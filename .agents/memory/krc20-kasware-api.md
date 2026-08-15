---
name: KRC-20 disperse via KasWare native API
description: How KRC-20 batch transfers work in the Kaspa Disperse tool — wallet API, event handling, token info source.
---

## Rule
Use `kasware.krc20BatchTransferTransaction(list)` for KRC-20 bulk sends — do NOT build commit-reveal transactions manually.

**Why:** KasWare's wallet handles the commit-reveal inscription pattern internally. Each `IBatchTransfer` item gets its own commit+reveal pair, the wallet shows one approval per batch call, and progress is emitted via the `krc20BatchTransferChanged` event as each transfer settles.

## How to apply

**IBatchTransfer shape:**
```typescript
{ tick: string; dec?: string; to: string; amount: number | string }
// amount is in whole token units (not minimal units)
// dec is the token's decimal precision (e.g. "8")
```

**Event handling:**
```javascript
provider.on('krc20BatchTransferChanged', handler);
// handler receives IBatchTransferResult[]
// result.status: 'success' | 'failed'
// result.txId: { commitId, revealId } | undefined
// result.index: zero-based index in the batch list
```

**Token decimals:** Fetch from `https://api.kasplex.org/v1/krc20/token/{TICK}` → `result[0].dec`
**Wallet KRC-20 balance:** `provider.getKRC20Balance()` → array of `{ tick, balance (minimal units), dec }`

**No server-side route needed** — the wallet handles everything. The `/api/kaspa/build-tx` and `/api/kaspa/push-tx` routes are KAS-only.

**Batch size:** Still split into ≤50 recipients per `krc20BatchTransferTransaction` call for consistency with KAS batching, even though the wallet doesn't enforce a specific limit.
