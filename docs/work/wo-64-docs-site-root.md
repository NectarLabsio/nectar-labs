# WO-64 — docs — docs at the root of docs.nectarlabs.io (< 90 min; commit `feat(docs-site): baseUrl "/" on docs.nectarlabs.io (WO-64)`)
Write only apps/docs-site/. Facts: WO-60 F-ids (Docusaurus baseUrl/url/sitemap, Vercel `redirects` status). Hosts: config.yaml `site.production_hosts`.
1. docusaurus.config.ts: `baseUrl: "/"`; `url` = DOCS_URL (https://docs.nectarlabs.io) when set, localhost otherwise; drop the DOCS_ORIGIN_URL "APP
   origin" model and its comments (replace every `ac.nectarlabs.io`). App links → APP_URL (https://testnet.nectarlabs.io), status links → STATUS_URL
   (https://status.nectarlabs.io), site links → SITE_URL; local defaults unchanged.
2. vercel.json: remove the `/` → `/docs/` redirect and both `/docs` rewrites; add permanent (308) redirects `/docs` → `/` and `/docs/:path*` → `/:path*`
   so old links on the docs origin land; keep cleanUrls and every header.
3. Content: every internal link and every mention of the docs living under `/docs` on the app host; Feed links stay `/health`.
   No hackathon branding (check-no-branding). Copy rules: no unbacked "live".
Tests: `pnpm --filter docs-site build` exit 0 (broken links fail it); built sitemap and canonical use https://docs.nectarlabs.io when DOCS_URL is set;
`grep -r "ac.nectarlabs.io\|/docs/" build/` shows no stale prefix links (report any left and why). `pnpm verify:quick` 0.
DISK RULE: no pnpm install in the worktree (symlink node_modules). NO Co-Authored-By. Report ≤ 20 lines.
