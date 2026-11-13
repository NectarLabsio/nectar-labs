# WO-79 — docs — README/HUMAN_HANDOFF name the current production web (< 15 min; commit `docs: production web = 1a95022 (WO-74) (WO-79)`)
Write only README.md, docs/process/human-handoff.md. Source: docs/EVIDENCE.md §G9 run 9 (step 4 FAIL) and the orchestrator facts below.
- README:11–13 and :34 (and any line naming the production web release): production web = commit 1a95022 (release 4 + WO-74: the borrow composer refreshes its
  balance after "Get test assets"), Vercel dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K, deployed 2026-11-13 13:51Z with the Vercel CLI (Kunal approved this fix only; the
  claude.ai connectors were down). Docs stay release 4 (c95cd0c, dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE). Evidence: EVIDENCE §"WO-34 production (web 1a95022, WO-74)"
  (being written by WO-78) and §"WO-34 production (custom hosts)" for docs + hosts.
- HUMAN_HANDOFF H-DEPLOY: add the 13:51Z web deploy (approval, dpl id, CLI path because connectors were down).
`pnpm verify:quick` 0; branding check 0. Symlink node_modules. NO Co-Authored-By. Report ≤ 5 lines.
