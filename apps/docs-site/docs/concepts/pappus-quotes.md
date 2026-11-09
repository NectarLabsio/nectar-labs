---
title: Pappus quotes
slug: /concepts/pappus-quotes
description: Escrowed, time-committed buy quotes for one collateral asset.
---
# Pappus quotes

<p className="verified">Verified against: F-013 (2026-11-09), F-021 (2026-11-09) · spec docs/PRD.md §4.1, §6.3–§6.6 · docs/work/interface-p0.md · D-009 (2026-11-10)</p>
<p className="status">Status: specification. Not deployed (G2 pending). Contract tests land at G1.</p>

A **Pappus quote** is a buyer's promise to buy up to `committed_usd_e6` of one collateral asset at no worse than `max_discount_bps` below the oracle price. The promise is backed by USDC held in `nectar-core`. One dollar backs one live quote: escrow is never re-lent.

## Funding

A buyer funds a quote with the NEP-141 `ft_transfer_call` of USDC to `nectar-core`. That call requires exactly 1 yoctoNEAR (F-013). The contract receives `ft_on_transfer(sender_id, amount, msg)` and credits the quote only if the calling token is the configured USDC token. Every other token panics.

```json
{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":250,"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}
```

| Rule (P0) | Value | Source |
| --- | --- | --- |
| Minimum notice period | 7 days (`min_notice_period_s: 604800`) | PRD §4.1, D-009 |
| Minimum quote size | $100 (`min_quote_usd_e6: 100000000`) | PRD §15 (storage griefing) |
| Live quotes per asset | at most 64; more is refunded in full | PRD §6.6 |
| Amount encoding | `U128` JSON string, 6 decimals | interface-p0 |

If any rule fails, `ft_on_transfer` returns the full amount and the token contract refunds it (F-013). On success the contract adds the amount to the asset's committed capacity `Q_c` and emits `quote_funded` (NEP-297, F-021).

`TopUpQuote` adds to an existing quote. Accrued fees are settled to claimable first, so the top-up does not earn fees retroactively.

## What a quote earns

Every borrow above the static limit pays a limit premium. The buyers' 70 % share is distributed pro rata to committed dollars through an O(1) accumulator. See [Limit premium and fee index](/concepts/premium-and-fee-index). A buyer claims at any time with `claim_fees(quote_id)` (1 yoctoNEAR).

## What a quote costs

When a position is pre-liquidated, quotes for that asset are consumed in ascending `max_discount_bps`, then oldest first, touching at most 8 quotes. The buyer's escrow repays the debt and the buyer receives collateral worth more than it paid, by up to the discount. In P0 the discount is exactly `max_discount_bps`. In P1 a TEE computes a clearing discount that can only be lower. See [Pre-liquidation](/concepts/pre-liquidation).

## Leaving

Exit takes two steps with a notice period. See [Notice periods](/concepts/notice-periods).
