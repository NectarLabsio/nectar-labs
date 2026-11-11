# WO-34a — web — two hosts, docs rewrite, env, headers (< 2 h; commit `feat(web): host routing, docs rewrite, hosted env and headers`)
Write only `apps/web/`, `packages/ui/`, `packages/sdk/`. Context: docs/work/wo-34-deploy.md (read it). Next 16.4.5. Facts for proxy/middleware, rewrites,
redirect codes and metadata routes come from FACTS (WO-34r runs in parallel). If an F-id is missing, read the installed `node_modules/next` source/docs
and note what you relied on in your report (the researcher records it). **Local mode is sacred:** with SITE_URL/APP_URL unset, every route works on one host
exactly as today (no redirects, same e2e, G9 from a fresh clone unchanged).
1. Env (server-side, documented in apps/web/.env.example):
   - SITE_URL, APP_URL, DOCS_URL (default APP_URL + /docs), FEED_URL (replaces any hard-coded Feed origin in the /api/feed and /api/indexer proxies;
     local default unchanged), REPO_URL (empty → every GitHub/repo link hidden).
   - Expose to the client only non-secret URLs. No secret in any NEXT_PUBLIC_*. Any RPC key stays behind a server route (today: none; keep it so).
2. Host routing (proxy/middleware) when both SITE_URL and APP_URL are set:
   - Hosts:
     - www.<site> → SITE (301).
     - APP `/` → `/feed`.
     - App routes requested on SITE → APP (308).
     - Landing-only routes requested on APP → SITE (308). Landing-only routes: `/`, `/about`, `/legal/*`, `/security`, `/status`, `/changelog`, `/brand`, `/talk`.
   - Preserve path + query.
   - `/api/*` serves on both hosts (the status page uses /api/health). The copilot same-origin guard must accept the APP origin.
3. Docs: on APP, `/docs` and `/docs/:path*` rewrite to DOCS_ORIGIN (the docs deployment; Docusaurus baseUrl `/docs/`, WO-34d).
   - `app/docs/page.tsx` remains only for local mode.
   - Links to docs use DOCS_URL.
4. Headers:
   - CSP built from env + `packages/config/config.yaml` RPC hosts + the near-connect/wallet hosts actually contacted. List exactly the hosts in use.
     Keep `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`.
     Add `script-src`/`connect-src`/`frame-src`/`img-src` only after you have measured them in real Chrome with the REAL near-connect selector and one
     wallet iframe opening (do not sign). If a strict script-src breaks a wallet, keep the current policy for that directive and say so.
   - HSTS.
   - Previews (`VERCEL_ENV !== 'production'`) send `X-Robots-Tag: noindex`.
5. Per-host `sitemap.xml`, `robots.txt` (APP robots also points at `/docs/sitemap.xml`), canonical URLs (`metadataBase` per host).
   - OG image and favicon from `packages/ui/logo/` (no new artwork).
6. Production guard: when `VERCEL_ENV === 'production'` (or `NECTAR_PRODUCTION=1`), the build fails if config.yaml `site.operator`, `site.country` or
   `site.contact` is null, or if SITE_URL/APP_URL are unset. Typed loader for the `site:` section in packages/sdk config (not strict-breaking).
7. Tests:
   - e2e (no network): host routing via the Host header against `next start` with SITE_URL/APP_URL set on your own port. Check each redirect code and
     the `/` → `/feed` redirect. The local-mode suite must stay green.
   - `pnpm verify:quick`. Lighthouse a11y ≥ 90 both themes on the routes you touched.
Own port (not 3000/3100/3217/3291/3471/8788–8791/8891). Stop your server. No deploy, no Vercel CLI. NO Co-Authored-By. Never --no-verify. Report ≤ 10 lines,
including the measured host list for the CSP.
