# WO-34d — docs — docs-site under /docs, hosting handoffs, D-030 (< 60 min; commit `docs: docs-site baseUrl /docs/; hosting handoffs; D-030`)
Write only `apps/docs-site/`, `docs/HUMAN_HANDOFF.md`, `docs/DECISIONS.md`, `docs/RUNBOOK.md`. Context: docs/work/wo-34-deploy.md (read the pre-check).
1. Docusaurus 3.10.2:
   - `baseUrl: '/docs/'`, docs `routeBasePath: '/'` (pages at /docs/<page>). `url` = origin from env DOCS_ORIGIN_URL (default stays local).
   - Add a `vercel.json` (or equivalent) so the docs deployment's `/` redirects to `/docs/`.
   - Fix every internal and absolute link, plus the README/docs references to docs-site paths that change.
   - Sitemap at /docs/sitemap.xml.
   - Local `pnpm --filter docs-site build` and `serve` work. Note the local URL change in RUNBOOK.
   - The changelog blog stays as is for now (WO-34e decides).
   - FACTS for baseUrl/routeBasePath come from WO-34r (in parallel). If they are missing, verify against the installed @docusaurus/core and note it.
2. HUMAN_HANDOFF (protocol §6, each with why human, exact command or click path, what we do on the answer, default if silent):
   - **H-DOMAIN**: nectarlabs.io is unregistered (NXDOMAIN; Vercel shows it available at $14.99/yr 1, $46 renewal). Kunal registers it, or names a domain
     he owns. Agents never buy. Default if silent by 2026-11-13 06:00 UTC: `*.vercel.app` / `*.up.railway.app` URLs.
   - **H-DNS**: the records Vercel returns after the domain is added (filled in at deploy time).
   - **H-LEGAL**: OPERATOR, COUNTRY, CONTACT, X_HANDLE (packages/config/config.yaml `site:`, TODO-H-LEGAL). Default if silent by 2026-11-13 12:00 UTC: no
     production promotion, submission continues without hosting.
   - **H-KEYS**: confirm or decline testnet function-call keys for the keeper and the x402 relayer as Railway secrets. The paste kept the line, but the
     template fields were unfilled, so it is treated as unconfirmed. Default if silent: keeper + x402 stay local; the hosted app says when settlement runs.
   - **H-HOST**: in Kunal's own shell, `npx -y vercel@<ver> login` and `npx -y @railway/cli@<ver> login` (versions from WO-34r, or latest if not yet
     recorded), and tell us the Railway plan (Dashboard → Workspace settings → Plan). Never upgrade. Default if silent by 2026-11-13 06:00 UTC: no hosting.
   - H5 → superseded by H-HOST/H-DOMAIN (keep the history line).
3. DECISIONS D-030: hosting per WO-34 (Kunal-confirmed deploy), new projects (pre-repo Vercel/Railway projects untouched), env-driven hosts, keys pending
   H-KEYS, defaults above.
`pnpm --filter docs-site build` exit 0, `node scripts/check-no-branding-all.mjs` exit 0. NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines.
