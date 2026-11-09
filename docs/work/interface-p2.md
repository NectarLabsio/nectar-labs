# interface-p2.md — P2 Chain Signatures + Solana + copilot (orchestrator, 2026-11-10; D-016)
## Preimage (built only by nectar-core; ASCII, pipe-separated, decimal integers, no spaces)
`NECTAR_SETTLE_V1|chain=solana-devnet|program=<vault_program_id>|pos=<position_id>|quote=<quote_id>|repay_e6=<n>|seize_units=<n>|recipient=<buyer_remote_recipient base58>|nonce=<n>|expires=<unix_s>`
Signed raw (D-016) by `v1.signer-prod.testnet.sign({request:{path:"solana-devnet-v1", payload_v2:{Eddsa:<hex of the ASCII bytes>}, domain_id:1}})`,
1 yocto from gas_reserve, ≥ 15 Tgas (F-034 live), response `{"scheme":"Ed25519","signature":[64 u8]}` (F-035), timeout → promise fails.
## Contract (WO-15) — no V1 root-struct change (new storage keys), code-only upgrade like WO-10b/c
- Collateral `remote_chain: {chain_id:"solana-devnet", vault_program, mpc_domain_id:1}` (exists in CollateralConfig) + owner `set_remote_chain(symbol, …|null)`.
- Owner `set_signer_config(account:"v1.signer-prod.testnet", path:"solana-devnet-v1", gas_tgas:15, expiry_s:3600)`.
- Settlement for a collateral with remote_chain: after pricing (P0 static / quoter), for each leg whose quote has `buyer_remote_recipient`
  build the preimage (nonce = monotonically increasing per contract, stored), call sign, `.then(on_signature(position_id, leg, nonce))`:
  store `PendingSettlement{preimage, signature_hex, nonce, expires}`; emit `settlement_signed{position_id, quote_id, nonce, preimage, signature_hex}`;
  position → `Settling` until `relay_settlement_result(position_id, solana_tx_sig)` (keeper) → Closed, `settlement_relayed`. Debt repaid
  from escrow exactly as the NEAR path; collateral is NOT ft_transferred on NEAR for remote legs (it is released on Solana).
  Sign failure/timeout → `settlement_sign_failed`, position back to Open (owner `cancel_settlement` exists).
- Views: `get_pending_settlement(position_id)`, `get_signer_config()`, `get_vault_authority_hint()` (path + signer account).
- Keeper key already allows `relay_settlement_result` (D-010).
- Sandbox: stub signer contract that yields and resumes with a real Ed25519 signature from a local test key over the exact preimage; a test
  verifies the signature off-chain against the stub's pubkey. Gas: Pyth + quoter + sign + callbacks within 300 Tgas (record).
- scripts helper (`contracts/nectar-core/tests` or packages/sdk): derive the authority pubkey with @noble/curves (F-036) — WO-15 adds
  `packages/sdk/src/chainsig.ts` ONLY if it coordinates with web ownership: put it in contracts/…/tools instead; orchestrator wires scripts.
## Accepted WO-15 choices (orchestrator)
One remote leg per settlement call; relay closes only when debt is 0 (else Open); pool credit + keeper share wait for on_signature; a
signature is never rolled back (cancel_settlement refuses an unsigned leg until `expires`); no signer config or a pending unrelayed leg →
remote-recipient quotes settle on NEAR. Authority (solana-devnet-v1) = ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV (live view match).
## Solana (WO-14, needs H-TOOLCHAIN-SOLANA) / keeper relay (WO-16) — not dispatched until the toolchain exists.
## Copilot (WO-17) — fixture-first (NEAR AI Cloud was down at 23:05Z, H7 key absent): verifier per F-071/F-072, @phala/dcap-qvl 0.7.1 (F-073).
