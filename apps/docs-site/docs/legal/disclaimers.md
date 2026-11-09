---
title: Risk disclaimers
---
# Risk disclaimers

- **Mock collateral.** `nvdax-mock.nectar.testnet` is a test token with no relation to NVIDIA, Backed xStocks or Superstate. It stands in for a tokenized equity to demonstrate the mechanism.
- **Oracle.** On testnet the price may come from an owner-controlled fallback when no public oracle answers; the UI shows an "Owner oracle" badge whenever this is the case.
- **TEE pricing.** When the OutLayer quoter is unavailable, settlements price at the quote's `max_discount_bps`; the Feed marks these "Fallback pricing".
- **Cross-chain.** The Solana leg is a devnet demonstration. The Chain Signatures MPC network is operated by third parties.
- **No audit.** Contracts and programs are unaudited hackathon code.
- **Not an offer.** Nothing here is an offer to lend, borrow or trade.
