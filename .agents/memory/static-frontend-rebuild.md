---
name: Static frontend rebuild
description: How to get frontend code changes into the published (deployed) app.
---

The published app serves static files from `artifacts/kaspa-disperse/dist/public`.
The Vite dev workflow serves the latest source directly, but the published deployment serves the last *built* bundle.

**Rule:** After any frontend change that must reach published users, run:
```
cd artifacts/kaspa-disperse && PORT=22434 BASE_PATH=/ pnpm run build
```

**Why:** The deployment process (`artifacts/api-server/dist/index.mjs`) is started by the Replit deployment manager at boot. It reads static files off disk — so a fresh build is picked up immediately without restarting the server.

**How to apply:** Anytime a fix is only in `src/` but the user reports the bug still exists on the published URL, the static bundle is stale. Rebuild first, then verify.
