---
title: Nectar Reserve
slug: /concepts/nectar-reserve
description: One pooled committed buyer per asset that fills after every Pappus quote, with a 7-day exit notice and a realised (never promised) fee APR.
---
# Nectar Reserve (`R_c`)

<p className="verified">Verified against: spec docs/PRD.md §4.8, §6.11 · contracts/nectar-core/src/reserve.rs (WO-23b, merged 2026-11-10) · scripts/21-deploy-v2.sh (testnet parameters) · D-023, D-024 (2026-11-10) · tests listed below · testnet: docs/EVIDENCE.md §G2b (2026-11-10T16:34Z first run, `get_reserve`), evidence/v7-modules/summary.md (2026-11-10)</p>
<p className="status">Status: deployed in `nectar-core-v2.nectar.testnet` (EVIDENCE §G2b: `get_reserve NVDAx` answers, discount 600 bps). A $10 deposit ran on testnet on 2026-11-10 and minted Reserve Note `r-NVDAx-0` (evidence/v7-modules/summary.md; verifier record pending). No settlement has reached the Reserve on testnet; the waterfall and shortfall paths are tested in the sandbox. The earlier v1 contract has no Reserve pool; its `R_c` is 0.</p>

## What it is

The Reserve is one pooled buyer per asset. Depositors put in USDC and receive shares. The pool's USDC is the `R_c` term of every limit:

```text
B_c = min( LTV_c · V_c ,  (1 − h_c) · (Q_c + R_c + D_c) )
R_c = reserve USDC − USDC already in exit notice
```

`R_c` is the pool itself. No owner can set it: the v1 setter `set_reserve` and the field `nectar_reserve_usd_e6` were removed in v2 (D-024).

## The waterfall

In a pre-liquidation the Reserve comes **after every quote**:

1. Pappus quotes fill in ascending discount (see [Pre-liquidation](/concepts/pre-liquidation)).
2. The Reserve fills the rest at its own `discount_bps`, and only when no live quote outside the call still has capacity.
3. If debt remains after the Reserve, the position stays `Settling` for the owner (`cancel_settlement`). Nothing is forced through.

The Reserve discount sits above every quote ceiling: `set_reserve_params` refuses a discount that does not exceed every live quote's `max_discount_bps`, and `FundPappusQuote` refuses a quote at or above the Reserve discount. The testnet deploy sets 600 bps against demo quote ceilings of 250 and 400 bps (D-024). Seized units stay in the contract and accrue to shares. Reserve fills cover NEAR-held collateral only; remote positions settle through `settle_remote`.

## Deposit, earn, exit

- **Deposit:** `ft_transfer_call` of mock USDC with `{"JoinNectarReserve":{"collateral":"NVDAx"}}`, at least $10. The first deposit mints shares 1:1; each deposit mints a Reserve Note `r-<collateral>-<n>` ([Position Notes](/concepts/position-notes)). A deposit into a disabled Reserve, for an unknown asset or below $10 is refunded in full.
- **Earn:** the buyers' 70% of every limit premium and Shield fee is split between quotes and the Reserve in proportion `Q_c : R_c`. Each Note keeps per-share checkpoints for fees and units, so a late depositor gets nothing from earlier fills.
- **Exit:** `initiate_reserve_exit(note_id)` (Note owner, 1 yoctoNEAR) takes the shares out of `R_c` at once, at their current value, and checkpoints pending units and fees. After the notice period `complete_reserve_exit(note_id)` pays the USDC value plus fees, and the seized units. If a transfer fails, the claim is restored.
- **Notice:** 7 days on testnet. `set_reserve_params(symbol, discount_bps, notice_ns?)` (owner) accepts 60 s to 30 days because the sandbox cannot advance 7 days; the deploy script pins 7 days (D-024).

## The number we show

The web app and `get_reserve(symbol)` show **"realised fee APR (trailing 7 days)"**: fees credited to the Reserve over the last 7 UTC days, annualised against `R_c`. It counts fees only, not the value of seized units. It is a historical figure, never a promised rate. Depositors can lose value: the Reserve buys collateral in a falling market, and the units paid out at exit may be worth less than the USDC that bought them.

Views: `get_reserve(symbol)` (`r_usd_e6`, shares, notice USDC, units, `discount_bps`, `share_price_e6`, `min_deposit_usd_e6`, `notice_period_ns`, `fees_7d_usd_e6`, `realised_apr_7d_bps`) and `get_reserve_note(note_id)` (value, claimable units and fees, `can_complete`, `transfer_locked`).

## Tests

- deposits: `tests_reserve::v7_reserve_join_first_deposit_mints_1to1_and_a_note`, `v7_reserve_join_below_ten_dollars_refunded`, `v7_reserve_join_disabled_refunded`, `v7_reserve_join_unknown_collateral_and_wrong_token_refunded`, `v7_reserve_join_depleted_refunded`
- parameters: `v7_reserve_set_params_ok_and_event`, `v7_reserve_set_params_owner_only`, `v7_reserve_set_params_out_of_range`, `v7_reserve_set_params_must_exceed_quote_ceilings`, `v7_reserve_quote_at_or_above_reserve_discount_refunded`, `v7_reserve_notice_param_bounds_and_effect`, `v7_reserve_notice_param_below_min`
- fees: `v7_reserve_premium_split_q_to_r_and_realised_apr`, `v7_reserve_apr_window_drops_old_days`, `v7_reserve_late_depositor_gets_no_earlier_units_or_fees`
- waterfall: `v7_reserve_fills_only_after_every_quote`, `v7_reserve_waits_for_quotes_beyond_the_call`, `v7_reserve_shortfall_stays_settling_and_locks_reserve_notes`, `v7_reserve_enabled_but_empty_and_no_quotes_reverts`
- exit: `v7_reserve_exit_after_notice_pays_exact_amounts`, `v7_reserve_failed_exit_transfers_restore_the_claim`, `v7_reserve_complete_before_notice`, `v7_reserve_initiate_note_owner_only`, `v7_reserve_old_owner_loses_authority_after_transfer`
- sandbox `reserve_waterfall_late_depositor_transfer_and_exit`, `reserve_shortfall_stays_settling_and_locks_transfers` (contracts/nectar-core/tests/sandbox_reserve.rs)
