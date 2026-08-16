---
name: KCC-20 covenant dispersal implementation
description: How KCC-20 (KRON) token transfers work — P2SH covenant transactions signed via kasware.signPskt
---

## Core facts

- **1 KRON = 1 sompi** stored in the covenant UTXO. User inputs whole numbers (dec=0).
- **Batch size**: max 3 recipients per tx (covenant maxOuts=4 including change).
- **Fee**: fixed 5,000,000 sompi (0.05 KAS) per transaction — covenant mass is large (~2433-byte redeemScript).
- **UTXO source**: Kron indexer proxied at `/api/kron/*` (CORS-blocked otherwise).

## State layout in redeemScript (stateStart=0, stateLen=46 bytes)

```
[0]      = 0x20  (OP_DATA_32)
[1..32]  = 32-byte owner pubkey (x-only Schnorr)
[33]     = 0x01
[34]     = type byte (KRON = 0x03)
[35]     = 0x08
[36..43] = amount as little-endian uint64 (amount in sompi = KRON units)
[44]     = 0x01
[45]     = isMinter byte (0 = false)
[46..]   = 2387-byte covenant body (identical for all KRON UTXOs of same version)
```

To build a recipient redeemScript: copy template, replace bytes [1..32] with recipient pubkey, replace [36..43] with amount LE.

## P2SH scriptPublicKey

`0xaa 0x20 blake2b256(redeemScript) 0x87`

**Why:**
- Kaspa uses OP_BLAKE2B (0xaa) not OP_SHA256 (0xa9) for P2SH.

**Implementation:**
```typescript
import { blake2b } from '@noble/hashes/blake2.js';  // NOT blake2b, NOT blake2b/blake2b
const hash = blake2b(redeemScript, { dkLen: 32 });   // blake2b-256 (32-byte output)
```

**Verified:** blake2b256 of KRON UTXO 0's redeemScript = `2ab52cee...ef97` which matches the on-chain P2SH scriptPublicKey.

## signPskt transaction JSON format

Different from `signKaspaTransaction` format. Uses kaspa-wasm `Transaction.serializeToSafeJSON()` schema:

```json
{
  "version": 0,
  "inputs": [{
    "previousOutpoint": {"transactionId": "hex", "index": 0},
    "signatureScript": "",
    "sequence": "0",       // string not number
    "sigOpCount": 1,
    "utxoEntry": {         // "utxoEntry" not "utxo"
      "amount": "22086",   // string not number
      "scriptPublicKey": {"version": 0, "script": "aa20...87"},
      "blockDaaScore": "500185651",  // string
      "isCoinbase": false
    },
    "redeemScript": "207a97..."  // P2SH inputs only — wallet uses this for sighash
  }],
  "outputs": [{
    "value": "100",        // "value" not "amount", string
    "scriptPublicKey": {"version": 0, "script": "hex"}
  }],
  "lockTime": "0",
  "subnetworkId": "0000000000000000000000000000000000000000",
  "gas": "0",
  "payload": ""
}
```

**push-tx must handle both formats:** `out.amount ?? out.value` and `Number(inp.sequence ?? 0)`.

## Kaspa API field names

- Transaction DAA score: `accepting_block_blue_score` (NOT `accepting_blue_score` or `blue_score`)
- Endpoint: `GET https://api.kaspa.org/transactions/{txId}`

## Browser flow (home.tsx)

1. `handleExecuteDisperse` routes KCC-20 to `executeKcc20Disperse`
2. Re-batches `parsedRecipients` into groups of 3 (overrides the 50-batch default)
3. Per batch: POST `/api/kron/build-kcc20-transfer` → `kasware.signPskt({txJsonString, options:{signInputs}})` → POST `/api/kaspa/push-tx`
4. `signPskt` returns string or `{txJsonString}` — handle both.

## API server (`kron.ts`)

Endpoint: `POST /api/kron/build-kcc20-transfer`
Body: `{senderAddress, recipients:[{address,amount}], tick}`
Response: `{txJsonString, inputIndicesToSign, fee, totalAmount}`
