---
title: Pre-liquidation vs liquidation
slug: /concepts/pre-liquidation
description: Sell to the committed buyer at a bounded discount instead of dumping on a DEX.
---
# Pre-liquidation vs liquidation

<p className="verified">Verified against: F-013 (2026-11-09), F-015 (2026-11-09), F-021 (2026-11-09) · spec docs/PRD.md §4.4, §6.5 · docs/work/interface-p0.md · D-004, D-010 (2026-11-10)</p>
<p className="status">Status: specification. Deployed on NEAR testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). P0 settles at max_discount_bps (fallback, disclosed). TEE pricing is P1.</p>

A classic liquidation sells collateral into whatever liquidity exists at that moment. Nectar's **pre-liquidation** sells to a buyer who committed in advance, at a discount the buyer agreed to before the stress started.

## Trigger

Each position stores its own `pre_liq_ltv_bps`, chosen at open within the owner's `[pre_liq_min_bps, pre_liq_max_bps]` (6500–8000 in config.yaml). A position is triggerable when:

```text
debt_usd_e6 · 10_000 > V_usd_e6 · pre_liq_ltv_bps      and the oracle is fresh
```

The keeper calls `trigger_preliquidation(position_id)` with a function-call key that can call only that method and `relay_settlement_result` (D-010, F-015). It attaches no deposit and passes nothing but the id.

## Waterfall (PRD §4.4)

1. **Flag.** The condition above holds.
2. **Route check.** PROD compares DEX depth with the best quote. This build records the comparison and takes the Pappus route.
3. **Pappus.** Quotes for the asset are consumed in ascending `max_discount_bps`, then oldest first, at most 8.
   - **P0:** each quote fills at its own `max_discount_bps` (fallback pricing, D-004).
   - **P1:** OutLayer returns `clearing_discount_bps`. The contract clamps it to `[0, max_discount_bps]`, so a faulty quoter can only cost the buyer, never the borrower.
4. **Settle.** The debt is repaid from the buyer's escrow and the collateral moves to the buyer: `ft_transfer` on NEAR, or a signed settlement message on Solana (P2). The borrower keeps the rest. The contract emits `settled_near`.
5. **Reserve** fills last (PROD).

## Seize amount

```text
seize_units = repay_usd_e6 · (10_000 + keeper_fee_bps) · 10^decimals / (price_usd_e6 · (10_000 − disc_bps))
```

`keeper_fee_bps` is 50 in config.yaml. Whether the P0 contract charges it is fixed by WO-2 and confirmed at G1.

## Why it is safer

| | DEX liquidation | Nectar pre-liquidation |
| --- | --- | --- |
| Price | whatever the pool gives under stress | at most `max_discount_bps`, agreed in advance |
| Weekend | pool may be empty | escrow is in the contract |
| Keeper power | often picks route and size | passes an id only; the contract computes everything |
