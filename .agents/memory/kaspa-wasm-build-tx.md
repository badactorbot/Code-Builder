---
name: Kaspa transaction building without kaspa-wasm
description: Why kaspa-wasm Generator/createTransactions fail for manually constructed UTXOs in this env, and the pure-JS workaround used in the API server.
---

## The problem
kaspa-wasm v0.13.0 `Generator` and `createTransactions` throw "Prefix is missing" or "Invalid address" for ANY manually constructed UTXO entry (plain JS objects or typed WASM objects). Root causes:
1. `new UtxoEntry({...})` has no constructor — creates uninitialized WASM object; `.address` returns null pointer.
2. WASM move semantics: passing `new Address(str)` into a setter via plain JS object args frees the pointer immediately.
3. WebSocket RpcClient (needed to get WASM-typed UTXOs) cannot connect to external Kaspa nodes from Replit.

## The fix (in `artifacts/api-server/src/routes/kaspa.ts`)
Pure-JS Kaspa bech32 address → P2PK scriptPublicKey decoder:
- Character set: `qpzry9x8gf2tvdw0s3jn54khce6mua7l` (same as Bitcoin bech32)
- Checksum length: **8 characters** (strip from payload tail)
- Decode remaining quintets (5-bit groups) → bytes; byte[0]=version, bytes[1:33]=pubkey
- P2PK script (version 0): `"20" + pubkeyHex + "ac"`
- ECDSA script (version 8): `"21" + pubkeyHex + "ab"`

## SignableTransaction JSON format (for KasWare.signKaspaTransaction)
```json
{
  "version": 0,
  "inputs": [{ "previousOutpoint": {"transactionId":"...", "index":0}, "signatureScript":"", "sequence":0, "sigOpCount":1, "utxo": {"address":"kaspa:...", "amount": 2000000000, "scriptPublicKey": {"version":0,"script":"..."}, "blockDaaScore": 510815440, "isCoinbase": false} }],
  "outputs": [{ "amount": 100000000, "scriptPublicKey": {"version":0,"script":"..."} }],
  "lockTime": 0, "subnetworkId": "0000000000000000000000000000000000000000", "gas": 0, "payload": ""
}
```

**Why:** amounts as numbers (safe for < 9×10¹⁵ sompi); scriptPublicKey uses `script` key (not `scriptPublicKey`).

## Fee estimation
`mass = 239 + numInputs*642 + numOutputs*365` grams; `fee = ceil(mass/1000)*1000` sompi.

## REST API UTXO format
`scriptPublicKey.scriptPublicKey` (nested key, hex string) — map to `script` for SignableTransaction.
