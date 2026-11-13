# WO-69 — keeper — refresher config test follows Kunal's schedule A (< 15 min; commit `test(keeper): refresher config test = schedule A (WO-69)`)
Write only services/keeper/test/oracle-refresher.test.ts. packages/config/config.yaml `ops.oracle_refresher` changed (orchestrator, Kunal 2026-11-13 option A):
tick_s 15, session_max_age_s 60, closed_max_age_s 21600, allowance_near "5". The test "parses the real packages/config/config.yaml" (line 138) still pins
[60_000, 600, 43_200] → change it to [15_000, 60, 21_600]. Nothing else. `pnpm --filter keeper test` 0 failures; `pnpm verify:quick` 0.
DISK RULE: symlink node_modules, no pnpm install in the worktree. NO Co-Authored-By. Report ≤ 4 lines.
