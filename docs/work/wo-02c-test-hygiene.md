# WO-2c — contract — test hygiene (small: ≤ 20 tool calls; NO change to contract src logic or wasm)
1. Replace deprecated `testing_env_with_promise_results` with the 5-argument `testing_env!` (F-131) in mock-ft lib.rs tests and
   nectar-core tests.rs. `cargo test -p nectar-core -p mock-ft` green; also `RUSTFLAGS="-D warnings" cargo test ...` green
   for the unit tests (sandbox may stay as is if the warning is in deps).
2. `fee_debt_e18`: G2 saw it hold e6-scale values. Read the code: if it is reward-debt in USD e6, add a doc comment + a note in
   docs/work/interface-p0.md is NOT yours — instead report the exact semantics; do NOT rename the field (deployed ABI; P1 redeploy decides).
3. Confirm `cargo near build non-reproducible-wasm` for nectar-core still gives sha256 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46
   (doc comments may change it — if it changes, revert the doc comment and report). Commit `test:`. Report ≤ 10 lines.
