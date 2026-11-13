# WO-95a — repo cleanup: top level, docs/process, removals, LICENSE (docs agent; WO-92 step 2 §2a–d, §2f, §2h). Base: main (WO-94 merged). WO-95b (scripts/, .github/) runs in parallel: in scripts/ change only path references to files you move; if a script you would edit is gone on main at merge time, the deletion wins.

Write early: list every move/removal first (git ls-files), apply with `git mv` / `git rm` in a few batched commands, then fix links in one pass.
No history rewrite. Nothing pushed. Never pnpm install. scripts/ and .github/ are done by WO-95b — do not touch them except to update a path
reference to a file you moved.

a. Top level (§2a). Add LICENSE: standard MIT text, "Copyright (c) 2026 Nectar Labs". Root package.json (§2f): name, description, repository
   (https://github.com/NectarLabsio/nectar-labs), license "MIT", private true — no dependency or script changes.
   Move to docs/process/: BUNDLE_README.md (→ bundle-readme.md). README.template.md: remove if nothing references it, else move.
   KEEP at top level (orchestrator default, reported to Kunal; §2a lists only apps/ packages/ services/ contracts/ but moving these breaks build
   paths, deploy scripts, CLAUDE.md §4 and the empty-product-diff check): quoter/, solana/, evm/, landing/, and the tool configs builds and
   deploys read: .env.example (quick start), .githooks/ (gitleaks pre-commit), .gitleaks.toml, .dockerignore, .railwayignore, Cargo.toml/lock.
   CLAUDE.md: content unchanged.
b. docs/ (§2b). Product docs stay in docs/: EVIDENCE.md, FACTS.md, README.md (index), DEMO_SCRIPT.md, DESIGN_SYSTEM.md, RUNBOOK.md,
   SUBMISSION.md (read by scripts/build-submission.mjs; hackathon context allowed here), media/. Everything else that is process material goes
   to docs/process/ with kebab-case names: work/ (all work orders, keep file names), STATE.md → state.md, HUMAN_HANDOFF.md → human-handoff.md,
   DECISIONS.md → decisions.md, FINAL_REPORT.md → final-report.md, GATE_FAIL_*.md → gate-fail-*.md (lower case), PRD.md → prd.md,
   PRD-v6.md → prd-v6.md, BUILD_PROMPT.md → build-prompt.md, BUILD_PROMPT_V7.md → build-prompt-v7.md, HACKATHON.md → hackathon.md,
   X_POST.md → x-post.md, MARKET_TASK.md → market-task.md. Update every link and path reference to a moved file across the repo (README,
   docs/**, EVIDENCE, evidence/README.md, apps/docs-site, scripts/*.mjs, .claude/hooks/*.sh — state.sh and guard.sh name docs/STATE.md and
   docs/HUMAN_HANDOFF.md). Do not edit CLAUDE.md even though it names old paths.
c. Remove from git (§2c): .claude/agent-memory/ and .claude/agents/ (git rm -r --cached; keep the local files) — .claude/ keeps settings.json and
   hooks/ only; docs/FACTS-nectar-labs.md (§2h: DefiLlama economics / thesis text; tree only, no history rewrite); docs/media/screens/
   03-borrow-preview.png if WO-94 left it unreferenced; any other duplicate screenshot. Files over 1 MB (orchestrator list): evidence/G3/design/
   home-*.png 3.3/2.0 MB, evidence/G3/screens/home-phone-*.png 1.9 MB, evidence/G9/run7-*/host-grep.txt 2.7 MB, evidence/WO-67/B/host-grep.txt
   1.2 MB, packages/ui/logo/source.png 1.7 MB, three cargo-test-nectar-core.log 1.7 MB — justify each in evidence/README.md or remove (raw grep
   dumps can go if no README/EVIDENCE claim links them; keep gate logs and design screenshots). .gitignore gets: ._*, .DS_Store,
   .claude/worktrees/, .claude/agent-memory/, .claude/agents/, nectar-demo-media/, *.mp4, *.mov, build outputs (dist, .next, target, build,
   .docusaurus).
d. evidence/README.md (§2d): every folder you touched still indexed; no home paths (git grep '/Users/' is empty today); no file over 5 MB.
Checks: markdown link check over README.md and docs/** (0 broken; write a small node or python checker, run it, keep it out of git);
`node scripts/check-no-branding-all.mjs` 0; `git ls-files | grep -E '(^|/)\._|\.DS_Store'` empty.
Commit(s) `chore: repo cleanup (WO-95a)`. NO Co-Authored-By. Report ≤ 15 lines: final top-level tree, files moved (count + list file),
removed, links updated (count), >1 MB decisions, anything unverified.
