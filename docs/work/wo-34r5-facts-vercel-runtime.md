# WO-34r5 — researcher — facts for WO-34p (web) and WO-34q (docs) (< 30 min; commit `docs(facts): F-428.. Vercel runtime + clean URLs`)
Write only docs/FACTS.md: new ids from F-428, date 2026-11-12, a primary URL read this session for each. At most 6 page reads.
1. Vercel project configuration `cleanUrls` (and `trailingSlash`) in vercel.json: what it does for `a/b.html` → `/a/b`, and whether the file must sit
   in the rootDirectory (vercel.com/docs/project-configuration).
2. Next.js 16 `outputFileTracingRoot` and `outputFileTracingIncludes`: key format (route globs), path base (relative to the project dir), and monorepo
   use (nextjs.org/docs/app/api-reference/config/next-config-js/output).
3. Vercel Node.js version selection: the `engines.node` field in package.json takes precedence over the project setting, and a range like
   `>=22.22.2` picks the newest major (vercel.com/docs/functions/runtimes/node-js/node-js-versions).
   Observed on 2026-11-12: functions ran `nodejs26.x` with project nodeVersion 22.x. Record that as a live note.
Report ≤ 8 lines: ids, one line each. NO Co-Authored-By. Never --no-verify.
