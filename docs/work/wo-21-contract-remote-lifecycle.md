# WO-21 — contract — remote collateral lifecycle (Solana; domain-aware for Base later) (< 2 h; commit `feat(contract): v7 remote lifecycle`)
Read first: `docs/work/interface-v7.md` §B (binding), PRD v7 §9 and §9B only, FACTS F-338 (`derived_public_key(path, predecessor: Option<AccountId>,
domain_id: Option<DomainId>)`: always pass domain_id; answers `"ed25519:<b58>"` or `"secp256k1:<b58 of 64 B x‖y>"`), F-339, F-130/F-131, and
`solana/deploy.md` + `solana/programs/nectar_vault/src/preimage.rs` (the vault rebuilds your strings byte for byte).

Accepted WO-14 deviations you must match:
- `NECTAR_RELEASE_V1|…|vault=<program id>|…`, the same value as `program=` in settle (`remote_chain.vault_program`);
- Solana amounts are u64: refuse to reserve, settle or release a remote position whose units or repay do not fit u64;
- kind suffix `|kind=PRELIQ` (1) / `|kind=SELF` (2); the legacy v1 preimage (no suffix) is never produced by v2.

Build on the merged v2 code (WO-19):
1. `reserve_remote_position(...)` → `AwaitingDeposit`, path `solana-devnet/pos/<id>`, cross-contract `derived_public_key` → `on_authority` stores
   `remote.authority`, with a 30-min expiry plus `expire_remote_reservation` (anyone). The limit checks run at confirm time, not at reserve time (a reserve must not
   lock pool funds).
2. `confirm_remote_deposit(position_id)` → OutLayer `vault_read` request (input `{"job":"vault_read","chain":"solana-devnet","program":<vault>,
   "position_id":<id>}`; output `{"position_id","units","authority","depositor","slot_or_block"}` ≤ 900 B) → `on_deposit_verified`: require the
   authority to match and units ≥ reserved, re-check both limits (A1) with a fresh price, pay out (A4 `pay_to` and A5 fees apply), set `Open`, and emit the event.
   OutLayer failure ⇒ stays `AwaitingDeposit` with an event (no fallback payout). Sandbox: a stub OutLayer contract returns the JSON.
3. `keeper_attest_deposit(position_id, tx_ref, depositor)` behind `allow_keeper_deposit_attestation` (owner setter, default false), `source: "keeper"`.
4. Settlement of a remote position signs the v2 settle preimage with the **position's** path (not the global `solana-devnet-v1`). Only quotes with a
   `buyer_remote_recipient` can fill a remote position. **NEAR-held positions always settle on NEAR in v2.** The v1 demo path that signed a Solana
   message for NEAR-held collateral is removed (it was a disclosed placeholder; it must not exist in v2).
5. `request_remote_release(position_id)` after debt = 0 → `Releasing`, signs `NECTAR_RELEASE_V1` with the position path, `get_pending_release` view,
   event `remote_release_signed`. Relay completion: extend `relay_settlement_result` (or add `relay_release_result`, keeper) → `Closed`.
6. Keeper function-call method list for v2 (D-019): `trigger_preliquidation, relay_settlement_result, confirm_remote_deposit,
   keeper_attest_deposit` (+ `relay_release_result` if you add it; say so in the report).
Tests: unit tests for every panic path. Sandbox with a stub signer (real Ed25519 over the exact bytes; reuse the WO-15 stub) and a stub OutLayer:
- the happy path reserve → confirm → borrow paid → price drop → settle signed with the position path;
- reserve → confirm → repay → release signed;
- a forged attestation (wrong authority) refused; units below reserved refused; an expired reservation; keeper attestation refused while the flag is off;
- a replayed release refused (nonce); a release before full repay refused;
- an off-chain check that the signatures verify against the stub key over the vault's exact strings.
Gas per new method < 100 Tgas (record). Write only under contracts/. Report ≤ 20 lines.
