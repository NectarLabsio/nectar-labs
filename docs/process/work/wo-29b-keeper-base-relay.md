# WO-29b — keeper — Base relay + chain-aware Solana relay (< 2 h; commit `feat(keeper): base relay (EIP-712 settle/release)`)
Read: docs/process/work/interface-v7.md §D, D-026, the merged contract (WO-29a): views `get_pending_settlement_evm(position_id)` /
`get_pending_release_evm(position_id)` → `{digest, r, s, v, positionId, quoteId, repayE6, seizeRaw, recipient, nonce, expires, kind, status, txHash}`,
`get_remote_chains(symbol)`, position `remote.chain_id`; the vault ABI in evm/src/NectarVaultBase.sol (+ `forge inspect NectarVaultBase abi`). Write only services/.
1. **Safety first (commit separately if needed):** the Solana relay must only handle positions whose `remote.chain_id == "solana-devnet"` (or events with
   `chain: "solana-devnet"`); anything else is skipped, never parsed as a Solana preimage. Tests for a Base position present alongside Solana ones.
2. `services/keeper/src/base.ts`: viem client on chain 84532 at `BASE_RPC_URL` (env; a local fork `http://127.0.0.1:8545` or Base Sepolia). Refuse chain id
   8453 / mainnet RPC hosts. The signer is a Foundry keystore account (`BASE_KEYSTORE_DIR` + `BASE_ACCOUNT` + `BASE_PASSWORD_FILE`): decrypt in-process
   (web3 secret storage v3: scrypt + aes-128-ctr + keccak MAC) with existing deps (@noble/hashes has scrypt/keccak; add @noble/ciphers only if needed),
   never log key material, never accept a raw key env var.
3. Relay: for signed Base settlements/releases build `settle(Settle, v, r, s)` / `release(Release, v, r, s)` calldata from the view fields (exact ABI from
   the vault), append the ERC-8021 suffix only when `BASE_BUILDER_CODE` is set (H19), send, wait for receipt, then `relay_settlement_result` /
   `relay_release_result` (method names unchanged) with the 0x tx hash. Idempotent: skip if the vault position is closed or the nonce is used.
4. Deposit watcher for Base: read `positions(id)` on the vault; when open with amount ≥ reserved, call `confirm_remote_deposit` — but if a
   `BASE_KEEPER_ATTEST=1` env is set (local fork: OutLayer cannot reach localhost), call `keeper_attest_deposit(position_id, tx_ref, depositor)` instead (labelled).
5. Tests: calldata byte-exactness against evm/test/eip712_vectors.json (selector + encoding), keystore decrypt against a test keystore generated in the test,
   chain-id refusal, mocked RPC idempotency. `pnpm verify:quick` green. `.env.example` lines (paths/ids only): BASE_RPC_URL, BASE_KEYSTORE_DIR, BASE_ACCOUNT,
   BASE_PASSWORD_FILE, BASE_VAULT_ADDRESS, BASE_KEEPER_ATTEST.
Report ≤ 15 lines.
