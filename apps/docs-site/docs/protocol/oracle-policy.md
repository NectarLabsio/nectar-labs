---
title: Oracle policy
slug: /protocol/oracle-policy
description: Which price the contract trusts, and how it defends itself either way.
---
# Oracle policy

<p className="verified">Verified against: F-050 (2026-11-09), F-052 (2026-11-09), F-053 (VERIFY G5), F-054 (2026-11-09), F-055 (2026-11-09), F-056 (VERIFY G5), F-173 (2026-11-09), F-174 (2026-11-09), C-007 (open), C-012 (open) · D-005 (2026-11-09), D-013, D-015 (2026-11-10) · docs/EVIDENCE.md: G5 FALLBACK (disclosed)</p>
<p className="status">Status on 2026-11-10: **owner oracle (disclosed)** for NVDAx, with a badge in the UI. G5: FALLBACK (disclosed). The Pyth path is built and sandbox-tested but not live; it waits on a Pyth API key (handoff H13). Owner price: current value: run `pnpm demo:testnet`.</p>

## What is live and what is not

| Source | State (2026-11-09/10) | Id |
| --- | --- | --- |
| Owner oracle (`update_owner_price` on nectar-core) | **in use** for NVDAx. Disclosed fallback | D-005 |
| `pyth-oracle.testnet` | contract live, but **no NVDA price**: nobody can push updates because Hermes `/v2/updates/price/latest` returns HTTP 401 without an API key | F-054, F-056, C-007 |
| `price-oracle.testnet` | does not expose `get_price` and lists no NVDA asset, so it is dropped as a source | F-055, C-012, D-013 |

## Pyth path (built, not live)

- Each collateral has an `oracle_source`: `Owner` or `Pyth` (contract `pyth-oracle.testnet` plus a price identifier) (D-013).
- nectar-core reads Pyth itself inside `trigger_preliquidation` with `get_price_no_older_than(price_identifier, age)`. `age` is the session-aware max age, 120 s in session and 86,400 s closed (F-173, D-015).
- `price`/`conf` arrive as JSON strings and `expo` as a number; value = price × 10^expo (F-174). Staleness, confidence and band checks run in the contract. These are covered by sandbox tests.
- Pushing Hermes updates via `update_price_feeds` is the job of a separate updater account, not the keeper (D-013). The updater is off until H13 lands.
- A G5 PASS needs a live NVDA price with staleness and confidence rejection tested on testnet. That has not happened, so G5 is recorded as FALLBACK (disclosed).

## Defences in every tier

| Defence | Rule | Config |
| --- | --- | --- |
| Freshness | refuse borrow and settlement if the price is older than the session limit | `max_age_s_session` 120, `max_age_s_closed` 86,400 |
| Sanity band | a new price more than `band_bps` from the last accepted one is rejected; `oracle_rejected` is emitted | `band_bps` 1500 |
| Two-step override | `propose_price` then `apply_price`, owner only (PROD: timelock) | — |
| Confidence | reject if the confidence interval is too wide (live source only) | `max_conf_bps` 100 |
| Whitelist | only configured collateral tokens; `ft_on_transfer` panics otherwise | — |
| No DEX valuation | never price from pool activity | — |
| Session flag | when `market_session_open` is false: `D_c = 0`, `h_c = weekend_haircut_bps` | owner-set in P0 |

The Rhea Finance exploit (April 2026, about $7.6M) came from pricing fake tokens off fresh pool activity (F-052). It is the reason the whitelist, freshness, band and no-DEX rules are mandatory.

## Quoter and price

The P1 quoter has outbound HTTP off (D-014). It does not call Hermes and reports the contract-supplied price with `src: "oracle"`.

## Demo control (disclosed)

In the demo the owner lowers the mock price through the two-step override to push a position below its pre-liquidation threshold. This is a testnet control, labelled as such in the console and in the demo script.
