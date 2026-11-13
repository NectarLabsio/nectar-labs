# WO-35j — docs — Feed link answers 404 (G3b re-run 7 item (d), failed check) (< 15 min; commit `fix(docs-site): link the hosted Feed /health`)
Write only apps/docs-site/docs/. Source: docs/EVIDENCE.md "G3b re-run 7" (d): /docs/integrate/feed-rest links the bare
https://feed-production-2f2776c9.up.railway.app, which answers 404 (the Feed serves /health, /api/*; no root route). /health answers 200.
1. Point every link to the bare Feed origin at https://feed-production-2f2776c9.up.railway.app/health (feed-rest.md, monitoring.md, any other page).
   Text may still name the origin; the href must be a URL that answers 200. `grep -rn "feed-production-2f2776c9.up.railway.app" apps/docs-site/docs` —
   every href ends in /health or /api/... .
2. Nothing else changes.
Tests: `pnpm --filter docs-site build` 0 (DISK RULE: no pnpm install in the worktree; symlink node_modules from /Volumes/T7/nectar-labs, never stage them);
`curl -s -o /dev/null -w '%{http_code}'` on each linked Feed URL → 200; `pnpm verify:quick` 0. NO Co-Authored-By. Report ≤ 3 lines.
