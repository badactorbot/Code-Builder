---
name: KAS single-approval dispersal
description: The validated KasWare Safe JSON contract for one atomic multi-output KAS dispersal.
---

Build one multi-output Safe JSON transaction containing every recipient, the fixed service-fee output, and sender change; use `kaspa-wasm` to compute its top-level `id`, sign once with KasWare `signPskt` using Sighash All, then broadcast the returned string unchanged with `pushTx`.

**Why:** KasWare's Safe JSON parser requires a valid top-level `id` in addition to flat `transactionId`/`index` input fields, serialized script public keys, string amounts, and explicit mass. Omitting it fails before signing with `missing field id`.

Kaspa mainnet nodes enforce a minimum relay fee of 100 sompi per compute-mass unit. Do not use the installed WASM helper's returned mass value directly as the sompi fee; a 6,156-mass transaction requires 615,600 sompi.

**How to apply:** Fetch authoritative UTXOs, exclude mempool-spent outpoints, calculate final mass, charge `mass × 100` sompi, derive the ID from the exact unsigned transaction, and reject transactions above the 100,000 standard-mass ceiling. Do not convert the wallet's signed JSON through the REST broadcast schema.

The user confirmed the complete Kaspa distribution flow works correctly in live use.

**Why:** Future UI, hosting, or wallet-detection changes should preserve the proven transaction-building, signing, fee, and broadcast behavior rather than replacing it during unrelated work.

**How to apply:** Treat the existing KAS transaction flow as the regression baseline and keep future fixes narrowly scoped unless the user explicitly requests transaction-logic changes.