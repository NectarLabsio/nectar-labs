# WO-90 — Part B of Kunal's full brief: repo cleanup AFTER the takes (03:00–08:00Z), never during capture
Rules: no history rewrite. No content changes under apps/, packages/, services/, contracts/ except deleting junk files, so the product stays identical to what's deployed.
1. Top level holds only: README.md, LICENSE, SECURITY.md, CLAUDE.md, workspace config (package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig, Cargo files if any),
   .gitignore, .github/, apps/, packages/, services/, contracts/, scripts/, docs/, evidence/. Move everything else.
2. Process material goes to docs/process/: work orders (docs/work), HUMAN_HANDOFF, STATE, DECISIONS, FINAL_REPORT, GATE_FAIL_*, PRD and build prompts, BUNDLE_README.
   Keep EVIDENCE.md and FACTS.md in docs/. Update every link that points at a moved file.
3. Remove junk from git: ._* files, .DS_Store, stray logs outside evidence/, scratch scripts, agent-memory notes, duplicate screenshots. Add ._*, .DS_Store,
   .claude/worktrees/, nectar-demo-media/ and large media to .gitignore. Videos stay out of git.
4. evidence/: add evidence/README.md, an index of what each folder proves, linked to the README claim it supports. No home paths. No file over 5 MB.
5. scripts/: every script is referenced by a doc, test or package.json, or it goes. The commands table lists the ones a judge needs.
6. .github/workflows: anything that would run on GitHub after the push must pass there without secrets, or be removed. No red badge on a public repo.
7. Report: the final top-level tree, files moved and removed, links updated.
Orchestrator note: CLAUDE.md, STATE and work orders move — update CLAUDE.md's own path references (docs/STATE.md, docs/work/*.md) accordingly; scripts/hooks that
read docs/work or STATE paths must follow. Do it in one docs/scripts agent round + one verifier check.
