import { Router } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// Kaspa bech32 address → P2PK scriptPublicKey (pure JS, no kaspa-wasm needed)
// Kaspa uses standard bech32 charset with an 8-character checksum.
// ---------------------------------------------------------------------------
const BECH32_CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const CHECKSUM_LEN = 8;

function kaspaAddrToScript(address: string): string {
  const colonIdx = address.indexOf(':');
  if (colonIdx === -1) throw new Error(`Invalid Kaspa address: no prefix separator in "${address}"`);
  const payload = address.slice(colonIdx + 1);
  if (payload.length <= CHECKSUM_LEN) throw new Error(`Address payload too short: "${address}"`);

  // Decode each bech32 character to its 5-bit value, strip checksum
  const quintets: number[] = [];
  for (const c of payload.slice(0, -CHECKSUM_LEN)) {
    const v = BECH32_CHARS.indexOf(c);
    if (v < 0) throw new Error(`Invalid bech32 character "${c}" in address "${address}"`);
    quintets.push(v);
  }

  // Convert 5-bit groups → 8-bit bytes
  let acc = 0, bits = 0;
  const bytes: number[] = [];
  for (const q of quintets) {
    acc = (acc << 5) | q;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }

  // bytes[0] = version, bytes[1..33] = 32-byte Schnorr public key (PubKey v0)
  const version = bytes[0];
  if (version === 0) {
    // P2PK (Schnorr): OP_DATA_32 + pubkey + OP_CHECKSIG
    const pubkeyHex = bytes.slice(1, 33).map(b => b.toString(16).padStart(2, '0')).join('');
    if (pubkeyHex.length !== 64) throw new Error(`Bad pubkey length from address "${address}"`);
    return '20' + pubkeyHex + 'ac';
  } else if (version === 8) {
    // P2PK (ECDSA): OP_DATA_33 + pubkey(33 bytes) + OP_CHECKSIGECDSA
    const pubkeyHex = bytes.slice(1, 34).map(b => b.toString(16).padStart(2, '0')).join('');
    return '21' + pubkeyHex + 'ab';
  } else {
    throw new Error(`Unsupported address version ${version} in "${address}"`);
  }
}

// ---------------------------------------------------------------------------
// Kaspa REST API
// ---------------------------------------------------------------------------
const API_BASE: Record<string, string> = {
  mainnet: 'https://api.kaspa.org',
  testnet: 'https://api-tn11.kaspa.org',
  testnet10: 'https://api-tn10.kaspa.org',
};

// ---------------------------------------------------------------------------
// Fee estimation (Kaspa "mass"-based)
// Transaction mass ≈ 239 base + 642 per input + 365 per output (grams)
// Minimum fee = ceil(mass / 1000) sompi
// ---------------------------------------------------------------------------
function estimateFee(numInputs: number, numOutputs: number): bigint {
  const mass = 239n + BigInt(numInputs) * 642n + BigInt(numOutputs) * 365n;
  return ((mass + 999n) / 1000n) * 1000n; // ceil to nearest 1000 sompi
}

// ---------------------------------------------------------------------------
// POST /api/kaspa/build-tx
// Body: { senderAddress, recipients: [{address, amount}], networkId? }
// Returns: { pendingTxs: [{ id, txJson, paymentAmount, feeAmount }] }
//
// txJson is the SignableTransaction JSON that KasWare.signKaspaTransaction()
// expects — identical to what kaspa-wasm's SignableTransaction.toJSON() produces.
// ---------------------------------------------------------------------------
router.post('/build-tx', async (req, res) => {
  try {
    const {
      senderAddress,
      recipients,
      networkId = 'mainnet',
    } = req.body as {
      senderAddress: string;
      recipients: { address: string; amount: number }[];
      networkId?: string;
    };

    if (!senderAddress || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'senderAddress and recipients are required' });
    }

    const apiBase = API_BASE[networkId] ?? API_BASE.mainnet;

    // ── 1. Fetch UTXOs + mempool-spent outpoints in parallel ─────────────
    const [utxoRes, txRes] = await Promise.all([
      fetch(`${apiBase}/addresses/${senderAddress}/utxos`),
      fetch(`${apiBase}/addresses/${senderAddress}/full-transactions?limit=100&offset=0&resolve_previous_outpoints=no`),
    ]);

    if (!utxoRes.ok) {
      throw new Error(`UTXO fetch failed (${utxoRes.status}): ${await utxoRes.text()}`);
    }
    const rawUtxos = await utxoRes.json() as any[];
    if (!rawUtxos.length) {
      return res.status(400).json({ error: 'No UTXOs found for sender address' });
    }

    // Build a set of outpoints already being spent in unconfirmed mempool txs
    const mempoolSpent = new Set<string>();
    if (txRes.ok) {
      const recentTxs = await txRes.json() as any[];
      for (const tx of recentTxs) {
        if (tx.is_accepted === false) {
          for (const inp of (tx.inputs ?? [])) {
            // index comes back as a string from this endpoint
            mempoolSpent.add(`${inp.previous_outpoint_hash}:${inp.previous_outpoint_index}`);
          }
        }
      }
    }

    // Normalize UTXOs, excluding any the mempool is already spending
    const utxos = rawUtxos
      .map(u => ({
        transactionId: u.outpoint.transactionId as string,
        index: u.outpoint.index as number,
        amount: BigInt(u.utxoEntry.amount),
        // REST API stores script under scriptPublicKey.scriptPublicKey (hex)
        script: u.utxoEntry.scriptPublicKey.scriptPublicKey as string,
        blockDaaScore: Number(u.utxoEntry.blockDaaScore),
        isCoinbase: u.utxoEntry.isCoinbase as boolean,
      }))
      .filter(u => !mempoolSpent.has(`${u.transactionId}:${u.index}`));

    if (!utxos.length) {
      return res.status(400).json({ error: 'No spendable UTXOs — all funds are pending in the mempool. Wait for your last transaction to confirm.' });
    }

    // Sort largest first for greedy selection
    utxos.sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));

    // ── 2. UTXO selection ─────────────────────────────────────────────────
    const totalPaymentSompi = recipients.reduce(
      (sum, r) => sum + BigInt(Math.round(r.amount * 1e8)),
      0n,
    );
    const numOutputs = recipients.length + 1; // +1 for change

    const selected: typeof utxos = [];
    let selectedTotal = 0n;

    for (const utxo of utxos) {
      selected.push(utxo);
      selectedTotal += utxo.amount;
      const fee = estimateFee(selected.length, numOutputs);
      if (selectedTotal >= totalPaymentSompi + fee) break;
    }

    const fee = estimateFee(selected.length, numOutputs);
    const changeAmount = selectedTotal - totalPaymentSompi - fee;

    if (changeAmount < 0n) {
      return res.status(400).json({
        error: `Insufficient funds. Need ${totalPaymentSompi + fee} sompi, have ${selectedTotal} sompi.`,
      });
    }

    // ── 3. Build script for sender (change output) ────────────────────────
    const senderScript = kaspaAddrToScript(senderAddress);

    // ── 4. Build inputs array (SignableTransaction format) ────────────────
    const inputs = selected.map(u => ({
      previousOutpoint: { transactionId: u.transactionId, index: u.index },
      signatureScript: '',
      sequence: 0,
      sigOpCount: 1,
      utxo: {
        address: senderAddress,
        amount: Number(u.amount), // sompi as number (safe up to ~9×10^15)
        scriptPublicKey: { version: 0, script: u.script },
        blockDaaScore: u.blockDaaScore,
        isCoinbase: u.isCoinbase,
      },
    }));

    // ── 5. Build outputs array ────────────────────────────────────────────
    const outputs: Array<{ amount: number; scriptPublicKey: { version: number; script: string } }> =
      recipients.map(r => ({
        amount: Math.round(r.amount * 1e8),
        scriptPublicKey: { version: 0, script: kaspaAddrToScript(r.address) },
      }));

    if (changeAmount > 0n) {
      outputs.push({
        amount: Number(changeAmount),
        scriptPublicKey: { version: 0, script: senderScript },
      });
    }

    // ── 6. Assemble SignableTransaction JSON ──────────────────────────────
    const txJson = JSON.stringify({
      version: 0,
      inputs,
      outputs,
      lockTime: 0,
      subnetworkId: '0000000000000000000000000000000000000000',
      gas: 0,
      payload: '',
    });

    return res.json({
      pendingTxs: [
        {
          id: 'pending',
          txJson,
          paymentAmount: totalPaymentSompi.toString(),
          feeAmount: fee.toString(),
        },
      ],
    });
  } catch (err: any) {
    const msg: string = err?.message ?? 'Transaction build failed';
    return res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// POST /api/kaspa/push-tx
// Body: { signedTxJson: string, networkId?: string }
//
// Accepts the signed transaction JSON returned by KasWare.signKaspaTransaction()
// and broadcasts it to the Kaspa network via the public REST API.
// This is the fallback for wallets that expose signKaspaTransaction but not pushTx.
// ---------------------------------------------------------------------------
router.post('/push-tx', async (req, res) => {
  try {
    const { signedTxJson, networkId = 'mainnet' } = req.body as {
      signedTxJson: string;
      networkId?: string;
    };

    if (!signedTxJson) {
      return res.status(400).json({ error: 'signedTxJson is required' });
    }

    const apiBase = API_BASE[networkId] ?? API_BASE.mainnet;

    // Parse the SignableTransaction JSON from the wallet
    const tx = typeof signedTxJson === 'string' ? JSON.parse(signedTxJson) : signedTxJson;

    // Map to Kaspa REST API SubmitTransactionRequest format.
    // Handles two source formats:
    //   - signKaspaTransaction format: outputs have "amount" (number)
    //   - signPskt / kaspa-wasm format: outputs have "value" (BigInt string)
    // Both: scriptPublicKey uses "script" key internally; REST API needs "scriptPublicKey".
    const submitTx = {
      version: tx.version ?? 0,
      inputs: (tx.inputs ?? []).map((inp: any) => ({
        previousOutpoint: {
          transactionId: inp.previousOutpoint?.transactionId,
          index: inp.previousOutpoint?.index,
        },
        signatureScript: inp.signatureScript ?? '',
        sequence: Number(inp.sequence ?? 0),
        sigOpCount: inp.sigOpCount ?? 1,
      })),
      outputs: (tx.outputs ?? []).map((out: any) => ({
        // "amount" (signKaspaTransaction) or "value" (kaspa-wasm/signPskt) — accept both
        amount: Number(out.amount ?? out.value ?? 0),
        scriptPublicKey: {
          version: out.scriptPublicKey?.version ?? 0,
          // Our build-tx uses 'script'; REST API expects 'scriptPublicKey'
          scriptPublicKey: out.scriptPublicKey?.scriptPublicKey ?? out.scriptPublicKey?.script ?? '',
        },
      })),
      lockTime: Number(tx.lockTime ?? 0),
      subnetworkId: tx.subnetworkId ?? '0000000000000000000000000000000000000000',
    };

    const submitRes = await fetch(`${apiBase}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: submitTx, allowOrphan: false }),
    });

    const submitBody = await submitRes.json() as any;

    if (!submitRes.ok) {
      throw new Error(submitBody?.detail ?? submitBody?.error ?? `Kaspa node rejected transaction (${submitRes.status})`);
    }

    return res.json({
      txId: submitBody.transactionId ?? submitBody.txId ?? '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Broadcast failed' });
  }
});

export default router;
