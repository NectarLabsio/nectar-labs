# GATE_FAIL_G3b — web E2E on nectar-core-v2 — 2026-11-10 ~17:20Z — verifier run at 2bf99e1 (EVIDENCE d46baed)
**What failed:** `pnpm --filter web e2e` exit 1 — 14 failures = 7 specs × desktop/phone: agents-console:48, notes:147, shields:175, shields:242,
v7:33, v7:64, v7:78. They assert the pre-flip world (all `features.*` false, v1 contract) — config now points at v2 with 8 flags on (8ba7650).
**Also found (not gate criteria, real bugs):** `/api/feed` serves a build-time snapshot on first response (stale vs chain); `/feed` shows two 503s
when `NEXT_PUBLIC_FEED_URL` is unset.
**What passed:** build; 214 e2e; Lighthouse a11y ≥ 98 on 10 routes × 2 themes; 400 px no-scroll; live v2 data renders (Q_c $16,107, R_c $10, session badge);
v7 module runs verified on chain (PASS).
**Fix (web, WO-26f):** e2e specs must not depend on the live config's flag values: drive flag state through the existing localhost-only e2e override
(`window.__NECTAR_E2E_MOCK__`) and test both flag-off and flag-on paths explicitly; `/api/feed` revalidates (no build-time snapshot served as live);
`/feed` degrades cleanly without a Feed URL (panel says "Feed indexer not configured", no 503 noise). Then the verifier re-runs G3b.
