import { Router } from 'express';
import { blake2b } from '@noble/hashes/blake2.js';

const router = Router();

const KRON_IDX = 'https://idx.kron.technology';
const KASPA_API = 'https://api.kaspa.org';

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

// ── Fee constants ─────────────────────────────────────────────────────────────
// Covenant transactions with large redeemScripts have significant mass.
// Use a conservative fixed fee of 0.05 KAS to ensure relay acceptance.
const KCC20_FEE_SOMPI = 5_000_000n; // 0.05 KAS

// ── Routes ───────────────────────────────────────────────────────────────────

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

    // ── 5. Fetch sender's KAS UTXOs (for fee payment) ─────────────────────
    const kasResp = await fetch(
      `${KASPA_API}/addresses/${encodeURIComponent(senderAddress)}/utxos`,
    );
    if (!kasResp.ok) {
      return res.status(502).json({ error: `Kaspa API returned ${kasResp.status} for KAS UTXOs` });
    }
    const kasUtxos = await kasResp.json() as any[];

    // Pick the KAS UTXO with the most KAS that exceeds the fee
    const sortedKas = [...kasUtxos].sort((a, b) => {
      const diff = BigInt(b.utxoEntry?.amount ?? 0) - BigInt(a.utxoEntry?.amount ?? 0);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    const feeUtxo = sortedKas.find((u: any) => BigInt(u.utxoEntry?.amount ?? 0) >= KCC20_FEE_SOMPI);
    if (!feeUtxo) {
      return res.status(400).json({
        error: `Insufficient KAS for fee — need ≥${Number(KCC20_FEE_SOMPI) / 1e8} KAS (${KCC20_FEE_SOMPI} sompi)`,
      });
    }

    // ── 6. Get blockDaaScore for KRON UTXOs from Kaspa tx API ─────────────
    const txDaaScores = new Map<string, string>();
    await Promise.allSettled(
      selectedKron.map(async (u) => {
        const txId: string = u.outpoint?.transactionId ?? u.transactionId ?? '';
        if (!txId || txDaaScores.has(txId)) return;
        try {
          const r = await fetch(`${KASPA_API}/transactions/${txId}`);
          const d = await r.json() as any;
          txDaaScores.set(txId, String(d.accepting_block_blue_score ?? d.accepting_blue_score ?? d.blue_score ?? 0));
        } catch {
          txDaaScores.set(txId, '0');
        }
      }),
    );

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
    const changeAmount = selectedTotal - totalNeeded;
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
    const kasAmount = BigInt(feeUtxo.utxoEntry?.amount ?? 0);
    const kasChange = kasAmount - KCC20_FEE_SOMPI;

    // ── 10. Assemble Transaction JSON (kaspa-wasm serializeToSafeJSON format) ─
    // This format is what kasware.signPskt expects.
    const inputs: any[] = [];

    // KRON covenant inputs — include redeemScript so the wallet can sign P2SH
    for (const u of selectedKron) {
      const txId: string = u.outpoint?.transactionId ?? '';
      const idx: number = u.outpoint?.index ?? 0;
      const amount: string = String(u.amount ?? u.utxoEntry?.amount ?? 0);
      const spk: string = u.scriptPublicKey ?? '';

      inputs.push({
        previousOutpoint: { transactionId: txId, index: idx },
        signatureScript: '',
        sequence: '0',
        sigOpCount: 1,
        utxoEntry: {
          amount,
          scriptPublicKey: { version: 0, script: spk },
          blockDaaScore: txDaaScores.get(txId) ?? '0',
          isCoinbase: false,
        },
        redeemScript: u.redeemScriptHex ?? u.script ?? '',
      });
    }

    // KAS fee input (regular P2PK — no redeemScript)
    const kasSpk = feeUtxo.utxoEntry?.scriptPublicKey;
    inputs.push({
      previousOutpoint: {
        transactionId: feeUtxo.outpoint?.transactionId ?? feeUtxo.transactionId,
        index: feeUtxo.outpoint?.index ?? feeUtxo.index,
      },
      signatureScript: '',
      sequence: '0',
      sigOpCount: 1,
      utxoEntry: {
        amount: String(feeUtxo.utxoEntry?.amount ?? 0),
        scriptPublicKey: typeof kasSpk === 'string'
          ? { version: 0, script: kasSpk }
          : { version: kasSpk?.version ?? 0, script: kasSpk?.scriptPublicKey ?? kasSpk?.script ?? '' },
        blockDaaScore: String(feeUtxo.utxoEntry?.blockDaaScore ?? 0),
        isCoinbase: feeUtxo.utxoEntry?.isCoinbase ?? false,
      },
    });

    const outputs: any[] = [
      // Recipient KRON covenant outputs
      ...recipientOutputs.map((o) => ({
        value: String(o.amount),
        scriptPublicKey: { version: 0, script: o.scriptPublicKeyHex },
      })),
    ];

    // KRON change output (if any)
    if (kronChangeOutput) {
      outputs.push({
        value: String(kronChangeOutput.amount),
        scriptPublicKey: { version: 0, script: kronChangeOutput.scriptPublicKeyHex },
      });
    }

    // KAS change output (always include to return KAS)
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
      fee: String(KCC20_FEE_SOMPI),
      totalAmount: String(totalNeeded),
    });
  } catch (err: any) {
    console.error('[kron] build-kcc20-transfer error:', err);
    return res.status(500).json({ error: err?.message ?? 'KCC-20 transfer build failed' });
  }
});

export default router;
