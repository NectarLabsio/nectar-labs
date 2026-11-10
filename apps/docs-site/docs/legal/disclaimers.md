---
title: Risk disclaimers
slug: /legal/disclaimers
description: Mock assets, fallbacks and unaudited code, stated plainly.
---
# Risk disclaimers

_Last updated 2026-11-10 · Provider: **TODO-H9**_

- **Mock collateral.** `nvdax-mock` is a test token with no relation to NVIDIA, Backed / xStocks or Superstate. It stands in for a tokenized equity to demonstrate the mechanism. Mock USDC is a test token with no relation to Circle.
- **What is deployed.** The v1 contract `nectar-core.nectar.testnet` runs on NEAR testnet with mock tokens. The v7 modules (including Shields, Profit-Lock, Position Notes and the Nectar Reserve) are built and tested in a sandbox; their contract, `nectar-core-v2.nectar.testnet`, is not deployed yet. See [Live on testnet](/start/live-on-testnet).
- **Owner oracle.** In P0 the price is set by the project owner (a disclosed fallback). The UI shows an "Owner oracle" badge whenever this is the case. The owner can move the price, which the demo does on purpose.
- **Fallback pricing.** Until the OutLayer quoter is live (P1), and whenever it fails, settlements price at each quote's `max_discount_bps`. The Feed marks these as fallback pricing.
- **Cross-chain.** The Solana leg is a devnet demonstration (P2). The Chain Signatures MPC network is operated by third parties.
- **Position Notes.** Notes are testnet NEP-171 tokens over mock positions. They have no monetary value, are not securities and are not offered for sale. Whoever holds a Note controls its record and receives its payouts.
- **Nectar Reserve.** The Reserve is testnet software that pools mock USDC. It is not an investment offer and pays no promised return. The figure shown is a "realised fee APR (trailing 7 days)", historical and fees only. In a real deployment a Reserve depositor could lose value, because the Reserve buys collateral in falling markets. Exits wait a 7-day notice period.
- **Shields.** A Shield sizes a limit as if the market were closed and keeps committed buyers behind it for a window. It does not prevent a settlement and is not a guarantee of any kind.
- **No audit.** Contracts, programs and the quoter are unaudited. See [Audits](/security/audits).
- **Not an offer.** Nothing here is an offer to lend, borrow, buy, sell or trade anything, in any jurisdiction.
- **Figures.** Market figures carry a date and a source. Illustrative calculations are labelled and are not projections.
