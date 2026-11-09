# WO-0 — orchestrator — scaffold (P0)
Goal: monorepo per CLAUDE.md §4 ownership; CI; hooks; config with TODO-G2 ids; scripts that fail loudly on missing vars.
Acceptance: `pnpm i` works; `pnpm verify:quick` runs lint/typecheck on empty packages; `.claude/hooks/guard.sh` blocks `git push` in a dry test; commit `chore: scaffold`.
Files: everything at repo root, packages/config, scripts/, .github/.
