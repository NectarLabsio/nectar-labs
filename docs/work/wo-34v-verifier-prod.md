# WO-34v — verifier — production acceptance (against the hosted URLs; no secrets; read-only on hosts)
Context: docs/work/wo-34-deploy.md. Inputs from the orchestrator in the dispatch line: SITE, APP, DOCS, FEED URLs, the deployed commit, and the Vercel
and Railway deployment ids. Fresh clone of that commit for the scripts. Never sign anything. Never stop host services. Own ports only. Budget ≤ 40 turns.
Commit what you have and report before you run out.
1. Crawl: `node apps/web/scripts/crawl.mjs` (WO-34c) against SITE, APP and DOCS. Pass criteria:
   - 0 broken internal links; external links answer; 0 console errors.
   - Every route in both themes at 1440 and 400 px. Screenshots go to evidence/WO-34/.
   - Redirects:
     - www → SITE 301.
     - App routes on SITE → APP 308.
     - Landing-only routes on APP → SITE 308.
     - APP `/` → `/feed`.
2. Lighthouse a11y ≥ 90 on every route, both themes: `LH_BASE_URL=<host>` with `LH_ROUTES` for each host.
3. Host check:
   - Capture every request host per page in real Chrome (fresh profile), including opening the real near-connect selector and one wallet iframe (no
     signing).
   - Any host that is not listed on SITE `/legal/privacy` fails the gate. Exempt: our own SITE and APP hosts. Use the same check as WO-34e2, which
     looks for each host in backticks on the privacy page.
   - Cookies and storage keys must match `/legal/cookies`.
4. Response headers per host (curl -sI): CSP (exact hosts), HSTS, `frame-ancestors 'none'`, X-Frame-Options, and noindex on the preview URL but not on
   production.
   - Feed:
     - `FEED/health` 200 with lag and last block.
     - CORS allows SITE and APP and refuses another origin.
     - MCP `tools/list` 200.
5. Wallet connect on APP: the real near-connect selector opens and a wallet row is fully visible and clickable. Do not sign.
   - x402 hosted: N/A (D-031).
6. EVIDENCE: a row "WO-34 production" plus a section with:
   - deployment ids, URLs, deployed commit;
   - the headers;
   - links to the crawl and host-check reports (evidence/WO-34/);
   - PASS/FAIL per item.
   Commit `test: evidence — WO-34 production acceptance` (no Co-Authored-By, never --no-verify). Report ≤ 12 lines.
