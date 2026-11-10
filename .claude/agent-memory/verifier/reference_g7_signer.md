---
name: g7-signer-recipe
description: G7 NEAR-side verification recipe (MPC sign via tx_status, ed25519 verify, code hash) and traps found 2026-11-09
metadata:
  type: reference
---

G7 NEAR side (first recorded PARTIAL 2026-11-09T23:57Z, commit 97382fd):
- Trigger tx hash: grep "Transaction ID" near the `settlement_signed` EVENT_JSON in evidence/G7/signer-roundtrip-*.log.
- EXPERIMENTAL_tx_status: decode the receipt args of `sign` (base64 JSON; payload_v2.Eddsa is hex of the RAW preimage, no pre-hash).
  The signer's SuccessValue comes from `return_signature_and_clean_state_on_success` = {"scheme":"Ed25519","signature":[64]}.
- Add a negative control: tamper the preimage, then verify-ed25519.mjs must print signature_valid:false.
- Code hash: `cargo near build non-reproducible-wasm` in contracts/nectar-core prints the bs58 sha256 itself.
- Traps: gates.md G7 commands (anchor test, keeper test:settle-devnet) don't exist until the Solana leg is built;
  README line ~51 says in present tense that a Solana program verifies the signature; the placeholder program id isn't in the README.
- nearblocks tx page returns 403 to WebFetch, same as [[reference_explorer_webfetch]].
