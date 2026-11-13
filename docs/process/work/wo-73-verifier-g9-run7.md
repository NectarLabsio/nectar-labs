# WO-73 — verifier — G9 run 7 on the Feed-fix commit (< 60 min; commit `test: evidence — G9 run 7 (WO-73)`)
Fresh clone of main at the commit the orchestrator names into a temp dir outside /Volumes/T7 (pnpm install allowed there only). Write only docs/EVIDENCE.md, evidence/.
Since G9 run 6/6b (c95cd0c product): packages/config ops.oracle_refresher (WO-69 keeper test), services/feed v2 events (WO-71, merge 37dfec9), scripts/demo/**,
docs. Web and docs builds are unchanged (`git diff --stat c95cd0c <commit> -- apps contracts` must be empty).
1. Full G9 as run 6 (docs/process/work/gates.md G9; EVIDENCE §G9 run 6): README quick start < 15 min, every command (pnpm i, demo:testnet, verify, web dev routes,
   docs build, Feed MCP stdio + HTTP), claims vs EVIDENCE and live hosts, gitleaks over full history, branding, the ac.nectarlabs.io / vercel.app grep,
   submission dry run (`node scripts/build-submission.mjs --dry-run`), handoff census.
2. Hosted Feed (https://feed-production-2f2776c9.up.railway.app/health): commit 37dfec9, source views+neardata, events_indexed ≥ 1, indexer_cursor present,
   indexer_lag_blocks small (record value); README Feed rows match. The local Feed tests include the real v2 fixtures (services/feed/test/v2-events.test.ts).
3. scripts/demo/** must contain no secret, no key material, no home path (grep), and the seed phrase file is never read by committed code except
   scripts/demo/intear-setup.mjs (which must not print it: read the redact path).
PASS → EVIDENCE row + block. FAIL on a product claim → docs/process/gate-fail-g9-r7.md. NO Co-Authored-By. Do not touch host services. Report ≤ 12 lines.
