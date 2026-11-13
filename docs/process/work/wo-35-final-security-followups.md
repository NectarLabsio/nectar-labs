# WO-35 — final security follow-ups from the fix re-verification (2026-11-11). NO Co-Authored-By; never --no-verify.
Background: two independent reviewers re-traced every finding at 6e51276: contract 19 FIXED / 3 PARTIAL, no theft or double execution; vaults/keeper mostly FIXED plus new items below.
## WO-35s — solana (N1, high)
Nonce PDA seeds become `[b"nonce", position.key(), position.authority, nonce.to_le_bytes()]` in settle and release (interface-v7 §E). Attack test: a depositor loops
open(X, K_att) → release(nonce n) → withdraw for n in N..N+M, then open(X, K_real, full): NEAR's signature with nonce n must still settle/release. Update solana/client/pda.ts,
vault.ts, solana/deploy.md. Commit `fix(solana): nonce seeds include the authority (N1)`.
## WO-35k — keeper (N2, N3, N4; services/keeper)
With N1 fixed, a program-owned NonceRecord at `[nonce, slot, authority, nonce]` with matching fields is unforgeable proof the leg landed:
- N2a/d: accept the record as sufficient regardless of the slot's current status and without byte-comparing ix data (Anchor ignores trailing ix bytes). The tx signature to report: any successful tx that created the record; N2b: page through signatures of the nonce address to the oldest (bounded, retry later if rate-limited) and fall back to the slot address.
- N2c (Base): landed = `nonceUsed(slotKey, nonce)`; find the tx from vault logs (event topics), not `tx.to == vault`.
- N3: when the slot is no longer Open but the CURRENT nonce has no record, look for the landed leg without the nonce filter (older nonces of this position) and relay that tx (Solana + Base).
- N4: confirm late or short deposits for expired reservations too (`confirm_remote_deposit` by the keeper; the contract allows it within the keeper budget) so collateral can be released; replace the permanent "3 tries per fingerprint" give-up with a capped exponential retry.
Commit `fix(keeper): landed-leg proof via nonce record, older legs, late deposits (N2-N4)`.
## WO-35c — contract (reviewer N1)
p1.rs:342-349 budgets ft_transfer gas for remote legs that make no transfers, so Pyth + quoter with ≥ 7 distinct-buyer candidates needs > 300 Tgas and trigger reverts. Drop `n_transfers` for remote positions (or fall back to static settle), with a sandbox test at 8 distinct buyers. Still a code-only upgrade, still 2.2.0-v7. Commit `fix(contract): remote trigger gas budget`.
## WO-35e — evm
`release`: require `m.recipient == p.depositor` (parity with Solana) + forge test. Commit `fix(evm): release recipient must be the depositor`.
## WO-35w — web (after WO-35s): packages/sdk nonce PDA seeds per §E. Commit `fix(sdk): nonce seeds include the authority`.
## WO-35d — docs (after the rollout): create SECURITY.md (contact, 90-day disclosure, no bounty, "not audited") with the review summary and an honest list of what remains:
SR-5 partial (capacity checked at origination; single-leg bin-packing), SR-7 partial (B20 `isAuthorized` not checked at funding → an off-allowlist 0x recipient can strand a Base leg), SR-15 partial (no mint binding in vault_read), SR-4 EVM remainder push, keeper relays advisory, Base on a local fork, low-severity list; link docs/process/work/security-review-v7.md.
