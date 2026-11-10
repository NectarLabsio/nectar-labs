---
title: Shields
slug: /concepts/shields
description: A weekend-safe borrowing limit with committed buyers behind it, for a fixed window and a flat fee.
---
# Shields

<p className="verified">Verified against: spec docs/PRD.md §4.9, §4.11 · contracts/nectar-core/src/shields.rs (WO-23a, merged 2026-11-10) · F-342 (NYSE calendar, 2026-11-10) · D-022, D-024 (2026-11-10) · tests listed below · testnet: evidence/v7-modules/summary.md, evidence/v7-modules/shield-20261110T165521Z.log (2026-11-10)</p>
<p className="status">Status: ran on testnet on 2026-11-10 in `nectar-core-v2.nectar.testnet` (scripts/61-v7-modules-testnet.sh, evidence/v7-modules/summary.md): Weekend Shield position #5 (2 NVDAx, $189 debt, 15 bps fee instead of the premium, Note `p-5`); the first attempt was refused by the aggregate check, as designed. Not yet recorded by the verifier in docs/EVIDENCE.md. The earlier v1 contract has no Shields.</p>

## What a Shield is

A Shield is a normal position opened with a weekend-safe limit. It is sized **as if the market were already closed**: the haircut is `weekend_haircut_bps` and verified DEX depth `D_c` counts as 0, even if the borrow happens in session. The limit therefore rests only on committed capacity (Pappus quotes `Q_c` plus the Nectar Reserve `R_c`), which does not disappear on Friday at 16:00 New York time.

For the length of the window, only committed buyers settle the position. This build has no DEX route, so the contract records the window and exposes it (`get_shield(position_id).committed_buyers_only`).

A Shield does not stop a settlement. If the position becomes triggerable, committed buyers take collateral at their bounded discount, exactly as in [Pre-liquidation](/concepts/pre-liquidation).

## Opening one

Add `shield` to the borrow message (NEAR-held collateral) or pass it to `reserve_remote_position(.., shield)` (Solana collateral):

```json
{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"20000000","shield":{"kind":"Weekend","window_end_ns":"<next calendar open, ns>"}}}
```

| Rule | Weekend | Event |
| --- | --- | --- |
| Window end | must equal the next open in the session calendar (D-022) | at most the curator's `event_window_end_ns` |
| Maximum length | 65.5 h | 72 h |
| Fee (default, owner may set 0–1,000 bps) | 15 bps on the full borrow | 25 bps on the full borrow |
| Minimum borrow (testnet) | $5 | $5 |
| Opens per account | at most 5 per UTC day (Weekend and Event together) | same |

The Shield fee **replaces** the limit premium and is split like it: 70% buyers (shared between quotes and the Reserve in proportion `Q_c : R_c`), 20% lenders, 10% treasury. The origination fee still applies. See [Fee stack and referrals](/concepts/fee-stack).

A refused Shield returns the deposit in full. Reasons include an ended window, a weekend window that does not end at the next calendar open, an event window after the curator's end, a borrow below $5, and a sixth open in one UTC day.

## Owner and views

- `set_shield_params(symbol, weekend_fee_bps, event_fee_bps, event_window_end_ns)` (owner; each fee ≤ 1,000 bps; the event end is 0 or in the future).
- `get_shield(position_id)` returns `kind`, `window_end_ns`, `fee_bps`, `fee_usd_e6`, `active` and `committed_buyers_only`.
- `get_shield_opens_today(account_id)` returns 0–5.
- `get_fee_stack(symbol?)` returns `shield_weekend_fee_bps` and `shield_event_fee_bps` among the other fees.

## Tests

- `tests_v7b::shield_sized_at_weekend_params_in_session_and_fee_replaces_premium`
- `tests_v7b::shield_window_and_minimum_refusals`, `shield_five_opens_per_day_then_refused_until_next_utc_day`
- `tests_v7b::set_shield_params_owner_only`, `set_shield_params_fee_bound`, `set_shield_params_event_in_past`, `set_shield_params_unknown_symbol`, `fee_stack_view`
- `tests_v7b::shield_on_remote_reservation_counts_and_prices_at_confirm`, `shield_on_remote_reservation_validated`
- sandbox `shield_weekend_sizing_fee_and_daily_limit` (contracts/nectar-core/tests/sandbox_v7b.rs)
