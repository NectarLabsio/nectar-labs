---
title: Roadmap
slug: /project/roadmap
description: P0 to PROD, with the gate each phase must pass.
---
# Roadmap

<p className="verified">Verified against: F-001 (2026-11-09), F-002 (2026-11-09), F-003 (2026-11-09) · spec docs/process/prd.md §18 · D-001, D-004 (2026-11-09) · D-018, D-024 (2026-11-10) · docs/EVIDENCE.md §G2b, §G7 v7, §G14 (2026-11-10T16:52Z) · §v7 module runs (2026-11-10T17:20Z, 2bf99e1) · re-runs after D-027 (2026-11-11, recorded in b8784c1 and 5083d30)</p>
<p className="status">Status on 2026-11-10: gate results are on [Evidence](/project/evidence); what runs where is on [Live on testnet](/start/live-on-testnet).</p>

| Phase | Ships | Gates |
| --- | --- | --- |
| **P0 Core credit** | `nectar-core` on NEAR testnet with real NEP-141 custody of mock USDC and mock NVDAx; Pappus quotes; O(1) fee index; two-step notice withdrawal; Cramér limit; static settlement at `max_discount_bps` with owner oracle; keeper with a function-call key; web app; this docs site | G0–G3 |
| **P1 Verified pricing and depth** | OutLayer quoter (pinned `wasm32-wasip2`) with clamped `disc_bps` and fallback; Pyth or OutLayer oracle with staleness and confidence checks; 1Click `dry: true` depth (F-002); Feed REST and MCP | G4–G6 |
| **P2 Cross-chain settlement and copilot** | Solana devnet `nectar_vault`; Chain Signatures Ed25519 over a contract-built preimage; NEAR AI Cloud copilot with signature verification | G7–G8 |
| **v7** (deployed on testnet 2026-11-10, G2b PASS; see the status of each part) | `nectar-core-v2.nectar.testnet`: aggregate limit, Weekend Oracle Guard, origination fee, remote collateral lifecycle on Solana devnet, x402 paid export, [Position Notes](/concepts/position-notes) and the OutLayer vault-read job are live (EVIDENCE §G2b, §G7 v7, §G14); [Shields](/concepts/shields), [Profit-Lock](/concepts/profit-lock) and [Nectar Reserve](/concepts/nectar-reserve) ran on testnet (EVIDENCE §v7 module runs, 2bf99e1; the Profit-Lock event is not chain-confirmed). Not on testnet: corporate-action multiplier, `pay_to`, referrers (built and sandbox-tested), OutLayer calendar and multiplier jobs (no recorded execution) | G1 (v7), G11, G2b, G7 (v7), G14: PASS |
| **Release** | evidence complete; fresh-clone rehearsal | G9 |
| **PROD** (not built here) | mainnet with DAO owner and timelock; audit; real tokenized-equity collateral; keeper bonds and slashing; curator fee schedule | audit, 30-day soak, legal review |

**Cut order if time runs short** (last to first): copilot, Feed MCP, Solana leg (keeping the signer round-trip demo), 1Click depth, live oracle (stay on the disclosed owner oracle), OutLayer quoter (stay on disclosed static pricing). P0 is never cut.

**Deliberately not built:** other chains (D-001), secp256k1 settlement, anything on mainnet, a token, governance UI, mobile apps. Live networks: NEAR testnet and Solana devnet only (F-003). The EVM vault runs on a local fork of Base Sepolia (D-026), not on Base Sepolia.
