# GATE_FAIL_G2b — v2 testnet deploy — 2026-11-10 16:40Z — verifier run at 1c4cdb3 (EVIDENCE 03a8d5f)
**What failed:** `pnpm verify` exits 1: two tests assert the v1 core id after the config switch to v2 —
`services/feed/test/defaults.test.ts:21,26` and `services/keeper/test/keyfile.test.ts:43` expect `nectar-core.nectar.testnet`.
**What passed:** accounts + code (deployed code byte-identical to the clone's build, 734,784 B, sha 252a6abe…), keeper-v2 single function-call key with
the 5 D-019 methods, every v2 view, `pnpm demo:testnet` against v2.
**Why:** the tests pinned the literal default id instead of reading `accounts.core` from config.yaml (the v2 switch is a config change, D-018).
**Fix (in scope):** keeper agent WO-16b: the tests read the expected id from config.yaml (or assert shape, not the literal). Orchestrator: config.yaml
comments "TODO-G2b (not created yet)" removed. Then the verifier re-runs G2b (`pnpm verify` + a re-read of views).
