---
title: Chain Signatures leg
slug: /protocol/chain-signatures
description: How nectar-core asks the NEAR MPC network for an Ed25519 signature.
---
# Chain Signatures leg

<p className="verified">Verified against: F-028 (2026-11-10), F-030 (2026-11-09), F-031 (2026-11-09), F-032 (2026-11-09), F-033 (2026-11-09), F-034 (2026-11-09), F-035 (2026-11-09), F-036 (2026-11-09), F-184 (2026-11-09), F-185 (2026-11-09) · near/mpc commit b5bafa3 · D-003 (2026-11-09), D-016 (2026-11-10) · docs/EVIDENCE.md G7 (2026-11-09T23:57Z, 97382fd)</p>
<p className="status">Status: NEAR side live on testnet (G7 PARTIAL, 2026-11-09T23:57Z). Trigger tx <a href="https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe">FCtApD2L…MHhe</a> on position #6: nectar-core built the preimage, `v1.signer-prod.testnet` returned an Ed25519 signature over the raw bytes, nectar-core emitted `settlement_signed`, and the signature verifies against the derived key below (a one-byte change in the preimage fails). The Solana leg is not built, so nothing was relayed.</p>

| Fact | Value | Id |
| --- | --- | --- |
| Signer contract | `v1.signer-prod.testnet` (mainnet `v1.signer`) | F-030 |
| Request | `sign({ path, payload_v2: {Ecdsa: 64-hex} or {Eddsa: hex}, domain_id })` | F-031 |
| Domains | 0 = Secp256k1, 1 = Ed25519 | F-032 |
| Deposit | 1 yoctoNEAR | F-033 |
| Gas | from the signer's `sign_call_gas_attachment_requirement_tera_gas` config, not a constant | F-034 |
| Response | `SignatureResponse::Ed25519 { signature }` | F-035 |
| Yield/resume API in near-sdk 5.30.1 | `Promise::new_yield`, `YieldId::resume`, `env::promise_yield_resume` | F-028 |
| Derived key for (`nectar-core.nectar.testnet`, `solana-devnet-v1`, domain 1) | `ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV`; the live `derived_public_key` view equals the off-chain derivation | F-036, F-185 |
| Payload | raw UTF-8 preimage bytes as hex, no pre-hash | D-016 |

## Rules nectar-core follows

1. **Contract-built payload.** No public method accepts a hash or a payload. The preimage is built in the callback from state (D-003). See [Preimage format](/protocol/preimage-format).
2. **Gas reserve pays.** The 1 yoctoNEAR deposit and gas come from `gas_reserve_yocto`, funded by the owner. The keeper attaches nothing, and its function-call key could not attach a deposit anyway (F-015).
3. **Distinct path per chain**, so a signature for one chain is useless on another.
4. **Nonce and expiry** inside the signed message.

## What a stolen keeper key can do

Call `trigger_preliquidation` on a position that is not triggerable, which the contract refuses, or on one that is, which is the keeper's job anyway. It cannot make the contract sign an arbitrary payload. A planned P2 test (G7) and demo step will show the refusal.
