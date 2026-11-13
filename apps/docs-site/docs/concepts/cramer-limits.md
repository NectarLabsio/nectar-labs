---
title: Cramér limits
slug: /concepts/cramer-limits
description: The borrowing limit as the lower of an LTV ceiling and recoverable value.
---
# Cramér limits

<p className="verified">Verified against: F-050 (2026-11-09), F-063 (2026-11-09) · spec docs/process/prd.md §4.2, §8 · docs/process/work/interface-p0.md · D-009 (2026-11-10)</p>
<p className="status">Status: specification. Deployed on NEAR testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). Numbers below are computed from packages/config/config.yaml, not read from chain.</p>

## Formula (PRD §4.2, adopted by D-009)

```text
B_c = min( LTV_c · V_c ,  (1 − h_c) · (Q_c + R_c + D_c) )
```

| Term | Meaning | Field / source | P0 behaviour |
| --- | --- | --- | --- |
| `V_c` | collateral value: units × oracle price | `units * price_usd_e6 / 10^decimals` | owner oracle (fallback, disclosed) |
| `LTV_c` | ceiling with committed quotes | `max_nectar_ltv_bps` | owner-set |
| `Q_c` | committed capacity: sum of live quote remainders | `active_committed_q_usd_e6` | O(1) on fund / initiate-withdraw / settle |
| `R_c` | Nectar Reserve | v1: `nectar_reserve_usd_e6` · v2: `get_reserve(symbol).r_usd_e6` | 0 on the earlier v1 contract. In v2 (live on testnet, EVIDENCE §G2b) it is the [Reserve pool](/concepts/nectar-reserve) itself, with no owner setter (D-024); a $10 deposit ran on 2026-11-10 (evidence/v7-modules/summary.md) |
| `D_c` | verified DEX depth | `verified_dex_depth_usd_e6` | owner-set in P0, quoter in P1; **forced to 0 when `market_session_open` is false** |
| `h_c` | haircut | `base_haircut_bps` in session, `weekend_haircut_bps` otherwise | owner-set |

The contract computes this in integers, rounding against the borrower (interface-p0):

```text
B_c = min( max_nectar_ltv_bps · V / 10_000 ,  (10_000 − h_c) · (Q_c + R_c + D_c) / 10_000 )
```

The **static limit** `base_ltv_bps · V_c / 10_000` is what a lender would offer without Nectar. A borrow may not exceed `B_c` or the available pool liquidity. The part above the static limit pays `limit_premium_bps` up front, deducted from proceeds.

## Worked example (illustrative, from config.yaml)

Parameters: `base_ltv_bps` 4000, `max_nectar_ltv_bps` 7000, `base_haircut_bps` 1000, `weekend_haircut_bps` 2500, `limit_premium_bps` 300. Assume one borrower with 300 NVDAx at a mock price of $185.00 and $65,000 of committed quotes. The session is closed, so `D_c` = 0. `R_c` = 0.

| Step | Value |
| --- | --- |
| `V_c` = 300 × 185.00 | $55,500.00 |
| static limit = 40 % × V | $22,200.00 |
| LTV ceiling = 70 % × V | $38,850.00 |
| recoverable = (1 − 25 %) × (65,000 + 0 + 0) | $48,750.00 |
| **B_c** = min(38,850, 48,750) | **$38,850.00** |
| premium on max draw = (38,850 − 22,200) × 3 % | $499.50 |

With only $20,000 committed, recoverable value is 75 % × 20,000 = $15,000, so `B_c` = $15,000, **below** the static limit. The formula as specified does not floor `B_c` at the static limit. Thin committed capacity lowers the limit instead of pretending.

## Open points fixed by tests, not by prose

- Whether `B_c` is checked per position or netted across all open positions drawing on the same `Q_c`. The answer comes from the G1 contract tests, and this page will name the test.
- Oracle freshness: borrowing is refused if the price is older than `max_age_s_session` (120 s) in session or `max_age_s_closed` (86,400 s) when closed. See [Oracle policy](/protocol/oracle-policy).
- 1Click lists no tokenized-equity route (F-063), so on testnet `D_c` stays owner-set (0) for NVDAx.

Why not the earlier "`ltv_static + uplift · Q_c`" model? D-009 records it. That model needed a float or a new scale and contradicted PRD §4.2.
