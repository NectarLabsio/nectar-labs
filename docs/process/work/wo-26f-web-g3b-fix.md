# WO-26f — web — G3b fix (< 1.5 h; commit `fix(web): config-independent e2e + feed freshness (G3b)`)
Read docs/process/gate-fail-g3b.md and the G3b block in docs/EVIDENCE.md (exact failing assertions). Write only apps/web, packages/ui, packages/sdk.
1. Make agents-console:48, notes:147, shields:175, shields:242, v7:33, v7:64, v7:78 independent of the live config.yaml: set the flag state per test via the
   localhost-only `window.__NECTAR_E2E_MOCK__` override (or a fixture config), and cover BOTH flag-off (controls hidden) and flag-on (controls shown) paths.
   No test may assert the current value of any `features.*` or `accounts.*` in config.yaml.
2. `/api/feed`: never serve a build-time snapshot as live — revalidate on request (or short ISR) and label stale data with its age.
3. `/feed` without `NEXT_PUBLIC_FEED_URL`: no 503 fetches; the panel renders "Feed indexer not configured" with the docs link.
4. Optional (Lighthouse 98 → 100): heading-order on /borrow, /console, /shield.
Acceptance: full `PW_CHANNEL=chrome pnpm --filter web e2e` green against the current config (v2, flags on) AND with a temporary flags-off config (run once, do
not commit it); build + sdk tests green. Do not commit evidence/ screenshots. Report ≤ 12 lines.
