# GATE_FAIL_G8 — 2026-11-09T23:44Z UTC — commit 2b49f42
**What failed (wording only):** README.md:61 claims "copilot answers are TEE-signed and verified" (no NEAR AI answer has ever been received or
verified); README.md:24 says the copilot is "not built" (wrong); the panel intro says "the browser verifies the TEE signature and
attestation" but the Intel DCAP check runs server-side. Weak test: e2e/copilot.spec.ts accepts /Key missing|Ask copilot/.
**Passed:** test:copilot 10/0/1 (live skipped); `--live` without key exits 1 with a clear message; e2e copilot 4/4; 12 checks listed
passed/failed/not run, no bare tick; fixture (Phala sample quote with patched report_data + throwaway-key chat — NOT a NEAR AI recording)
correctly ends "unverified — hidden"; real-crypto offline checks green; FACTS F-074..F-078 / C-018 respected. NEAR AI /v1/models 500.
**Fix:** WO-4f (README/docs wording) ∥ WO-17c (panel copy + strict e2e). Then re-run G8.
