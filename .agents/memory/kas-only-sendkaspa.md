---
name: KAS single-approval dispersal
description: The validated KasWare Safe JSON contract for one atomic multi-output KAS dispersal.
---

Build one multi-output Safe JSON transaction containing every recipient, the fixed service-fee output, and sender change; use `kaspa-wasm` to compute its top-level `id`, sign once with KasWare `signPskt` using Sighash All, then broadcast the returned string unchanged with `pushTx`.

**Why:** KasWare's Safe JSON parser requires a valid top-level `id` in addition to flat `transactionId`/`index` input fields, serialized script public keys, string amounts, and explicit mass. Omitting it fails before signing with `missing field id`.

Kaspa mainnet separately limits compute mass to 100,000 and KIP-0009 storage mass to 500,000. The installed WASM helper exposes compute mass only; validate populated inputs and output amounts through Kaspa's authoritative transaction-mass API.

**Why:** A transaction can be well below the compute limit but still be rejected for storage mass. Storage mass is amount-sensitive, and adding an input can lower it, so minimal-input feasibility is not monotonic by recipient count.

**How to apply:** Fetch authoritative UTXOs, exclude mempool-spent outpoints, calculate both dimensions, try additional available inputs before splitting on storage mass, charge authoritative mass × 100 sompi, and derive the ID from the final unsigned transaction. Do not convert signed JSON through the REST broadcast schema.

The user confirmed the complete Kaspa distribution flow works correctly in live use.

**Why:** Future UI, hosting, or wallet-detection changes should preserve the proven transaction-building, signing, fee, and broadcast behavior rather than replacing it during unrelated work.

**How to apply:** Treat the existing KAS transaction flow as the regression baseline and keep future fixes narrowly scoped unless the user explicitly requests transaction-logic changes.

After KasWare returns a transaction ID, show a prominent completion confirmation with a direct Kaspa Explorer link; multi-batch distributions need one link per completed batch.

**Why:** Recipient-row links alone were too easy to miss. The user confirmed the campaign-level completion message works as intended.

**How to apply:** Preserve completed-batch links even if a later batch fails, and reset them only when a new recipient list starts a new campaign.

Batch size must be derived from the complete live transaction mass, not a fixed recipient cap or the numeric KAS amount alone.

**Why:** Larger payments can select more UTXOs, increasing input mass even when recipient count is unchanged; a fixed wallet count can therefore pass for one wallet state and fail for another.

**How to apply:** Find the largest safe recipient slice using actual UTXOs, outputs, change, and fees; rebuild and recalculate after each confirmed batch because the spendable UTXO set changes.