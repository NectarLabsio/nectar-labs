# WO-80 — verifier — G9 run 9b: step 4 re-check (< 20 min; commit `test: evidence — G9 run 9b step 4 (WO-80)`)
Fresh clone of main at the commit the orchestrator names. Write only docs/EVIDENCE.md, evidence/.
1. `git diff --stat d863f55 <commit> -- apps packages services contracts` must be empty → G9 run 9 items other than step 4 carry over.
2. Step 4 again: every README hosted-demo / production claim (README:3, :11–13, :34, :150 and the Feed rows) vs EVIDENCE (§"WO-34 production (web 1a95022, WO-74)",
   §"WO-34 production (custom hosts)", Feed blocks) and the live hosts (web chunk marker onClaimed→reload on testnet.nectarlabs.io; docs unchanged; Feed /health).
   HUMAN_HANDOFF H-DEPLOY matches. Any README line EVIDENCE or the live host does not show = FAIL.
PASS → append "Resolved" to the G9 run 9 block. NO Co-Authored-By. Don't touch host services or any wallet/faucet. Report ≤ 6 lines.
