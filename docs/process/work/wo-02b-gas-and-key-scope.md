# WO-2b — contract — G1 fix (small: ≤ 30 tool calls)
Context: docs/process/gate-fail-g1.md. Edit only contracts/ (and evidence/G1/gas-sandbox.csv regeneration).
1. tests/sandbox.rs: call each of `set_keeper`, `set_fee_split`, `set_session`, `set_dex_depth`, `set_reserve`, `propose_price`,
   `apply_price` once as owner and print `GAS,<method>,<tgas>` like the existing rows; also mock-ft `mint`, `storage_deposit`,
   `ft_transfer` (standalone). Regenerate evidence/G1/gas-sandbox.csv so every public non-view method of the default build has a row.
2. PRD §6.10 key-scope test: give the keeper account a function-call access key limited to `trigger_preliquidation,relay_settlement_result`
   on nectar-core (near-workspaces key API, read from the installed crate source if needed) and show (a) trigger works with it,
   (b) a call to `usdc.ft_transfer` signed with that key fails, (c) a non-keeper account calling trigger is refused (exists — keep).
   If near-workspaces cannot sign with a function-call key, say so and test (b) at the contract level instead.
Acceptance: `cargo test -p nectar-core -p mock-ft` green; every method in the gas CSV < 100 Tgas. Commit `test:`; report ≤ 15 lines.
