# WO-95b — scripts audit + GitHub CI (general agent for the orchestrator; WO-92 step 2 §2e, §2g). Base: main.

Scope: scripts/ and .github/ only. Do not touch docs/, apps/, packages/, services/, contracts/, solana/, evm/, quoter/, landing/ (WO-95a and others own them).
No history rewrite. Nothing pushed.

1. §2e "every script is referenced by a doc, test or package.json, or it goes". For each tracked file under scripts/ (git ls-files scripts), find a
   reference: any package.json "scripts", any test, any .md under docs/ (including docs/work/*.md — work orders count), README.md, SECURITY.md,
   apps/docs-site/docs, .github/workflows, .claude/hooks, or another referenced script that calls it. `git rm` only files with no reference.
   Known one-offs to check: scripts/demo/stills-now.mjs, scripts/demo/still-agent-now.mjs (likely unreferenced → remove);
   scripts/demo/stills-takes.mjs is referenced by docs/work/wo-94 → keep. Never remove scripts/deploy/*, scripts/build-submission.mjs,
   scripts/check-no-branding-all.mjs, scripts/demo/takes/*, scripts/demo/capture/* (used by WO-35 docs) without a second look.
   Write the table (file, reference or "none → removed") into your report file evidence/WO-95/scripts-audit.md.
2. §2g ".github/workflows: whatever runs on GitHub after the push passes there without secrets, or is removed".
   Facts (orchestrator, GitHub public API 2026-11-13 ~21:35Z): both runs on NectarLabsio/nectar-labs (b6d6f41, 126e47b) concluded `failure` with
   0 jobs, i.e. the workflow never started. Probable causes in .github/workflows/ci.yml: line 16 flow mapping
   `with: { targets: wasm32-unknown-unknown,wasm32-wasip2 }` (the comma ends the value; `wasm32-wasip2` becomes a null input) and
   gitleaks/gitleaks-action@v2, which needs a GITLEAKS_LICENSE secret for organization-owned repos. `cargo test ... | tail -n 80` hides failures.
   Decide by evidence, not hope: reproduce each kept job's commands in a FRESH CLONE under /tmp/ci-check-<ts> (internal disk; pnpm install is
   allowed there, never on /Volumes/T7): `pnpm i --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build &&
   pnpm --filter docs-site build` with Node 22; the rust job only if it finishes in < 25 min locally. Keep a job only if it passed in the fresh clone,
   needs no secret, and fails honestly (`set -o pipefail`, no `| tail` masking). Quote every `with:` value. Drop the gitleaks-action job (no secret
   available); the local pre-commit gitleaks hook stays. If no job can be shown to pass, remove ci.yml. Validate YAML (python yaml.safe_load) and
   check each `uses:` action/version exists.
Commit `chore: scripts audit + CI that passes without secrets (WO-95b)` (or two commits). NO Co-Authored-By. Report ≤ 12 lines: scripts removed,
CI jobs kept/removed with the fresh-clone result and durations, anything unverified. Delete /tmp/ci-check-* when done.
