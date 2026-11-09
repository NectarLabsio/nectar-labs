# interface-p0.md — the P0 contract ABI every agent codes against (orchestrator, 2026-11-10)

Source: PRD §4, §6, §8 + D-009/D-010. WO-2 implements exactly this; WO-3 (`packages/sdk`) and WO-5 type against it.
A change here goes through the orchestrator; agents report mismatches instead of improvising.

## Encoding
- All u128 amounts are JSON strings (`U128`); u64 timestamps/ids are JSON strings (`U64`). bps are numbers (u16).
- Suffixes: `_usd_e6` (USDC 6 dp), `_e18` (fee index), `_ns` (nanoseconds), `_bps`.
- Collateral is keyed by `symbol` (e.g. `"NVDAx"`). `V_usd_e6 = units * price_usd_e6 / 10^decimals`. Round against the borrower.
- `B_c = min(max_nectar_ltv_bps·V/1e4, (1e4−h_c)·(Q_c+R_c+D_c)/1e4)`; `h_c = base_haircut_bps` if `market_session_open` else `weekend_haircut_bps` and `D_c = 0`.
- Oracle fresh iff `now − oracle_updated_ns ≤ max_age_ns_session` (session open) or `≤ max_age_ns_closed` (closed).

## ft_on_transfer msg (serde externally tagged enum, JSON)
- `"SupplyLendingLiquidity"` (usdc)
- `{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":250,"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}` (usdc; notice ≥ min; amount ≥ min_quote; ≤ 64 live quotes per asset else full refund)
- `{"TopUpQuote":{"quote_id":"0"}}` (usdc)
- `{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"…","pre_liq_ltv_bps":7500}}` (collateral token; fresh oracle; borrow ≤ B_c and ≤ pool; premium = max(0, borrow − base_ltv·V)·limit_premium_bps/1e4 deducted from proceeds; pre_liq_ltv within [pre_liq_min, pre_liq_max]; any failure → full refund, no state change)
- `{"Repay":{"position_id":"0"}}` (usdc; returns unused)
- unknown/invalid msg → return full amount. Unknown predecessor token → panic.

## Change methods
| method | caller | deposit | notes |
| --- | --- | --- | --- |
| `new(owner, usdc_token, keeper)` | init | — | |
| `upsert_collateral(symbol, config: CollateralInput)` | owner | 0 | CollateralInput = config.yaml `collateral.nvdax` fields |
| `set_keeper(keeper)`, `set_fee_split(buyers_bps, lenders_bps, treasury_bps)`, `set_session(symbol, open)`, `set_dex_depth(symbol, depth_usd_e6)`, `set_reserve(symbol, reserve_usd_e6)`, `set_quote_params(min_notice_period_ns, min_quote_usd_e6)`, `set_oracle_params(max_age_ns_session, max_age_ns_closed, band_bps)` | owner | 0 | |
| `update_owner_price(symbol, price_usd_e6)` | owner | 0 | P0 owner oracle; rejects (event `oracle_rejected`) if > band_bps from last accepted |
| `propose_price(symbol, price_usd_e6)` / `apply_price(symbol)` | owner | 0 | two-step override that bypasses the band |
| `pause()` / `unpause()` | owner | 0 | paused: all money paths refuse; views and withdrawals of *completed* notice still allowed |
| `fund_gas_reserve()` | owner | yes (`#[payable]`) | |
| `initiate_quote_withdrawal(quote_id)` | buyer | 1 yocto | settles fees, Q_c −= remaining, unlock_ns = now + notice |
| `complete_quote_withdrawal(quote_id)` | buyer | 1 yocto | after unlock; zero then ft_transfer; callback restores on failure |
| `claim_fees(quote_id)` | buyer | 1 yocto | |
| `trigger_preliquidation(position_id)` | keeper | 0 | not `#[payable]`; requires fresh oracle and `debt·1e4 > V·pre_liq_ltv_bps`; P0 static settle at each quote's max_discount_bps, ≤ 8 quotes, ascending max_discount_bps then oldest |
| `relay_settlement_result`, `on_quoter_result`, `on_signature` | — | — | feature-gated stubs (`p1`, `p2`), not in default build |

## Views
`contract_version() -> String` · `get_config()` · `get_collateral(symbol)` · `list_collaterals(from_index, limit)` ·
`get_exit_capacity(symbol) -> {q_usd_e6, r_usd_e6, d_usd_e6, haircut_bps, session_open, oracle_price_usd_e6, oracle_age_s, oracle_fresh, b_c_usd_per_unit_e6?, limit_bps_effective}` ·
`get_quote(quote_id)` · `list_quotes(symbol, from_index, limit)` · `get_position(position_id)` · `list_positions(from_index, limit)` ·
`get_health(position_id) -> {value_usd_e6, debt_usd_e6, ltv_bps, pre_liq_ltv_bps, oracle_fresh, triggerable}` ·
`get_pool() -> {available_usd_e6, utilised_usd_e6, treasury_usd_e6, lenders_fees_usd_e6}` ·
`preview_borrow(symbol, units, borrow_usd_e6) -> {b_c_usd_e6, static_limit_usd_e6, premium_usd_e6, ok, reason}`
Position `status`: `"Open" | "Settling" | "Closed"`.
Item shapes (clarified 2026-11-10 after WO-5): every quote object carries `quote_id` (U64 string) plus `buyer, collateral,
committed_usd_e6, remaining_usd_e6, max_discount_bps, notice_period_ns, unlock_ns (null|U64), buyer_remote_recipient,
fee_debt_e18, claimable_fees_usd_e6`; every position object carries `position_id` (U64 string) plus `borrower, collateral,
units, debt_usd_e6, premium_usd_e6, pre_liq_ltv_bps, opened_ns, status`. `list_*` return arrays of these objects, never tuples.

## Events (NEP-297, `standard:"nectar"`, `version:"1.0.0"`, `data` is an array of one object)
`quote_funded{quote_id,buyer,collateral,amount_usd_e6,max_discount_bps}` · `quote_topped_up{quote_id,amount_usd_e6}` ·
`quote_exiting{quote_id,unlock_ns}` · `quote_withdrawn{quote_id,principal_usd_e6,fees_usd_e6}` · `fees_claimed{quote_id,amount_usd_e6}` ·
`liquidity_supplied{account,amount_usd_e6}` · `position_opened{position_id,borrower,collateral,units,debt_usd_e6,premium_usd_e6}` ·
`repaid{position_id,amount_usd_e6,remaining_debt_usd_e6}` · `preliq_triggered{position_id,keeper}` ·
`settled_near{position_id,quote_id,disc_bps,repay_usd_e6,seize_units,buyer}` · `oracle_updated{symbol,price_usd_e6}` · `oracle_rejected{symbol,price_usd_e6,last_usd_e6}` ·
`collateral_upserted{symbol}` · `paused{}` · `unpaused{}`

## Accepted additions from WO-2 (2026-11-10, orchestrator)
- `get_exit_capacity` adds `capacity_usd_e6` (= (1e4−h_c)·(Q+R+D)/1e4); `b_c_usd_per_unit_e6` = max_nectar_ltv·price/1e4;
  `limit_bps_effective` = max_nectar_ltv_bps when capacity > 0, else 0.
- `get_owed_collateral(account)` view + `payout_failed{...}` event: collateral whose ft_transfer failed is recorded as owed
  (claim method not built in P0 — disclosed limitation).
- Quote gains `created_ns`; Position gains `premium_usd_e6`; `update_owner_price` returns `bool` (false = band rejection).
- Borrow refunded if it would already exceed `pre_liq_ltv` at open. Pre-liquidation repays the full debt; keeper fee paid in
  collateral units. Paused: `initiate_quote_withdrawal` allowed, `claim_fees` refused.
- Rounding: V↓, ltv↑, B_c↓, static limit↓, premium↑, seize units↑, fee debt↑; ltv with V=0 & debt>0 = u32::MAX.
- `from_index`/`limit` are u32 JSON numbers.

## Test vectors
`contracts/nectar-core/tests/model.py` writes `tests/model.csv` (columns documented in the file). WO-5 health math and WO-3 preview UI
read the same CSV; nobody re-derives the maths by hand.
