---
title: Trust model
slug: /security/trust-model
description: Who is trusted for what, and what bounds each trust.
---
# Trust model

<p className="verified">Verified against: F-015 (2026-11-09), F-030 (2026-11-09), F-040 (2026-11-09), F-050 (2026-11-09), F-060 (2026-11-09), F-070 (2026-11-09) · spec docs/PRD.md §15 · D-003, D-005 (2026-11-09)</p>
<p className="status">Status: design. Deployed on NEAR testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). Each bound is backed by a test named on the Threats page once G1 passes.</p>

Every rule that moves money is enforced by `nectar-core`. Every off-chain party can at worst delay or degrade a settlement. None can redirect funds.

| We trust | For | Bounded by |
| --- | --- | --- |
| NEAR validators | execution and storage | protocol |
| Owner key (deployer in this build) | risk parameters, pause, oracle choice | every owner action emits an event; PROD: multisig and timelock |
| `outlayer.testnet` (P1, F-040) | running the pinned WASM | clamp to `max_discount_bps`; fallback to P0 pricing on failure |
| Price source (owner in P0; G5 decides, F-050) | spot price | freshness, 1,500 bps band, weekend haircut, two-step override |
| `v1.signer-prod.testnet` MPC set (P2, F-030) | signing only what we send | contract-built preimage, path per chain, nonce, expiry |
| 1Click (P1, F-060) | public depth figure | `dry: true` only; `D_c` = 0 if unavailable |
| Keeper | liveness | function-call key, no deposits (F-015), cannot choose payloads (D-003) |
| NEAR AI Cloud (P2, F-070) | prose for humans | never a contract input; signature verified in the browser |

## The owner is the largest trust

In this build the owner is a single deployer key on testnet. It can change parameters, pause, and move the mock price (the disclosed demo control). That is acceptable for testnet with mock assets and is not acceptable for mainnet. PROD requires a DAO owner with a 48 h timelock on parameter changes and an instant pause. See [Upgrades](/operations/upgrades).
