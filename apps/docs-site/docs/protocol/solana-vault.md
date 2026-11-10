---
title: Solana vault
slug: /protocol/solana-vault
description: Anchor program that releases collateral only on a NEAR-signed message.
---
# Solana vault (`nectar_vault`)

<p className="verified">Verified against: F-080 (2026-11-09), F-081 (2026-11-09), F-082 (2026-11-09), F-036 (2026-11-09) · spec docs/PRD.md §9 · D-016 (2026-11-10) · docs/EVIDENCE.md G7 (2026-11-09T23:57Z)</p>
<p className="status">Status: P2, **not built**: the Solana CLI and Anchor are not installed (handoff H-TOOLCHAIN-SOLANA). Program id TODO-G7 (devnet); no Solana transaction exists (G7 PARTIAL). If the toolchain does not arrive by 2026-11-13 12:00 UTC, the Solana leg is cut and the NEAR signer round trip (see Chain Signatures) is the P2 demo. Everything below is design.</p>

Anchor 0.32.1 program on Solana devnet, with `@solana/kit` 8.6.0 off-chain (F-081).

| Instruction | Who | Effect |
| --- | --- | --- |
| `init_vault(symbol, mint, authority)` | deployer | PDA token account owned by the program; records the one vault authority, the NEAR-derived Ed25519 key (D-016) |
| `open_position(position_id, amount)` | borrower | deposits collateral |
| `settle(preimage fields…, signature)` | anyone (keeper) | requires the **previous instruction** to be the Ed25519 program verifying `signature` over the rebuilt preimage with the vault authority; checks nonce unused and not expired; pays `seize_units` to `recipient`, remainder to borrower |
| `cancel_position` | borrower | withdraw after the NEAR side reports the debt repaid (advisory in this build) |

## Facts and open points

| Item | Value | Id |
| --- | --- | --- |
| Ed25519 program | `Ed25519SigVerify111111111111111111111111111` | F-080 |
| Instructions sysvar; Ed25519 ix data | `Sysvar1nstructions1111111111111111111111111`; `[num_signatures u8, padding u8]` then a 14-byte offsets struct per signature | F-082 |
| Vault authority = derived key for (`nectar-core.nectar.testnet`, `solana-devnet-v1`, domain 1) | `ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV` (live view = off-chain derivation) | F-036, D-016 |

## Why the keeper cannot steal

The derived key never signs a Solana transaction and holds no SOL. The keeper pays the fee and submits `[Ed25519 verify, settle]`, but cannot alter any field without breaking the signature check. Replay fails on the nonce, the expiry and the program id inside the preimage. Planned test: an Anchor test where a second `settle` with the same message fails.
