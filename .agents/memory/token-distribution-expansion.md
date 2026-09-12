---
name: Token distribution expansion
description: Feasibility and product constraints for adding KRC-20 and KCC-20 asset discovery and distribution.
---

KRC-20 and KCC-20 can share the KAS distributor's recipient-entry and review experience, but they must use separate asset-specific transaction engines.

**Why:** Native KAS uses one atomic multi-output transaction. KRC-20 uses indexer-derived balances and wallet-managed commit/reveal operations, while KCC-20 ownership lives in covenant UTXOs with implementation-specific state and output constraints.

**How to apply:** Keep the proven KAS transaction flow unchanged. If token support is pursued, start with KasWare-only KRC-20 discovery and batch transfer, showing per-recipient commit/reveal results and avoiding atomicity claims.

KRC-20 holdings can be discovered through KasWare's provider balance API and verified through an indexer such as Kasplex or kas.fyi. Website support must be capability-detected because a wallet supporting KRC-20 internally does not guarantee it exposes compatible dApp methods.

**Why:** Injected wallet APIs are fragmented, token balances depend on off-chain protocol interpretation, and a batch can partially complete.

**How to apply:** Use integer units and verified decimals, identify the indexer, reconcile wallet/indexer results, estimate required native KAS, and track every transfer result rather than treating the batch as one atomic transaction.

KCC-20 support should initially be limited to explicitly validated covenant implementations, not marketed as universal support for every detected KCC-20 token.

**Why:** The reviewed KCC-20 specification was still a community-review draft in September 2026. Covenant layouts, ownership rules, recipient public-key requirements, fixed KAS output values, output counts, and mass limits can differ. Detecting a holding does not prove the app knows how to transfer it.

**How to apply:** Query a covenant indexer for discovery, distinguish detected assets from supported assets, validate covenant version/profile and recipient compatibility, and implement an allowlisted adapter per covenant. Expect small batches and potentially one wallet approval per transaction.

For holder-reward distributions that produce multiple native-KAS transactions, charge the fixed 100 KAS service fee in every mass-safe transaction.

**Why:** The user explicitly selected per-batch charging. Each batch is an independent atomic KAS transaction and requires its own KasWare approval.

**How to apply:** Show the transaction count and per-transaction approval requirement before signing. Preserve completed batches if a later batch fails, and never retry a broadcast blindly.

Complete holder import is allowed only when the indexer can enumerate every holder. KCC-20 supports cursor pagination; the public Kasplex KRC-20 API exposes only its top holders and must not be treated as complete.

**Why:** A silently truncated holder list would produce an incomplete reward distribution.

**How to apply:** Reject partial KRC-20 imports until a verified full-holder provider is available. Do not cap a complete source; paginate, deduplicate, and import all resolved Kaspa owner addresses.