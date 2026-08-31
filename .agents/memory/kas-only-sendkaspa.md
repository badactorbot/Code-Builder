---
name: KAS wallet-managed sending
description: The confirmed reliable approach for native KAS dispersals.
---

Use the connected wallet's `sendKaspa()` for each recipient rather than assembling multi-output transactions or manually selecting UTXOs.

**Why:** A wallet-managed single-recipient send avoids server-side transaction-format mismatches and lets the wallet choose valid inputs. Sequential sends can briefly encounter Kaspa's orphan-disallowed response when a later send tries to spend fresh change, so the flow needs a short delay and retry handling for orphan errors.

**How to apply:** Preserve this approach for native KAS dispersal changes. Keep token/covenant transaction code separate from the KAS-only flow.