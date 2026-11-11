---
name: g12-g13-base-fork-recipe
description: G12/G13 Base spoke on local anvil fork of Base Sepolia (D-026) — zsh word-split trap, U64-string views, cast annotation stripping, ecrecover precompile recipe
metadata:
  type: reference
---
Run 2026-11-10 (7bface5, EVIDENCE 770d053): G12 + G13 PASS (local fork) in ~20 tool calls.
- Bash tool shell is zsh: `set -- $p` does not word-split; put multi-step loops in a bash script file in scratchpad.
- nectar-core-v2 views take position_id as STRING ("6"); integer panics.
- `cast decode-calldata` appends " [1.794e9]" annotations; strip with sed before passing the struct back to `cast call`.
- Digest: cast call vault hashRelease/hashSettle(struct)(bytes32); ecrecover: cast call 0x…01 $(cast concat-hex digest $(cast to-uint256 v) r s) → last 20 bytes.
- derived_public_key secp256k1:<base58 64B x‖y>; cast keccak → last 20 bytes == authority.
- Replay: cast call vault <tx input> --from keeper → 0x6d9650be NonceUsed(nonce). Vault Status enum: 0 None,1 Open,2 Settled,3 Released.
- createB20 factory 0xB20f000…000 is a precompile (getCode 0 bytes) on sepolia.base.org; params = cast abi-encode "f((uint8,string,string,address,uint8))".
- Gate text gaps to always note: ERC-8021 suffix (D-026: only if H19), Solana-domain revert only in forge tests, scripts/06+26 need keystores (NOT RUN), explorer N/A.
