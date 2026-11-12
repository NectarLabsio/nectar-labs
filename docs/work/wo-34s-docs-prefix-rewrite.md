# WO-34s — docs — the docs deployment serves its own `/docs/*` (< 30 min; commit `fix(docs-site): serve /docs/* on the docs deployment`)
Write only `apps/docs-site/` (plus one RUNBOOK line). Facts: F-393, F-428, and the WO-34r6 ids (vercel.json rewrites).
Found 2026-11-12 (Kunal opened the docs preview): "Your Docusaurus site did not load properly … baseUrl = /docs/".
- The build is flat (F-393), but every page references `/docs/assets/…` and links `/docs/<slug>`. Through the APP rewrite (`/docs/:path*` → docs origin `/:path*`)
  that works. Opened directly on the docs deployment, `/docs/assets/js/main.*.js` answers 404, the JS never loads, and the banner shows.
- The G3b crawl and the preview smoke test checked page status codes only, never assets.

1. apps/docs-site/vercel.json: keep `"cleanUrls": true`; add, in this order,
   `"rewrites": [{ "source": "/docs/", "destination": "/" }, { "source": "/docs/:path*", "destination": "/:path*" }]`.
   F-433: `/docs/:path*` matches `/docs` and `/docs/<path>` but NOT `/docs/` (the Docusaurus home link, baseUrl) — hence the first rule.
   F-434: filesystem first, so the flat files are never shadowed. F-435: the cleanUrls resolution of a rewrite destination needs the live check (orchestrator).
   Optional, if quick: run `@vercel/routing-utils` (the converter the researcher used, F-433) on the final vercel.json from a scratch dir outside the repo and
   confirm `/docs/`, `/docs`, `/docs/assets/x.js` and `/docs/start/quick-start` all map; report the output in one line.
   Do not change baseUrl, the APP rewrite (apps/web), or apps/web/scripts/serve-docs.mjs. No root redirect: the APP proxies `/docs` to the docs origin `/`,
   so a `/` → `/docs/` redirect would loop.
2. Update the hosting comment in docusaurus.config.ts (line ~23) and add one line to docs/RUNBOOK.md "Deploy through the connectors": the docs deployment opened
   directly is read at `<docs-host>/docs/` (its bare root is not a supported entry point).
3. Tests: `pnpm --filter docs-site build` → 0; `node -e` JSON-parse of vercel.json; `pnpm verify:quick` → 0. The orchestrator verifies the rewrite on a Vercel preview.
NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines.
