# WO-34r8 — researcher — Vercel production prerequisites (< 25 min; commit `docs(facts): F-440.. Vercel protection + aliases`)
Write only docs/FACTS.md: next free ids, date 2026-11-12, a primary URL read this session for each. At most 4 page reads (vercel.com/docs/deployment-protection,
vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication, vercel.com/docs/domains (vercel.app / aliases), REST API project
update if needed).
Context: projects nectar-labs-web and nectar-labs-docs (Hobby) have `ssoProtection: { enabled: true, deploymentType: "all_except_custom_domains" }`.
Production must be public on `*.vercel.app` addresses (H-DOMAIN default); previews stay protected. Planned: two aliases on the web project (SITE, APP), the docs
project's own production domain as the proxy target.
Record, quoting the docs:
1. Vercel Authentication scopes: what "Standard Protection" protects (previews + generated deployment URLs?) vs "all_except_custom_domains" vs "preview" (API
   `deploymentType` values). Which setting leaves the production `*.vercel.app` domain and assigned `*.vercel.app` aliases public while previews stay behind login?
   Is a `*.vercel.app` alias treated as a "custom domain" for protection purposes?
2. `*.vercel.app` aliases: can a project be given an extra `<name>.vercel.app` (first come, first served? Hobby limits?), and does a production deployment get
   assigned the project's domains automatically (`target: "production"` via the API)?
3. Environment variables: a value set for target `production` applies to builds started after it is set (no rebuild of existing deployments).
Report ≤ 6 lines: ids, one line each, and the exact `deploymentType` to set. NO Co-Authored-By. Never --no-verify. Stop at 20 turns: commit what you have.
