# WO-62d — web — crawl script for the custom hosts (G3b run 8 (d)) (< 45 min; commit `test(web): crawl knows docs/status hosts (WO-62d)`)
Write only apps/web/scripts/crawl.mjs (and its helpers/tests if any) and docs/ui/app/Console.dc.html (one number).
Source: docs/EVIDENCE.md §"G3b re-run 8" item (d). The release candidate is right; the crawler is stale:
1. crawl.mjs:83 still expects SITE /docs/* → 308 APP/docs/*. Since WO-62b, SITE, APP and STATUS `/docs` and `/docs/<rest>` → 308
   `${DOCS_URL}/<rest>` (prefix dropped, query kept). Expect that (e.g. `${DOCS}/security/audits`).
2. Treat the DOCS and STATUS origins (env DOCS_URL, STATUS_URL; serve-docs.mjs for docs at the root in hosted mode) as internal hosts: crawl and
   render their pages like SITE and APP, so the docs pages (≈ 56) and the status page are covered again.
3. docs/ui/app/Console.dc.html: "Reserve discount 4.00%" → 6.00% (deployed 600 bps, evidence/claims/deployed-params-20261112T192755Z.json).
Run `node apps/web/scripts/crawl.mjs --polite` in hosted mode with all five env vars and report its totals (internal pages per host, failures).
`pnpm verify:quick` 0. DISK RULE: no pnpm install in the worktree (symlink node_modules). NO Co-Authored-By. Report ≤ 12 lines.
