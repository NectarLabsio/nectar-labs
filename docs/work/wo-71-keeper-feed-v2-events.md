# WO-71 — keeper — hosted Feed indexes nectar-core-v2 events (version 2.0.0) (< 75 min; commit `fix(feed): index nectar-core-v2 events (2.0.0) (WO-71)`)
Kunal 2026-11-13: fix now, scoped to services/feed. Write only services/feed/** and evidence/WO-71/. No other package, no contract change, no web change.
Bug (docs/FINAL_REPORT.md FAILED 1): services/feed/src/events.ts:7,:34 accept only version "1.0.0"; nectar-core-v2 emits "2.0.0" (contracts/nectar-core/src/events.rs:8);
services/feed/test/feed.test.ts:55 asserts 2.0.0 is rejected. The hosted Feed therefore indexes no event.
1. FIRST (before any code change): compare, event by event, the `data` fields nectar-core-v2 emits (contracts/nectar-core/src/events.rs + every `emit(` call in
   contracts/nectar-core/src/*.rs) with what services/feed reads (events.ts NECTAR_EVENTS, db.ts ingest `case` arms, str()/num() field reads, api.ts/export CSV
   columns). Write evidence/WO-71/fields.md: one row per event — v1 fields read by the Feed · v2 fields emitted · difference (missing / renamed / type / new) ·
   Feed action. Include v2 events the Feed does not know yet (decide: index or ignore, and say why). Commit this file in the same commit.
2. Accept "2.0.0". Keep "1.0.0" only if, for every event the Feed reads, the fields are identical; otherwise drop 1.0.0 (say so in fields.md). Map any
   renamed/changed fields explicitly; never guess a field; unknown events stay ignored.
3. Tests: replace the "2.0.0 rejected" assertion. Add fixtures from REAL testnet log lines (fetch with RPC `tx`, archival-rpc.testnet.fastnear.com if needed):
   at least today's oracle refresh tx De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG (sender nectar.testnet; oracle_updated in block 277503817), plus any
   position_opened / repaid / quote_* / settled_* v2 lines you can find in docs/EVIDENCE.md tx hashes on nectar-core-v2.nectar.testnet. Quote the tx hash
   next to each fixture. Test that each fixture ingests into the DB with the expected row values.
4. Observability (small, additive): /health gains `indexer_cursor` (the neardata cursor, SQLite meta) and `indexer_lag_blocks` (neardata final − cursor), null
   in views-only mode. Nothing else in /health changes.
5. `pnpm --filter feed test` 0 failures; `pnpm verify:quick` 0. DISK RULE: symlink node_modules, no install in the worktree. NO Co-Authored-By.
Report ≤ 15 lines: the fields.md differences (one line per event that differs), 1.0.0 kept or dropped, test counts, fixture tx hashes.
