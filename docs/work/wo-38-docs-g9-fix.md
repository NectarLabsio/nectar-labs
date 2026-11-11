# WO-38 — docs — G9 fix: hackathon copy in the docs site + README staleness (< 45 min; commit `docs: G9 fix — no hackathon copy in the docs site; README refresh`)
Write only `apps/docs-site/**`, `README.md`, `docs/HUMAN_HANDOFF.md`. Read docs/GATE_FAIL_G9.md and EVIDENCE §G9 (1aabf5f) first.
1. `apps/docs-site/docs/project/evidence.md:11`: remove the NEAR Hackathon sentence. Product UI may say "testnet" and "mock collateral" only — no hackathon, deadline or
   judging copy anywhere in apps/docs-site. `node scripts/check-no-branding-all.mjs` must exit 0 (it scans landing, web, ui and the docs site).
2. README (verifier guesses, EVIDENCE §G9):
   a. Lines ~66-71: the Feed DOES poll without `CORE_ACCOUNT_ID` (default ids from packages/config/config.yaml) — fix the sentence; name FEED_PORT / FEED_MCP_PORT /
      FEED_DB_PATH (check services/feed for exact names and defaults) or point to services/feed/README.md for them.
   b. "What works today (2026-11-10)" + "pnpm verify 39 s" → the G9 numbers in EVIDENCE §G9 (cite it); keep "TODO-H2" for the clone URL.
   c. Name the web routes a stranger can open (from apps/web/app: /, /borrow, /feed, /console, /notes, /reserve, /shield, /agents, /keepers, /security …; verify each
      exists as a page). Do not mention routes that 404.
   d. MCP client: one line pointing to the exact section with the registration snippet (services/feed/README.md or the docs-site "Feed MCP" page) — verify it exists.
3. docs/HUMAN_HANDOFF.md: H-NEAR-FAUCET (line ~41) status → DONE (Kunal replied "H-NEAR-FAUCET done" on 2026-11-10; v2 deployed after). H-GUARD-V7 stays OPEN but
   say "Kunal-only; no product claim depends on it (Base runs on the local fork, D-026)".
Copy rules apply. `pnpm --filter docs-site build` exits 0. NO Co-Authored-By line. Never --no-verify. Report ≤ 6 lines.
