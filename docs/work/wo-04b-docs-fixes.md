# WO-4b — docs — follow-up fixes (P0, small: ≤ 30 tool calls)
1. **Branding (CLAUDE.md §1, blocks G3):** the web app renders apps/docs-site/docs/legal/*.md. Remove every mention of the
   hackathon from privacy.md, terms.md, disclaimers.md, cookies.md (and any other page under apps/docs-site/docs/ except
   project/evidence). Say "testnet software", "experimental", "mock collateral" instead. Verify with
   `grep -rniE 'hackathon|nearhackathon' apps/docs-site/docs apps/docs-site/src apps/docs-site/docusaurus.config.ts`
   → only the Evidence page may match. (BUILD_PROMPT §11.2 "hackathon status" in Terms is overridden by CLAUDE.md §1.)
2. `docs/img/architecture.svg` (+ .mmd): 1Click depth is `D_c`, not `R_c` (R_c = Nectar Reserve, PRD §4.2). Remove the README note
   about the figure once fixed. Leave settlement.svg's hash step alone (open P2 conflict, PRD §6.5 vs §9).
3. Feed REST page: generate or hand-write it from `services/feed/openapi.yaml` (now on main); keep onBrokenLinks throw.
Acceptance: `pnpm --filter docs-site build` green; `pnpm --filter web e2e` legal specs no longer fail on branding
(run `pnpm --filter web exec playwright test -g legal` with `PW_CHANNEL=chrome` if the full suite is slow). Commit `docs:`.
