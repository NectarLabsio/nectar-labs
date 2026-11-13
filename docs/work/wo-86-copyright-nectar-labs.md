# WO-86 — web + docs — copyright "© 2026 Nectar Labs" (Kunal 2026-11-13 ~16:10Z "yes change") (< 20 min each)
DEPLOY AFTER TONIGHT'S TAKES with WO-85 (Kunal): commit on your branch only; the orchestrator merges and deploys after the takes.
Replace "© 2026 Nectar Network" with "© 2026 Nectar Labs" in the copyright lines only (no other "Nectar Network" text changes):
A (web; write only packages/ui/**, landing/**, apps/web tests that assert it): packages/ui/src/Nav.tsx:152, landing/index.html. Start from branch
  worktree-agent-aee995c471fbfd360 (WO-85, a6a4114) so both land together: `git merge --ff-only a6a4114` after fast-forwarding to main. Relink @nectar/ui and
  @nectar/sdk to the worktree's packages before building (WO-85 note). `pnpm --filter web test` 0, `next build --webpack` 0 (built output has only the new text),
  `pnpm verify:quick` 0, branding check 0. Commit `fix(ui): copyright = Nectar Labs (WO-86)`.
B (docs; write only apps/docs-site/**): the docs-site config copyright (docusaurus.config.*). `pnpm --filter docs-site build` 0; built HTML has only the new text.
  Commit `docs(site): copyright = Nectar Labs (WO-86)`.
Symlink node_modules (no install). NO Co-Authored-By. Report ≤ 4 lines each.
