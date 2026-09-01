---
name: KAS single-approval dispersal
description: The validated KasWare Safe JSON contract for one atomic multi-output KAS dispersal.
---

Build one multi-output Safe JSON transaction containing every recipient, the fixed service-fee output, and sender change; sign once with KasWare `signPskt` using Sighash All, then broadcast the returned string unchanged with `pushTx`.

**Why:** KasWare's documented Safe JSON uses flat `transactionId`/`index` input fields, serialized script public keys, string amounts, and an explicit mass. This format passed a mocked end-to-end wallet flow, while the older per-recipient `sendKaspa` flow required repeated approvals.

**How to apply:** Fetch authoritative UTXOs, exclude mempool-spent outpoints, calculate mass and relay fee from the final input/output counts, and reject transactions above the 100,000 standard-mass ceiling. Do not convert the wallet's signed JSON through the REST broadcast schema.