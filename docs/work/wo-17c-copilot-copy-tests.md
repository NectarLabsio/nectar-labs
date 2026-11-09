# WO-17c — web — copilot copy + strict e2e (G8 fix; ≤ 12 tool calls). Context: docs/GATE_FAIL_G8.md
Panel intro: say which checks run in the browser (EIP-191 recovery, hashes, report_data/nonce) and which on the server (Intel DCAP via
dcap-qvl, NVIDIA NRAS in live mode). e2e/copilot.spec.ts: without NEAR_AI_API_KEY assert the "Key missing" banner exactly and that
"Ask copilot" is disabled (no alternation regex). test:copilot + e2e + lighthouse green. Commit `fix(web):`.
