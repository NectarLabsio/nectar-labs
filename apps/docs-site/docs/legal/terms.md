---
title: Terms of use
slug: /legal/terms
description: Terms for the Nectar Labs site, web app, docs, Feed and testnet contracts.
---
# Terms of use

_Last updated 2026-11-12 · Draft, not legal advice · Operator: **Nectar Labs** · Country: **United States / India** · Contact: [kunal@nectarnetwork.fun](mailto:kunal@nectarnetwork.fun)_

These terms cover the Nectar Labs site, the web app, this documentation, the Nectar Feed API and MCP server, and the Nectar Labs contracts and programs on public test networks (together, "the service"). The [risk disclaimers](/legal/disclaimers) are part of these terms. By using the service you accept both.

## 1. Testnet only

The service runs on NEAR testnet, Solana devnet and a local fork of Base Sepolia. Nothing is deployed on any mainnet. Every token the service uses is a test token, and nothing in the service has monetary value. Do not send real assets to any address the service shows. The web app refuses to sign for an account that is not a `.testnet` or implicit account and shows "Wrong network" instead.

## 2. Mock collateral with no value

The collateral is **mock NVDAx** (`nvdax-mock.nectar.testnet`), a test token that stands in for tokenized equities such as xStocks. It is not issued or backed by, and has no relation to, NVIDIA, Backed / xStocks or any other issuer. It represents no share and no claim on anything. Mock USDC (`usdc-mock.nectar.testnet`) is a test token with no relation to Circle. Neither can be redeemed or exchanged for anything of value.

## 3. No token

Nectar Labs has no token, no token sale and no airdrop. Position Notes are NEP-171 records of mock quotes, loans and Reserve deposits on the testnet contract. They are not a project token, have no monetary value and are not offered for sale. Anyone offering a "Nectar" or "Nectar Labs" token is not acting for the operator.

## 4. Not investment advice, not an offer

Nothing in the service is financial, investment, legal or tax advice, or an offer to lend, borrow, buy, sell or trade anything in any jurisdiction. Limits, premiums, discounts and the Reserve's "realised fee APR (trailing 7 days)" are testnet protocol figures. They are not recommendations and not promised returns. The copilot panel's answers are labelled "Model output, not advice."

## 5. Unaudited, experimental software, no warranty

The contracts, the Solana and EVM vaults, the quoter, the keeper, the Feed and the web app are **unaudited**. The two internal reviews described in SECURITY.md (2026-11-11) are not audits. The software is MIT-licensed and provided "as is", without warranty of any kind, express or implied. You use it at your own risk.

Parameters, contracts and interfaces can change, be paused or be withdrawn without notice. A single owner account sets the protocol parameters, can pause the contract and sets the mock price ([Trust model](/docs/security/trust-model)).

## 6. Disclosed fallbacks and known limitations

Some parts of the service run in a disclosed fallback mode, for example the owner-set price instead of a market oracle. Some limitations are known and not fixed, for example that a remote Loan Note does not carry the collateral release. Both lists are in the [risk disclaimers](/legal/disclaimers). The full list of known limitations is SECURITY.md "What remains (known, not fixed)", summarised on [Audits](/docs/security/audits#what-remains). Read them before you sign anything.

## 7. Service availability

The hosted demo (site, web app, docs and the read-only Feed) is planned to stay available until at least **2026-11-25**. There is **no service level**: the hosted demo can be slow, rate-limited, unavailable or stopped at any time, and it may end after that date without notice. The x402 paid export is not part of the hosted demo; it runs on the operator's machine. Cross-chain settlement depends on a keeper that does not run continuously. If a signed settlement expires before it is relayed, anyone can recover it with "Re-sign settlement" in the web app.

The service depends on third parties that have their own terms and can fail: NEAR and Solana RPC providers, OutLayer, the NEAR Chain Signatures MPC signer, NEAR Intents 1Click (read-only dry quotes), NEAR AI Cloud, the wallets you choose, and the hosting providers of the hosted demo (Vercel for the site, app and docs; Railway for the Feed). The [privacy policy](/legal/privacy) lists what each one receives.

## 8. On-chain data is public and permanent

Every transaction you sign is recorded on a public blockchain and can be read by anyone, indefinitely: your account id, amounts, positions, quotes and Notes. Explorers and indexers keep their own copies. The operator cannot change or delete on-chain data. Do not put personal data in account names, memos or any field that goes on chain.

## 9. Acceptable use

Keep your wallet keys to yourself: the service never asks for them. Do not attack the deployments beyond responsible disclosure ([Bug disclosure](/docs/security/disclosure)), do not impersonate the project, and do not use the Feed, the copilot or any API in ways that degrade it for others (the copilot is rate-limited). You are responsible for complying with the laws that apply to you.

## 10. Liability

To the extent the applicable law allows, the operator is not liable for any loss or damage arising from the use of, or the inability to use, the service, including the loss of test tokens, testnet positions or data.

## 11. Changes

Changes to these terms are dated at the top of this page and recorded in the [Changelog](/changelog). Continued use after a change means you accept it.

## 12. Operator and contact

- Operator: **Nectar Labs**, operated from the United States / India
- Contact: [kunal@nectarnetwork.fun](mailto:kunal@nectarnetwork.fun)

_Sources: SECURITY.md "What remains" and review 2 R2-10, R2-12 (2026-11-11) · README "Live on testnet" table · docs/process/decisions.md D-026, D-030, D-031 · `packages/config/config.yaml` `site.hosted_until` · FACTS F-328._
