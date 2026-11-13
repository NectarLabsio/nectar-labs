# WO-34r7 — researcher — vercel.json `redirects` (< 15 min; commit `docs(facts): F-437.. vercel.json redirects`)
Write only docs/FACTS.md: next free ids, date 2026-11-12, a primary URL read this session. At most 2 page reads (vercel.com/docs/project-configuration/vercel-json.md).
Planned use: apps/docs-site/vercel.json gains `"redirects": [{ "source": "/", "destination": "/docs/", "permanent": false }]` next to cleanUrls and the WO-34s rewrites.
Record, quoting the docs:
1. `redirects` syntax: `source`, `destination`, `permanent` (status 307 vs 308) and `statusCode`; relative destinations allowed.
2. Does a redirect on `/` fire even though `/index.html` exists in the output (redirects before the filesystem check)? F-434 has "redirects run before rewrites";
   record the filesystem order explicitly or mark it "not documented this session".
3. Does `source: "/"` match only the root (not `/docs/…`)?
Report ≤ 5 lines: ids, one line each, and whether the planned rule is sound. Stop at 15 turns: commit what you have. NO Co-Authored-By. Never --no-verify.
