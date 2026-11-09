---
title: What Nectar Labs is
slug: /start/what-is-nectar-labs
---
# What Nectar Labs is

<p className="verified">Verified against FACTS F-001–F-008, F-110–F-114 (2026-11-09)</p>

Lenders cap loan-to-value on tokenized stocks and other thin-exit collateral because the liquidity they would sell into is **revocable**: it is on a DEX today and gone on a weekend or in a crash. Nectar Labs makes exit liquidity **committed**.

- **Pappus quotes.** A market maker escrows USDC and commits to buy up to a fixed amount of a collateral asset at no more than a stated discount, with a notice period before withdrawal.
- **Cramér limits.** The borrowing limit for that asset rises with committed capacity: `B_c = min(ltv_static + uplift · Q_c, ltv_max) × collateral value`.
- **Limit premium.** Borrowers pay a rate premium for the extra capacity; most of it accrues to the committed buyers through an O(1) fee index.
- **Pre-liquidation.** When a position's health drops below 1, the contract sells collateral to the committed buyer at a clearing discount computed inside a TEE (OutLayer), instead of dumping on a DEX. For collateral held on Solana, the contract has NEAR Chain Signatures sign the settlement message and a Solana program verifies it before releasing funds.

Three roles use it: **buyers** (market makers who want paid, bounded inventory), **borrowers** (holders of tokenized stock who want a higher limit), and **curators** (who set collateral parameters). Agents and readers use the public **Feed** (REST + MCP).

Status: NEAR testnet with mock collateral, built for the NEAR Hackathon 2026. See [Live on testnet](/start/live-on-testnet).
