# interface-p1.md — P1 ABI and quoter I/O (orchestrator, 2026-11-10; decisions D-013, D-014)

Extends docs/work/interface-p0.md (unchanged rules: U128/U64 as strings, bps numbers, round against the borrower).

## Quoter (WO-9) — OutLayer wasm32-wasip2, deterministic, integer-only
**stdin** (UTF-8 JSON, ≤ 4 KiB, built by the contract):
`{"v":1,"symbol":"NVDAx","position_id":"0","oracle_price_usd_e6":"140000000","session_open":false,"seize_usd_e6":"11250000000",
"vol_bps":420,"quotes":[{"id":"0","max_discount_bps":250,"remaining_usd_e6":"10000000000"}]}` (≤ 8 quotes, ascending max_discount then id)
**secrets** (env, buyer's OutLayer profile): `MM_<id>_Q_BPS` (inventory utilisation 0..10000), `MM_<id>_GAMMA_BPS` (risk aversion 0..10000).
**formula** (D-014): `disc = min(max_discount_bps, vol_bps + q_bps·gamma_bps·vol_bps / 1e8)`, integer floor. Missing/invalid secret for a quote → `disc = max_discount_bps` (P0 behaviour).
**stdout** (one line, ≤ 900 B with 8 fills, F-043): `{"v":1,"symbol":"NVDAx","position_id":"0","input_sha256":"<64 hex of the exact stdin bytes>",
"price_e6":"140000000","src":"oracle","depth_e6":"0","depth_src":"none","session_open":false,"vol_bps":420,
"fills":[{"id":"0","disc_bps":65}],"model":"as-v1"}`. Outbound HTTP is optional and off in P1 (Hermes needs a key, C-007; NVDAx has no 1Click route, F-063): `src` stays `"oracle"`, `depth_src` `"none"`.
Any parse error → print `{"v":1,"error":"<short>"}` and exit 0 (the contract falls back).
`quoter/tests/vectors.json`: ≥ 20 cases `{stdin, env, expected_stdout_fields}`, shared with contract unit tests (WO-10).

## Contract additions (WO-10) — feature `p1` becomes default; state is versioned
- **Upgrade:** `#[init(ignore_state)] migrate()` (owner-only via predecessor == current account after deploy, or owner check) reads the P0 borsh
  layout and writes V1 with new fields defaulted. Sandbox test: deploy P0 wasm, seed, deploy P1 wasm, `migrate`, all P0 views unchanged.
- Owner: `set_quoter_pin(project_id: String, version_key: String)` (empty strings disable → P0 static pricing), `set_quoter_config(deposit_yocto: U128,
  gas_tgas: u64, max_instructions: U64, max_memory_mb: u32, max_execution_seconds: u32)`, `set_vol_bps(symbol, vol_bps: u16)`,
  `set_oracle_source(symbol, source: {"Owner"} | {"Pyth":{"account":"pyth-oracle.testnet","price_identifier":"<hex>"}})`, `set_max_conf_bps(u16)`.
- `trigger_preliquidation(position_id)` (keeper, 0 deposit, unchanged signature): if source is Pyth → `get_price(price_identifier)` on the Pyth
  contract, callback accepts it only if `publish_time` age ≤ max age and `conf ≤ price·max_conf_bps/1e4` and within band, else emits
  `oracle_rejected` and aborts (position back to Open). Then, if a quoter pin is set → `outlayer.testnet.request_execution` (F-047: source
  `{Project:{project_id, version_key}}`, explicit `resource_limits` always, `input_data` = stdin above, `response_format` Json,
  `payer_account_id` = self, deposit `deposit_yocto` from `gas_reserve_yocto`) `.then(on_quoter_result(position_id, input_sha256))`; else P0 settle.
- `on_quoter_result` `#[private]`: result `null`/unparseable/`error`/wrong v/symbol/position/input_sha256/unknown quote id → fallback to each quote's
  `max_discount_bps`, event `quoter_fallback{position_id, reason}`; else clamp each `disc_bps` to `[0, max_discount_bps]`, event
  `quoter_result{position_id, input_sha256, fills:[{quote_id, disc_bps}]}`; then the P0 settlement path with those discounts.
- `fund_gas_reserve` unchanged; views add `get_quoter_config()`, `get_oracle_source(symbol)`; `get_exit_capacity` adds `oracle_source`.
- **No `update_price_feeds` passthrough** (D-013): pushing Hermes data into pyth-oracle.testnet needs a deposit, which the keeper's
  function-call key cannot attach; a separate updater account does it (WO-11).
- Gas: trigger with Pyth read + quoter + 8 legs must fit 300 Tgas; record each leg in the sandbox (stub contracts in contracts/test-stubs/).

## Keeper / Feed (WO-11)
- Oracle updater (only when a Pyth key exists, H13): `ORACLE_UPDATER_ACCOUNT_ID` + `ORACLE_UPDATER_KEY_PATH` (0600, separate account, small balance)
  fetch Hermes with `Authorization: Bearer $PYTH_API_KEY` (F-056) → `pyth-oracle.testnet.update_price_feeds` with the fee as deposit. Without the
  key the updater is disabled and logs why.
- 1Click (F-060..F-064): `POST /v0/quote` `dry:true` every 5 min per configured asset; `verifyQuoteSignature(resp)` must be true or the sample is
  discarded; store `amountInUsd/amountOutUsd`. NVDAx: record "no 1Click route" (F-063); also sample one routable pair (e.g. NEAR→USDC on NEAR)
  so G6 has a verified signed quote.
- Indexer: Neardata block polling (F-122) for receipts to nectar-core, view polling stays as fallback.
- Feed MCP (F-160, sdk 1.32.2): tools `get_exit_capacity`, `preview_borrow`, `list_quotes` (no buyer ids), `explain_limit` — stdio + Streamable HTTP; README section.

## Web (WO-12)
Feed: Q_c/R_c/D_c, exit gap, uplift, oracle badge (source, age, conf), settlement history with `disc_bps` and an OutLayer execution link when
`quoter_result` exists, "no 1Click route" for NVDAx. Quote form: 7-day / 30-day presets (D-009). Console (owner): quoter pin/config, vol_bps,
oracle source, pause — every write previewed. Keepers: last triggers from the feed API, "run a keeper" snippet.
