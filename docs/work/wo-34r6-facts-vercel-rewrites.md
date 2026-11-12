# WO-34r6 — researcher — vercel.json `rewrites` for the docs deployment (< 20 min; commit `docs(facts): F-433.. vercel.json rewrites`)
Write only docs/FACTS.md: next free ids, date 2026-11-12, a primary URL read this session for each. At most 3 page reads (vercel.com/docs/project-configuration/vercel-json.md
first; vercel.com/docs/rewrites only if needed).
Why: the docs deployment opened directly shows the Docusaurus baseUrl banner. Its pages reference `/docs/assets/…`, but the flat build serves `/assets/…` (F-393), so
`/docs/assets/js/main.*.js` answers 404 (observed live 2026-11-12 on dpl_5pYWUsABpAs4RUGZ5cHGa2dNeEM6). Planned fix: apps/docs-site/vercel.json gains
`"rewrites": [{ "source": "/docs/:path*", "destination": "/:path*" }]` next to `"cleanUrls": true`.
Record, quoting the docs:
1. `rewrites` syntax in vercel.json: `source`/`destination`, whether `:path*` also matches `/docs` and `/docs/` (zero segments), and nested paths.
2. Order: is a vercel.json rewrite applied before or after the filesystem check? (No `docs/` folder exists in the build, so either works; record which.)
3. With `cleanUrls: true`, does a rewrite destination such as `/start/quick-start` resolve to `start/quick-start.html`? (F-428 has the "no extension in source or
   destination" line; add anything more explicit.)
4. Any limit on rewrites in a static (no framework) deployment.
Report ≤ 6 lines: ids, one line each, and whether the planned rule is sound. NO Co-Authored-By. Never --no-verify.
