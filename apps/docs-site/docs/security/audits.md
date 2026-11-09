---
title: Audits
slug: /security/audits
description: Audit status, stated plainly.
---
# Audits

<p className="verified">Verified against: spec docs/PRD.md §15, §18 · repository state on 2026-11-10</p>

**No audit has been performed.** The contracts, the Solana program and the quoter are unaudited testnet code. Do not use them with real assets.

| Component | Audit | Planned |
| --- | --- | --- |
| `nectar-core` (NEAR) | none | before any mainnet deployment (PROD) |
| `mock-ft` | none | testnet only, never on mainnet |
| `nectar_vault` (Solana) | none | before mainnet (PROD) |
| quoter (OutLayer WASM) | none | before mainnet (PROD) |

Mainnet also requires a 30-day testnet soak and a legal review of the disclaimers (PRD §18). Until then the internal controls are the tests named on the [Threat table](/security/threats), and they are claimed only once they pass at G1.
