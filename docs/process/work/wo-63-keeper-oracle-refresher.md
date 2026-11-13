# WO-63 — keeper — owner-price refresher for Railway + Feed/x402 data answers (< 2 h; commit `feat(keeper): owner-price refresher (WO-63)`)
Write only services/keeper/ (and services/feed/, services/x402/ only if a report item needs a test). H-ORACLE option A, Kunal 2026-11-12:
runs continuously on Railway through 2026-11-18 with a function-call key on nectar.testnet limited to nectar-core-v2 `update_owner_price`
(owner-only, no deposit: lib.rs:1434, F-015). Params: config.yaml `ops.oracle_refresher` (tick_s 60, session_max_age_s 600, closed_max_age_s 43200, run_until).
1. `services/keeper/src/oracle-refresher.ts` + script `oracle-refresher` (`pnpm --filter keeper oracle-refresher`). Key from ORACLE_REFRESHER_KEY_PATH
   (JSON {account_id, public_key, private_key}); account_id must equal config owner (`accounts.owner`); core from config. Each tick: view
   `get_exit_capacity {"symbol":"NVDAx"}`. Skip unless `oracle_source == "Owner"`. In-session = `session_open` true or `session_reason == "stale_price"`
   → refresh when `oracle_age_s ≥ session_max_age_s`; otherwise refresh when `≥ closed_max_age_s`. Refresh = `update_owner_price {symbol,
   price_usd_e6: <current on-chain oracle_price_usd_e6>}`, 0 deposit, 30 Tgas. Never another price. Stop cleanly after run_until. JSON log lines
   (decision, age, tx hash, rpc), never key material. Use the near-rpc.ts fallback list; backoff on errors; non-zero exit only for key/config errors.
2. Tests (mocked RPC): each decision branch, exact price re-asserted, skip when Pyth, stop after run_until, no deposit attached, key/owner mismatch refused.
3. Report answers (no code needed unless a test proves it): (a) Does the hosted Railway Feed record events now? (b) Which REST/MCP endpoints return
   empty in views mode? (c) For each demo step — new account gets test assets, borrow with Weekend Shield, position page + explorer link, the agent's
   x402 paid call — which data source it reads and whether it is empty. (d) Which Feed the local x402 server on :8791 uses upstream (the local Feed
   :8788 has been stale since 2026-11-11) and what the paid CSV contains; propose the smallest fix for the recording. Do NOT stop or restart host
   services (keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545).
`pnpm verify:quick` 0. DISK RULE: no pnpm install in the worktree (symlink node_modules). NO Co-Authored-By. Report ≤ 20 lines.
