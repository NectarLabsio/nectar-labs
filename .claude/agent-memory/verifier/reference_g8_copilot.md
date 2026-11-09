---
name: g8-copilot-recipe
description: How to run and judge G8 (NEAR AI copilot verifier) — fixture nature, spec weakness, README overclaim trap
metadata:
  type: reference
---

G8 = `pnpm --filter web test:copilot` (fixture; `-- --live` exits 1 without NEAR_AI_API_KEY, H7).
- Fixture is NOT a NEAR AI recording: Phala dcap-qvl sample TDX quote (real Intel chain) + chat signed by a throwaway key; quote has
  patched report_data, so DCAP must fail → "unverified — hidden" is the correct end state.
- e2e/copilot.spec.ts: since WO-17c (df4706f) asserts the exact "Key missing" banner + browser/server intro sentences; no separate probe needed.
- Overclaim trap (FAIL at 2b49f42, 2026-11-09): README `privacy` line said "copilot answers are TEE-signed and verified" while the status row
  said "not built". Grep README + docs-site for copilot/NEAR AI on every re-run.
- cloud-api.near.ai /v1/models returned 500 (DB pool error) on 2026-11-09 23:44Z. Record the status, never retry with a key.
Re-run PASS (fixture) 2026-11-09T23:56Z at df4706f; /v1/models still 500. Docs then still said "G8 re-run pending" (stale, not an overclaim).
Related: [[explorer-webfetch-403]]
