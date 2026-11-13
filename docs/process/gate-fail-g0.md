# GATE_FAIL_G0 — 2026-11-09T23:01Z UTC — commit 90af048 (recorded after p0-green and p1-green; G0 was performed on 2026-11-09 but never written to EVIDENCE — orchestrator gap)
**What failed:** FACTS has no entries for the *installed* rustc 1.95.0, cargo 1.95.0 and node v22.23.4 (only minimums: F-010 rust_version 1.95, F-012 node ≥ 22.22.2).
**Passed:** cargo-near 0.23.0, near-cli-rs 0.31.1, pnpm 10.34.9, gitleaks 8.30.1 match FACTS; F-020 resolved (help output matches); 1Click /v0/tokens answers;
Hermes 401 as recorded (C-007). anchor/solana absent → P2 dependency (H-TOOLCHAIN-SOLANA), not a P0 failure.
**Fix:** researcher adds the three installed-version entries (date + evidence path evidence/G0/verifier-20261109T230153Z/toolchain.log); verifier re-records G0.
Impact on earlier gates: none — G1–G6 were run with these exact tools (their logs show the versions); this is a recording gap, not a toolchain change.
