# WO-62a — web — failed claim checks B1–B4 (< 2 h; commit `fix(web): landing claims — Base local fork, Reserve, params, counters (WO-62a)`)
Write only apps/web/, packages/ui/, docs/ui/ (design mockups: numbers only). Source of truth for numbers: the deployed views in
evidence/claims/deployed-params-20261112T192755Z.json (nectar-core-v2 at block 277405686): NVDAx base LTV 4000, max LTV 7000, base haircut 1000,
weekend haircut 2500 bps (= config.yaml collaterals); Reserve deployed and live with $10 (10 shares at $1, discount 600 bps, 7-day notice,
r_usd_e6 10000000 counted in capacity); verified DEX depth for NVDAx 0 (no 1Click route).
B1. Landing chains section: wherever Base appears (heading variants, steps 03/04, card, FAQ), the page itself says that Base settlement ran on a local
    fork of Base Sepolia, not on Base Sepolia (EVIDENCE §G13). Server HTML and hydrated text must say the same (keep the WO-35i server flags).
B2. Reserve: it is deployed and holds $10, so do not call it absent. Fix every line that overstates it. In particular, the phase line "Add the Reserve and
    verified DEX depth, and the same 300 shares support up to 70%" must say what is example data and what is deployed: e.g. "In this example (quotes
    $80,000 and DEX depth $12,000 are example figures; the Reserve as deployed holds $X), the same 300 shares reach the deployed 70% cap." Reserve
    amounts shown come from the chain read, never hard-coded.
B3. Haircut and LTV: landing prose, the chamber example and the app must use the deployed values above (config/chain reads). Remove every
    85% / 4% / 12% / 400 / 1200 / 8500 figure that presents a parameter: docs/ui/app/*.dc.html (Console hs 400 / hc 1200 / ltv 8500, Main/Market "85%",
    "4%, 12% closed") and apps/web/e2e/design-app.spec.ts DEMO_COLL. Tell me if you find any other "1200/400" comment and what it was.
B4. Rolling counters: the server HTML holds the final value as plain text (readable with JS off and by screen readers). The digit columns are
    `aria-hidden="true"` and are added only after hydration (client effect); no "0123456789" strings in the server HTML.
B5 (report only): list the pages/sections that read Feed events and what each shows while the hosted Feed runs `FEED_INDEXER=views` (events_indexed 0).
Tests: Playwright — B1 text in server HTML and hydrated (desktop + phone); B2/B3 numbers equal the fixture/config values, no 85%; B4 JS-off plain value
present, no reel nodes, hydrated reels aria-hidden. `pnpm verify:quick` 0; branding 0; Lighthouse a11y landing dark + light ≥ 90 (report the score).
DISK RULE: no pnpm install in the worktree (symlink node_modules). NO Co-Authored-By. Report ≤ 20 lines with test counts.
