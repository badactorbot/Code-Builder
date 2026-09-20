import { pool } from "@workspace/db";

const KASPLEX_API = "https://api.kasplex.org/v1";
const BURN_ADDRESS = "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e";
const PAGE_SIZE = 50;
const PAGES_PER_TURN = 20;

type IndexJob = {
  ticker: string;
  status: string;
  cursor: string | null;
  processed_operations: number;
  expected_holders: number | null;
  final_holder_count: number | null;
  final_eligible_holder_count: number | null;
  excluded_burn_addresses: number;
  last_error: string | null;
};

const active = new Set<string>();
type DbClient = Awaited<ReturnType<typeof pool.connect>>;
type DbQueryable = { query: (...args: any[]) => Promise<{ rows: any[] }> };

function validAddress(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("kaspa:") && value !== BURN_ADDRESS;
}

async function getJobFromClient(client: DbQueryable, ticker: string): Promise<IndexJob | null> {
  const result = await client.query(
    `SELECT ticker, status, cursor, processed_operations, expected_holders,
            final_holder_count, final_eligible_holder_count,
            excluded_burn_addresses, last_error
       FROM krc20_index_jobs WHERE ticker = $1`,
    [ticker],
  );
  return (result.rows[0] as IndexJob | undefined) ?? null;
}

async function getJob(ticker: string): Promise<IndexJob | null> {
  return getJobFromClient(pool, ticker);
}

async function createJob(ticker: string, expectedHolders: number): Promise<IndexJob> {
  const existing = await getJob(ticker);
  if (
    existing
    && existing.expected_holders === expectedHolders
    && (existing.status === "completed" || existing.status === "failed")
  ) {
    return existing;
  }
  if (
    existing
    && existing.expected_holders !== null
    && existing.expected_holders !== expectedHolders
  ) {
    await pool.query(`DELETE FROM krc20_balances WHERE ticker = $1`, [ticker]);
    await pool.query(
      `UPDATE krc20_index_jobs
          SET status = 'indexing', cursor = NULL, processed_operations = 0,
              expected_holders = $2, final_holder_count = NULL,
              final_eligible_holder_count = NULL, excluded_burn_addresses = 0,
              last_error = NULL,
              completed_at = NULL, updated_at = NOW()
        WHERE ticker = $1`,
      [ticker, expectedHolders],
    );
  }
  await pool.query(
    `INSERT INTO krc20_index_jobs (ticker, status, expected_holders, updated_at)
     VALUES ($1, 'indexing', $2, NOW())
     ON CONFLICT (ticker) DO UPDATE SET expected_holders = EXCLUDED.expected_holders,
       status = CASE WHEN krc20_index_jobs.status = 'completed'
                     THEN krc20_index_jobs.status ELSE 'indexing' END,
       updated_at = NOW()`,
    [ticker, expectedHolders],
  );
  const job = await getJob(ticker);
  if (!job) throw new Error(`Unable to create KRC-20 index job for ${ticker}.`);
  return job;
}

async function markFailed(ticker: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await pool.query(
    `UPDATE krc20_index_jobs SET status = 'failed', last_error = $2, updated_at = NOW()
     WHERE ticker = $1`,
    [ticker, message.slice(0, 2000)],
  );
}

async function applyDeltas(
  client: DbQueryable,
  ticker: string,
  deltas: Map<string, bigint>,
): Promise<void> {
  const rows = [...deltas.entries()].filter(([, amount]) => amount !== 0n);
  if (!rows.length) return;
  const values: unknown[] = [];
  const placeholders = rows.map(([address, amount], index) => {
    values.push(ticker, address, amount.toString());
    const base = index * 3;
    return `($${base + 1}, $${base + 2}, $${base + 3}::numeric)`;
  });
  await client.query(
    `INSERT INTO krc20_balances (ticker, address, balance)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (ticker, address) DO UPDATE
       SET balance = krc20_balances.balance + EXCLUDED.balance`,
    values,
  );
}

async function replayTurn(ticker: string): Promise<void> {
  let job = await getJob(ticker);
  if (!job) throw new Error(`KRC-20 index job for ${ticker} does not exist.`);
  let cursor = job.cursor;

  for (let page = 0; page < PAGES_PER_TURN; page += 1) {
    const url = new URL(`${KASPLEX_API}/krc20/oplist`);
    url.searchParams.set("tick", ticker);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (cursor) url.searchParams.set("next", cursor);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "kasdistro/1.0" },
    });
    const data: any = await response.json();
    if (!response.ok || data?.message !== "successful" || !Array.isArray(data?.result)) {
      throw new Error(data?.message || `Kasplex operation history returned HTTP ${response.status}.`);
    }

    const deltas = new Map<string, bigint>();
    let accepted = 0;
    for (const operation of data.result) {
      if (String(operation?.txAccept) !== "1" || String(operation?.opAccept) !== "1") continue;
      let amount: bigint;
      try {
        amount = BigInt(operation?.amt ?? "0");
      } catch {
        throw new Error(`Kasplex returned an invalid amount for ${ticker}.`);
      }
      if (amount < 0n) throw new Error(`Kasplex returned a negative amount for ${ticker}.`);
      const add = (address: unknown, delta: bigint) => {
        if (typeof address !== "string" || !address.startsWith("kaspa:")) return;
        deltas.set(address, (deltas.get(address) ?? 0n) + delta);
      };
      if (operation.op === "mint") add(operation.to, amount);
      else if (operation.op === "transfer" || operation.op === "send") {
        add(operation.from, -amount);
        add(operation.to, amount);
      } else if (operation.op === "burn") add(operation.from, -amount);
      accepted += 1;
    }
    const next = typeof data.next === "string" && data.next ? data.next : null;
    if (next === cursor) throw new Error(`Kasplex returned a repeated cursor for ${ticker}.`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyDeltas(client, ticker, deltas);
      await client.query(
        `UPDATE krc20_index_jobs SET cursor = $2, processed_operations =
           processed_operations + $3, updated_at = NOW() WHERE ticker = $1`,
        [ticker, next, accepted],
      );
      if (!next || data.result.length === 0) {
        const countResult = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE balance::numeric > 0)::int AS count,
             COUNT(*) FILTER (
               WHERE balance::numeric > 0 AND address = $2
             )::int AS burn_count
             FROM krc20_balances WHERE ticker = $1`,
          [ticker, BURN_ADDRESS],
        );
        const count = Number(countResult.rows[0]?.count ?? 0);
        const burnCount = Number(countResult.rows[0]?.burn_count ?? 0);
        job = await getJobFromClient(client, ticker);
        const expected = job?.expected_holders;
        if (expected !== null && count !== expected) {
          throw new Error(
            `Kasplex reports ${expected?.toLocaleString()} holders, but replay resolved ${count.toLocaleString()}.`,
          );
        }
        await client.query(
          `UPDATE krc20_index_jobs SET status = 'completed',
             final_holder_count = $2, final_eligible_holder_count = $3,
             excluded_burn_addresses = $4, completed_at = NOW(), updated_at = NOW()
             WHERE ticker = $1`,
          [ticker, count, count - burnCount, burnCount],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
    cursor = next;
    if (!cursor || data.result.length === 0) return;
  }
}

async function run(ticker: string): Promise<void> {
  if (active.has(ticker)) return;
  active.add(ticker);
  try {
    await replayTurn(ticker);
    const job = await getJob(ticker);
    if (job?.status === "indexing") setImmediate(() => void run(ticker));
  } catch (error) {
    try { await markFailed(ticker, error); } catch { /* preserve original failure */ }
  } finally {
    active.delete(ticker);
  }
}

export async function startKrc20Index(ticker: string, expectedHolders: number): Promise<IndexJob> {
  const job = await createJob(ticker, expectedHolders);
  if (job.status === "completed") return job;
  void run(ticker);
  return job;
}

export async function getCompletedKrc20Snapshot(
  ticker: string,
): Promise<{ addresses: string[]; excludedBurnAddresses: number }> {
  const result = await pool.query(
    `SELECT address FROM krc20_balances
     WHERE ticker = $1 AND balance::numeric > 0 AND address <> $2
       AND address LIKE 'kaspa:%' ORDER BY address`,
    [ticker, BURN_ADDRESS],
  );
  const addresses = result.rows.filter((row) => validAddress(row.address)).map((row) => row.address);
  const burnResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM krc20_balances
     WHERE ticker = $1 AND address = $2 AND balance::numeric > 0`,
    [ticker, BURN_ADDRESS],
  );
  return {
    addresses,
    excludedBurnAddresses: Number(burnResult.rows[0]?.count ?? 0),
  };
}

export { BURN_ADDRESS };