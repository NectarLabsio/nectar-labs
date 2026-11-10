---
title: Weekend Oracle Guard
slug: /concepts/weekend-oracle-guard
description: The contract decides on its own whether the market is in session, and it fails closed.
---
# Weekend Oracle Guard

<p className="verified">Verified against: F-342 (2026-11-10, NYSE 2026–2027 calendar), F-350 (2026-11-10) · spec docs/PRD.md §4.7 · docs/work/interface-v7.md §A2 · D-018 (2026-11-10) · tests listed below (evidence/wo-21/cargo-test.log, 2026-11-10)</p>
<p className="status">Status: built and tested in the sandbox; testnet deployment pending. It ships in `nectar-core-v2.nectar.testnet`, which has not been created yet (D-018, handoff H-NEAR-FAUCET). The live v1 contract still uses the owner flag `market_session_open`.</p>

## The rule

```text
session_open = window_contains(now) ∧ (now − oracle_updated_ns ≤ 900 s) ∧ ¬forced_closed
```

When the session is closed:

- `D_c` = 0 (DEX depth is ignored), and
- `h_c` = `weekend_haircut_bps` instead of `base_haircut_bps`.

Borrows still work, at the weekend parameters and under the normal oracle-freshness rule. See [Cramér limits](./cramer-limits.md) and [Aggregate borrowing limit](./aggregate-limit.md) for where `D_c` and `h_c` enter.

## It fails closed

Each condition can only close the session. The contract reports why with `session_reason`, checked in this order:

| `session_reason` | Meaning |
| --- | --- |
| `no_calendar` | the calendar is empty or was never set, so the session is closed |
| `outside_hours` | `now` is not inside any NYSE window |
| `stale_price` | the stored price is older than 900 s, or there is none |
| `forced_closed` | the owner forced the asset closed |
| `open` | none of the above |

`force_session_closed(symbol, true)` closes an asset (for halts or circuit breakers). `force_session_closed(symbol, false)` only clears the force. It cannot open a session outside a window or with a stale price. Nothing the owner sets can open a session.

## Calendar windows

The contract does not compute time zones. It stores a sorted list of NYSE session windows `[open_ns, close_ns)` in UTC. Regular days and early closes are windows, and holidays are simply absent.

- Owner `set_session_calendar(windows)` replaces the whole list. It panics unless the list is sorted and non-overlapping, has `open < close` in every window, and has at most 600 windows. View: `get_session_calendar(from_index, limit)`.
- The windows come from `packages/config/nyse-calendar.json`, which holds the holidays and early closes read from nyse.com (F-342). `scripts/22-session-calendar.mjs` turns that file into windows, and it takes daylight saving time from the runtime's IANA data for `America/New_York`. No window is typed by hand.
- The calendar ends where F-342 ends (2027). After the last window, every session is closed until the owner loads a new list.

## Why 900 s

The guard does not trust a price feed's own idea of "the market is open". Coinbase's tokenized-equity Chainlink feeds keep the last close through weekends and holidays and freeze during corporate actions (F-350). A held price looks fresh to a naive reader. Requiring a price published within 900 s while the window is open means a frozen feed closes the session.

## Not built yet (PRD §4.7)

- An attested OutLayer result that can set `forced_closed` (P1 calendar job). It will be able to close a session, never open one.
- A weekend reference price. The v2 fields `weekend_ref_price_e6` and `weekend_ref_updated_ns` exist and are unused. PROD would use a 24/7 DEX TWAP plus an implied-volatility spread.

## Tests

- `tests_v7::empty_calendar_means_closed`
- `tests_v7::outside_hours_is_closed`
- `tests_v7::price_older_than_900s_flips_to_weekend_parameters`
- `tests_v7::forced_closed_and_false_cannot_open`
- `tests_v7::reason_precedence_outside_hours_before_stale_and_forced`
- `tests_v7::calendar_set_and_paginate`, plus the refusals `calendar_unsorted_rejected`, `calendar_overlap_rejected`, `calendar_empty_window_rejected`, `calendar_over_600_rejected`, `calendar_owner_only`
- `math::tests::limit_closed_session_ignores_depth_and_uses_weekend_haircut`, `math::tests::session_window_search`
- sandbox `weekend_guard_calendar_stale_and_forced` (contracts/nectar-core/tests/sandbox_v7.rs)
