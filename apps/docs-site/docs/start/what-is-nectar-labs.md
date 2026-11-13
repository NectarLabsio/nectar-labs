---
title: What Nectar Labs is
slug: /
sidebar_label: What Nectar Labs is
description: Committed, escrowed buyers raise borrowing limits on thin-exit collateral.
---
# What Nectar Labs is

<p className="verified">Verified against: F-003 (2026-11-09), F-013 (2026-11-09), F-063 (2026-11-09) · spec docs/process/prd.md §1, §4.2 · D-002, D-009 (2026-11-10)</p>
<p className="status">Status: testnet software, mock collateral. P0 contracts deployed on NEAR testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44); web gate G3 in progress.</p>

Current deployment state: [Live on testnet](/start/live-on-testnet).

Lenders cap loan-to-value on tokenized stocks and other thin-exit collateral because the liquidity they would sell into is **revocable**: it sits on a DEX on a weekday and is gone on a weekend or in a crash. Nectar Labs makes exit liquidity **committed**.

## The equation

```text
B_c = min( LTV_c · V_c ,  (1 − h_c) · (Q_c + R_c + D_c) )
```

The borrowing limit `B_c` for a collateral `c` is the lower of the curator's LTV ceiling applied to the collateral value and the **recoverable value**: committed quotes `Q_c` plus reserve `R_c` plus verified DEX depth `D_c`, minus a haircut `h_c`. Outside market hours `D_c` is forced to zero and the larger weekend haircut applies. Details: [Cramér limits](/concepts/cramer-limits).

## The pieces

- **Pappus quotes.** A buyer (market maker, prop AMM, fund) escrows USDC in the contract and commits to buy up to that amount of one collateral at no more than `max_discount_bps` below the oracle price. Leaving takes a notice period of at least 7 days. See [Pappus quotes](/concepts/pappus-quotes).
- **Cramér limits.** Committed capacity raises the asset's limit, up to the curator's ceiling.
- **Limit premium.** A borrower who draws above the static limit (`base_ltv_bps · V_c`) pays `limit_premium_bps` on the excess. 70 % goes to buyers through an O(1) fee index, 20 % to lenders, 10 % to the treasury. See [Limit premium and fee index](/concepts/premium-and-fee-index).
- **Pre-liquidation.** When a position crosses its pre-liquidation LTV, a keeper asks the contract to settle. The contract repays the debt from the committed buyer's escrow and delivers collateral to the buyer at the quote's discount, instead of dumping on a DEX. See [Pre-liquidation](/concepts/pre-liquidation).

## Three roles, one public feed

| Role | Wants | Uses |
| --- | --- | --- |
| Buyer | paid, bounded inventory at a known discount | Post a quote, claim fees, exit with notice |
| Borrower | a higher limit on tokenized stock | Lock collateral and borrow, repay |
| Curator / owner | safe caps on thin-exit collateral | Collateral parameters, oracle, pause |

Agents and risk desks read the public **Feed** (contract views today; REST and MCP in P1).

## What is real and what is not

- **Mock collateral.** The collateral is a mock NEP-141 token (`nvdax-mock`), standing in for tokenized equities such as xStocks. No tokenized equity exists on NEAR testnet and 1Click lists no equity route (F-063, D-002).
- **Testnet only.** NEAR testnet and Solana devnet (F-003). No mainnet, no token, no real funds.
- **Phases.** P0 (core credit, static settlement at `max_discount_bps`, owner oracle) comes first. TEE pricing, live oracle and 1Click depth are P1. The Solana settlement leg and copilot are P2. Every fallback is disclosed where it applies. See [Roadmap](/project/roadmap).
