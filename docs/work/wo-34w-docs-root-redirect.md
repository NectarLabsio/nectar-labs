# WO-34w — docs — docs deployment root `/` → `/docs/` (< 20 min; commit `fix(docs-site): redirect the docs deployment root to /docs/`)
Write only `apps/docs-site/` (plus one RUNBOOK line). Facts: F-433–F-439. Depends on WO-34t (web keeps the `/docs` prefix when proxying; in flight,
merged before any deploy), so the APP never requests the docs origin `/` and this redirect cannot loop through the APP.
Why: Kunal opened the docs deployment's bare root twice; on the fixed preview it shows "Page Not Found" (baseUrl /docs/).

1. apps/docs-site/vercel.json: add `"redirects": [{ "source": "/", "destination": "/docs/", "permanent": false }]` (307, F-437; `^/$` only, F-439).
   Keep cleanUrls and the two WO-34s rewrites exactly as they are.
2. Comment in docusaurus.config.ts (hosting block): the root redirect, why it is safe only with WO-34t, and the open live check (F-438: the order relative to
   the filesystem and whether the `/docs/` → `/` rewrite re-enters the redirect is derived from routing-utils source, not documented).
   docs/RUNBOOK.md: the docs deployment root redirects to `/docs/`.
3. Tests: vercel.json parses; `pnpm --filter docs-site build` → 0; `pnpm verify:quick` → 0. Optional: routing-utils 6.6.1 from a scratch dir outside the repo on the
   final vercel.json — `/` → 307 `/docs/`, and `/docs/` must NOT end in a redirect; one line.
The orchestrator checks live: `<docs>/` → 307 `location: /docs/`; `<docs>/docs/` → 200 (no loop). If it loops, the fallback is a rewrite destination
`/index.html` for `/docs/`; report whether routing-utils suggests that would be needed.
NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines.
