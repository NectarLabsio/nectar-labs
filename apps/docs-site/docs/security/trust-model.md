---
title: Trust model
slug: /security/trust-model
description: Who is trusted for what, and what bounds each trust.
---
# Trust model

<p className="verified">Verified against: F-015 (2026-11-09), F-030 (2026-11-09), F-040 (2026-11-09), F-050 (2026-11-09), F-060 (2026-11-09), F-070 (2026-11-09), F-073, F-075, F-076, F-077, F-078 (2026-11-09) · test `e2e/copilot.spec.ts` · spec docs/PRD.md §15 · D-003, D-005 (2026-11-09)</p>
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
| Keeper | liveness; reporting that a remote leg landed | function-call key, no deposits (F-015), cannot choose payloads (D-003). Its `relay_settlement_result` / `relay_release_result` reports are **advisory**: nectar-core checks only the format of the tx reference and does not verify the Solana or Base transaction (PRD §9 trust note; PROD: light-client or attested proof). An expired, unrelayed leg can be re-signed by anyone (`resign_remote_settlement`); a relayed one cannot (test `sr3_resign_refused_after_relay`) |
| NEAR AI Cloud (P2, F-070) | prose for humans | never a contract input; the answer is shown only when it is signed by an attested NEAR AI TEE, which is provenance, not advice, and is not yet tied to the question typed. Checks: Intel DCAP quote verification on the server (F-073), EIP-191 signer recovery and report_data/nonce checks in the browser (F-075, F-076). No live answer has been verified yet (key H7 absent; `/v1/models` 500 on 2026-11-09, F-078) |

## The owner is the largest trust

In this build the owner is a single deployer key on testnet. It can change parameters, pause, and move the mock price (the disclosed demo control). That is acceptable for testnet with mock assets and is not acceptable for mainnet. PROD requires a DAO owner with a 48 h timelock on parameter changes and an instant pause. See [Upgrades](/operations/upgrades).
