---
title: Solana vault
slug: /protocol/solana-vault
description: Anchor program that releases collateral only on a NEAR-signed message.
---
# Solana vault (`nectar_vault`)

<p className="verified">Verified against: F-080 (2026-11-09), F-081 (2026-11-09), F-082 (VERIFY G7), F-036 (VERIFY G7) · spec docs/PRD.md §9</p>
<p className="status">Status: P2, not built. Program id TODO-G7 (devnet). Cut order keeps a NEAR-only signer round-trip demo if the Solana leg slips.</p>

Anchor 0.32.1 program on Solana devnet, with `@solana/kit` 8.6.0 off-chain (F-081).

| Instruction | Who | Effect |
| --- | --- | --- |
| `init_vault(symbol, mint)` | deployer | PDA token account owned by the program |
| `open_position(position_id, near_derived_pubkey, amount)` | borrower | deposits collateral; records the position's authorised Ed25519 pubkey (NEAR-derived) |
| `settle(preimage fields…, signature)` | anyone (keeper) | requires the **previous instruction** to be the Ed25519 program verifying `signature` over the rebuilt preimage with the recorded pubkey; checks nonce unused and not expired; pays `seize_units` to `recipient`, remainder to borrower |
| `cancel_position` | borrower | withdraw after the NEAR side reports the debt repaid (advisory in this build) |

## Facts and open points

| Item | Value | Id |
| --- | --- | --- |
| Ed25519 program | `Ed25519SigVerify111111111111111111111111111` | F-080 |
| Instructions sysvar address, Anchor accessor, Ed25519 ix offsets | **unverified** | F-082 (G7) |
| Derived pubkey for (`nectar-core`, path) | **unverified** | F-036 (G7) |

## Why the keeper cannot steal

The derived key never signs a Solana transaction and holds no SOL. The keeper pays the fee and submits `[Ed25519 verify, settle]`, but cannot alter any field without breaking the signature check. Replay fails on the nonce, the expiry and the program id inside the preimage. Planned test: an Anchor test where a second `settle` with the same message fails.
