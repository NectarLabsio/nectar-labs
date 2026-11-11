# WO-38b — docs — G9 is PASS (< 20 min; commit `docs: G9 PASS after the re-run`)
Write only `README.md`, `apps/docs-site/docs/**`, `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION.md`. Source: docs/EVIDENCE.md G9 row + "G9 re-run" section (commit 89f83ee).
G9 re-run 2026-11-11 on 0af5cdd: **PASS** — quick start < 2 min (pnpm i 6 s, demo:testnet 3 s, pnpm verify 15 s), 21 README routes 200, docs build ok, gitleaks 272 commits clean,
Feed MCP from the README alone, no unbacked claim. The first run (c5f6349) FAIL is superseded. Replace every "G9 pending / FAIL / re-run pending" with that, citing 89f83ee:
README.md:3, :67, :115; apps/docs-site/docs/project/evidence.md:9 and :32; start/live-on-testnet.md:9; start/quick-start.md:9 (+ its timing column if it quotes the first run);
docs/DEMO_SCRIPT.md:6; SUBMISSION.md wherever G9 appears. Grep `G9` in those files for any other stale status. In apps/docs-site, never use the word "hackathon"
(say "a docs wording issue"); `node scripts/check-no-branding-all.mjs` and `pnpm --filter docs-site build` exit 0. Don't touch tracks/website/TODO-H* fields.
NO Co-Authored-By line. Never --no-verify. Report ≤ 4 lines.
