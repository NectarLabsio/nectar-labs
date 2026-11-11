---
title: Settlement flow
slug: /protocol/settlement-flow
description: From keeper trigger to collateral delivery, per phase.
---
# Settlement flow

<p className="verified">Verified against: F-013 (2026-11-09), F-021 (2026-11-09), F-031 (2026-11-09), F-033 (2026-11-09), F-035 (2026-11-09), F-040 (2026-11-09), F-080 (2026-11-09) · spec docs/PRD.md §5, §6.5, §9 · D-003, D-004 (2026-11-09) · docs/EVIDENCE.md §G7 v7 (2026-11-10T16:52Z, 91db9ea)</p>
<p className="status">Status: P0 path is the specification that WO-2 implements (deployed on testnet 2026-11-09, G2 PASS 2026-11-09T20:55Z, commit 5f27f44). P1 is live (G4 PASS 2026-11-09T22:10Z). P2 is live end to end on nectar-core-v2 and Solana devnet (G7 v7 PASS 2026-11-10T16:52Z, commit 91db9ea): signer response on NEAR, Ed25519 verify + settle on devnet (tx 3cdcQru2…), relay reported back. The first run on v1 (G7 PARTIAL 2026-11-09T23:57Z) verified the NEAR side only.</p>

## P0 (static pricing, NEAR collateral)

```text
keeper                  nectar-core                         usdc-mock / nvdax-mock
  |  trigger_preliquidation(position_id)  |                            |
  |-------------------------------------->|                            |
  |                     checks: keeper, 0 deposit, not paused,         |
  |                     fresh oracle, debt·1e4 > V·pre_liq_ltv_bps     |
  |                     state = Settling; pick ≤ 8 quotes              |
  |                     (ascending max_discount_bps, then oldest)      |
  |                     per quote: disc = max_discount_bps (P0)        |
  |                     escrow −= repay; pool += repay; debt −= repay  |
  |                     ft_transfer(buyer, seize_units) -------------->|
  |                     emit settled_near{position_id, quote_id,       |
  |                       disc_bps, repay_usd_e6, seize_units, buyer}  |
```

State changes happen before any cross-contract call. Transfer callbacks only roll back on failure (checks-effects-interactions, PRD §6.3).

## P1 (TEE pricing)

The contract calls `outlayer.testnet.request_execution` with the pinned `source: {Project: {project_id, version_key}}` (F-040). The callback `on_quoter_result` parses at most 900 bytes of stdout (F-043) and clamps `disc_bps` to `[0, max_discount_bps]`. If the quoter fails or times out, the contract falls back to P0 pricing and emits `quoter_fallback`. A down TEE never blocks a rescue.

## P2 (collateral on Solana)

```text
keeper        nectar-core              v1.signer-prod.testnet      nectar_vault (devnet)
  | trigger      |                              |                          |
  |------------->| builds NECTAR_SETTLE_V1      |                          |
  |              | preimage from its own state  |                          |
  |              | sign({path, payload_v2:      |                          |
  |              |   {Eddsa: hex}, domain_id:1})|                          |
  |              |  1 yoctoNEAR (F-033) ------->|                          |
  |              |<------ Ed25519 signature ----| (F-035)                  |
  |<-- settlement_signed{preimage, signature}   |                          |
  | tx: [Ed25519 verify ix (F-080), settle(...)] ------------------------->|
  |              |                              |  checks previous ix,     |
  |              |                              |  nonce unused, expiry    |
  | relay_settlement_result(position_id, sig)   |                          |
  |------------->| position Closed (keeper claim advisory)                 |
```

The keeper never chooses the recipient, the amount or the nonce (D-003). It can relay or refuse. A refusal is visible because the position stays in `Settling`, and any other keeper can relay the same signed message. Since the 2026-11-11 security fix wave (contract 2.2.1-v7, vault v2, D-027; verifier record pending):

- The relay report is advisory. nectar-core checks only the format of the tx reference ([Trust model](/security/trust-model)).
- If a signed leg expires unrelayed, anyone can call `resign_remote_settlement(position_id)`. It signs the identical leg with a fresh nonce; nothing is rolled back (test `sr3_expired_signed_leg_resigns_identically_with_a_fresh_nonce`).
- The vault no longer pushes the remainder. After settle the depositor signs `withdraw`, and a buyer whose token account cannot receive signs `claim`. The EVM vault on the local fork still pays both in the same transaction.
- Remote settlement is single-leg: one quote whose recipient fits the chain must clear the debt. Candidates are filtered by recipient before the 8-quote cut (SR-5, test `sr5_unfit_quotes_cannot_crowd_out_a_fitting_one`).

Details: [Preimage format](/protocol/preimage-format), [Solana vault](/protocol/solana-vault), [Chain Signatures leg](/protocol/chain-signatures).
