---
title: Risk disclaimers
slug: /legal/disclaimers
description: Testnet, mock collateral, unaudited code, disclosed fallbacks and known limitations, stated plainly.
---
# Risk disclaimers

_Last updated 2026-11-12 · Part of the [Terms of use](/legal/terms) · Operator: **TODO-H-LEGAL** (OPERATOR) · Contact: **TODO-H-LEGAL** (CONTACT)_

## The short version

- **Testnet only.** NEAR testnet, Solana devnet and a local fork of Base Sepolia. No mainnet, no real funds, nothing with monetary value.
- **Mock collateral.** `nvdax-mock` is a test token that stands in for a tokenized equity (xStocks) to demonstrate the mechanism. It has no relation to NVIDIA, Backed / xStocks or Superstate and has no value. Mock USDC has no relation to Circle and has no value.
- **No token.** Nectar Labs has no token, no sale and no airdrop.
- **Unaudited.** Contracts, vaults, quoter, keeper, Feed and web app are unaudited. See [Audits](/docs/security/audits).
- **Not advice, not an offer.** Nothing here is advice or an offer to lend, borrow, buy, sell or trade anything, in any jurisdiction.
- **Public and permanent.** What you sign on chain is public and cannot be deleted by anyone.
- **No service level.** The hosted demo is planned until at least 2026-11-25 and can stop at any time.

## What is deployed

The current contract is `nectar-core-v2.nectar.testnet` (version `2.2.1-v7`) on NEAR testnet with mock tokens. The earlier v1 contract stays deployed as evidence. The Solana vault program runs on devnet. The Base vault runs **only on a local fork of Base Sepolia** on the operator's machine. Three v7 features are built and tested but switched off on testnet: the corporate-action multiplier, `pay_to` with claimable USDC, and registered referrers. Evidence for each component, with explorer links, is on [Live on testnet](/docs/start/live-on-testnet).

## Disclosed fallbacks

- **Owner oracle.** The mock NVDAx price is set by the project owner (`update_owner_price`), and the UI shows an "Owner oracle" badge. The Pyth path is built and tested in the sandbox but not in use. The owner moves the price on purpose in demos, which can trigger the pre-liquidation of mock positions. See [Oracle policy](/docs/protocol/oracle-policy).
- **Fallback settlement pricing.** When the OutLayer TEE quoter fails or is denied, a settlement prices at each quote's `max_discount_bps`, and the Feed marks it as fallback pricing. The quoter's market-maker inputs are demo values set by the operator and published in the docs, and each settlement's discount reveals their product. The TEE quote is not verified on chain. See [Quoter (TEE) and fallback](/docs/protocol/quoter-tee).
- **Keeper attestation for remote deposits.** Solana deposits are attested by an OutLayer TEE read of the vault. A keeper attestation exists as the labelled testnet fallback, and it is the only path on the Base fork, which the quoter cannot read.
- **Exit depth from 1Click is read-only.** The Feed shows signed dry quotes (`dry: true`) for a reference pair. Nothing is ever deposited. NVDAx has no 1Click route, so its depth term counts as zero.
- **Copilot.** The NEAR AI copilot is tested on a fixture, not on a NEAR AI recording; no live NEAR AI answer has been verified yet. The panel shows an answer only when it is signed by an attested NEAR AI TEE, and labels it "Model output, not advice."
- **x402 paid export.** It runs on the operator's machine, not on the hosted demo: its relayer needs a full-access key, which is not stored with a hosting provider.
- **Keeper.** The keeper that relays cross-chain settlements does not run continuously. A signed settlement that expires unrelayed can be recovered by anyone with "Re-sign settlement".

## Known limitations

The full list is SECURITY.md "What remains (known, not fixed)", summarised on [Audits](/docs/security/audits#what-remains). The ones that affect you as a user:

- **A remote Loan Note does not carry the collateral release.** Transferring a Loan Note moves the loan to the new owner, and anyone can repay it. For collateral held on NEAR, a full repay releases the collateral to the current Note owner. For Solana and Base positions, the release is signed to the **depositor recorded at deposit**, and the vault pays only that depositor. If you take a remote Loan Note and repay it, you do not receive the collateral. See [Position Notes](/docs/concepts/position-notes).
- **Base is a local fork, not Base Sepolia.** Base vault transactions exist only on a local anvil fork of Base Sepolia (chain id 84532) on the operator's machine and have no public explorer. The NEAR side (key derivation, EIP-712 digest, MPC signature) is real on NEAR testnet. A Base leg can also stay stuck if the token's policy stops authorising the recipient or the depositor.
- **No Note transfer to a `0s` / `0u` account that does not exist yet.** The web app treats only 64-hex and `0x` account ids as implicit. Any other receiver must already exist, otherwise Transfer stays off. Nothing is stranded; a direct `nft_transfer` call is not affected.
- **Remote positions can become hard to pre-liquidate.** Remote capacity is checked only when a loan is opened. Buyers can clear their remote recipient or exit afterwards, and remote settlement uses a single quote.
- **Keeper relays are advisory.** NEAR does not verify that a Solana or Base transaction happened. A lying keeper, or a leaked keeper key, could close a remote position on NEAR without the remote leg landing.
- **Trust in the owner.** One deployer key sets parameters, pauses the contract and moves the mock price.

## Modules

- **Position Notes.** Notes are testnet NEP-171 tokens over mock positions. They have no monetary value, are not securities and are not offered for sale. Whoever holds a Note controls its record and receives its payouts, except the remote collateral release above. Transfers are refused while a settlement is pending.
- **Nectar Reserve.** The Reserve is testnet software that pools mock USDC. It is not an investment offer and pays no promised return. The figure shown is a "realised fee APR (trailing 7 days)", historical and fees only. In a real deployment a Reserve depositor could lose value, because the Reserve buys collateral in falling markets. Exits wait a 7-day notice period.
- **Shields.** A Shield sizes a limit as if the market were closed and keeps committed buyers behind it for a window. It does not prevent a settlement and is not a guarantee of any kind.
- **Figures.** Market figures carry a date and a source. Illustrative calculations are labelled and are not projections.

_Sources: SECURITY.md "What remains" items 1, 3, 4, 6, 7, 8, 10, 11, 12 (2026-11-11) · README "Live on testnet" table · docs/EVIDENCE.md §G2b, §G5 (FALLBACK), §G6, §G7, §G8 (fixture), §G13 (local fork) · docs/DECISIONS.md D-026, D-029, D-031 · FACTS C-007, C-012, C-020, F-063, F-328._
