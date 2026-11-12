# WO-34x — orchestrator — production deploy through the connectors (after G3b re-run 5 PASS)
Kunal confirmed production hosting in session (WO-34). H-LEGAL answered 2026-11-12. H-DOMAIN unanswered → `*.vercel.app` (a domain added later is an env +
alias change, no code change; HUMAN_HANDOFF H-DOMAIN). Commit: **ca34111** (G3b run 5), tarball sha256 689b93c6…8ccaaba (already in the bucket).
Facts: F-414–F-443 (C-026 open: whether `all_except_custom_domains` leaves `*.vercel.app` public → irrelevant once set to `preview`).

## Hosts
- SITE = `https://nectarlabs.vercel.app`, APP = `https://nectarlabs-app.vercel.app` (aliases on nectar-labs-web; F-443 VERIFY → the first alias call settles
  availability; fallback names `nectar-labs-site` / `nectar-labs-app`, then the project domain `nectar-labs-web-kunals-projects-35d3a237.vercel.app` for APP).
- DOCS_ORIGIN = `https://nectar-labs-docs-kunals-projects-35d3a237.vercel.app` (docs project production domain; internal proxy target; serves `/docs/*`).
- DOCS_URL = APP + `/docs`. Feed stays `https://feed-production-2f2776c9.up.railway.app` (FEED_URL already set for production).

## Steps (each result logged to evidence/WO-34/prod-*.log; no token or presigned URL in any log)
1. Docs project env, target production: APP_URL = APP, DOCS_ORIGIN_URL = APP.
2. Web project env, target production: SITE_URL, APP_URL, DOCS_URL, DOCS_ORIGIN, REPO_URL = "" (H2 open). Explorer/faucet NEXT_PUBLIC_* stay unset, as in
   the previews that passed.
3. ssoProtection `deploymentType: "preview"` on both projects (F-440/F-442: production URLs public, previews behind login).
4. Production deploy docs, then web, from the ca34111 tarball (fresh 1 h GET URL), `target: "production"`, same projectSettings and stubs as the previews.
   The production guard runs at build (VERCEL_ENV=production): it must pass (operator fields filled, SITE/APP set).
5. Assign SITE + APP aliases to the web production deployment. Feed `FEED_CORS_ORIGINS` = SITE + APP origins (Railway set-variables; redeploy).
6. Public smoke (no token): smoke-web.sh on APP and SITE; smoke-docs.sh on APP (APP `/docs/*` proxied); docs origin `/` → 307 `/docs/`;
   SITE app routes → APP 308 and APP landing routes → SITE 308 (WO-34a); response headers (HSTS, CSP, no noindex on production).
7. STATE, then WO-34v (verifier production acceptance), README "Hosted demo" (docs), G9 run 4, `submission-rc`.
If any step fails for plan reasons: stop, record under H-HOST, keep previews. Hard stop 2026-11-13 18:00 UTC.
