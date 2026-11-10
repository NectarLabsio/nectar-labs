---
title: Corporate-action multiplier
slug: /concepts/corporate-actions
description: Collateral is stored in raw units and valued through a per-asset multiplier, so splits and dividends do not break a loan.
---
# Corporate-action multiplier

<p className="verified">Verified against: F-345 (2026-11-10, B20 `multiplier()` / `scaledBalanceOf`), F-350 (2026-11-10, Chainlink tokenized-equity feeds include M), F-352 (2026-11-10, xStocks mechanism not verified) · spec docs/PRD.md §4.6 · docs/work/interface-v7.md §A3 · D-021 (2026-11-10) · tests listed below (evidence/wo-21/cargo-test.log, 2026-11-10) · testnet: docs/EVIDENCE.md §G2b (wasm deployed, 2026-11-10T16:52Z); config `features.multiplier: false`</p>
<p className="status">Status: built and tested in the sandbox; no testnet run. The code is in the `nectar-core-v2.nectar.testnet` wasm (G2b), but the product flag `features.multiplier` is off and no multiplier call has run on testnet. The OutLayer job that reads `multiplier()` has no recorded testnet execution, and no Base Sepolia token exists. The collateral is still **mock NVDAx**.</p>

## Valuation

```text
V_c = raw_units / 10^d  ×  M_T / 10^18  ×  P_underlying
```

Tokenized stocks absorb splits and reinvested dividends by changing a multiplier, not balances. The B20 Asset token exposes `multiplier()` (WAD, 1e18) and `scaledBalanceOf(account)` = raw × multiplier, and raw balances do not change (F-345). nectar-core stores collateral in raw units and applies the current multiplier `M_T` when it values a position, so the loan's accounting survives a corporate action.

## Never count M twice

Some price feeds already include the multiplier. The Coinbase tokenized-equity Chainlink feeds on Base publish underlying price × multiplier (F-350). Each collateral therefore carries a `price_kind` (D-021):

| `price_kind` | Price source | M in valuation |
| --- | --- | --- |
| `Underlying` (default) | price of the underlying share | applied |
| `TokenIncludesMultiplier` | price of the token, M already included | treated as 1 |

`price_kind` cannot be changed while the asset has debt (`tests_v7::price_kind_change_with_debt_refused`).

## Changing M

| Path | Who | Rule |
| --- | --- | --- |
| `set_multiplier(symbol, multiplier_e18)` | owner | increase only, at most +5% per call (`new ≤ old · 10500 / 10000`); refused while a corporate action is pending |
| `announce_corporate_action(symbol, multiplier_e18, effective_ns)` | owner | any other change (a decrease or more than +5%); `effective_ns` must be at least one hour away; sets `ca_pending` |
| `apply_corporate_action(symbol)` | anyone, once `now ≥ ca_effective_ns` | sets M, clears `ca_pending`; for `Underlying` it rescales the stored price by `old_M / new_M` and resets the band reference, so V stays continuous |

While `ca_pending` is set, new borrows in that asset are refused with `reason: "ca_pending"`. Repays and settlements continue.

`Position.entry_multiplier_e18` is stored for display only ("+2% from dividends since open"). Limits always use the current `M_T`.

## Example: a 2-for-1 split on mock NVDAx

The owner announces M → 2 × M at least one hour ahead, and anyone applies it when it takes effect. M doubles, the stored underlying price halves, raw balances do not move, and V and LTV stay where they were. The mock token has the same `multiplier()` view and an owner `update_multiplier`, so the demo can mirror the change on the token.

## Not built yet or not verified

- The P1 source: an OutLayer job that reads `multiplier()` by `eth_call` from a Base Sepolia token (PRD §4.6). The contract hook `request_multiplier_read(symbol)` is built and tested in the sandbox: `on_multiplier_read` applies the `set_multiplier` bound (increase only, at most +5%, not while a corporate action is pending) and records any other change as `ca_suggested_multiplier_e18` for the owner (`tests_v7b::multiplier_job_bounded`). The OutLayer job is built (quoter/src/jobs.rs); no testnet execution of it is recorded in docs/EVIDENCE.md. No Base Sepolia token is deployed.
- xStocks: whether xStocks use a Token-2022 Scaled UI Amount multiplier is **not verified** (F-352, gate G11 open).
- Real B20 collateral needs the issuer and eligible jurisdictions; this is PROD-only.

## Tests

- `tests_v7::underlying_multiplier_values_per_unit_with_m`, `tests_v7::token_includes_multiplier_ignores_m_and_keeps_price`
- `tests_v7::set_multiplier_bounds`, `set_multiplier_above_5pct_refused`, `set_multiplier_decrease_refused`, `set_multiplier_refused_while_pending`, `set_multiplier_owner_only`
- `tests_v7::announce_under_one_hour_refused`, `apply_before_effective_refused`, `apply_without_announcement_refused`, `announce_zero_refused`, `announce_owner_only`
- `tests_v7::borrow_refused_while_ca_pending_repay_continues`
- `tests_v7::split_two_for_one_leaves_ltv_and_value_unchanged`, `tests_v7::settlement_after_split_seizes_model_units`, `tests_v7::split_voids_pending_price_proposal`
- `math::tests::multiplier_split_keeps_value_and_seize`
- mock token: `tests::multiplier_default_and_update`, `update_multiplier_owner_only`, `update_multiplier_rejects_zero`
