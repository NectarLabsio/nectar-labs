---
title: Privacy policy
slug: /legal/privacy
description: What the Nectar Labs service processes, which third parties your browser contacts, and what each one can see.
# Sources (YAML comment, not rendered by either renderer):
# - Hosts, storage keys, cookies: apps/web/content/data-inventory.json + .md (generated 2026-11-11T21:04:52Z by apps/web/e2e/inventory.spec.ts, WO-34f: all 6 selector wallets, CSP enforced).
#   Solana devnet RPC is not in the measured run (needs a wallet extension): apps/web/lib/csp.ts, apps/web/lib/env.ts.
#   jsDelivr fallback blocked: @hot-labs/near-connect 0.12.0 build/NearConnector.js l.15-16 vs apps/web/lib/csp.ts MEASURED.connect.
# - Vercel: F-402 (Hobby), F-403 (runtime logs 1 h on Hobby; method/path/host/UA/search params; IP is derived, hence "may include").
# - Railway: F-404, F-405 (plans, volumes), F-406 (edge adds X-Real-IP), F-412 (log retention 3/7/30 days; privacy policy quote).
# - RPC: DECISIONS D-025, FACTS F-369. Hosting split: D-030; x402 not hosted: D-031 (F-328, C-023).
# - Feed logger drops ip/user_agent: services/feed/src/log.ts. Copilot: apps/web/lib/copilot/server.ts, apps/web/lib/api/guard.ts.
---
# Privacy policy

_Last updated 2026-11-12 · Draft, not legal advice · Operator: **TODO-H-LEGAL** (OPERATOR) · Country: **TODO-H-LEGAL** (COUNTRY) · Contact: **TODO-H-LEGAL** (CONTACT)_

## What this covers

This policy covers the Nectar Labs site, the web app, this documentation, and the Nectar Feed API and MCP server (together, "the service"). The operator is **TODO-H-LEGAL** (OPERATOR). The service is **testnet software**: it runs on NEAR testnet, Solana devnet and a local fork of Base Sepolia, with mock tokens and no real funds.

In the hosted demo, Vercel serves the site, the web app and this documentation, and Railway serves the Feed. The x402 paid export is not hosted. It runs only on the operator's own machine, so the hosted service never contacts an x402 facilitator. The keeper, the bot that settles positions, works only with public chain data and receives nothing from your browser.

## In short

- No account, no sign-up, no forms, **no cookies**.
- On our servers we collect nothing beyond the hosting providers' request logs (see [Host logs](#host-logs)) and, for the copilot, an in-memory rate limit.
- **Analytics are off.** No analytics vendor is configured, so no analytics script loads, whatever you choose in the consent banner.
- Your browser keeps a few settings in localStorage. Once you open the wallet selector, the selector library and the wallet you pick keep their own entries. Every key is listed below and on the [Cookie policy](/legal/cookies).
- Your browser talks **directly** to the NEAR RPC provider. Once you press **Connect wallet**, it also talks to the wallet-list host and the wallet you open. Each of them sees your IP address.
- **On-chain data is public and permanent.**

## What we process and why

| Data | Where | Purpose | Legal basis (GDPR / UK GDPR) | Retention |
| --- | --- | --- | --- | --- |
| HTTP request metadata (see [Host logs](#host-logs)) | Vercel; Railway for the Feed | deliver the service, find faults, prevent abuse | legitimate interest | 1 hour on Vercel; 3, 7 or 30 days on Railway, by plan |
| Settings in your browser (theme, consent choice, a wallet-connected flag) | your browser only; we never receive them | remember your settings | strictly necessary | until you clear site data |
| IP address of copilot requests | the web app server's memory only | rate-limit the copilot route (5 live answers a minute per address, 30 overall) so nobody can run up its cost | legitimate interest | never logged or written to disk; held in memory until the server instance stops (at most 10,000 addresses, oldest dropped first) |
| The question you type into the copilot | NEAR AI Cloud, **live mode only** (see [Our servers' outbound calls](#our-servers-outbound-calls)) | answer the question | legitimate interest | not stored by us |
| Email you send us | the mailbox of the contact address | reply to you | legitimate interest | until resolved, then 12 months |
| Wallet account ids and on-chain activity | public blockchains | the protocol itself | none needed: public by nature | permanent, outside anyone's control |

## Host logs

| Host | Serves | What its logs record | Kept for |
| --- | --- | --- | --- |
| Vercel (Hobby plan) | the site, the web app, this documentation | for each request: method, path, query string, time, status code, host, request id, user agent, region and cache fields. Vercel matches log entries by IP address and user agent, so these logs may include your IP address. | runtime logs: 1 hour on the Hobby plan |
| Railway | the Feed API and MCP server | Railway's edge passes the caller's IP address to the Feed in a request header. The Feed's own logger drops IP address and user-agent fields before it writes a line. Railway may also process IP address and device data as our service provider, under its own privacy policy. | 3 days (Free plan), 7 days (Hobby), 30 days (Pro) |

Some web app URLs contain a position id, a Note id or a referrer account (`?ref=`), so a logged path or query string can carry them. Your browser never calls the Feed directly: the web app's server fetches from it. The Feed sees your IP address only if you call its API or MCP server yourself, for example from an agent.

## Browser storage

| Key | Kind | Host | Set by | Purpose | Lifetime |
| --- | --- | --- | --- | --- | --- |
| `nectar-consent` | localStorage | site and app | our code | your Accept or Decline choice: `{v, analytics, at}` | until you clear site data; the banner asks again after 180 days |
| `nectar-theme` | localStorage | site and app | our code | remembers dark or light theme | until you clear site data |
| `nectar-wallet-connected` | localStorage | app | our code | `1` after a wallet connects, so the app reconnects on your next visit | set on connect, removed on disconnect |
| `theme` | localStorage | app (this documentation) | Docusaurus | the documentation colour mode, only if you use its colour switch | until you clear site data |
| `selected-wallet` | localStorage | app | near-connect 0.12.0 (wallet selector library) | id of the wallet you picked | set on connect, removed on disconnect |
| `hot-connector/wallets`, `hot-connector/wallets/<wallet id>:<version>` (measured: `ethereum-wallets:0.1.4`, `intear-wallet:1.0.0`, `ledger:1.0.0`, `meteor-wallet:1.1.1`, `near-cli:1.0.0`, `nightly-wallet:1.0.0`) | IndexedDB | app | near-connect 0.12.0 | cache of the sandboxed wallet's code | until you clear site data; replaced on a new wallet version |
| `<wallet id>:…` (measured: `meteor-wallet:<random id>`, `meteor-wallet:met_bridge_partner::<per-session ids>`) | localStorage | app | the wallet you opened, through near-connect | the wallet's own storage, passed out of its sandboxed frame and prefixed with its wallet id | until you disconnect or clear site data |

How this was measured: on 2026-11-11, real Chrome with a fresh profile visited every route on both hosts in dark and light theme, with consent accepted and declined, and opened each of the six wallets in the selector one at a time, in a fresh profile, with our content security policy enforced and without signing. `nectar-wallet-connected` and `theme` did not appear in that run because it never completed a connect or used the documentation colour switch. They are listed from the code. No cookie was set in any run.

## Third parties your browser contacts

| Host | Who | When | What it can see |
| --- | --- | --- | --- |
| `test.rpc.fastnear.com` | FastNEAR, NEAR testnet RPC (default) | app pages that read the contracts; the wallet selector | your IP address and user agent, the contracts and accounts you query, and the transaction hashes the app checks. After you connect, your account id travels with the reads of your balances, claims and Notes. |
| `rpc.testnet.fastnear.com` | FastNEAR, NEAR testnet RPC (fallback) | when the default does not answer; the Meteor Wallet and Intear Wallet frames also call it | the same as above |
| `raw.githubusercontent.com` | GitHub, serving the selector's wallet list (`manifest.json`) and wallet icons | after you press **Connect wallet** | your IP address and user agent; no account id |
| `storage.herewallet.app` | host of wallet icons named in the wallet list; also images inside the Nightly Wallet frame | after you press **Connect wallet** | your IP address and user agent; no account id |
| `evm-on-near.dev` | host of wallet icons named in the wallet list; also the Ethereum Wallets frame and the window it opens | after you press **Connect wallet**; more once you open Ethereum Wallets | your IP address and user agent; once you use Ethereum Wallets, what you do in it |
| `api.devnet.solana.com` | Solana devnet public RPC | the Solana collateral flow only, which needs a Solana wallet extension (listed from the code; the fresh-profile run could not reach it) | your IP address, the Solana addresses and accounts queried, and the signatures of transactions it checks. Your wallet sends the transactions itself. |
| the hosts of the wallet you open | that wallet (next section) | after you open it in the selector | see [Wallets](#wallets) |

Your browser contacts nothing else. The site, the web app and this documentation serve their own fonts, scripts and search index. Nothing loads from Google Fonts or a script CDN. The selector library has a built-in fallback copy of its wallet list on `cdn.jsdelivr.net`. That host is not in our content security policy, so your browser blocks the request. No analytics host is contacted, because none is configured.

## Wallets

The wallet selector (near-connect 0.12.0) runs each wallet's code in a sandboxed iframe inside our page. Before you open a wallet, no wallet code runs. Once you open one, its frame contacts that wallet's own hosts, listed below per wallet. Once you connect, the wallet sees your account id and every transaction you ask it to sign, under that wallet's own privacy policy. We never ask for or collect your keys. What a wallet keeps in its storage space stays in your browser under its prefixed keys (see [Browser storage](#browser-storage)) and never reaches our servers. A wallet that opens its own window or tab, for example to approve a transaction, does so under its own site's policy.

### Hosts per wallet

Before you pick a wallet, the selector itself contacts `raw.githubusercontent.com`, `storage.herewallet.app`, `evm-on-near.dev` and `test.rpc.fastnear.com` (table above). Each wallet adds the hosts below once you open it. Measured on 2026-11-11, one wallet at a time in a fresh profile, with our content security policy enforced and without signing.

| Wallet | Hosts its frame contacts | Windows it opens |
| --- | --- | --- |
| Meteor Wallet | `mc.meteorwallet.app` (its API; our policy also allows its websocket), `meteorwallet.app` (images), `fonts.cdnfonts.com` and `rsms.me` (web fonts), `rpc.testnet.fastnear.com` (NEAR testnet RPC) | none |
| Intear Wallet | `wallet.intear.tech` (its frame page and API), `rpc.testnet.fastnear.com` (NEAR testnet RPC) | none |
| NEAR CLI | `rsms.me` (web fonts) | none |
| Ethereum Wallets | `evm-on-near.dev` (its frame page and API) | `https://evm-on-near.dev/`, under that site's own policy, not ours |
| Ledger | no host beyond the selector's | none |
| Nightly Wallet | `storage.herewallet.app` (images) | none |

Each of these hosts sees your IP address and user agent. A wallet's own API also sees what you do in that wallet.

The wallet list is the selector library's manifest. It is fetched at runtime and not pinned, so its maintainers can add a wallet or change a wallet's hosts before we measure again. Our content security policy lets a wallet frame reach only our own hosts and the hosts listed on this page, so a frame's requests to any other host are blocked. A window that a wallet opens, as Ethereum Wallets does, is outside our policy.

### Solana wallet

In the Solana collateral flow you connect a browser-extension wallet (Phantom or another Wallet Standard wallet). It sees your Solana address and the transactions you approve, under its own policy.

## Our servers' outbound calls

These calls come from our servers, not your browser. None of them carries your IP address.

| Service | Called by | When | What it receives |
| --- | --- | --- | --- |
| NEAR AI Cloud (`cloud-api.near.ai`) | web app server (copilot) | **live mode only**, when the operator has set an API key. Without a key the copilot answers from a recorded example and calls no one. | the question you type and a random nonce |
| Phala PCCS (Intel DCAP collateral) | web app server (copilot) | live mode only, to check the TDX quote | the attestation quote; no personal data |
| NVIDIA NRAS (`nras.attestation.nvidia.com`) | web app server (copilot) | live mode only, to check GPU attestation | the GPU attestation payload; no personal data |
| FastNEAR (`test.rpc.fastnear.com`, `rpc.testnet.fastnear.com`) | web app server and the Feed | reading chain state | public contract views only |
| dRPC (`near-testnet.drpc.org`), Intear (`testnet-rpc.intea.rs`) | the Feed | only when FastNEAR does not answer | public contract views only |
| Neardata (`testnet.neardata.xyz`) | the Feed | indexing protocol events | requests for public testnet blocks |
| NEAR Intents 1Click (`1click.chaindefuser.com`) | the Feed | refreshing reference depth: dry quotes only, never a deposit | a quote request for a token pair and an amount; no user data |

## What we never do

We never collect private keys or seed phrases, sell data, build profiles, run ads, or track you across sites.

## On-chain data is public and permanent

Quotes, positions, claims, Notes and settlements are recorded on NEAR testnet and Solana devnet. Anyone can read them, including your wallet address and every transaction it sends. We cannot change or erase on-chain data. That is a property of public blockchains, not a choice we make.

## Contact, sharing and links

"Talk to us" shows the contact address with a copy button. It has no form and sends nothing. The "Share to X" link on a Note page opens X in a new tab with a short text (the Note id, "NEAR testnet", "mock collateral") and the Note's page address prefilled. It sends nothing until you click it and posts nothing unless you do. Links to other sites (NEAR, Solana, OutLayer and others) are plain links, and those sites have their own policies once you follow them.

## Your rights

Where GDPR, UK GDPR or India's Digital Personal Data Protection Act 2023 applies, you can ask for access, correction, erasure, restriction or portability, object to processing, and withdraw consent at any time on the [Cookie policy](/legal/cookies#cookie-settings). We hold almost nothing about you: settings live in your browser, and host logs expire as stated above. Write to **TODO-H-LEGAL** (CONTACT). You may also complain to your data-protection authority.

## Children

The service is not directed at children, and we do not knowingly process their data.

## Changes

Material changes are listed in the [Changelog](/changelog), and the date at the top of this page is updated.
