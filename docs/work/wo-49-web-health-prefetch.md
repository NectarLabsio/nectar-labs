# WO-49 — web — G3b fix: /api/health prefetch never settles (< 60 min; commit `fix(web): G3b — /api/health prefetch settles; footer Status link not prefetched`)
Write only `apps/web/`, `packages/ui/`. Read docs/GATE_FAIL_G3B_R2.md and EVIDENCE §G3b re-run (b1728aa; probe script in evidence/G3/verifier-20261111T1530Z/).
1. Reproduce on your own port (`next build && next start`): load `/`, list requests that never finish (Playwright `requestfinished`/`requestfailed`), confirm
   the `/api/health` RSC prefetch is the one. Find the root cause in apps/web/app/api/health/route.ts (WO-42a 5 s cache — e.g. a shared in-flight promise
   that never resolves for `RSC: 1` / `Next-Router-Prefetch` requests, or streaming that never closes). Fix it so every request to the route completes.
2. Footer "Status" link (SiteChrome.tsx ~:107): an API route must not be RSC-prefetched — plain `<a>` or `prefetch={false}`.
3. Run the FULL `PW_CHANNEL=chrome pnpm --filter web e2e` (desktop + phone, incl. screens.spec) against your server: 0 failed; Lighthouse unchanged (a11y ≥ 90);
   `pnpm verify:quick` green. Screens may write PNGs under evidence/ in your worktree — do not commit them.
NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines: root cause in one sentence, fix, e2e counts.
