# Final gate runs (G3b re-run 3 + G9 run 4) on the final commit — two verifiers in parallel, fresh clones, no secrets, own ports
Never stop host services (keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545). If a kill of your own server is refused, say so; don't work around it.
Budget ≤ 35 turns each — commit what you have and report before you run out.

**G3b (verifier A):** exactly docs/process/work/wo-50-verifier-g3b-rerun.md (full e2e desktop + phone incl. screens.spec, Lighthouse, headers, `pnpm verify`,
branding check). Plus: in real Chrome with the REAL near-connect selector (fresh profile, consent banner visible), /borrow → Connect wallet → every wallet
row fully visible (not covered by the banner) on desktop and phone viewports; screenshot to evidence. Do not sign. Row "G3b re-run 3" + section.
WO-34 additions (all on your own ports, from the fresh clone):
- (a) Local-mode e2e now includes `site-pages.spec.ts` and the `/docs/*` explainer.
- (b) Hosted-mode `e2e/hosts.spec.ts` (SITE_URL/APP_URL on *.localhost): redirect codes, per-host sitemap/robots, canonical.
- (c) `E2E_INVENTORY=1 --project=inventory` with the CSP ENFORCED: 0 CSP violations, including each of the 6 selector wallets opened up to the connect
  prompt (never sign). The measured hosts must equal apps/web/content/data-inventory.json, and every third-party host must appear in backticks in
  apps/docs-site/docs/legal/privacy.md.
- (d) `node apps/web/scripts/crawl.mjs --polite` in hosted mode (docs via scripts/serve-docs.mjs): 0 failures, 0 of our console errors.
- (e) Lighthouse default route list (now including /about /status /changelog /brand /talk /security) ≥ 90, both themes.
- (f) H-LEGAL is answered (config.yaml `site:` filled, 05b8c63). A production build with `NECTAR_PRODUCTION=1` and SITE_URL/APP_URL set must now
  SUCCEED. Then, in your clone only, null `site.operator` and rebuild: it must FAIL with the guard message (record as PASS of the guard); restore the file.
- (g) WO-34p: after `pnpm --filter web build`, `node apps/web/scripts/check-trace.mjs` exits 0 (6/6 dynamic routes carry packages/config/config.yaml).
- (h) Vercel preview of the G3b commit. Run 5 change: Vercel keeps only ONE valid share link at a time (observed 2026-11-12), so two links cannot be
  handed over together. The orchestrator deploys web + docs previews of the run-5 commit, runs scripts/deploy/smoke-web.sh, smoke-docs.sh and the Chrome
  check, and commits the logs as evidence/WO-34/preview-*-ca34111-*.log in the main repo. You review those logs (read-only, main repo path) against the
  bullets below and record (h) as "orchestrator-run, reviewed"; the independent hosted check is WO-34v on the public production URLs. You never deploy.
  - web: every route in the crawl list answers 200 (or its expected redirect); /api/health ok:true; runtime logs show `nodejs22.x`.
  - docs: every page of the build answers 200 without `.html` (clean URLs, WO-34q).
  - docs opened directly at `<docs-host>/docs/<slug>` (WO-34s): every page answers 200, and every `/docs/assets/*.css|js` and `/docs/img/*` it references
    answers 200. In real Chrome, `/docs/` shows no "Your Docusaurus site did not load properly" banner and the page hydrates (theme toggle works).
  - Status codes alone are not a pass: the 46c35ea docs preview answered 200 on all 55 pages while every asset under `/docs/assets/` was 404.
    `scripts/deploy/smoke-docs.sh <docs-origin> <share-token>` runs the page + asset check.
  - docs root (WO-34w): `<docs-host>/` → 307 `location: /docs/`, and `/docs/` → 200 (no redirect loop).
  - Hosted-mode proxy (WO-34t, APP `/docs/*` → docs origin `/docs/*`, prefix kept): covered locally by hosts.spec.ts with `E2E_DOCS=1` and
    apps/web/scripts/serve-docs.mjs; the live hosted check is WO-34v (production acceptance).
- Run 5 target: the code-final commit the orchestrator names (c4f143b or a docs-only descendant). Playwright on this machine needs `PW_CHANNEL=chrome`
  (the bundled headless shell 1254 is not installed).
- **Run 6 (FROZEN commit 312677303720a70e76823901f7968e4ff7c0891d, Kunal's freeze 2026-11-12):** everything above, plus:
  - (i) WO-35w claims on the built landing (local build, rendered HTML): no "0123456789" in visible text or meta description; the Base section says
    "local fork"; every TEE line says verifiable (no private/confidential); no "until the Reserve ships"; the worked example uses config.yaml parameters
    (LTV 40/70, haircut 10/25). Event-history banner appears when the Feed reports `history: "unavailable"` (views mode).
  - (j) WO-35k: keeper + feed unit tests pass; Feed /health shape has `chain_head_source`, `history`, `rpc`; in views mode `chain_head` ≥ last block.
  - (k) a git grep for the macOS home-directory prefix (slash, "Users", slash) lists only contracts/nectar-core/tests/fixtures/*.wasm (accepted:
    byte-identical to deployed code).
  - (h) for run 6: orchestrator-run preview checks of 3126773 (evidence/WO-34/preview-*-3126773-*.log), reviewed by you as in run 5.
  - Disk: clone into /tmp (internal disk, ~80 GB free); never install dependencies under /Volumes/T7.
- **Run 7 (RELEASE 2 = the commit the orchestrator names; frozen 3126773 + WO-35g docs + WO-35i landing + docs-only):** everything in run 6, plus:
  - (l) WO-35i in a HYDRATED browser (not curl only): the landing "chains" section text after hydration equals the server HTML text for that section, and
    every sentence naming Base says "local fork" — with the flags as config.yaml ships them and with each flag pinned (v7.spec.ts:189-243 covers this; run
    it and also check by hand in Chrome on your local `next start`). LandingNav "Chains" link consistent.
  - (h) for run 7: orchestrator preview logs evidence/WO-34/preview-*-<release2 sha7>-*.log, incl. a hydrated landing check.
**G9 (verifier B) runs only after the deploy step** (README "Hosted demo" lands first), or on Kunal's deadline if hosting is skipped.

**G9 (verifier B):** docs/process/work/g9-final.md steps 1–7 + docs/process/work/g9-final-2.md steps 8–10, plus:
11. `node scripts/build-submission.mjs` (dry run only, never --send): `tracks` = ["defi","security","agents"]; no privacy-track framing left in SUBMISSION,
    README, X_POST (factual privacy statements may stay); X_POST may carry the hackathon wording its rules require (it is not product UI).
12. SECURITY.md known limitations include C-020 and the remote Loan Note release-to-depositor caveat, and each matches code (notes.rs move_note, remote.rs
    request_remote_release, SDK implicit-account regex). SECURITY.md zod line matches FACTS F-383–F-385.
Row "G9 run 4" + section.
Each: one commit `test: evidence — <gate> on the final commit` (no Co-Authored-By, never --no-verify). Report ≤ 12 lines incl. the clone commit.
