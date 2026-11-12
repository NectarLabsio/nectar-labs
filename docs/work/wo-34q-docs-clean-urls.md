# WO-34q — docs — clean URLs on the docs deployment (< 20 min; commit `fix(docs-site): clean URLs on Vercel`)
Write only `apps/docs-site/`. Found by the WO-34m docs preview of fd06e11 (evidence/WO-34/preview-smoke-docs-*.log):
- On the docs deployment `/security/audits` answers 404 and `/security/audits.html` answers 200: all 55 pages, because Vercel does not serve
  `a/b.html` at `/a/b` by default.
- The APP rewrite `/docs/:path*` → docs origin `/:path*` (F-393) asks for the path without `.html`, so every hosted docs link would 404.
1. Add `apps/docs-site/vercel.json` with `{"cleanUrls": true}` (F-428). It sits in the docs rootDirectory (F-430). Leave `trailingSlash` unset (F-429).
2. Add a comment-free JSON. Explain it in the header comment of docusaurus.config.ts, one line citing F-428/F-430. Note that the
   orchestrator ships this file as an inline stub, because Vercel reads it before the install step.
3. `pnpm --filter docs-site build` passes. `node scripts/check-no-branding-all.mjs` exit 0.
NO Co-Authored-By. Never --no-verify. Report ≤ 4 lines.
