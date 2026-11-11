---
name: rpc-providers
description: NEAR testnet RPC fallback list (FastNEAR x2, dRPC, Intear) lives in @nectar/sdk; FastNEAR shares one rate limiter with keeper/Feed during gates
metadata:
  type: project
---

Both FastNEAR hosts (test.rpc / rpc.testnet) sit behind one rate limiter shared with the host keeper + Feed during gate runs, so a -429 takes out both (GATE_FAIL_G3B_R3, 2026-11-11).
WO-34g (2026-11-12) added near-testnet.drpc.org and testnet-rpc.intea.rs (F-369 providers table; probed live, CORS open, same error shapes) to `TESTNET_RPC_FALLBACKS`; the transport fails over at once on 429/5xx/timeout/network, with no stickiness, so the fallbacks are contacted only while FastNEAR refuses.

**Why:** the CSP connect-src, data-inventory "declared" rows and the privacy page (docs-owned) must list exactly these hosts; a new host means CSP + inventory-annotations + docs.
**How to apply:** add/remove RPC hosts only in packages/sdk/src/rpc.ts, then lib/csp.ts BASE.connect, e2e/inventory-annotations.ts, content/data-inventory.*; tell the orchestrator so docs updates privacy.md. Live specs read via the SDK transport, never a raw FastNEAR fetch. See [[web-e2e-patterns]].
