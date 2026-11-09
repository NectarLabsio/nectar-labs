# WO-11b — keeper/feed — Pyth updater (gated) + Neardata indexer (P1; ≤ 40 tool calls)
Spec: docs/work/interface-p1.md §Keeper/Feed, D-013, FACTS F-054, F-056, F-120..F-122.
1. services/keeper/src/oracle-updater.ts: disabled unless PYTH_API_KEY_PATH (0600 file) AND ORACLE_UPDATER_ACCOUNT_ID + ORACLE_UPDATER_KEY_PATH
   (0600) are set; logs `oracle_updater_disabled{reason}` otherwise. When enabled: GET Hermes `/v2/updates/price/latest?ids[]=<feed>` with
   `Authorization: Bearer <key>` (F-056; header shape unverified for Hermes — make it configurable), then
   `pyth-oracle.testnet.update_price_feeds(data)` with the fee as deposit (read the fee from the Pyth contract view per F-054; if F-054 lacks
   the fee view name, leave it configurable and say so). Never log the API key. Unit tests with recorded fixtures only — no live Hermes call
   (no key exists yet, H13), no transactions.
2. services/feed indexer: Neardata source (F-122) polling `/v0/last_block/final` → blocks; extract nectar-core receipts' NEP-297 logs from
   `receipt_execution_outcomes`; resume from the last height in SQLite; idempotent; view polling stays as fallback (config switch).
   F-122 marks the receipt-outcome field shape VERIFY: capture one real block containing a nectar-core receipt (read-only GET; find a recent
   block height from `pnpm demo:testnet` evidence or RPC tx status of the G2 seed txs in evidence/G2/seed-*.log) as a fixture and code to it.
Acceptance: keeper + feed tests and typecheck green; `pnpm verify:quick` green. Commit `feat(keeper):` / `feat(feed):`.
