# WO-35f — researcher — vercel.json `headers` + team-suffixed noindex (< 15 min; commit `docs(facts): F-452.. vercel.json headers`)
Write only docs/FACTS.md: next free ids, date 2026-11-12. ≤ 2 page reads (vercel.com/docs/project-configuration/vercel-json.md `headers`; deployment-protection
or domains page only if it explains the noindex below).
Why: WO-34v (production acceptance of ca34111) found the docs deployment sends no X-Frame-Options / CSP frame-ancestors, and that the team-suffixed
`nectar-labs-docs-kunals-projects-35d3a237.vercel.app` sends `x-robots-tag: noindex` while `nectarlabs-docs.vercel.app` / `nectarlabs-app.vercel.app` do not
(observed live 2026-11-12 ~14:20Z with curl -sI).
1. vercel.json `headers`: syntax (`source`, `headers: [{key, value}]`, `has`/`missing`), whether they apply to rewritten paths and to `cleanUrls` paths, and
   order relative to redirects/rewrites. Example for `/(.*)`.
2. Is the noindex on team-suffixed `*.vercel.app` URLs documented? Quote it if so; else record the live observation as "LIVE, not documented this session".
Report ≤ 4 lines: ids and the exact header block to use. NO Co-Authored-By. Never --no-verify. Stop at 12 turns: commit what you have.
