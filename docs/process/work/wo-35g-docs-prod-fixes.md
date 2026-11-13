# WO-35g — docs — production acceptance fixes (failed checks only, post-freeze) (< 30 min; commit `fix(docs-site): security headers; no localhost link`)
Write only apps/docs-site/. Source: docs/EVIDENCE.md "WO-34 production" (WO-34v FAIL on ca34111). Facts: WO-35f ids (vercel.json headers), F-433–F-439.
1. apps/docs-site/vercel.json: add a `headers` block for `/(.*)` with `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Do not add script/style CSP directives (Docusaurus inline scripts;
   the APP's own CSP already covers APP /docs). Keep cleanUrls, the redirect and both rewrites exactly as they are.
2. apps/docs-site/docs/integrate/feed-rest.md (and any other docs page): no link to `http://127.0.0.1:8788` or any localhost URL. Show the hosted Feed
   https://feed-production-2f2776c9.up.railway.app as the link; keep the local address as inline code text (not a link) for local runs.
   `grep -rn "127.0.0.1\|localhost" apps/docs-site/docs` → only inline-code mentions.
3. Update the hosting comment in docusaurus.config.ts if it lists vercel.json contents.
Tests: vercel.json parses; `pnpm --filter docs-site build` 0 (do NOT pnpm install in your worktree: symlink node_modules from the main checkout
/Volumes/T7/nectar-labs if missing, never stage the symlinks); grep check of item 2; `pnpm verify:quick` 0.
NO Co-Authored-By. Never --no-verify. Report ≤ 5 lines.
