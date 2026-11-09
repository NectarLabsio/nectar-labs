---
title: Roadmap
slug: /project/roadmap
description: P0 to PROD, with the gate each phase must pass.
---
# Roadmap

<p className="verified">Verified against: F-001 (2026-11-09), F-002 (2026-11-09), F-003 (2026-11-09) · spec docs/PRD.md §18 · D-001, D-004 (2026-11-09)</p>
<p className="status">Status on 2026-11-10: P0 in progress. No phase has passed its gates.</p>

| Phase | Ships | Gates |
| --- | --- | --- |
| **P0 Core credit** | `nectar-core` on NEAR testnet with real NEP-141 custody of mock USDC and mock NVDAx; Pappus quotes; O(1) fee index; two-step notice withdrawal; Cramér limit; static settlement at `max_discount_bps` with owner oracle; keeper with a function-call key; web app; this docs site | G0–G3 |
| **P1 Verified pricing and depth** | OutLayer quoter (pinned `wasm32-wasip2`) with clamped `disc_bps` and fallback; Pyth or OutLayer oracle with staleness and confidence checks; 1Click `dry: true` depth (F-002); Feed REST and MCP | G4–G6 |
| **P2 Cross-chain settlement and copilot** | Solana devnet `nectar_vault`; Chain Signatures Ed25519 over a contract-built preimage; NEAR AI Cloud copilot with signature verification | G7–G8 |
| **Release** | evidence complete; fresh-clone rehearsal | G9 |
| **PROD** (not built here) | mainnet with DAO owner and timelock; audit; real tokenized-equity collateral; Nectar Reserve (`R_c`); keeper bonds and slashing; curator fee schedule | audit, 30-day soak, legal review |

**Cut order if time runs short** (last to first): copilot, Feed MCP, Solana leg (keeping the signer round-trip demo), 1Click depth, live oracle (stay on the disclosed owner oracle), OutLayer quoter (stay on disclosed static pricing). P0 is never cut.

**Deliberately not built:** other chains (D-001), secp256k1 settlement, anything on mainnet, a token, governance UI, mobile apps. Only NEAR testnet and Solana devnet are used (F-003).
