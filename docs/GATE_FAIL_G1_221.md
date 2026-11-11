# GATE_FAIL_G1_221 — 2026-11-11 (verifier, fresh clone of 45ed1f3; EVIDENCE 2e16f9b, evidence/G1/verifier-221-20261111T135216Z/)
**Check:** G1 per-method gas rows on the deployed 2.2.1-v7 code (every public change method has a sandbox GAS row < 100 Tgas).
**Cause (single):** `remove_extra_remote_chain` (contracts/nectar-core/src/evm.rs:413, owner setter) has no GAS row — only unit tests call it.
Everything else green: 608 unit + 50 sandbox, 0 failed; test wasm = deployed code hash 3mv4LRm6…; 66 of 67 change methods measured, max 78.72 Tgas/tx.
Note (not a FAIL reason): update_owner_price out-of-band reject branch is unit-tested only; the accepted path is measured (2.74 Tgas).
**Fix (WO-45, contract, test-only):** sandbox test that calls remove_extra_remote_chain (and the update_owner_price reject branch) and prints GAS rows in the
existing format. No contract source change → deployed code unchanged, no redeploy.
**Then:** verifier re-runs the gas-row check from a fresh clone. Status: OPEN.
