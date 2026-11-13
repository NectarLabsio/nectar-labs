# WO-2 — contract — nectar-core + mock-ft (P0)
Goal: PRD §6–§8 state, ft_on_transfer (5 msg variants), quotes lifecycle, positions, static settlement (bounded 8/64), owner admin, views, NEP-297 events, contract_version; mock-ft NEP-141 + mint(owner); P1/P2 methods compile as feature-gated stubs.
Tests: unit per method; sandbox per msg variant and transition; tests/model.py → tests/model.csv; gas table.
Acceptance: `cargo near build non-reproducible-wasm` + `cargo test` green; report ≤ 20 lines with gas per method.
FACTS: F-010, F-013, F-014, F-015, F-021.
Addendum 2026-11-10 (orchestrator): ABI is docs/process/work/interface-p0.md — implement exactly; collateral params per D-009 and packages/config/config.yaml. Build only with `cargo near build` (F-027: plain cargo build lacks `--cfg near`). Use F-028 names, near-workspaces 0.24.0 (F-029). First sandbox deploy also settles F-027's NEAR-VM compatibility question: report the result. Cargo workspace root is the repo Cargo.toml (members nectar-core, mock-ft; edition 2024 in [workspace.package]). PATH needs $HOME/.cargo/bin.
