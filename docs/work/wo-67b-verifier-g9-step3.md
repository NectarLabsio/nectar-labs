# WO-67b — verifier — G9 run 6b: step 3 re-check after WO-68 (< 30 min; commit `test: evidence — G9 run 6b step 3 (WO-67b)`)
Fresh clone of main at the commit the orchestrator names (65ea73f or later) into a temp dir outside /Volumes/T7. Write only docs/EVIDENCE.md and evidence/.
1. `git diff --stat c95cd0c <commit> -- apps packages services contracts` must be empty (product = deployed c95cd0c), so run 6 items 1, 2, 4–7 carry over.
2. G9 step 3 again: every README claim about the hosted demo vs docs/EVIDENCE.md and the live hosts (SITE https://nectarlabs.io, APP https://testnet.nectarlabs.io,
   DOCS https://docs.nectarlabs.io, STATUS https://status.nectarlabs.io, Feed https://feed-production-2f2776c9.up.railway.app/health). Check each line GATE_FAIL_WO67
   named (README hosted-demo section, Docs/Status/Feed rows, faucet line) plus DEMO_SCRIPT step 3 and HUMAN_HANDOFF H-DEPLOY/H-NEARDATA. A README line that
   says something EVIDENCE or the live host does not show = FAIL.
3. `scripts/deploy/smoke-prod.sh` runs directly from the fresh clone now (f5a3152 set +x); run it once with the 5 legacy pairs as full origins: exit 0.
PASS → mark docs/GATE_FAIL_WO67.md resolved (append one line). Report ≤ 8 lines. NO Co-Authored-By. Do not touch host services.
