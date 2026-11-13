# WO-10a — contract — versioned state + migrate + quoter path (P1; ≤ 50 tool calls)
Spec: docs/process/work/interface-p1.md §Contract (everything except the Pyth oracle source, which is WO-10b), D-014, FACTS F-047/F-048/F-130..F-133.
1. Versioned state + `migrate()`; sandbox: deploy the P0 wasm (build it from tag p0-green into a temp dir, or keep a copy of the G1 wasm,
   sha 6bd1ec51…), seed, upgrade to the new wasm, migrate, all P0 views identical, then a P1 flow.
2. `p1` becomes the default feature; quoter path, `on_quoter_result` with clamp/fallback/events, owner setters, views.
3. contracts/test-stubs: a stub `outlayer` contract whose `request_execution` returns a configurable JSON (or null / error) via the same
   callback shape as F-048; add `contracts/test-stubs` to the root Cargo.toml members.
4. Unit tests consume quoter/tests/vectors.json if present (skip with a message if WO-9 is not merged yet); clamp test with 9,999 bps; fallback
   tests for null, bad hash, unknown quote id. Gas for trigger+quoter+8 legs recorded (< 300 Tgas total attached, each method < 100 Tgas burnt).
Report wasm size (storage cost matters: owner has < 1 NEAR, H-NEAR-FAUCET), test counts, gas. Commit `feat(contract):`.
