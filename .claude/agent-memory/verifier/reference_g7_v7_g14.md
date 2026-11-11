---
name: g7-v7-and-g14-recipe
description: G7 (v7) read-only chain verification + G14 x402 checks; RPC -429 trap on rpc.testnet.near.org, Ed25519 ix decode, mock-ft has no events
metadata:
  type: reference
---
Run 2026-11-10 (91db9ea, EVIDENCE d552211): G2b re-run PASS, G7 v7 PASS, G14 PASS in ~30 tool calls.
- rpc.testnet.near.org started answering `-429 "ENDPOINT IS DEPRECATED"` mid-run; switch to https://rpc.testnet.fastnear.com (also in repo scripts).
- G7: get_position(id).remote.authority vs v1.signer-prod.testnet derived_public_key {path, predecessor, domain_id:1}. Repay/release tx hashes are in evidence/G7/v2-release-*.log ("Transaction ID"), sender borrower1.
- Solana: getTransaction jsonParsed; decode ix0 Ed25519 data (base58; 2-byte header + 7×u16 offsets) to show pubkey == authority and msg == NEAR preimage. PDA closed = getAccountInfo value null.
- verify-ed25519.mjs wants {preimage, signature_hex}; for release map .message→preimage. Add 2 negative controls.
- G14: mock-ft emits NO EVENT_JSON for ft_transfer; prove transfer by the usdc-mock receipt + decoded delegate_action args.
- Explorers: solana explorer WebFetch 429, nearblocks 403 (see [[explorer-webfetch-403]]).
