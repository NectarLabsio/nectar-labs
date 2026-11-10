# G7 (v7) round trip on nectar-core-v2 + Solana devnet — orchestrator run 2026-11-10 16:36–16:43Z (to be verified read-only by the verifier)
Keeper daemon: keeper-v2.nectar.testnet (function-call key only) + devnet fee payer 82hq1LTc9cuYsdkKxYQVQ6p4qxvYM9hdrQ6V8zW7HVa7 (evidence/G7/keeper-v2-*.log).
Vault program ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW · mint 3Ve8GiDBtD7crfwUcKukpMigKQaU2aXtSCNgu661E8hT · depositor 2s7mnWvgC9tqo7FToKWPNcTyJ6faXWWCJ7dzRdxKTzKS
· buyer recipient FtWQZk7KAXFjt9pXZsTtYFgBHx64RFMEmhnPtenWMU2q · remote quote #2 ($1,000 @ 300 bps, buyer1).

## Release path — position 2 (3 NVDAx)
- reserve_remote_position → remote_authority_set path solana-devnet/pos/2, authority ed25519:HRf3veyfWvAccxvAgkDvp9eCKTuCpfobLVMJ9TVstarz
  == live derived_public_key(solana-devnet/pos/2, nectar-core-v2, domain 1) (evidence/G7/v2-check-2.log: AUTHORITY MATCH)
- open_position on devnet → position PDA FDUbeLRbZhmFQBPVkiBytvseXrDS7TFtiibhZGEpFgam
- keeper confirm_remote_deposit NEAR tx 8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3 → OutLayer vault_read → remote.status Open, source "outlayer",
  deposit_ref (slot) 520805167, paid $364.695480
- repay $370.44 → remote_release_signed NECTAR_RELEASE_V1|…|pos=2|recipient=2s7mn…|nonce=0|expires=1794332328
- keeper relayed [Ed25519 verify, release]: Solana tx 5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv;
  relay_release_result NEAR tx 7biCvPbApT6RU7hoxUcKGeMxNX2aG6PWEv79KzPxsz2e; PDA closed; depositor balance back to 7 NVDAx.
## Settle path — position 3 (3 NVDAx)
- authority ed25519:APU8mbdwRLFR884iW2om4pQmP126ueKXCWL2B4JrYXCw == derived_public_key(solana-devnet/pos/3, …) (v2-check-3.log); PDA E26iv84F8pP9ML3eAMLZuuSLKAAdjtiioh6qfXhXiKMQ
- confirm NEAR tx 8hNqxAdC61nAwmTWeUbK5auA4CbB35ppkPcnNX7PYe5C → Open, source "outlayer"
- owner price 180 → 160 → 150 (disclosed demo control) → LTV 8232 bps > 7500
- keeper trigger_preliquidation NEAR tx HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u: preliq_triggered → quoter_requested → OutLayer request 16453
  (WasmUrl …/5d90edb8….wasm) execution_completed → quoter_result fills [q1 250, q2 300, q0 400] (clamped to ceilings: regime vol 420 bps > every
  ceiling) → settlement_signed NECTAR_SETTLE_V1|…|pos=3|quote=2|repay_e6=370440000|seize_units=2545980|recipient=FtWQZ…|nonce=1|…|kind=PRELIQ
- keeper relayed [Ed25519 verify, settle]: Solana tx 3cdcQru2WH6d… (full sig in get_pending_settlement(3).solana_tx_sig); PDA closed;
  recipient holds 2.54598 NVDAx (= 370.44 / (150 × 0.97)); depositor received the 0.45402 remainder; position 3 Closed, debt 0.
