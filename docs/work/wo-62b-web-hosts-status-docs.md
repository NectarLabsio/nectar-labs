# WO-62b — web — custom hosts, status host, docs redirect, legacy-host 308 (< 2 h; commit `feat(web): custom hosts, status host, docs at docs. (WO-62b)`)
Write only apps/web/ and packages/sdk/ (if a shared type needs it). Facts: WO-60 F-ids in docs/FACTS.md (Next host redirects, Vercel redirects,
wallet origins) — cite them in comments. Hosts (config.yaml `site.production_hosts`, env in production): SITE_URL https://nectarlabs.io ·
APP_URL https://testnet.nectarlabs.io · DOCS_URL https://docs.nectarlabs.io · STATUS_URL https://status.nectarlabs.io (new) · FEED_URL unchanged.
1. lib/hosts.ts + proxy.ts: add the status origin. STATUS host `/` serves the status page (rewrite to /status); every other path on STATUS → 308 to its
   canonical host (landing paths → SITE, app paths → APP); shared paths (/api, assets, metadata) served. SITE `/status` → 308 `${STATUS}/`.
   STATUS_URL unset = today's behaviour (status on SITE). Local single-host mode unchanged.
2. Docs live at the root of DOCS_URL. Remove the APP `/docs` rewrite and DOCS_ORIGIN. In hosted mode APP and SITE `/docs` and `/docs/<rest>` → 308
   `${DOCS_URL}/<rest>` (prefix dropped, query kept). Local mode keeps the in-app /docs page. NEXT_PUBLIC_DOCS_URL = DOCS_URL; every docs link in the
   app/landing points at DOCS_URL paths without `/docs/`.
3. Legacy hosts: env `LEGACY_HOSTS` = comma list `host=site|app|docs|status`; a request whose Host is listed → 308 to that origin, same path + query
   (then the normal split applies). Unit-test with example hosts (no real vercel.app names in the repo; the real list lives in Vercel env).
4. Canonicals, `metadataBase`, OG/Twitter URLs, sitemap.ts and robots.ts per host (SITE, APP, STATUS); CSP: any origin-specific directive updated;
   replace every `ac.nectarlabs.io` (hosts.ts comment, .env.example) with the new hosts; .env.example lists STATUS_URL and LEGACY_HOSTS.
5. Wallet sign-in on testnet.nectarlabs.io: from WO-60 item 5, make any code change needed; list any human allowlist step in your report.
Tests: unit route() table (status host, docs 308s, legacy map, www, local mode); e2e hosts.spec updated (E2E hosted mode with example hosts);
`pnpm verify:quick` 0; prod build with the five env vars exit 0; check-trace exit 0; branding 0.
DISK RULE: no pnpm install in the worktree (symlink node_modules). NO Co-Authored-By. Report ≤ 20 lines.
