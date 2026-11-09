---
title: Preimage format
slug: /protocol/preimage-format
description: The canonical settlement message the contract builds and the MPC signs.
---
# Preimage format (`NECTAR_SETTLE_V1`)

<p className="verified">Verified against: F-031 (2026-11-09), F-032 (2026-11-09), F-033 (2026-11-09), F-035 (2026-11-09), F-036 (VERIFY G7), F-080 (2026-11-09) · spec docs/PRD.md §9 · D-003 (2026-11-09)</p>
<p className="status">Status: P2 design. Not built. The derived-key computation (F-036) and the exact byte layout are confirmed at G7.</p>

The NEAR contract never signs a Solana transaction. It signs a canonical **message** that it built from its own state. The keeper supplies only `position_id` (D-003).

```text
NECTAR_SETTLE_V1|chain=solana-devnet|program=<vault_program>|pos=<position_id>|quote=<quote_id>|repay_e6=<n>|seize_units=<n>|recipient=<buyer_remote_recipient>|nonce=<n>|expires=<unix_s>
```

- ASCII, pipe-separated, decimal integers, no spaces.
- `program` binds the message to one vault program. `chain` and the derivation path bind it to one chain.
- `nonce` is unique per position and recorded in `used_nonces` on NEAR and in program state on Solana. `expires` bounds the relay window.
- The Solana program rebuilds the same string from its instruction arguments and compares it byte for byte.

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

Ed25519 signs the message directly, so there is no pre-hash (PRD §9). PRD §6.5 also mentions a `sha256` step. That conflict is open: G7 decides by verifying an MPC signature against the raw preimage bytes with the Solana Ed25519 program (F-080), and this page records the result.
