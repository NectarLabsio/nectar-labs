---
title: Profit-Lock
slug: /concepts/profit-lock
description: Self-settlement. A healthy borrower sells just enough collateral to opted-in committed buyers to repay, and keeps the rest debt-free.
---
# Profit-Lock (self-settlement)

<p className="verified">Verified against: spec docs/PRD.md §4.10, §4.11 · contracts/nectar-core/src/shields.rs (WO-23a, merged 2026-11-10) and src/notes.rs (WO-22) · D-016, D-023 (2026-11-10) · tests listed below · testnet: evidence/v7-modules/summary.md, evidence/v7-modules/profitlock-20261110T165420Z.log (2026-11-10)</p>
<p className="status">Status: ran on testnet on 2026-11-10 in `nectar-core-v2.nectar.testnet` (scripts/61-v7-modules-testnet.sh, evidence/v7-modules/summary.md): `self_settle` on position #0 repaid $4,500 from buyer1's opted-in quote at 250 bps, fee 50 bps, and the borrower kept the remaining units. Not yet recorded by the verifier in docs/EVIDENCE.md. It is off for an asset until the owner sets a daily cap (`max_voluntary_fill_usd_e6_per_day` is 0 by default; the run set $5,000).</p>

## What it does

`self_settle(position_id)` closes a position at the borrower's choice, through committed buyers instead of a market sale:

1. The contract computes `fill = debt + ceil(debt × 50 / 10,000)`: the debt plus the 50 bps Profit-Lock fee.
2. Quotes that opted in fill it in ascending discount, at most 8 legs. Each leg seizes `seize_units_m(fill_i, M, P, d, δ_i, 0)` raw units, rounded up against the borrower.
3. The pool receives the debt, the treasury receives the fee, and the borrower keeps the remaining units with no debt.

NEAR-held positions settle on NEAR with `ft_transfer`s. A remote (Solana) position takes one leg, signed with `|kind=SELF` in the settlement preimage ([Preimage format](/protocol/preimage-format)).

## Who can call it and when

- The caller is the borrower, which means the owner of the Loan Note `p-<position_id>` ([Position Notes](/concepts/position-notes)). Attach 1 yoctoNEAR.
- Health must be ≥ 1: a position that a keeper could already trigger cannot self-settle.
- The price must be fresh, no corporate action may be pending for the asset, and the contract must not be paused.
- Opted-in capacity must cover the fill, and the fill must fit the asset's daily cap (a UTC-day counter set by `set_max_voluntary_fill(symbol, max_usd_e6_per_day)`, owner only; 0 turns Profit-Lock off).

## Buyers opt in

A market maker opts in when funding a quote: `FundPappusQuote{.., accepts_voluntary_fills: true}`. The flag appears on the quote and in the `quote_funded` event. Quotes without it are never used for self-settlement, only for pre-liquidation.

## Preview before signing

`preview_self_settle(position_id)` runs the same checks and arithmetic without a caller check. It returns `ok`, `reason`, `debt_usd_e6`, `fee_usd_e6`, `fill_usd_e6`, `units_repaid`, `units_kept`, `legs`, `remote`, `daily_cap_usd_e6` and `daily_used_usd_e6`. The web app disables the button and shows `reason` when `ok` is false.

## Tests

- `tests_v7b::self_settle_happy_path_exact_units`, `self_settle_fills_opted_in_quotes_in_ascending_discount`, `self_settle_daily_cap_resets_next_day`
- refusals: `self_settle_without_opted_in_capacity`, `self_settle_above_daily_cap`, `self_settle_health_below_one`, `self_settle_ca_pending`, `self_settle_oracle_stale`, `self_settle_borrower_only`, `self_settle_needs_one_yocto`, `self_settle_paused`, `self_settle_closed_position`, `self_settle_unknown_position`
- `tests_v7b::set_max_voluntary_fill_owner_only`, `preview_self_settle_reasons`, `opted_in_quote_event_and_flag`
- remote: `remote_self_settle_signs_kind_self_and_credits_on_signature`, `remote_self_settle_sign_failure_rolls_back_fill`, `remote_self_settle_needs_a_remote_recipient_covering_the_fill`
- Notes: `tests_notes::v7_notes_self_settle_by_new_loan_owner`, `v7_notes_self_settle_old_owner_refused`
- sandbox `self_settle_refusals_and_exact_units` (contracts/nectar-core/tests/sandbox_v7b.rs)
