---
title: Risk disclaimers
slug: /legal/disclaimers
description: Mock assets, fallbacks and unaudited code, stated plainly.
---
# Risk disclaimers

_Last updated 2026-11-10 · Provider: **TODO-H9**_

- **Mock collateral.** `nvdax-mock` is a test token with no relation to NVIDIA, Backed / xStocks or Superstate. It stands in for a tokenized equity to demonstrate the mechanism. Mock USDC is a test token with no relation to Circle.
- **Nothing deployed yet.** On 2026-11-10 no contract is deployed. See [Live on testnet](/start/live-on-testnet).
- **Owner oracle.** In P0 the price is set by the project owner (a disclosed fallback). The UI shows an "Owner oracle" badge whenever this is the case. The owner can move the price, which the demo does on purpose.
- **Fallback pricing.** Until the OutLayer quoter is live (P1), and whenever it fails, settlements price at each quote's `max_discount_bps`. The Feed marks these as fallback pricing.
- **Cross-chain.** The Solana leg is a devnet demonstration (P2). The Chain Signatures MPC network is operated by third parties.
- **No audit.** Contracts, programs and the quoter are unaudited. See [Audits](/security/audits).
- **Not an offer.** Nothing here is an offer to lend, borrow, buy, sell or trade anything, in any jurisdiction.
- **Figures.** Market figures carry a date and a source. Illustrative calculations are labelled and are not projections.
