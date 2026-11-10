# WO-23c — contract — G11 fix (≤ 20 tool calls; commit `test(contract): G11 gas rows for shield/job setters`)
Read docs/GATE_FAIL_G11.md. Write only contracts/.
1. In a sandbox target (sandbox_v7b.rs is natural), call `set_shield_params` and `set_job_config` as owner and print GAS rows in the same format the other
   rows use (so the verifier's grep picks them up). Assert each < 100 Tgas.
2. Add a unit test: `confirm_remote_deposit` → `on_deposit_verified` with an authority that differs from `remote.authority` is refused (forged attestation).
3. `cargo test -p nectar-core` and the touched sandbox target green (tail -n 30). Report ≤ 10 lines with the two gas numbers.
