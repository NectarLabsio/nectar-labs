---
title: Limit premium and fee index
slug: /concepts/premium-and-fee-index
description: Who pays for the extra limit, and how buyers earn in O(1).
---
# Limit premium and fee index

<p className="verified">Verified against: F-013 (2026-11-09) · spec docs/process/prd.md §4.2, §4.3 · docs/process/work/interface-p0.md · D-009 (2026-11-10)</p>
<p className="status">Status: specification. Deployed on NEAR testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). Fee maths is checked against a reference loop in the G1 tests.</p>

## The premium

```text
premium_usd_e6 = max(0, borrow_usd_e6 − base_ltv_bps · V / 10_000) · limit_premium_bps / 10_000
```

In this build the premium is charged **up front**, deducted from the borrowed USDC. The borrower receives `borrow − premium`. In PROD it accrues per block. With the config.yaml value `limit_premium_bps` = 300, borrowing $16,650 above the static limit costs $499.50.

## The split (owner-set, default 70 / 20 / 10)

| Share | bps | Goes to |
| --- | --- | --- |
| Buyers | 7000 | the asset's fee index, pro rata to committed dollars |
| Lenders | 2000 | lending pool fees (`lenders_fees_usd_e6`) |
| Treasury | 1000 | `treasury_usd_e6` |

`set_fee_split(buyers_bps, lenders_bps, treasury_bps)` is owner-only. The three shares sum to 10,000.

## The O(1) fee index

Each collateral keeps one accumulator, in the MasterChef style:

```text
on premium:   acc_fee_per_dollar_e18 += buyer_share_e6 · 10^18 / Q_c
each quote:   fee_debt_e18 = committed_usd_e6 · acc / 10^18     (set at fund and top-up)
claimable:    committed_usd_e6 · acc / 10^18 − fee_debt_e18
```

No method loops over quotes to pay fees. A buyer's earnings depend only on its committed size and the accumulator delta since it joined. `initiate_quote_withdrawal` settles fees before removing the quote from `Q_c`, and `TopUpQuote` settles before adding. Neither steals nor double-counts.

## Example

$499.50 premium, $65,000 committed: buyers get $349.65, lenders $99.90, treasury $49.95. A $40,000 quote's share is 40/65 × 349.65 ≈ $215.17, claimable with `claim_fees(quote_id)`. Rounding is down, against the claimant.
