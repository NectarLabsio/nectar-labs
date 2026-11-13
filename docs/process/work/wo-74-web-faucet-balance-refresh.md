# WO-74 — web — borrow composer balance refreshes after "Get test assets" (< 45 min; commit `fix(web): refresh composer balance after a faucet claim (WO-74)`)
Kunal 2026-11-13: fix now; web deploy approved for this fix only. Write only apps/web/** (components + tests). No other behaviour change.
Bug (WO-35 rehearsal 1, evidence/WO-35/rehearsal-1/): after a successful faucet claim (TestAssets.tsx; txs FpZ1RLFD…, 2Dkw3rd2…) the composer on /borrow keeps the
old balance (useBalance → useView, deps [token, accountId]; reloaded only after a borrow, BorrowComposer.tsx:260), so "Review borrow" stays disabled with "More
than your balance" until a page reload. TestAssets (rendered by BorrowComposer.tsx:307) has no callback.
1. Smallest fix: TestAssets takes an optional `onClaimed?: () => void`, called once after the claim batch returns with at least one ok line; BorrowComposer
   passes `() => { bal.reload(); }` (and anything else on /borrow that shows the claimed tokens' balances, e.g. a USDC balance, if present). Keep TestAssets
   usable without the prop. No polling, no timers.
2. Tests: a unit/component test or the existing e2e/test-assets.spec.ts (mock adapter) asserting that after a successful claim the composer's balance shows the new
   amount without a reload and "Review borrow" can enable for an amount ≤ the claimed units. Keep claims.spec / test-assets.spec green.
3. `pnpm --filter web test` + the relevant Playwright specs (system Chrome if the headless shell is absent; say which) + `pnpm verify:quick` 0; `next build --webpack`
   exit 0 (Turbopack fails with symlinks). DISK RULE: symlink node_modules, no install in the worktree. NO Co-Authored-By. Report ≤ 8 lines: files, tests, build.
