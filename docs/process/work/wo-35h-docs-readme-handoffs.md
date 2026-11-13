# WO-35h — docs — README stale lines (G9 run 4 step 3) + H-ORACLE (< 30 min; commit `docs: README hosted status points to EVIDENCE; H-ORACLE`)
Write only README.md, docs/process/human-handoff.md, docs/RUNBOOK.md. Source: docs/EVIDENCE.md "G9 run 4" (FAIL step 3), "WO-34 production (release 3974b5b)".
1. README lines ~3 and ~11 say the hosted demo is deployed from ca34111; lines ~25–26 and ~139 say WO-34v is "not in docs/EVIDENCE.md yet". Both are stale.
   Production is redeployed again shortly (a landing fix), so do NOT hard-code a commit or a PASS/FAIL: say the hosted demo runs the release recorded in
   docs/EVIDENCE.md §"WO-34 production" (deployed commit + acceptance result there), and that EVIDENCE holds the production acceptance runs. Keep every other
   Hosted demo fact as is (URLs, views mode, keeper/x402 local, hosted until 2026-11-25).
2. docs/process/human-handoff.md new entry **H-ORACLE — keep the owner price fresh** (status OPEN):
   - Why: the owner (fallback) oracle goes stale 86,400 s after each refresh (config.yaml max_age_s_closed); then borrows and trigger_preliquidation fail
     with "oracle stale". It was 31 h stale on 2026-11-12 and was refreshed at ~15:12Z (tx 3E92xm8KDQcVC2FZh4MRn4dkBvZ1uS3H7eCvCubXM8rH, same price).
     Next stale ≈ 2026-11-13 15:10Z; judging runs 16–18 Nov.
   - Option A (Kunal, one command, machine stays on through 18 Nov): `cd /Volumes/T7/nectar-labs && scripts/ops/refresh-owner-price.sh >> evidence/ops/owner-price-refresher.log 2>&1 &`
     (re-asserts the current on-chain price when older than 12 h; signs as nectar.testnet via the OS keychain; never changes the price). An agent may not
     start this loop itself (blocked as unauthorized persistence).
   - Option B: the orchestrator runs the one-shot RUNBOOK `update_owner_price` (same price) in every session.
   - Default if silent: Option B while a session runs; with no session the price goes stale and the app shows "oracle stale" on borrow (disclosed fallback).
3. docs/RUNBOOK.md standing duty 1: name scripts/ops/refresh-owner-price.sh as the automated form and point to H-ORACLE.
4. Copy rules as before. Tests: `pnpm verify:quick` 0; branding check 0. DISK RULE: no pnpm install in the worktree (symlink node_modules if needed).
NO Co-Authored-By. Never --no-verify. Report ≤ 5 lines.
