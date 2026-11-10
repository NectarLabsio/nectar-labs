# WO-29a — contract — Base remote chain: domain-0 authority + EIP-712 + Ecdsa sign (< 2 h; commit `feat(contract): base spoke signing (code-only upgrade)`)
Read: docs/work/interface-v7.md §D (binding), D-026, FACTS F-330/F-331/F-332 (Ecdsa payload = 32-byte digest, response shape), F-338/F-339
(derived_public_key domain 0 → `secp256k1:<b58 of 64 B x‖y>`; EVM address = last 20 bytes of keccak256(x‖y); `env::keccak256_array`), and the merged
remote lifecycle (src/remote.rs, src/p2.rs, chainsig.rs). Write only contracts/.
**Must be a code-only upgrade over the LIVE v2 state** (nectar-core-v2.nectar.testnet): no change to existing borsh structs; new data under new storage keys /
new maps (as WO-10b/WO-15 did); add a sandbox test that deploys the current main v2 wasm, seeds a NEAR and a Solana remote position, upgrades to the new code, and
checks every view still reads and both flows still work.
Build:
1. A Base remote chain for a collateral (`chain_id "base-sepolia"`, vault = 0x address, domain 0). Pick the smaller change (list of remote chains per symbol vs a
   second symbol) and report it. `reserve_remote_position(…, chain?)` selects it; path `base-sepolia/pos/<id>`; on_authority converts the secp256k1 key to the 0x
   address and stores it.
2. EIP-712 digest for Settle/Release built on-chain (domainSeparator from name/version/chainId 84532/verifyingContract). Unit-test against
   `evm/test/eip712_vectors.json` (WO-27, in parallel; until it lands, compute vectors with a Rust keccak test and reconcile at merge).
3. Signing: `sign({path, payload_v2:{Ecdsa: hex(digest)}, domain_id:0})`, 1 yocto; on_signature stores `{r (x of big_r), s, v = 27 + recovery_id}` in a new map;
   views `get_pending_settlement_evm(position_id)` / `get_pending_release_evm(position_id)` → `{digest, r, s, v, positionId, quoteId, repayE6, seizeRaw, recipient,
   nonce, expires, kind}` (release: positionId, recipient, nonce, expires). Nonces shared with the existing counter.
4. Quotes: a 0x recipient fills Base positions only; base58 fills Solana only.
5. Confirm path for Base: `vault_read` input `{"job":"vault_read","chain":"base-sepolia","vault":<0x>,"position_id":…,"rpc_url":<from config>}` (the quoter job is
   extended separately); keeper attestation fallback works the same as for Solana.
6. Stub signer in contracts/test-stubs: answer domain 0 with a real secp256k1 key (k256) and Ecdsa signatures, so the sandbox can ecrecover the stored r/s/v back to
   the stored authority (do it in the test).
Tests: unit tests for every new panic path; sandbox: Base reserve → keeper-attested confirm → settle signed (ecrecover == authority) → relay; Base reserve → confirm →
repay → release signed; the upgrade-over-v2 test. Gas < 100 Tgas each. Report ≤ 20 lines.
