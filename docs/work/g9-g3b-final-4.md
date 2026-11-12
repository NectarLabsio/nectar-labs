# Final gate runs (G3b re-run 3 + G9 run 4) on the final commit — two verifiers in parallel, fresh clones, no secrets, own ports
Never stop host services (keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545). If a kill of your own server is refused, say so; don't work around it.
Budget ≤ 35 turns each — commit what you have and report before you run out.

**G3b (verifier A):** exactly docs/work/wo-50-verifier-g3b-rerun.md (full e2e desktop + phone incl. screens.spec, Lighthouse, headers, `pnpm verify`,
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
- (f) A production build with `NECTAR_PRODUCTION=1` and the site URLs set must FAIL while config.yaml `site:` operator fields are null or any page
  contains `TODO-H`. That failure is expected; record it as PASS of the guard.
- (g) WO-34p: after `pnpm --filter web build`, `node apps/web/scripts/check-trace.mjs` exits 0 (6/6 dynamic routes carry packages/config/config.yaml).
- (h) Vercel preview of the G3b commit (the orchestrator deploys it and hands you the share links; you never deploy):
  - web: every route in the crawl list answers 200 (or its expected redirect); /api/health ok:true; runtime logs show `nodejs22.x`.
  - docs: every page of the build answers 200 without `.html` (clean URLs, WO-34q).
**G9 (verifier B) runs only after the deploy step** (README "Hosted demo" lands first), or on Kunal's deadline if hosting is skipped.

**G9 (verifier B):** docs/work/g9-final.md steps 1–7 + docs/work/g9-final-2.md steps 8–10, plus:
11. `node scripts/build-submission.mjs` (dry run only, never --send): `tracks` = ["defi","security","agents"]; no privacy-track framing left in SUBMISSION,
    README, X_POST (factual privacy statements may stay); X_POST may carry the hackathon wording its rules require (it is not product UI).
12. SECURITY.md known limitations include C-020 and the remote Loan Note release-to-depositor caveat, and each matches code (notes.rs move_note, remote.rs
    request_remote_release, SDK implicit-account regex). SECURITY.md zod line matches FACTS F-383–F-385.
Row "G9 run 4" + section.
Each: one commit `test: evidence — <gate> on the final commit` (no Co-Authored-By, never --no-verify). Report ≤ 12 lines incl. the clone commit.
