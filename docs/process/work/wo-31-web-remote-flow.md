# WO-31 — web — remote (Solana devnet) borrow flow (< 2 h; commit `feat(web): Solana remote borrow flow`)
Read first: `docs/process/work/interface-v7.md` §B, `solana/deploy.md` (instruction discriminators, account order, PDAs, Position offsets), D-020 (Wallet
Standard + @solana/kit 8.6.0; NO @solana/web3.js / wallet-adapter), F-354 (`@wallet-standard/core` 1.1.2).
The contract side (WO-21) is being built in parallel; v2 is not deployed and the vault is not on devnet yet. Everything renders only when the contract is
v2 **and** `features.solana_remote` is true (false today). E2E uses mocked views plus a mocked Wallet Standard wallet.
Build:
1. `packages/sdk/src/solana.ts`: kit instruction builders for `open_position(position_id, authority[32], amount)` and `release(position_id, nonce,
   expires)` (account order and discriminators from deploy.md; vault program id and mint from config `solana.vault_program` / `solana.mint`, TODO today),
   the position PDA derivation, base58 ⇄ bytes for the authority (`"ed25519:<b58>"` from the contract), and unit tests against deploy.md byte layouts.
2. `/borrow`: chain selector NEAR / Solana. The Solana path walks reserve → deposit → confirm:
   - `reserve_remote_position` (NEAR wallet) shows the stored authority and the 30-min expiry countdown;
   - Phantom (Wallet Standard, devnet) `open_position`, with the authority shown beside "this key is derived by NEAR for position #id";
   - a "waiting for attested deposit" state that polls the position;
   - after confirm, "Open" with the payout.
3. `/position/[id]`: deposit status AwaitingDeposit / Open / Releasing. After full repay, a "Request release" button (`request_remote_release`), then
   a "Withdraw on Solana" button that sends `[ed25519 verify ix, release ix]` (use the signed message + signature from `get_pending_release`; the
   ed25519 ix bytes per F-082 in packages/sdk, ported from `solana/client/ed25519.ts`; keep them byte-identical and add a test).
4. States: no Phantom, wrong cluster, no SOL, reservation expired, OutLayer confirm failed (stays AwaitingDeposit), keeper-attested label.
Acceptance: build + e2e (PW_CHANNEL=chrome) + sdk tests green; a11y ≥ 90 on /borrow and /position; no horizontal scroll at 400 px. Write only
apps/web, packages/ui, packages/sdk. Report ≤ 20 lines.
