# WO-35k2 — docs — G9 run 5 notes (< 20 min; commit `docs: README G9 line; H-ORACLE session window; demo prep`)
Write only README.md, docs/HUMAN_HANDOFF.md, docs/DEMO_SCRIPT.md. Source: docs/EVIDENCE.md §"G9 run 5". No apps/docs-site change (no redeploy).
1. README line ~84 still says "G9 PASS" (run 3). Replace with the pointer used elsewhere: latest G9 run, commit and result in docs/EVIDENCE.md §G9.
2. H-ORACLE: add the in-session rule. contracts/nectar-core/src/lib.rs:75 `SESSION_MAX_PRICE_AGE_NS` = 900 s and lib.rs:348: during NYSE hours the session
   counts as open only while the owner price is < 15 min old; otherwise `session_reason: "stale_price"` and the closed-session (weekend) parameters apply —
   D_c forced to 0, larger haircut (the 24 h max age still governs whether borrows work at all). Option A's refresher (12 h) keeps borrows working but does
   not keep the session open in NYSE hours. Kunal's choice stays A or B as written.
3. docs/DEMO_SCRIPT.md "Before recording": if recording during NYSE hours (14:30–21:00 UTC) and the open-session limit should show, refresh the owner price
   (RUNBOOK one-shot `update_owner_price` with the CURRENT price, never a placeholder) within 15 min before recording; otherwise the screen shows the
   closed-session limit, which is correct and disclosed.
Tests: `pnpm verify:quick` 0; branding 0. DISK RULE: no pnpm install in the worktree. NO Co-Authored-By. Report ≤ 3 lines.
