# GATE FAIL — G3b re-run 3 (d4218d4) — 2026-11-11
Status: RESOLVED — G3b re-run 4 PASS on fd06e11 (EVIDENCE §G3b re-run 4). Evidence: docs/EVIDENCE.md §G3b re-run 3, evidence/G3/verifier-20261111T2144Z/.

## What failed
The full e2e did not reach 0 failed. Each of two runs had one desktop failure, and both were FastNEAR rate limits (-429):
- Run 1: 475/1/106 skipped. testnet.spec.ts:15: /api/health ok:false, because both RPCs refused.
- Run 2: 472/1/3 flaky. live-views.spec.ts:29: list_quotes -429.
No product assertion failed.

Everything else PASSED:
- site-pages 38/38, screens 46/46 ×2, hosts.spec 6/6.
- Inventory with the CSP enforced: 0 violations, 6/6 wallets, the 10 hosts match privacy.md.
- Polite crawl 0/0. Lighthouse 20 routes × 2 themes = 100.
- Production guard refuses null operator fields.
- Selector rows visible. Headers. `pnpm verify` 0. Branding check 0.

## Root cause
Both RPC endpoints the app falls back between are FastNEAR (test.rpc.fastnear.com, rpc.testnet.fastnear.com), so one rate limiter covers both. The
host services (keeper, Feed) share the same IP and quota during gate runs. The same limit will hit the hosted app's server-side /api/health from Vercel.

## Fix (within scope): WO-34g web
- RPC fallback across providers: add the non-FastNEAR public testnet hosts from F-369 (dRPC, Intear), probed live first.
- /api/health honest under rate limits.
- Live e2e specs retry with backoff.
- CSP + inventory updated; privacy page lists the fallback hosts (docs).
Then G3b re-run 4 on the new code-final commit. Nothing deploys while this is OPEN.
