---
title: Preimage format
slug: /protocol/preimage-format
description: The canonical settlement message the contract builds and the MPC signs.
---
# Preimage format (`NECTAR_SETTLE_V1`)

<p className="verified">Verified against: F-031 (2026-11-09), F-032 (2026-11-09), F-033 (2026-11-09), F-035 (2026-11-09), F-036 (2026-11-09), F-080 (2026-11-09), F-082 (2026-11-09) · spec docs/PRD.md §9 · D-003 (2026-11-09), D-016 (2026-11-10) · test `tests_p2::preimage_golden_vectors_byte_for_byte` · docs/EVIDENCE.md G7 (2026-11-09T23:57Z) · docs/EVIDENCE.md §G7 v7 (2026-11-10T16:52Z, 91db9ea)</p>
<p className="status">Status: live on testnet and devnet (EVIDENCE §G7 v7, 2026-11-10T16:52Z). nectar-core-v2 builds this preimage, the signer signs it, and `nectar_vault` on devnet verified it in the settle tx <a href="https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet">3cdcQru2…</a> (message equal to the stored preimage, `kind=PRELIQ`). The release message `NECTAR_RELEASE_V1|…` was verified in <a href="https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet">5fTihnbJ…</a>. The byte layout is pinned by golden-vector tests. The first v1 run (2026-11-09) used a placeholder program address.</p>

The NEAR contract never signs a Solana transaction. It signs a canonical **message** that it built from its own state. The keeper supplies only `position_id` (D-003).

```text
NECTAR_SETTLE_V1|chain=solana-devnet|program=<vault_program>|pos=<position_id>|quote=<quote_id>|repay_e6=<n>|seize_units=<n>|recipient=<buyer_remote_recipient>|nonce=<n>|expires=<unix_s>
```

- ASCII, pipe-separated, decimal integers, no spaces.
- `program` binds the message to one vault program. `chain` and the derivation path bind it to one chain.
- `nonce` is unique per position and recorded in `used_nonces` on NEAR and in program state on Solana. `expires` bounds the relay window.
- The Solana program `nectar_vault` rebuilds the same string from its instruction arguments and checks the signature over those bytes through the Ed25519 verify instruction placed before it (verified on devnet, EVIDENCE §G7 v7).

## Signing request

```json
{"path":"<per-chain path>","payload_v2":{"Eddsa":"<hex of utf8(preimage)>"},"domain_id":1}
```

| Field | Value | Source |
| --- | --- | --- |
| signer | `v1.signer-prod.testnet` | F-030 |
| `payload_v2` | `Eddsa` variant, variable-length hex | F-031 |
| `domain_id` | 1 = Ed25519 (0 = Secp256k1) | F-032 |
| deposit | 1 yoctoNEAR (`SIGN_DEPOSIT_YOCTONEAR`) | F-033 |
| response | `SignatureResponse::Ed25519 { signature }` | F-035 |

Ed25519 signs the message directly, so there is no pre-hash (PRD §9, decision D-016). PRD §6.5 mentioned a `sha256` step; D-016 rejected it (C-016). The G7 run confirmed it on testnet: the `Eddsa` payload decodes to the raw preimage bytes, and the returned signature verifies against them with the derived key `ed25519:6QPGoVj8…S1tV`. The path is `solana-devnet-v1`.
