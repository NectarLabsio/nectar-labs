---
title: Oracle policy
slug: /protocol/oracle-policy
description: Which price the contract trusts, and how it defends itself either way.
---
# Oracle policy

<p className="verified">Verified against: F-050 (2026-11-09), F-051 (2026-11-09), F-052 (2026-11-09), F-053 (VERIFY G5), C-001 (open) · spec docs/PRD.md §8 · D-005 (2026-11-09)</p>
<p className="status">Status: P0 uses the owner oracle (fallback, disclosed with a badge in the UI). Not deployed (G2 pending). The live source is decided at G5.</p>

## Sources disagree, so a gate decides (C-001)

| Source | Claim (2026-11-09) |
| --- | --- |
| docs.near.org oracles page | lists `pyth-oracle.testnet` (`get_price`, `update_price_feeds`) and OutLayer `price-oracle.testnet` with Pyth-compatible views (F-050) |
| Pyth contract-addresses page | NEAR not listed for Pyth Core (C-001) |

**G5 order (D-005):** (1) OutLayer `price-oracle.testnet` returns a fresh NVDA price, so use it. (2) Otherwise `pyth-oracle.testnet` does, so use it and note the conflict. (3) Otherwise keep the owner oracle and say so on every page that shows a price. The NVDA feed id on Hermes is itself unverified (F-053).

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

## Hermes (P1 quoter cross-check)

The quoter compares the contract-supplied price with Hermes `GET /v2/updates/price/latest?ids[]=<feed>` (F-051). If they differ by more than the band, it reports the contract's price with `src: "oracle"`.

## Demo control (disclosed)

In the demo the owner lowers the mock price through the two-step override to push a position below its pre-liquidation threshold. This is a testnet control, labelled as such in the console and in the demo script.
