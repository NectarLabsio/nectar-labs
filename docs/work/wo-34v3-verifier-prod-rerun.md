# WO-34v3 — verifier — production acceptance on RELEASE 2 (≤ 35 turns)
Same inputs as docs/work/wo-34v2-verifier-prod-rerun.md (SITE/APP/DOCS/docs origin/FEED), but production now runs RELEASE 2 (the orchestrator gives the
commit and deployment ids in the dispatch line). Fresh clone of release 2 into /tmp (never install under /Volumes/T7). PW_CHANNEL=chrome. Never sign.
1. The WO-34v2 FAIL: in a HYDRATED Chrome page (wait for network idle + 4 s), the landing "chains" section (#chains) text equals the server HTML text, and
   every sentence that names Base says "local fork" (heading, intro, steps 03/04). Record both texts.
2. The item WO-34v2 left "not checked": `node apps/web/scripts/crawl.mjs --polite` over SITE + APP incl. /docs/* — 0 broken internal links, 0 of our console
   errors (external bot blocks = warnings).
3. Spot regression (curl): no x-robots-tag noindex on SITE /, APP /feed, APP /docs and 3 docs pages; docs origin XFO + frame-ancestors; Feed /health
   history/chain_head_source/rpc; CORS SITE/APP allowed, other origin 403.
4. Lighthouse a11y on the landing, both themes (≥ 90).
EVIDENCE: row "WO-34 production (release 2)" + section; commit `test: evidence — WO-34 production acceptance (release 2)`, no Co-Authored-By. Commit an
"in progress" row early, then the final one. Report ≤ 8 lines.
