# WO-95b §2e — scripts audit (base main 1d0149d, 2026-11-14)

Rule (Kunal, WO-92 §2e): every tracked file under `scripts/` is referenced by a doc, test or package.json, or it goes.
Reference sources searched: every tracked file except `evm/lib/` and `evidence/` (so: all package.json files, tests, `docs/**/*.md`
including `docs/work/*.md`, README.md, SECURITY.md, `apps/docs-site/docs`, `.github/workflows`, `.claude/hooks`, `.githooks`, and other
scripts). Patterns tried in order: full path, path without `scripts/`, basename. A hit counts only from a file that is itself
referenced (scripts called only by an unreferenced script go with it). `docs/work/wo-95b-scripts-and-ci.md` (this audit's own work
order) is not counted as a reference. Short forms were checked by hand (`scripts/63`, `capture/terminal`, `takes/README`, `test-guard`,
`base-fork`, `56-solana`, `vault-init`, `stills-*`).

71 tracked files: 65 kept, 6 removed.

| File | Reference (file:line) or "none → removed" |
| --- | --- |
| scripts/00-accounts.sh | docs/BUILD_PROMPT.md:181, docs/work/wo-06-deploy.md, called by scripts/20-deploy-testnet.sh |
| scripts/01-toolchain.sh | .githooks/pre-commit:2 (hooks path set by package.json `prepare`), docs/HUMAN_HANDOFF.md |
| scripts/05-solana.sh | docs/BUILD_PROMPT.md:286, solana/deploy.md:25 |
| scripts/06-base.sh | docs/BUILD_PROMPT_V7.md:12, docs/EVIDENCE.md |
| scripts/10-build.sh | docs/BUILD_PROMPT.md:181, called by scripts/20-deploy-testnet.sh, 21-deploy-v2.sh, 29-security-upgrade.sh |
| scripts/20-deploy-testnet.sh | apps/docs-site/docs/operations/upgrades.md:15 |
| scripts/21-deploy-v2.sh | apps/docs-site/docs/concepts/nectar-reserve.md:8 |
| scripts/22-session-calendar.mjs | apps/docs-site/docs/concepts/weekend-oracle-guard.md:43 |
| scripts/25-upgrade-testnet.sh | apps/docs-site/docs/operations/upgrades.md:16 |
| scripts/26-deploy-base.sh | docs/BUILD_PROMPT_V7.md:12, docs/work/agent-evm.md |
| scripts/26-upgrade-code.sh | apps/docs-site/docs/operations/upgrades.md:17 |
| scripts/27-base-fork.sh | none → removed (note: 26-deploy-base.sh and 62-g13-base.sh default to the 127.0.0.1:8545 fork it started, but neither calls it and no doc names it) |
| scripts/28-upgrade-v2-code.sh | called by scripts/29-security-upgrade.sh:19 |
| scripts/29-security-upgrade.sh | docs/work/wo-37b-docs-demo-submission.md:10 |
| scripts/30-quoter-publish.sh | apps/docs-site/docs/operations/upgrades.md:28, .claude/agents/quoter.md |
| scripts/35-quoter-secrets.mjs | apps/docs-site/docs/operations/upgrades.md:29 |
| scripts/40-seed-demo.sh | docs/BUILD_PROMPT.md:181, docs/work/gates-v7.md |
| scripts/41-seed-v2-fixup.sh | docs/work/wo-37b-docs-demo-submission.md:15 |
| scripts/42-mint-usdc.sh | docs/STATE.md:498 |
| scripts/45-g4-run.sh | apps/docs-site/docs/operations/upgrades.md:30 |
| scripts/50-verify.sh | package.json:14 (`verify`, `demo:testnet`), apps/docs-site/docs/start/quick-start.md |
| scripts/55-g7-signer-roundtrip.sh | docs/EVIDENCE.md:1869 |
| scripts/56-solana-deploy.sh | none → removed (solana/deploy.md documents the same devnet deploy by hand; evidence/solana/deploy-20261110T*.log stay as history) |
| scripts/57-vault-init.mjs | none → removed (only caller was scripts/56-solana-deploy.sh:32) |
| scripts/58-g7-v2.sh | docs/work/wo-37b-docs-demo-submission.md:12, called by scripts/62-g13-base.sh |
| scripts/59-vault-open.mjs | docs/work/security-review-v7.md:358, called by scripts/58-g7-v2.sh |
| scripts/60-x402-accounts.sh | docs/STATE.md:452, docs/work/wo-43b-docs-review2-status.md |
| scripts/61-v7-modules-testnet.sh | apps/docs-site/docs/concepts/profit-lock.md:9, apps/docs-site/docs/concepts/shields.md |
| scripts/62-g13-base.sh | docs/work/wo-37b-docs-demo-submission.md:11 |
| scripts/63-mockft-faucet-upgrade.sh | docs/STATE.md:173 ("scripts/63 ran: … set_faucet from config") |
| scripts/_lib.sh | docs/work/gates.md:28, sourced by every kept `scripts/*.sh` |
| scripts/build-submission.mjs | docs/DECISIONS.md:32, docs/SUBMISSION.md |
| scripts/check-no-branding-all.mjs | package.json:13 (`verify:quick`) |
| scripts/demo-testnet.mjs | README.md:207, apps/docs-site/docs/start/quick-start.md |
| scripts/demo/capture/CAPTURE.md | docs/work/wo-35c-demo-take-script.md:2, docs/EVIDENCE.md |
| scripts/demo/capture/EDIT.md | docs/EVIDENCE.md:1322, docs/work/wo-35a-demo-capture-tooling.md |
| scripts/demo/capture/apptest.mjs | docs/EVIDENCE.md:1322 |
| scripts/demo/capture/compose.mjs | docs/work/wo-35e-takes-runbook.md:21, docs/EVIDENCE.md |
| scripts/demo/capture/contact.mjs | docs/work/wo-35a-demo-capture-tooling.md:41 |
| scripts/demo/capture/encode.mjs | docs/EVIDENCE.md:1322, docs/FACTS.md |
| scripts/demo/capture/encode.swift | docs/work/wo-35a-demo-capture-tooling.md:41, called by encode.mjs |
| scripts/demo/capture/endcard.html | docs/work/wo-35a-demo-capture-tooling.md:41, read by compose.mjs |
| scripts/demo/capture/gapcheck.mjs | docs/work/wo-35a-demo-capture-tooling.md, scripts/demo/capture/CAPTURE.md:99 |
| scripts/demo/capture/human.mjs | docs/work/wo-35a-demo-capture-tooling.md:25 |
| scripts/demo/capture/recorder.mjs | docs/EVIDENCE.md, scripts/demo/capture/CAPTURE.md:125 |
| scripts/demo/capture/srt.mjs | docs/work/wo-35a-demo-capture-tooling.md:41 |
| scripts/demo/capture/terminal/index.html | served by scripts/demo/capture/terminal/server.mjs:54 |
| scripts/demo/capture/terminal/server.mjs | docs/work/wo-35c-demo-take-script.md:36 |
| scripts/demo/intear-setup.mjs | docs/DEMO_SCRIPT.md:30 |
| scripts/demo/still-agent-now.mjs | none → removed (one-off for still 06; the PNG stays) |
| scripts/demo/stills-now.mjs | none → removed (one-off for stills 03/06; the PNGs stay) |
| scripts/demo/stills-takes.mjs | kept per WO-95b ("referenced by docs/work/wo-94"): wo-94 §1 names its outputs (stills 01–05 from take A) but not the script by name; no other doc names it |
| scripts/demo/takes/README.md | docs/work/wo-35e-takes-runbook.md:2 |
| scripts/demo/takes/take.mjs | docs/work/wo-35c-demo-take-script.md:12, docs/STATE.md |
| scripts/deploy/artifact.sh | docs/RUNBOOK.md:63 |
| scripts/deploy/artifacts-function.ts | docs/RUNBOOK.md:77 |
| scripts/deploy/deploy-railway.sh | docs/RUNBOOK.md:108 |
| scripts/deploy/deploy-vercel.sh | docs/RUNBOOK.md:108 |
| scripts/deploy/fetch-artifact.mjs | docs/RUNBOOK.md:80 |
| scripts/deploy/railway-feed-start.cmd | docs/RUNBOOK.md:91 |
| scripts/deploy/railway-oracle-start.cmd | docs/STATE.md:156 |
| scripts/deploy/smoke-docs.sh | docs/STATE.md:345, docs/work/wo-34x-production.md, called by smoke-prod.sh |
| scripts/deploy/smoke-prod.sh | docs/EVIDENCE.md:1181 |
| scripts/deploy/smoke-web.sh | docs/STATE.md:249, docs/work/wo-34x-production.md, called by smoke-prod.sh |
| scripts/ops/create-demo-account.mjs | docs/EVIDENCE.md:1315 |
| scripts/ops/refresh-owner-price.sh | docs/HUMAN_HANDOFF.md:47, docs/RUNBOOK.md |
| scripts/submit.sh | .claude/hooks/guard.sh, docs/SUBMISSION.md, docs/BUILD_PROMPT.md:438 |
| scripts/test-guard-v7.sh | docs/HUMAN_HANDOFF.md:351 |
| scripts/test-guard.sh | none → removed (WO-0 dry test of the guard; superseded by test-guard-v7.sh, which HUMAN_HANDOFF names) |
| scripts/v7-install-claude-config.py | docs/DECISIONS.md:21, docs/HUMAN_HANDOFF.md:351 |
| scripts/verify-ed25519.mjs | docs/EVIDENCE.md:1808, called by scripts/55-g7-signer-roundtrip.sh |

Every removed file is still in history at 1d0149d (`git show 1d0149d:<path>`). Restore one with `git checkout 1d0149d -- <path>` and add a
doc reference if it should stay.
