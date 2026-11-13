# WO-34p — web — dynamic routes 500 on Vercel; pin Node 22 (< 60 min; commit `fix(web): bundle config.yaml for serverless routes; pin Node 22`)
Write only `apps/web/`. Found by the WO-34m preview of fd06e11 (evidence/WO-34/preview-smoke-web-*.log, Vercel runtime logs):
- `/api/health`, `/api/feed`, `/feed/[symbol]`, `/position/[id]`, `/note/[id]` and `/quote/[id]` answer 500.
  - Log: `Error: packages/config/config.yaml not found above /var/task/apps/web` (loadConfig walks up from process.cwd()).
  - Next's file tracing does not bundle a file reached through a runtime path walk, so the serverless function has no config.yaml.
  - G3b could not see this: `next start` runs inside a full checkout.
- Functions run on `nodejs26.x`. Vercel picks the newest major allowed by apps/web/package.json `engines.node ">=22.22.2"`. G3b ran on Node 22.
- Static pages, headers, noindex and `/api/indexer/*` are fine (the Feed proxy works).

1. Make every server route that reads repo files at runtime work inside a traced serverless bundle.
   - Preferred: next.config.ts `outputFileTracingRoot` = the repo root, plus `outputFileTracingIncludes` adding `../../packages/config/config.yaml` for all
     server routes, and any other repo file a dynamic route reads at runtime (check evidence.server.ts and legal/security loaders; static pages are out of scope).
   - Confirm the option names and the path semantics in the installed Next 16.4.5 (node_modules/next config types or docs). Cite file and line in your report;
     the researcher records it. If tracing cannot do it, embed the parsed config at build time instead, with no behaviour change.
   - The production guard and the operator-field checks must keep working.
2. Pin `engines.node` in apps/web/package.json to `">=22.22.2 <23"`. Do not touch the root package.json; the orchestrator decides that.
3. Add `apps/web/scripts/check-trace.mjs`. After `next build` it reads `.next/server/**/*.nft.json` for the six routes above, checks that each
   trace includes packages/config/config.yaml (plus anything else from step 1), and exits non-zero otherwise. Run it after your build.
4. Tests:
   - `pnpm --filter web build` (with `node scripts/build-changelog.mjs` first, as in package.json), then check-trace.mjs → 0.
   - `pnpm verify:quick` → 0.
   - Start `next start` on your own port, from a copy that has only the traced files (or explain why not), and get 200 from /api/health
     and /position/1. If that is impractical, run it from the repo and say so; the orchestrator re-checks on a Vercel preview.
Own ports (not 3000/3100/3217/3291/3297/3471/3613/3741/3742/3761/3762/3771/3857/3961–3963/8788–8791/8891). Stop your servers. NO Co-Authored-By.
Never --no-verify. Report ≤ 8 lines: the fix, the Next source you cited, check-trace output, test counts.
