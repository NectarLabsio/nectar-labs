# WO-93 — copilot notice, neutral copy (web agent; WO-92 step 2 §3, Kunal 2026-11-13). Base: main f790b8c.

Scope: apps/web/components/CopilotPanel.tsx only (plus its test, if one asserts the old text). Nothing else under apps/, packages/, services/, contracts/.

Change: the amber `<Banner tone="warn" title="Key missing">` (line ~75) becomes neutral copy that says what the code actually does when live mode
is off. Read the component first and describe only real behaviour, e.g. a non-warning tone, title like "Recorded fixture", body like "Live answers
are off on this server. The verifier runs on a recorded fixture." Keep it short. The thrown error at line ~50 (`key_missing` after a click) may get the
same neutral wording if it is user-facing; do not change logic, routes or the API.

Copy rules: no banned words (docs/work/wo-92-readme-repo-final.md line 32), no "live" claim, no emoji, no hackathon wording.

Checks in your worktree: NEVER pnpm install; no node_modules directory in the worktree — symlink only
(`ln -s /Volumes/T7/nectar-labs/node_modules node_modules`, and the same for apps/web/node_modules and packages/*/node_modules that exist on main).
`pnpm verify:quick` 0; `pnpm --filter web exec next build --webpack` 0 (or the package's build script); branding check 0. Do not deploy.
Commit `fix(web): copilot notice says what runs when live mode is off (WO-93)`. NO Co-Authored-By. Report ≤ 6 lines: old/new text, checks, commit.
