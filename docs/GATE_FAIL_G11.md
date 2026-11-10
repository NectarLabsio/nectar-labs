# GATE_FAIL_G11 — v7 contract — 2026-11-10 15:39Z — verifier run at 74ce8be (EVIDENCE add9427)
**What failed:** the G11 criterion "gas per new method < 100 Tgas (recorded)". Two owner setters have no sandbox gas row: `shields.rs set_shield_params`
and `jobs.rs set_job_config`. Both have unit tests only.
**What passed:** 480 tests (452 unit + 28 sandbox), mock-ft 17, `model.py --check --v7` 132 rows, all 9 PRD §6.11 tests mapped to passing tests,
every measured v7 method < 100 Tgas (max new method 18.81 Tgas; max tx 68.94 Tgas).
**Why:** WO-23a added the setters without a sandbox call; the WO-22 gas sweep covered only the 10 setters flagged at G1.
**Fix (in scope, contract agent, WO-23c):** call both setters in a sandbox test and log GAS rows. Also add a unit test for a forged deposit attestation (wrong
authority), which today is covered by the sandbox only (verifier note). Then the verifier re-runs G11.
**Phase impact:** none outside G11. G11 is FAIL until re-run; no G11-dependent work (v2 deploy needs funds anyway) starts before it passes.

**RESOLVED 2026-11-10 16:10Z:** WO-23c (1e543b6) added both gas rows + the forged-attestation unit test; G11 re-run PASS (EVIDENCE 8e33c60).
