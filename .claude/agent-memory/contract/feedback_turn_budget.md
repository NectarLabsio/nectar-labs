---
name: feedback-turn-budget
description: Orchestrator enforces a tool-call turn limit on contract WOs; batch reads, write whole test files in one Write, WIP-commit early
metadata:
  type: feedback
---

On WO-23a (2026-11-10) the orchestrator interrupted with "you hit the turn limit" after ~70 tool calls, before tests
existed; the code was safe only because it was WIP-committed.

**Why:** WOs are sized < 2 h and the orchestrator budgets tool calls; long exploratory reads eat it.
**How to apply:** read the WO + only the touched code, write each new module/test file in a single Write, WIP-commit
after the core compiles, and keep sandbox helpers by copying an existing sandbox header (`head -n N` + `cat >>`).
near-sdk unit-test `get_logs()` only holds logs since the last `testing_env!`, so assert events right after each call.
Related: [[worktree-shell-guard]].
