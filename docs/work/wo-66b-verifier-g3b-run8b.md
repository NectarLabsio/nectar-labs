# WO-66b — verifier — G3b run 8b: items (d) and (k) + a hydration check, on c95cd0c (< 60 min; commit `test: evidence — G3b run 8b (WO-66b)`)
Fresh clone of c95cd0c in a temp dir (pnpm install allowed there, not on /Volumes/T7). Write only docs/EVIDENCE.md and evidence/.
Since run 8 (31809b1): WO-62d changed only apps/web/scripts/crawl*.mjs (+ test) and one number in docs/ui; de17c86 redacted the evidence log.
`git diff --stat 31809b1 c95cd0c -- apps packages services contracts` must show only those script files → runs 8 (all items but (d), (k)) + 8b cover c95cd0c.
- (d) `node apps/web/scripts/crawl.mjs --polite` in hosted mode with SITE_URL, APP_URL, DOCS_URL, STATUS_URL, LEGACY_HOSTS (*.localhost origins;
  docs built with DOCS_URL and served by scripts/serve-docs.mjs at the root). PASS = exit 0, 0 failures, 0 of our console errors; report pages per host.
- (k) the strict home-path grep from run 8 (non-wasm files): PASS = 0 real home paths.
- (p) hydration: the WO-62d agent saw React #418 (hydration mismatch) on SITE / and STATUS / in a fast non-polite crawl (polite: none). Load SITE / and
  STATUS / 10 times each in Chrome against the hosted `next start` (plain page.goto, networkidle + 2 s, no throttling), desktop and phone viewport,
  collecting console errors. PASS = 0 hydration errors. If any appear, capture the exact message + component stack and say whether it is timing-dependent;
  a reproducible hydration error is a product FAIL (then write docs/GATE_FAIL_G3B_R8B.md).
Report ≤ 12 lines. NO Co-Authored-By. Do not touch running host services.
