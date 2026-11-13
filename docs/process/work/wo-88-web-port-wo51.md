# WO-88 — web — port WO-51 (consent banner yields to the wallet selector) onto main (Kunal 2026-11-13 ~17:15Z) (< 40 min; commit `fix(web): consent banner yields to the wallet selector (WO-51, ported) (WO-88)`)
Kunal: ship WO-51 with the brand changes before 19:30Z (it fixes step 1 of the judges' 60-second path); if anything fails, revert both. Write only apps/web/**,
packages/ui/** (+ .claude/agent-memory/web/** if you must). Source: branch worktree-agent-a968adb7f7a7ad10c @5c27724 (merge-base f0ee63d) — the banner hides while
the near-connect selector or any of our modals is open and returns when it closes (ConsentBanner `yieldTo` prop; SiteChrome; lib/wallet/near-connect.ts; e2e
shell.spec test). `git merge-tree` vs main shows CONFLICTS: main changed SiteChrome.tsx (5 commits), ConsentBanner.tsx (3), near-connect.ts (2), shell.spec.ts (2) since.
Port the behaviour onto CURRENT main (cherry-pick + resolve, or re-apply by hand): keep every main change (brand footer, copyright, WO-74 TestAssets, Feed etc.).
Checks: `pnpm --filter web test` 0; e2e shell.spec.ts (incl. the WO-51 test) + claims.spec + test-assets.spec with system Chrome (PW_CHANNEL=chrome; the config's
own webServer on :3100 — do not set PORT); `next build --webpack` 0; `pnpm verify:quick` 0; branding check 0. DISK: T7 is ~99% full — NEVER pnpm install; symlink
node_modules (relink @nectar/ui + @nectar/sdk to the worktree's packages); delete nothing. Commit on your branch only (orchestrator merges + deploys). NO Co-Authored-By.
Report ≤ 6 lines: conflicts resolved how, tests, build.
