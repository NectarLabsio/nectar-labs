---
title: Monitoring
slug: /operations/monitoring
description: What is watched, where, and the alert thresholds.
---
# Monitoring

<p className="verified">Verified against: F-021 (2026-11-09) · spec docs/PRD.md §16.3, §17</p>
<p className="status">Status: contract deployed on NEAR testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). The keeper (services/keeper) is built and run locally, not continuously; it serves `/healthz` and `/runs` on `127.0.0.1:8787`. Feed is not built. There is no status page.</p>

## Signals

| Signal | Source | Planned threshold |
| --- | --- | --- |
| Keeper heartbeat | keeper `/healthz`, one row per minute | "no keeper online" after 3 missed beats |
| Oracle age | `get_exit_capacity.oracle_age_s` | stale for more than 10 min in session |
| `oracle_rejected` | NEP-297 event (F-021) | any |
| Pool utilisation | `get_pool` | informational |
| `Q_c` per asset | `get_exit_capacity` | informational; sparkline on the Feed |
| Positions in `Settling` | `list_positions` | more than 15 min (P2) |
| `quoter_fallback` rate (P1) | events | more than 10 % of triggers |
| Gas reserve | `get_config` | below 5 NEAR |

## Product metrics (PRD §17)

Committed capacity `Q_c`, exit gap, limit uplift (Nectar `B_c` minus the static limit), premium paid and fees distributed, settlement discount against the DEX-implied discount, quoter fallback rate, and keeper latency. All are derived from on-chain events, with no personal data.
