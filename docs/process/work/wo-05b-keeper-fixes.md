# WO-5b — keeper — model.csv loader + full-access refusal (small: ≤ 20 tool calls)
1. services/keeper/test/health.test.ts: since WO-2 merged, the tests read contracts/nectar-core/tests/model.csv, which has row kinds
   (`limit`, `leg`, …). Columns irrelevant to a kind are empty, so `missing column value_usd_e6` fires on `leg` rows (main is red).
   Filter rows by `kind` before reading kind-specific columns; keep the loud failure for a missing column on a row whose kind needs it.
   Assert the number of `limit` rows checked (>0) so the test can't pass vacuously.
2. Startup: refuse to start (exit 2, clear message) if the key at KEEPER_KEY_PATH is a FullAccess key on chain (today it only flags
   `/healthz` 503 FULL_ACCESS and keeps running). Unit test with a mocked access-key view. D-012 stays the primary control.
Acceptance: `pnpm --filter keeper test` + typecheck green; then `pnpm verify:quick` green from the repo root. Commit `fix(keeper):`.
