# WO-34t — web — proxy /docs to the docs deployment WITH the prefix (< 45 min; commit `fix(web): keep the /docs prefix when proxying to the docs deployment`)
Write only `apps/web/`. Facts: F-387 (Next rewrites, external, beforeFiles, `has: host`), F-393, F-433, F-434.
Why: since WO-34s (merged, 4f7702b) the docs deployment serves its pages under `/docs/*` itself (vercel.json rewrites `/docs/` → `/`, `/docs/:path*` → `/:path*`;
verified live on dpl_rCb371fxU9G4fVWhKoHRA126BwQE). Its bare root `/` shows "Page Not Found". The next step (a docs WO) redirects the docs deployment's
`/` → `/docs/`. Today the APP proxies `/docs` → `${DOCS_ORIGIN}/`, so that redirect would loop. Keep the prefix and the APP never asks for `/`.

1. apps/web/next.config.ts `rewrites()` (hosted branch only; local single-host mode unchanged):
   `{ source: "/docs", destination: \`${DOCS_ORIGIN}/docs/\` }` and `{ source: "/docs/:path*", destination: \`${DOCS_ORIGIN}/docs/:path*\` }`, same `has` host condition,
   still `beforeFiles`. Update the comment above it (prefix kept; F-433/F-434; why: the root redirect).
2. apps/web/scripts/serve-docs.mjs (the local stand-in for the docs deployment): serve `/docs/<path>` by stripping the prefix, exactly like the deployment's
   rewrites, including `/docs/` → index.html. Requests outside `/docs` may keep working as today. Update its header comment.
3. Any test or crawl expectation that assumes the stripped form (e2e/hosts.spec.ts, scripts/crawl.mjs, lib/hosts tests): update to the kept prefix.
4. Tests: `pnpm verify:quick` → 0; hosted-mode `e2e/hosts.spec.ts` and the `/docs/*` part of `site-pages.spec.ts` against a local build with
   serve-docs.mjs (own ports, not 3000/3100/3217/3291/3297/3471/3613/3741/3742/3761/3762/3771/3857/3961–3963/8788–8791/8891) → pass.
   Show one request: APP `/docs/start/quick-start` → 200 with the docs page, and APP `/docs/assets/js/<main>.js` → 200. Stop your servers.
Note: packages/config/config.yaml `site:` was filled by the orchestrator (H-LEGAL). If a web test assumed null operator fields, fix the test, not the config.
NO Co-Authored-By. Never --no-verify. Report ≤ 8 lines.
