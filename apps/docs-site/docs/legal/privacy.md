---
title: Privacy policy
slug: /legal/privacy
description: What the Nectar Labs sites process, why, and for how long.
---
# Privacy policy

_Last updated 2026-11-10 · Draft, not legal advice · Controller: **TODO-H9** (default if unanswered: "Nectar Labs, an unincorporated project by Nectar Network") · Contact: kunal@nectarnetwork.fun_

## What this covers

This documentation site, the Nectar Labs web app and the Nectar Feed API and MCP server ("the sites"). The sites serve **testnet software**: NEAR testnet and Solana devnet, mock tokens, no real funds.

Current state (2026-11-10): this documentation site, the web app (G3 PASS) and the Feed API and MCP server are built and run locally; the Feed has no public host. The web app stores `nectar-consent`, `nectar-theme` and `nectar-wallet-connected` in your browser (see [Cookie policy](/legal/cookies)).

## What we process

| Data | Where | Purpose | Legal basis (GDPR / UK GDPR) | Retention |
| --- | --- | --- | --- | --- |
| Theme choice and consent choice | your browser's localStorage (see [Cookie policy](/legal/cookies)) | remember your settings | strictly necessary / legitimate interest | until you clear it; consent re-asked after 180 days |
| Analytics events, **only if you accept** and only if a vendor is configured (TODO-H4) | analytics vendor | understand which pages help | consent | vendor default (TODO-H4) |
| HTTP request metadata (IP address, user agent, URL, time) | our hosting provider (TODO-H5) | deliver the site, prevent abuse | legitimate interest | per host policy (TODO-H5) |
| Email you send us | our mailbox | reply to you | legitimate interest / contract | until resolved + 12 months |
| Wallet account ids and on-chain activity (web app, when shipped) | public blockchains | the protocol itself | — (public by nature) | permanent, outside our control |

**On-chain data is public by nature.** Quotes, positions and settlements are on NEAR testnet and Solana devnet, visible to anyone, including your account id. We cannot erase on-chain data. That is a property of public blockchains, not a choice we make.

**We never** collect private keys or seed phrases, sell data, build profiles, run ads, track you across sites, or join wallet addresses to IP addresses in any log we control.

## Third parties actually used

| Service | Used by | When | Data it receives |
| --- | --- | --- | --- |
| Hosting provider (TODO-H5; default plan: Vercel preview) | all sites | every request | request metadata |
| Google Analytics 4 **or** Plausible (TODO-H4) | docs site, web app | only after you click "Accept analytics", and only if configured; **off by default** | page views, anonymised IP (GA4 with IP anonymisation) or no cookies (Plausible) |
| Email provider of kunal@nectarnetwork.fun | contact | when you email us | your message and address |
| NEAR AI Cloud (`cloud-api.near.ai`) | web app copilot, from our server | **live mode only** (operator API key set, TODO-H7); not called in fixture mode | the question you type and a random nonce; not your IP address |
| Phala PCCS (Intel DCAP collateral) | web app copilot, from our server | **live mode only**, to check the TDX quote | the attestation quote; no personal data |
| NVIDIA NRAS (`nras.attestation.nvidia.com`) | web app copilot, from our server | **live mode only**, to check GPU attestation | the GPU attestation payload; no personal data |

This site loads its fonts and search index from its own origin. It requests nothing from Google Fonts or any other CDN. Links to other sites (NEAR, Solana, OutLayer and others) are plain links. Those sites have their own policies once you follow them. The "Share to X" link on a Note page is one of these: it opens X in a new tab with a short text (the Note id, "NEAR testnet", "mock collateral") and the Note's page address prefilled, sends nothing until you click it, and posts nothing unless you do.

Contact form (TODO-H9): until a form provider is chosen, "Talk to us" opens your own mail client (`mailto:`). No form processor is involved.

## Your rights

Where GDPR, UK GDPR or India's Digital Personal Data Protection Act 2023 applies, you can ask for access, correction, erasure, restriction, portability, or object to processing, and you can withdraw consent at any time ([Cookie settings](/legal/cookies#cookie-settings)). Email kunal@nectarnetwork.fun. You may also complain to your data-protection authority.

## Children

The sites are not directed at children, and we do not knowingly process their data.

## Changes

Material changes are listed in the [Changelog](/changelog), with the date at the top of this page updated.
