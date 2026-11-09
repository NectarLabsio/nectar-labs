---
title: Contract reference
slug: /protocol/contract-reference
description: nectar-core P0 methods, messages, views and events.
---
# Contract reference (`nectar-core`, P0)

<p className="verified">Verified against: F-010 (2026-11-10), F-013 (2026-11-09), F-018 (2026-11-10), F-021 (2026-11-09), F-028 (2026-11-10) · docs/work/interface-p0.md (2026-11-10) · D-009, D-010 (2026-11-10)</p>
<p className="status">Status: interface specification that WO-2 implements. Deployed on testnet as `nectar-core.nectar.testnet` on 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). If the built ABI differs, the ABI wins and this page is corrected.</p>

Built with `near-sdk` 5.30.1 (F-010) and `cargo near build` (F-011). The contract account is [`nectar-core.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core.nectar.testnet).

## Encoding

- `u128` amounts are JSON strings (`U128`). `u64` timestamps and ids are JSON strings (`U64`). bps values are numbers (`u16`).
- Suffixes: `_usd_e6` (USDC, 6 decimals), `_e18` (fee index), `_ns` (nanoseconds), `_bps` (basis points, 10,000 = 100 %).
- Collateral is keyed by `symbol` (for example `"NVDAx"`). `V_usd_e6 = units · price_usd_e6 / 10^decimals`. Rounding is against the borrower.

## Token entry: `ft_on_transfer(sender_id, amount, msg)`

All money enters through NEP-141 `ft_transfer_call`, which requires exactly 1 yoctoNEAR (F-013). `msg` is a JSON, externally tagged enum:

| `msg` | Token | Effect |
| --- | --- | --- |
| `"SupplyLendingLiquidity"` | USDC | adds to the lending pool |
| `FundPappusQuote` with `collateral`, `max_discount_bps`, `notice_period_ns`, `buyer_remote_recipient` | USDC | new quote. Notice ≥ minimum, amount ≥ `min_quote_usd_e6`, at most 64 live quotes per asset, otherwise full refund |
| `TopUpQuote` with `quote_id` | USDC | settles fees, then adds to the quote |
| `LockCollateralAndBorrow` with `collateral`, `borrow_usd_e6`, `pre_liq_ltv_bps` | collateral token | fresh oracle required; `borrow ≤ B_c` and `≤ pool`; premium deducted; `pre_liq_ltv_bps` within the owner's bounds. Any failure refunds in full with no state change |
| `Repay` with `position_id` | USDC | reduces debt; returns the unused amount |
| unknown or invalid | any configured token | returns the full amount |

A token that is neither USDC nor a configured collateral makes `ft_on_transfer` panic.

```json
{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"38850000000","pre_liq_ltv_bps":7500}}
```

## Change methods

| Method | Caller | Deposit | Notes |
| --- | --- | --- | --- |
| `new(owner, usdc_token, keeper)` | init | — | |
| `upsert_collateral(symbol, config)` | owner | 0 | fields as `config.yaml` `collateral.nvdax` |
| `set_keeper`, `set_fee_split`, `set_session`, `set_dex_depth`, `set_reserve`, `set_quote_params`, `set_oracle_params` | owner | 0 | each emits an event or is visible in `get_config` |
| `update_owner_price(symbol, price_usd_e6)` | owner | 0 | P0 owner oracle. Rejected with `oracle_rejected` if more than `band_bps` from the last accepted price |
| `propose_price(symbol, price_usd_e6)` then `apply_price(symbol)` | owner | 0 | two-step override that bypasses the band |
| `pause()` / `unpause()` | owner | 0 | paused: money paths refuse. Views and completion of an elapsed withdrawal still work |
| `fund_gas_reserve()` | owner | NEAR (payable) | pays P1/P2 cross-contract costs |
| `initiate_quote_withdrawal(quote_id)` | buyer | 1 yocto | see [Notice periods](/concepts/notice-periods) |
| `complete_quote_withdrawal(quote_id)` | buyer | 1 yocto | after `unlock_ns` |
| `claim_fees(quote_id)` | buyer | 1 yocto | |
| `trigger_preliquidation(position_id)` | keeper | 0 (not payable) | fresh oracle, LTV above `pre_liq_ltv_bps`; P0 static settle, at most 8 quotes |
| `relay_settlement_result`, `on_quoter_result`, `on_signature` | — | — | feature-gated stubs (`p1`, `p2`), not in the default build |

## Views

| View | Returns |
| --- | --- |
| `contract_version()` | string |
| `get_config()` | owner, keeper, tokens, fee split, quote and oracle params |
| `get_collateral(symbol)` / `list_collaterals(from_index, limit)` | collateral config |
| `get_exit_capacity(symbol)` | `q_usd_e6`, `r_usd_e6`, `d_usd_e6`, `haircut_bps`, `session_open`, `oracle_price_usd_e6`, `oracle_age_s`, `oracle_fresh`, `limit_bps_effective` |
| `get_quote(quote_id)` / `list_quotes(symbol, from_index, limit)` | quotes |
| `get_position(position_id)` / `list_positions(from_index, limit)` | positions; `status` is `"Open"`, `"Settling"` or `"Closed"` |
| `get_health(position_id)` | `value_usd_e6`, `debt_usd_e6`, `ltv_bps`, `pre_liq_ltv_bps`, `oracle_fresh`, `triggerable` |
| `get_pool()` | `available_usd_e6`, `utilised_usd_e6`, `treasury_usd_e6`, `lenders_fees_usd_e6` |
| `preview_borrow(symbol, units, borrow_usd_e6)` | `b_c_usd_e6`, `static_limit_usd_e6`, `premium_usd_e6`, `ok`, `reason` |

Read a view with near-cli-rs (F-018) once deployed:

```bash
near contract call-function as-read-only nectar-core.nectar.testnet get_exit_capacity json-args '{"symbol":"NVDAx"}' network-config testnet now
```

## Events (NEP-297, F-021)

Logged as `EVENT_JSON:` with `standard: "nectar"`, `version: "1.0.0"`. `data` is an array of one object.

`quote_funded` · `quote_topped_up` · `quote_exiting` · `quote_withdrawn` · `fees_claimed` · `liquidity_supplied` · `position_opened` · `repaid` · `preliq_triggered` · `settled_near` · `oracle_updated` · `oracle_rejected` · `collateral_upserted` · `paused` · `unpaused`

P1 and P2 add `quoter_result`, `quoter_fallback`, `settlement_signed` and `settlement_relayed` (PRD §6.8).

## Errors

Panic messages are fixed by WO-2 and listed here from the built contract after G1.
