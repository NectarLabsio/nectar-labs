---
title: Whitepaper (short form)
slug: /concepts/whitepaper
description: Committed exit liquidity as a borrowing-limit input.
---
# Whitepaper (short form)

<p className="verified">Verified against: F-052 (2026-11-09), F-110a (2026-11-10), F-112a (2026-11-10) · spec docs/PRD.md §1, §3, §4 · D-009 (2026-11-10)</p>
<p className="status">Status: design document. Market figures are dated 2026-11-09 and re-pulled before each release. All other numbers are illustrative, computed from config.yaml.</p>

## 1. Problem

Every collateralised loan assumes a buyer for the collateral. For tokenized stocks, principal tokens and other RWAs, that buyer is a DEX pool or a prop AMM quoting during market hours, and the quote can be withdrawn without notice. Lenders respond with low, hand-set LTV caps.

## 2. Mechanism

1. **Pappus quotes** turn revocable depth into committed depth: USDC escrowed per asset, a maximum discount, a notice period of at least 7 days. See [Pappus quotes](/concepts/pappus-quotes).
2. **Cramér limits** make the limit a function of what can actually absorb a forced sale: `B_c = min(LTV_c · V_c, (1 − h_c)(Q_c + R_c + D_c))`. See [Cramér limits](/concepts/cramer-limits).
3. **The limit premium** prices the extra capacity. Most of it pays the buyers who created it. See [Limit premium and fee index](/concepts/premium-and-fee-index).
4. **Pre-liquidation** sells to the committed buyer at a bounded discount. See [Pre-liquidation](/concepts/pre-liquidation).
5. **Verifiable settlement**: a TEE prices the fill (P1) and NEAR Chain Signatures authorise release of collateral held on Solana (P2). The contract builds every signed message itself.

## 3. Economics (illustrative)

A buyer committing $40,000 of a $65,000 pool earns 40/65 of 70 % of every premium on that asset. With `limit_premium_bps` = 300, one maximal $55,500 position (example in [Cramér limits](/concepts/cramer-limits)) pays $499.50, of which the $40k buyer gets about $215. In return the buyer accepts the risk of buying NVDAx at up to 2.5 % below oracle during stress. Whether premiums cover that risk at real scale is an open question. The Feed shows the equation with live numbers so curators and buyers can judge it themselves. No projection is made here.

## 4. Security stance

The contract holds every rule. Off-chain parties (keeper, quoter, oracle, copilot) can delay or degrade a settlement but never redirect funds. Prices come only from a named feed for whitelisted collateral, with freshness and band checks. The Rhea Finance exploit (April 2026, about $7.6M) priced fake tokens off pool activity (F-052). See [Trust model](/security/trust-model).

## 5. Why NEAR

One contract holds escrow, limits and settlement. Chain Signatures let that contract authorise a release on Solana without a bridge. OutLayer runs the buyer's private pricing in a TEE. NEAR Intents is the public depth and USDC rail. For context, on 2026-11-10 NEAR Intents showed $37.006B cumulative volume and $191.14M TVL (F-110a, source: [DefiLlama](https://defillama.com/protocol/near-intents)), and Rhea Finance $237.35M TVL (F-112a, source: [DefiLlama](https://defillama.com/protocol/rhea-finance)).

## 6. Competitive position

To our knowledge, nobody sells committed, escrowed exit liquidity as a borrowing-limit input today. That is a judgement from the PRD §3 survey, not a verified fact. Liquidation engines, prop AMMs and risk curators are adjacent. Nectar is an input to all three. The risk is that a large curator builds the same escrow internally. The defence is being the neutral venue where many buyers compete on discount.
