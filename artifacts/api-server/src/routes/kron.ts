import { Router } from 'express';
import { blake2b } from '@noble/hashes/blake2.js';
import { estimateTransactionFee } from '../lib/kcc20-fee.js';

const router = Router();

const KRON_IDX   = 'https://idx.kron.technology';
const KASPA_API  = 'https://api.kaspa.org';
const KASPLEX_API = 'https://api.kasplex.org/v1';

// ── Bech32 helpers (same charset as kaspa.ts) ────────────────────────────────
const BECH32_CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const CHECKSUM_LEN = 8;

/** Decode a Kaspa bech32 address → 32-byte x-only public key. */
function addrToPubkey(address: string): Uint8Array {
  const colonIdx = address.indexOf(':');
  if (colonIdx === -1) throw new Error(`Invalid address (no colon): ${address}`);
  const payload = address.slice(colonIdx + 1);
  if (payload.length <= CHECKSUM_LEN) throw new Error(`Address payload too short: ${address}`);

  const quintets: number[] = [];
  for (const c of payload.slice(0, -CHECKSUM_LEN)) {
    const v = BECH32_CHARS.indexOf(c);
    if (v < 0) throw new Error(`Invalid bech32 character "${c}" in address "${address}"`);
    quintets.push(v);
  }

  let acc = 0, bits = 0;
  const bytes: number[] = [];
  for (const q of quintets) {
    acc = (acc << 5) | q;
    bits += 5;
    while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
  }
  // bytes[0] = version byte (0 = PubKey), bytes[1..32] = 32-byte Schnorr pubkey
  if (bytes.length < 33) throw new Error(`Address decode too short for: ${address}`);
  return new Uint8Array(bytes.slice(1, 33));
}

// ── KCC-20 covenant helpers ───────────────────────────────────────────────────

/**
 * Compute blake2b-256 (32-byte output variant) of data.
 * Kaspa uses this for P2SH script hashing.
 */
function blake2b256(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32 });
}

/**
 * Build a Kaspa P2SH scriptPublicKey from a redeemScript.
 * Format: 0xaa(OP_BLAKE2B) 0x20(push32) <blake2b256(redeemScript)> 0x87(OP_EQUAL)
 */
function p2shScript(redeemScript: Uint8Array): string {
  const hash = blake2b256(redeemScript);
  const out = new Uint8Array(35);
  out[0] = 0xaa;   // OP_BLAKE2B (Kaspa-specific opcode)
  out[1] = 0x20;   // OP_DATA_32
  out.set(hash, 2);
  out[34] = 0x87;  // OP_EQUAL
  return Buffer.from(out).toString('hex');
}

/**
 * Derive a new KRON redeemScript for a given recipient pubkey and token amount.
 *
 * KRON state (stateStart = 0, stateLen = 46 bytes):
 *   [0]      = 0x20  (OP_DATA_32 — marks pubkey push)
 *   [1..32]  = 32-byte owner pubkey
 *   [33]     = 0x01  (OP_DATA_1 — marks type push)
 *   [34]     = type byte
 *   [35]     = 0x08  (OP_DATA_8 — marks amount push)
 *   [36..43] = amount as little-endian uint64
 *   [44]     = 0x01  (OP_DATA_1 — marks isMinter push)
 *   [45]     = isMinter byte
 *   [46..]   = 2387-byte covenant body (identical for all KRON UTXOs of same version)
 */
function materializeScript(template: Uint8Array, recipientPubkey: Uint8Array, amount: bigint): Uint8Array {
  const s = new Uint8Array(template);
  const e = 0; // stateStart

  // Validate expected structure so we fail fast if layout ever changes
  if (s[e] !== 0x20 || s[e + 33] !== 0x01 || s[e + 35] !== 0x08 || s[e + 44] !== 0x01) {
    throw new Error(`Unexpected KCC-20 state layout — header bytes don't match expected KRON format`);
  }

  // Replace owner pubkey (bytes 1..32)
  s.set(recipientPubkey, e + 1);

  // Replace amount (bytes 36..43, little-endian uint64)
  let v = amount;
  for (let i = 0; i < 8; i++) { s[e + 36 + i] = Number(v & 0xffn); v >>= 8n; }

  return s;
}

// ── Bech32 ENCODING (for deriving P2SH addresses) ────────────────────────────
// Kaspa cashaddr-style checksum polymod (verified round-trip against real addresses).
function bech32Polymod(values: number[]): bigint {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    if (c0 & 0x01n) c ^= 0x98f2bc8e61n;
    if (c0 & 0x02n) c ^= 0x79b76d99e2n;
    if (c0 & 0x04n) c ^= 0xf33e5fb3c4n;
    if (c0 & 0x08n) c ^= 0xae2eabe2a8n;
    if (c0 & 0x10n) c ^= 0x1e4f43e470n;
  }
  return c ^ 1n;
}

function to5bit(bytes: number[] | Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

/** Encode a Kaspa address from version byte + hash. Version 8 = ScriptHash (P2SH). */
function encodeKaspaAddress(version: number, hash: Uint8Array, prefix = 'kaspa'): string {
  const data5 = to5bit([version, ...hash]);
  const prefix5 = [...prefix].map((c) => c.charCodeAt(0) & 0x1f);
  const cs = bech32Polymod([...prefix5, 0, ...data5, 0, 0, 0, 0, 0, 0, 0, 0]);
  let s = '';
  for (const d of data5) s += BECH32_CHARS[d];
  for (let i = 0; i < 8; i++) s += BECH32_CHARS[Number((cs >> BigInt(5 * (7 - i))) & 31n)];
  return `${prefix}:${s}`;
}

// ── Fee constant ──────────────────────────────────────────────────────────────

// Every KRON covenant UTXO carries a fixed 0.5 KAS regardless of token amount
// (the token amount lives in the redeemScript state, not in the output value).
// Verified against on-chain data: all holder UTXOs = 50,000,000 sompi.
const COVENANT_OUTPUT_SOMPI = 50_000_000n; // 0.5 KAS

// estimateTransactionFee is imported from ../lib/kcc20-fee.js

// ── Routes ───────────────────────────────────────────────────────────────────

// Proxy for Kasplex KRC-20 indexer — api.kasplex.org blocks direct browser
// requests (CORS / rate-limit → 403). All Kasplex calls must go through here.
router.get('/kasplex/*path', async (req, res) => {
  const subpath = Array.isArray(req.params.path)
    ? req.params.path.join('/')
    : (req.params as any).path as string;
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  try {
    const upstream_res = await fetch(`${KASPLEX_API}/${subpath}${qs}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'kaspa-disperse/1.0' },
    });
    const body = await upstream_res.text();
    res.status(upstream_res.status).set('Content-Type', 'application/json').send(body);
  } catch (err: any) {
    res.status(502).json({ error: `Kasplex proxy error: ${err?.message}` });
  }
});

// Proxy for Kron KCC-20 indexer — CORS on idx.kron.technology is locked
// to kron.technology only, so the browser cannot call it directly.
router.get('/kcc20/address/:address/tokenlist', async (req, res) => {
  const { address } = req.params;
  try {
    const upstream = await fetch(
      `${KRON_IDX}/v1/kcc20/address/${encodeURIComponent(address)}/tokenlist`,
    );
    const data = await upstream.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Failed to reach Kron indexer', detail: err?.message });
  }
});

// Proxy for KCC-20 UTXO list (browser can't hit Kron indexer directly due to CORS)
router.get('/kcc20/token/:tick/address/:address/utxos', async (req, res) => {
  const { tick, address } = req.params;
  try {
    const upstream = await fetch(
      `${KRON_IDX}/v1/kcc20/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(address)}/utxos`,
    );
    const data = await upstream.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Failed to reach Kron indexer', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/kron/build-kcc20-transfer
//
// Builds a KCC-20 (covenant-based) token transfer transaction in
// kaspa-wasm Transaction.serializeToSafeJSON() format, ready for
// kasware.signPskt({ txJsonString, options: { signInputs } }).
//
// Body:
//   senderAddress  – kaspa:q... address of the sender
//   recipients     – [{ address: "kaspa:q...", amount: "200" }, ...]
//                    amount is in raw KCC-20 units (dec=0 for KRON → integer)
//   tick           – token ticker, e.g. "KRON"
//
// Response:
//   txJsonString        – serialized transaction JSON for signPskt
//   inputIndicesToSign  – array of input indices the user must sign
//   fee                 – KAS fee in sompi (string)
//   totalAmount         – total token units sent (string)
// ---------------------------------------------------------------------------
router.post('/build-kcc20-transfer', async (req, res) => {
  try {
    const { senderAddress, recipients, tick } = req.body as {
      senderAddress: string;
      recipients: Array<{ address: string; amount: string }>;
      tick: string;
    };

    if (!senderAddress || !recipients?.length || !tick) {
      return res.status(400).json({ error: 'senderAddress, recipients, and tick are required' });
    }

    // ── 1. Fetch KCC-20 UTXOs for sender ──────────────────────────────────
    const kronResp = await fetch(
      `${KRON_IDX}/v1/kcc20/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(senderAddress)}/utxos`,
    );
    if (!kronResp.ok) {
      return res.status(502).json({ error: `Kron indexer returned ${kronResp.status} for UTXO list` });
    }
    const kronData = await kronResp.json() as any;
    const kcc20Utxos: any[] = Array.isArray(kronData.result) ? kronData.result : (Array.isArray(kronData) ? kronData : []);

    if (kcc20Utxos.length === 0) {
      return res.status(400).json({ error: `No ${tick} UTXOs found for ${senderAddress}` });
    }

    // ── 2. Calculate total token amount needed ────────────────────────────
    const totalNeeded = recipients.reduce((sum, r) => sum + BigInt(r.amount), 0n);

    // ── 3. Select KCC-20 UTXOs (FIFO) ────────────────────────────────────
    const selectedKron: any[] = [];
    let selectedTotal = 0n;
    for (const u of kcc20Utxos) {
      selectedKron.push(u);
      selectedTotal += BigInt(u.amount ?? u.utxoEntry?.amount ?? 0);
      if (selectedTotal >= totalNeeded) break;
    }
    if (selectedTotal < totalNeeded) {
      return res.status(400).json({
        error: `Insufficient ${tick} balance (have ${selectedTotal}, need ${totalNeeded})`,
      });
    }

    // ── 4. Get template redeemScript from first UTXO ─────────────────────
    const templateHex: string = kcc20Utxos[0].redeemScriptHex ?? kcc20Utxos[0].script ?? '';
    if (!templateHex) {
      return res.status(502).json({ error: 'Kron indexer did not return redeemScriptHex for UTXO' });
    }
    const template = Buffer.from(templateHex, 'hex');

    // ── 4b. Fetch authoritative on-chain UTXO entries for covenant inputs ─
    // The Kron indexer's `amount` is the TOKEN amount; the actual on-chain
    // output value is fixed at 0.5 KAS. We need the real sompi amount and
    // blockDaaScore for a correct sighash, so query the Kaspa API via the
    // covenant's derived P2SH address.
    const covenantEntries = await Promise.all(
      selectedKron.map(async (u) => {
        const redeemHex: string = u.redeemScriptHex ?? u.script ?? '';
        if (!redeemHex) throw new Error('Kron indexer did not return redeemScriptHex for a selected UTXO');
        const redeem = Buffer.from(redeemHex, 'hex');
        const p2shAddr = encodeKaspaAddress(8, blake2b256(redeem));
        const r = await fetch(`${KASPA_API}/addresses/${encodeURIComponent(p2shAddr)}/utxos`);
        if (!r.ok) throw new Error(`Kaspa API returned ${r.status} for covenant UTXO lookup`);
        const list = await r.json() as any[];
        const txId: string = u.outpoint?.transactionId ?? u.transactionId ?? '';
        const idx: number = u.outpoint?.index ?? 0;
        const match = (Array.isArray(list) ? list : []).find(
          (x: any) => x.outpoint?.transactionId === txId && Number(x.outpoint?.index) === idx,
        );
        if (!match) {
          throw new Error(`Covenant UTXO ${txId.slice(0, 12)}…:${idx} not found on-chain (may be spent or not yet indexed)`);
        }
        const spkRaw = match.utxoEntry?.scriptPublicKey;
        return {
          txId,
          index: idx,
          redeemScriptHex: redeemHex,
          amountSompi: BigInt(match.utxoEntry?.amount ?? 0),
          scriptPublicKeyHex: typeof spkRaw === 'string' ? spkRaw : (spkRaw?.scriptPublicKey ?? spkRaw?.script ?? ''),
          blockDaaScore: String(match.utxoEntry?.blockDaaScore ?? '0'),
          isCoinbase: Boolean(match.utxoEntry?.isCoinbase ?? false),
        };
      }),
    );
    const covenantInSompi = covenantEntries.reduce((s, e) => s + e.amountSompi, 0n);

    // ── 5. Fetch sender's KAS UTXOs (for fee payment) ─────────────────────
    const kasResp = await fetch(
      `${KASPA_API}/addresses/${encodeURIComponent(senderAddress)}/utxos`,
    );
    if (!kasResp.ok) {
      return res.status(502).json({ error: `Kaspa API returned ${kasResp.status} for KAS UTXOs` });
    }
    const kasUtxos = await kasResp.json() as any[];

    // Prefer a single UTXO large enough for the fee (simplest transaction).
    // If none qualifies, combine the largest UTXOs until we have enough.
    const sortedKas = [...kasUtxos].sort((a, b) => {
      const diff = BigInt(b.utxoEntry?.amount ?? 0) - BigInt(a.utxoEntry?.amount ?? 0);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    // ── 6. Determine required KAS (dynamic fee) ───────────────────────────
    // Every covenant output must carry 0.5 KAS. Covenant inputs contribute
    // their own 0.5 KAS each, so the sender's KAS UTXOs must cover:
    //   fee + (covenant outputs × 0.5 KAS) − (covenant inputs' sompi)
    //
    // The fee depends on the number of inputs, which depends on the fee — so
    // we iterate: start with zero KAS inputs, select UTXOs to cover the
    // requirement, recompute fee with actual count, repeat. Converges in ≤ 3
    // passes for typical dispersals; MAX_PASSES is a safety cap.
    const changeAmount = selectedTotal - totalNeeded;
    const numCovenantOutputs = recipients.length + (changeAmount > 0n ? 1 : 0);
    const covenantOutSompi = BigInt(numCovenantOutputs) * COVENANT_OUTPUT_SOMPI;

    // redeemScript length is constant for all KRON UTXOs of the same version.
    const redeemScriptLen = template.length;

    let feeUtxos: any[] = [];
    let feeTotal = 0n;
    let dynamicFee = 0n;

    // Iterate until the selected input count is stable (fixed point).
    // Each pass computes the fee for the count selected in the PREVIOUS pass,
    // then re-selects to cover the new requirement. When the count no longer
    // changes, the loop has converged.
    const MAX_PASSES = 20;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const prevCount = feeUtxos.length;

      // Conservative: always assume a KAS change output exists for fee estimation.
      // (It is omitted from the tx only when kasChange === 0, an unlikely edge case.)
      const numOutputsEst = numCovenantOutputs + 1;

      dynamicFee = estimateTransactionFee(
        covenantEntries.length,
        redeemScriptLen,
        feeUtxos.length,     // 0 on first pass → grows each round as needed
        numOutputsEst,
      );

      const requiredKas = dynamicFee + covenantOutSompi - covenantInSompi;

      if (requiredKas <= 0n) {
        // Covenant inputs carry enough KAS to fund the fee and all outputs —
        // no extra KAS UTXOs needed.
        feeUtxos = [];
        feeTotal = 0n;
        break;
      }

      // Re-select KAS UTXOs to cover the updated requirement.
      feeUtxos = [];
      feeTotal = 0n;
      const singleFeeUtxo = sortedKas.find((u: any) => BigInt(u.utxoEntry?.amount ?? 0) >= requiredKas);
      if (singleFeeUtxo) {
        feeUtxos = [singleFeeUtxo];
        feeTotal = BigInt(singleFeeUtxo.utxoEntry?.amount ?? 0);
      } else {
        for (const u of sortedKas) {
          feeUtxos.push(u);
          feeTotal += BigInt(u.utxoEntry?.amount ?? 0);
          if (feeTotal >= requiredKas) break;
        }
      }

      if (feeTotal < requiredKas) {
        return res.status(400).json({
          error: `Insufficient KAS — need ≥${Number(requiredKas) / 1e8} KAS (fee + 0.5 KAS per covenant output), have ${Number(feeTotal) / 1e8} KAS`,
        });
      }

      // Converged when the UTXO count is stable.
      if (feeUtxos.length === prevCount) break;
    }

    // ── Mandatory post-loop fixed-point verification ───────────────────────
    // Recompute the fee for the ACTUAL final input/output counts. This is
    // necessary because the loop may exit (via convergence OR the MAX_PASSES
    // cap) with dynamicFee reflecting the previous iteration's count rather
    // than the count that was ultimately selected.
    {
      const numOutputsFinal = numCovenantOutputs + 1; // conservative: include KAS change
      dynamicFee = estimateTransactionFee(
        covenantEntries.length,
        redeemScriptLen,
        feeUtxos.length,
        numOutputsFinal,
      );
      const requiredFinal = dynamicFee + covenantOutSompi - covenantInSompi;
      if (requiredFinal > 0n && feeTotal < requiredFinal) {
        return res.status(400).json({
          error: `Insufficient KAS — need ≥${Number(requiredFinal) / 1e8} KAS (fee + 0.5 KAS per covenant output), have ${Number(feeTotal) / 1e8} KAS`,
        });
      }
    }

    // ── 7. Build recipient redeemScripts and P2SH scriptPublicKeys ────────
    const senderPubkey = addrToPubkey(senderAddress);

    const recipientOutputs = recipients.map(({ address, amount }) => {
      const pubkey = addrToPubkey(address);
      const redeem = materializeScript(template, pubkey, BigInt(amount));
      return {
        redeemScriptHex: Buffer.from(redeem).toString('hex'),
        scriptPublicKeyHex: p2shScript(redeem),
        amount: BigInt(amount),
      };
    });

    // ── 8. KRON change back to sender ─────────────────────────────────────
    let kronChangeOutput: { redeemScriptHex: string; scriptPublicKeyHex: string; amount: bigint } | null = null;
    if (changeAmount > 0n) {
      const changeRedeem = materializeScript(template, senderPubkey, changeAmount);
      kronChangeOutput = {
        redeemScriptHex: Buffer.from(changeRedeem).toString('hex'),
        scriptPublicKeyHex: p2shScript(changeRedeem),
        amount: changeAmount,
      };
    }

    // ── 9. KAS change back to sender ──────────────────────────────────────
    const senderP2pkScript = '20' + Buffer.from(senderPubkey).toString('hex') + 'ac';
    // KAS change = everything in minus everything out minus fee
    const kasChange = feeTotal + covenantInSompi - covenantOutSompi - dynamicFee;

    // ── 10. Assemble Transaction JSON (kaspa-wasm serializeToSafeJSON format) ─
    // This format is what kasware.signPskt expects.
    const inputs: any[] = [];

    // KRON covenant inputs — include redeemScript so the wallet can sign P2SH.
    // utxoEntry uses the AUTHORITATIVE on-chain values (real sompi amount +
    // blockDaaScore) fetched in step 4b — not the indexer's token amounts.
    for (const e of covenantEntries) {
      inputs.push({
        previousOutpoint: { transactionId: e.txId, index: e.index },
        signatureScript: '',
        sequence: '0',
        sigOpCount: 1,
        utxoEntry: {
          amount: String(e.amountSompi),
          scriptPublicKey: { version: 0, script: e.scriptPublicKeyHex },
          blockDaaScore: e.blockDaaScore,
          isCoinbase: e.isCoinbase,
        },
        redeemScript: e.redeemScriptHex,
      });
    }

    // KAS fee inputs (regular P2PK — no redeemScript; may be multiple)
    for (const fu of feeUtxos) {
      const kasSpk = fu.utxoEntry?.scriptPublicKey;
      inputs.push({
        previousOutpoint: {
          transactionId: fu.outpoint?.transactionId ?? fu.transactionId ?? '',
          index: fu.outpoint?.index ?? fu.index ?? 0,
        },
        signatureScript: '',
        sequence: '0',
        sigOpCount: 1,
        utxoEntry: {
          amount: String(fu.utxoEntry?.amount ?? 0),
          scriptPublicKey: typeof kasSpk === 'string'
            ? { version: 0, script: kasSpk }
            : { version: kasSpk?.version ?? 0, script: kasSpk?.scriptPublicKey ?? kasSpk?.script ?? '' },
          blockDaaScore: String(fu.utxoEntry?.blockDaaScore ?? 0),
          isCoinbase: fu.utxoEntry?.isCoinbase ?? false,
        },
      });
    }

    // Every covenant output carries a fixed 0.5 KAS — the KRON token amount
    // is encoded in the redeemScript state, NOT in the output value.
    const outputs: any[] = [
      // Recipient KRON covenant outputs
      ...recipientOutputs.map((o) => ({
        value: String(COVENANT_OUTPUT_SOMPI),
        scriptPublicKey: { version: 0, script: o.scriptPublicKeyHex },
      })),
    ];

    // KRON change output (if any)
    if (kronChangeOutput) {
      outputs.push({
        value: String(COVENANT_OUTPUT_SOMPI),
        scriptPublicKey: { version: 0, script: kronChangeOutput.scriptPublicKeyHex },
      });
    }

    // KAS change output (always include to return KAS minus fee)
    if (kasChange > 0n) {
      outputs.push({
        value: String(kasChange),
        scriptPublicKey: { version: 0, script: senderP2pkScript },
      });
    }

    const txJson = {
      version: 0,
      inputs,
      outputs,
      lockTime: '0',
      subnetworkId: '0000000000000000000000000000000000000000',
      gas: '0',
      payload: '',
    };

    // All inputs need to be signed
    const inputIndicesToSign = inputs.map((_, i) => i);

    return res.json({
      txJsonString: JSON.stringify(txJson),
      inputIndicesToSign,
      fee: String(dynamicFee),
      totalAmount: String(totalNeeded),
    });
  } catch (err: any) {
    console.error('[kron] build-kcc20-transfer error:', err);
    return res.status(500).json({ error: err?.message ?? 'KCC-20 transfer build failed' });
  }
});

export default router;
