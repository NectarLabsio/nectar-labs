# WO-9 — quoter — OutLayer program (P1; ≤ 45 tool calls)
Spec: docs/process/work/interface-p1.md §Quoter, D-014, FACTS F-041..F-048. Own cargo workspace in quoter/ (root Cargo.toml excludes it).
Rust, `wasm32-wasip2`, no floats, no HTTP in P1, serde_json + sha2 only (justify any other crate). `cargo build --release --target wasm32-wasip2`.
Tests: native `cargo test` runs the logic + `tests/vectors.json` (≥ 20 cases incl. missing secrets, q=0, gamma=10000, vol=0, 8 quotes, malformed
stdin, unknown v, stdout byte length ≤ 900 asserted on the 8-fill case). Optional: run the wasm under `wasmtime` if installed (do not install).
Do NOT publish (scripts/30 is the orchestrator's). Report wasm size + sha256 (= version_key, F-045). Commit `feat(quoter):`.
