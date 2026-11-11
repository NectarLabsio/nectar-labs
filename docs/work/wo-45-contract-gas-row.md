# WO-45 — contract — G1 gas row for remove_extra_remote_chain (< 30 min; commit `test(contract): gas rows for remove_extra_remote_chain and the oracle band reject`)
Write only `contracts/` **tests** (no change under contracts/*/src — the deployed 2.2.1 code must stay byte-identical). Read docs/GATE_FAIL_G1_221.md first.
1. In the sandbox target that covers evm.rs (tests/sandbox_evm.rs or the v7 one, whichever already sets up extra remote chains), add a test that sets up an
   extra remote chain, calls `remove_extra_remote_chain` as owner (and asserts it is gone + a non-owner call fails), and prints a GAS row in exactly the
   format the other sandbox tests print (the verifier greps `--nocapture` output for it).
2. Add a sandbox call of `update_owner_price` with a price outside band_bps that returns false / emits `oracle_rejected`, with its GAS row.
3. `cargo test -p nectar-core --test <that target> -- --nocapture` green; full `cargo test -p nectar-core` green; built wasm sha256 / code hash still equals
   the deployed 2.2.1 hash (3mv4LRm6…; on this Mac a plain `cargo near build` needs SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk).
NO Co-Authored-By. Never --no-verify. Report ≤ 5 lines (the two GAS rows, test counts, hash equality).
