# EVIDENCE.md — written by the verifier agent only

| Gate | Status | UTC | Commit | Evidence |
| --- | --- | --- | --- | --- |
| WO-35 after-close takes (2026-11-13 21:00–21:16Z) (WO-96) | Txs 11/11 verified on testnet RPC, all SuccessValue: take A 5/5, take B 6/6, with the events named in shotlist.md. Frame review: 1 FIX-BEFORE-SENDING. Chrome shows "Debugger paused in another tab" for 2 frames at 0:48.000–0:48.067 in the master, the captioned version and the 720p master. The rest is minor or cosmetic (loading skeletons, flag price $27.59 vs $27.57, caption over the Weekend Shield card), plus 2 items for Kunal to decide: the footer email and the amber `owner · 62s · no conf` badge. Captions 5/5 match shotlist.md. On-screen numbers match: loan #22, $100, 15 bps / $0.15, $99.55, 402 → 200. Session closed (outside_hours) is cited from shotlist.md, NOT RE-CHECKED. "Relayer submitted nothing" (take B attempt 3) is NOT VERIFIED | 2026-11-13T21:35Z (finished) | deefdda | evidence/WO-35/weekend-frame-review-20261113T213157Z.md, evidence/WO-35/weekend-txcheck-20261113T213157Z.log (see §WO-35 after-close takes) |
| WO-34 production (web + docs c9fd56b, WO-85/86 brand) (WO-87 A) | PASS, 5/5 items. The deploy source commit is SELF-ATTESTED. Items 4 and 5b were added at 17:13Z–17:16Z, which replaces the INCOMPLETE status of the 17:07Z write-up (details below). (4) Lighthouse a11y: SITE / 100/100, APP /borrow 100/100, DOCS / dark 100. DOCS light (`?docusaurus-theme=light`) scores 97/97 because color-contrast fails on 29 footer link items (axe: #ebedf0 on #ffffff, 1.17:1); flagged. (5b) `PW_CHANNEL=chrome npx playwright test e2e/claims.spec.ts e2e/test-assets.spec.ts` on the config's own webServer (:3100, which was free): 28 passed, exit 0. Earlier write-up: (1) PASS: smoke-prod.sh with the 4 custom hosts and 5 legacy pairs: failures 0, exit 0. (2) PASS: the served HTML of SITE /, APP /borrow, APP /feed and STATUS / has "A Nectar Labs product" ×1 and "© 2026 Nectar Labs" ×1. DOCS / and /project/team have "© 2026 Nectar Labs" ×1; at c9fd56b the docs footer has no product line. All 6 pages have 0 "Nectar Network product" and 0 "2026 Nectar Network". Hydrated Chrome, 12 loads: the footer is correct on all 12 and old brand strings appear 0 times. (3) PASS: SITE /, APP /borrow, STATUS / and DOCS / at 1440 and 400 px show 0 console, page or hydration errors and 0 failed requests. (4) Lighthouse: NOT RE-CHECKED (still running at the stop). (5) Branding check on c9fd56b: exit 0, PASS. e2e: NOT RE-CHECKED because of a harness error. I set PORT=3387, but `pnpm start` is `next start -p 3100`, so the webServer timed out after 120 s and 0 tests ran. Deploy source commit is SELF-ATTESTED | 2026-11-13T17:01Z–17:16Z | c9fd56b (web dpl_F8NmBUE5PzpsdYRw94QWsRX85hgH, docs dpl_2gj8GAFNtCHUDHTtWYwmS55Yu2ks) | evidence/WO-87/, evidence/WO-87/probe/site-footer-hydrated.png (see §WO-34 production (web + docs c9fd56b, WO-85/86 brand)) |
| G9 run 9b (WO-80, step 4 re-check) | PASS, which resolves the G9 run 9 FAIL. Product unchanged: `git diff --stat d863f55 0904aec -- apps packages services contracts` is empty, so run 9 items 1–3 and 5–7 carry over. Step 4: README:3, :11–16, :34–39, Feed rows :29/:66 and :150 match EVIDENCE (§WO-34 production (web 1a95022, WO-74), §custom hosts, §G14, §G9 run 3) and HUMAN_HANDOFF H-DEPLOY. Live: APP /borrow chunk 3htcm-0feao4j.js has `{onClaimed:eT.reload}`, DOCS last-modified 02:03:23Z (unchanged), Feed /health ok true ×3 at commit 37dfec9 with start_block 277503800, CORS SITE/APP/STATUS only, smoke-prod 43 ok / 0 failures | 2026-11-13T14:27Z–14:33Z | 0904aec | evidence/G9/run9b-20261113T1427Z/ (see §G9 run 9b) |
| WO-34 production (web 1a95022, WO-74) (WO-78) | PASS, 5/5 items; 2 parts are SELF-ATTESTED (the source commit of the deploy and the production QA claim). (1) smoke-prod.sh with the 4 custom hosts and 5 legacy pairs exits 0: 43 ok, 0 failures (28 app routes, 56 docs pages + 6 assets). (2) One APP /borrow chunk has the WO-74 path, `T({onClaimed:e}={})` and `(0,t.jsx)(T,{onClaimed:eT.reload})`. nectarlabs-app.vercel.app/borrow 308s to the same page, and its 14 chunks have the same paths and sha256. (3) Hydrated Chrome, 4 loads of APP /borrow and SITE / at 1440 and 400 px: 0 console errors, 0 page errors, 0 hydration errors, 0 failed requests. (4) Lighthouse a11y on APP /borrow: 100 dark, 100 light. (5) G9 run 9 web-delta specs 28/28 and evidence/WO-74/prod-qa-check-20261113T140705Z.log (0.00 → 5.00 NVDAx with no reload) are cited, not re-run. Docs were not redeployed (last-modified 02:03:23Z) | 2026-11-13T14:21Z–14:25Z | 2cd7a6e (product 1a95022; web dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K, docs dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE) | evidence/WO-78/, evidence/WO-78/probe/app-borrow-hydrated.png (see §WO-34 production (web 1a95022, WO-74)) |
| G9 run 9 (WO-77, WO-74 commit) | FAIL, 1 reason (step 4 claims, docs/evidence only). README:11–13 still says "Production runs release 4, commit c95cd0c … Vercel web dpl_Bm1uwQcX…" and promises that a redeploy gets its own §"WO-34 production" block. Production web now serves the WO-74 code (APP /borrow chunk 3htcm-0feao4j.js carries `onClaimed`; WO-74 CLI deploy dpl_4ExxeLH… at 13:51Z, src 1a95022 per STATE at 9be1e2a). EVIDENCE has no block for that release. Every command PASSES. Fresh local clone of d863f55 outside /Volumes/T7. The public URL (README:82) serves main = b6d6f41, and its product code equals d863f55. Quick start about 1.1 min: pnpm i 11 s, demo:testnet 5 s, verify 28 s (ui 7, feed 89, keeper 327, x402 41, web 43 + 1 skip, 0 failed), web dev 4 s with 21 README routes 200 and /markets, /earn 404. Docs build 18 s. WO-77 e2e (test-assets + claims): 28/28 with system Chrome 157 (headless shell 1254 absent). Production /borrow ships onClaimed. smoke-prod 0 failures. Prod QA is SELF-ATTESTED (orchestrator log, not re-run). gitleaks: 559 commits, no leaks. Feed MCP stdio + HTTP: 8 tools. Payload: `website` absent, projectUrl = GitHub URL. Branding exit 0. Handoffs: 0 OTHER-OPEN | 2026-11-13T14:10Z–14:19Z | d863f55 | evidence/G9/run9-20261113T141044Z/ (see §G9 run 9) |
| G9 run 8 (WO-76, public GitHub URL) | PASS. Anonymous HTTPS clone of https://github.com/NectarLabsio/nectar-labs.git into /tmp (outside /Volumes/T7), HEAD b6d6f41 as expected. The repo is public: the GitHub API without a token returns private false, `ls-remote` works with no credential helper, and WebFetch of the repo page shows "Public" and 747 commits. Quick start took about 1.3 min of commands: pnpm i 12 s, demo:testnet 4 s, verify 36 s (ui 7, feed 89, keeper 327, x402 41, web 43 + 1 skip, 0 failed), web dev ready in 4 s with 21 README routes 200 and /markets, /earn 404. Docs build 24 s. gitleaks over all refs: 553 commits (= the non-merge commits of 747), no leaks. Feed MCP stdio + HTTP: 8 tools. Public-repo hygiene: no file over 50 MB in the tree or history (largest blob 3.5 MB). Only .env.example files, with placeholders. 0 expanded home paths. No key material: the long ed25519 strings are all signatures or public keys. Production still serves release 4 (no WO-74 `onClaimed` in the 14 /borrow chunks), which matches README:11. smoke-prod 0 failures. Hosted Feed commit 37dfec9, CORS as claimed. Payload: `website` absent. Handoffs unchanged since run 7 (0 OTHER-OPEN). README:82 TODO-H2 is still present (filled in a later commit) | 2026-11-13T13:44Z–13:52Z | b6d6f41 | evidence/G9/run8-public-20261113T134430Z/ (see §G9 run 8) |
| G9 run 7 (WO-73, Feed-fix commit) | PASS. Fresh clone of d92a199 outside /Volumes/T7. `git diff --stat c95cd0c d92a199 -- apps contracts` is empty, so the web and docs builds equal release 4. Quick start about 1.2 min of commands: pnpm i 25 s, demo:testnet 5 s, verify 37 s (ui 7, feed 89, keeper 327, x402 41, sdk 218, web 43 + 1 skip, 0 failed), web dev ready in 4 s with 21 README routes 200 and /markets, /earn 404. Docs build 42 s. gitleaks: 543 commits, no leaks. Feed MCP stdio + HTTP: 8 tools, live values equal to the demo. Hosted Feed /health (3 polls, 12:33:55Z–12:34:05Z): commit 37dfec9, source views+neardata, start_block 277503800, events_indexed 1, indexer_cursor present, indexer_lag_blocks 0. These match the README Feed rows. CORS: SITE, APP and STATUS allowed, docs and evil refused. The v2 fixture tests ran in verify (feed `ok 28 - real nectar-core-v2 (2.0.0) log lines`). scripts/demo has no secret, no key material and no /Users path. Only intear-setup.mjs reads the seed file, and every print goes through redact(). prod smoke exit 0. Payload: tracks defi/security/agents, `website` absent. Branding exit 0. Handoffs: 17 DONE / 11 DEFAULT / 7 KUNAL-ONLY / 2 N/A / 0 OTHER-OPEN. Notes (not counted) are in the block | 2026-11-13T12:33Z–12:40Z | d92a199 | evidence/G9/run7-20261113T123302Z/ (see §G9 run 7) |
| G9 run 6 (WO-67 B, deployed commit) | FAIL, 1 reason (step 3, docs only). The README hosted-demo section describes the state before this release. README:15–18, 24 and 35 say the status host, docs at the root of docs.nectarlabs.io and the "Get test assets" button are "not deployed", and that until then status.nectarlabs.io shows the landing page and docs.nectarlabs.io redirects to /docs/. Production shows all three: STATUS / has h1 "Status", the docs answer at the root, and APP /borrow shows the button. README:25 says Feed CORS allows "the Site and App origins only", but the STATUS origin is allowed too. Every command PASSES. Product code = c95cd0c: `git diff --stat c95cd0c b7fa381 -- apps packages services contracts` is empty. Quick start about 1 min of commands: pnpm i 10.8 s, demo:testnet 5 s, verify 29 s (ui 7, feed 79, keeper 327, x402 41, sdk 218, web 43 + 1 skip, 0 failed), web dev ready in 5 s with 21 README routes 200 and /markets, /earn 404. The docs build takes 19 s. gitleaks: 510 commits, no leaks. Feed MCP stdio + HTTP: 8 tools, live values. Payload: tracks defi/security/agents, `website` absent. Branding exit 0. 0 home paths. Host grep: 3 non-history hits, all allowed. Handoffs: 12 DONE / 14 DEFAULT / 8 KUNAL-ONLY / 2 N/A / 0 OTHER-OPEN | 2026-11-13T02:05Z–02:40Z | b7fa381 (product c95cd0c) | evidence/WO-67/B/ (see §G9 run 6) |
| WO-34 production (custom hosts) (WO-67 A) | PASS, 8/8 items, with tooling notes. (1) smoke-prod.sh: 43 ok, 0 failures, exit 0. That covers 28 app routes, 56 docs pages + 6 assets at the DOCS root, the host split, the status host, the docs 308s with the query kept, 5 legacy 308s with path + query kept, www → apex, and HSTS/CSP with no noindex on all 4 hosts. Note: the exact command exits 126 in a fresh clone because every *.sh file is git mode 100644. The run used a byte-identical +x copy. (2) Feed /health commit 3974b5b, and services/feed is unchanged up to c95cd0c. The web exposes no commit or build id. The docs bundle main.d34b8a10.js and the CSS are byte-identical to a local DOCS_URL build of the clone. (3) 4 hydrated loads of SITE / + STATUS / show 0 console, page or hydration errors. On the landing, 3 sentences name Base and all 3 say "local fork". (4) APP /borrow shows "Get test assets: connect a wallet first. Mock assets, no value". SITE (6 pages) and STATUS show 0 of it. (5) 6/6 wallets reach their prompt, 0 CSP violations. (6) Lighthouse: SITE / 100/100 and APP /borrow 100/100. The crawl --polite over the 4 hosts rendered 84 internal routes (site 15, app 10, status 1, docs 56; 56/56 sitemap URLs linked), all 200, with 0 of our console errors and 0 third-party failures. The script still exits 1 with 4 failures, and none of them is a product failure. 2 are relative `location` headers (APP / → /feed and STATUS /status → /) where the script expects an absolute URL; the target is the same. 1 is www → apex: production sends 308 (= F-456 and smoke-prod), but crawl-hosts.mjs:87 expects 301. 1 is Feed /health linked from the docs, which returned status 0 once; 8 re-probes, 5 with the crawler's own request shape, all answered 200 in 0.3–0.8 s. (7) CORS allows SITE, APP and STATUS and refuses evil.example.com (403 preflight). (8) oracle_age_s is 39,508, under 86,400. The refresher is not running: nectar.testnet has 1 FullAccess key and no update_owner_price key | 2026-11-13T02:05Z–02:40Z | c95cd0c (web dpl_Bm1uwQcXjHaUHWqizUzUiyq79vWm, docs dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE, Railway feed 3974b5b + deploy 8acfc7a5) | evidence/WO-67/A/, evidence/WO-67/A/probe/site-landing-hydrated.png (see §WO-34 production (custom hosts)) |
| G3b re-run 8b (WO-66b: (d), (k), (p) hydration, local only) | PASS, all 3 items. Since run 8, product code changed only in the crawler: `git diff --stat 31809b1 c95cd0c -- apps packages services contracts` lists exactly apps/web/scripts/crawl.mjs, crawl-hosts.mjs and crawl-hosts.test.mjs (3 files, +265/−31). docs/ui changed 1 line: the Console mockup's Reserve discount went from 4.00% to 6.00%. Runs 8 and 8b together cover c95cd0c. (d) Hosted `crawl.mjs --polite` with all five env vars on *.localhost exits 0. It found 83 internal URLs and rendered site 15, app 9, status 1 and docs 56 (all 56 sitemap URLs, 0 unlinked). Redirect checks 14/14, incl. SITE/APP/STATUS /docs/<rest> → DOCS/<rest>. **0 failures**, 0 of our console errors, 0 third-party failures. 29 bot-wall warnings: nearblocks 403 ×25, explorer.solana.com 429 ×3, solana.com 429 ×1. (k) The strict home-path grep finds **0 lines**, and the WO-62b log has 0 hits. (p) 40 plain loads (SITE / and STATUS /, 10× each, desktop + phone, networkidle + 2 s) show **0 hydration errors**, 0 console errors and 0 page errors. Supplements, not criteria: 80 parallel crawler-style loads, one fast (non-polite) crawl and a second set of 40 plain loads all show 0 hydration errors. React #418 did not reproduce | 2026-11-12T21:33Z–21:55Z | c95cd0c | evidence/G3b/verifier-rerun8b-20261112T2132Z/ (see §G3b re-run 8b) |
| G3b re-run 8 (release candidate, WO-66 (a)–(o), local only) | FAIL, 2 reasons. Neither is a product assertion. (d): `crawl.mjs --polite` exits 1 with 1 failure, and that failure is the crawler's own stale check. crawl.mjs:83 still expects the WO-34a 308 "SITE /docs/* → APP/docs/*". The release candidate answers 308 → DOCS_URL/security/audits, which is what WO-62b asks for and what hosts.spec checks. The crawler also treats only SITE + APP as internal, so with docs at the DOCS root it renders no docs page. My supplement covers this: 56 docs pages + 6 assets answer 200 at the root, and 112 Chrome loads show 0 problems. (k): evidence/WO-62b/hosts-spec-20261112T195948Z.log:20,42 contain a real macOS home path (a Playwright cache path). Every product assertion PASSES. (a) e2e 510/0/116, 0 flaky. (b) hosts.spec 11/11 incl. the browser check (system Chrome) + legacy old-site 1/1. (c) inventory 6/6, CSP 0 violations, 12 = 12 hosts. (e) LH 40/40 = 100. (f) prod build exit 0 and guard exit 1. (g) check-trace 0 ×2. (i), (j), (l) PASS. (m) claims 10 + test-assets 16, and the hand probe 20/20 against live views. (n) see the next row. (o) PASS. (h) not in this run (local only) | 2026-11-12T20:19Z–21:06Z | 31809b1 | evidence/G3b/verifier-rerun8-20261112T2019Z/, evidence/G3b/claims-how-20261112T2019Z.png (see §G3b re-run 8) |
| G11 delta (mock-ft), WO-66 (n) | PASS (host SDK env workaround, see block). `cargo test -p mock-ft`: 38 unit + sandbox_faucet 1/1 (code-only upgrade from tests/fixtures/mock-ft-deployed.wasm). The fixture equals archival view_code of both tokens at block 277406854. `cargo near build non-reproducible-wasm` sha256 e3d4ded5…6d14 = view_code of usdc-mock and nvdax-mock (view_account code_hash GLMp3W4J… = base58). faucet_config on both = config.yaml faucet. Tx 2A4jN155… is FINAL SuccessValue: borrower1 → nvdax-mock faucet_mint, ft_mint 5000000 to borrower1. `cargo test --workspace` 710/0: nectar-core 608 unit + 51 sandbox, mock-ft 39, test-stubs 12 | 2026-11-12T20:38Z–21:04Z | 31809b1 | evidence/G3b/verifier-rerun8-20261112T2019Z/n/ (see §G3b re-run 8 (n)) |
| G9 run 5c (step 3 on c194c8f) | PASS (step 3 only). Product code still equals release 3: `git diff --stat 5f011bb c194c8f -- apps packages services contracts` is empty. Since 88b99b3 only docs changed. README:153 no longer says "live oracle"; it now reads "oracle (G5: owner-oracle fallback, disclosed)", which matches §G5 FALLBACK. Every remaining "live" in README.md and docs/SUBMISSION.md is either backed by §G2b, §G4, §G7 or §G14 PASS, or is a negation or neutral use. docs/process/x-post.md has 0 hits. Pointers resolve to the newest blocks: §"WO-34 production" opens with release 3 PASS, §G3b with 7b PASS (7 + 7b), §G9 with 5b PASS (and now 5c). SUBMISSION's runs 5 + 5b cite (87be719, b945f42) is correct. Nothing contradicts STATE (~17:10Z entry). Notes, not counted: SUBMISSION.md:53 still cites G3b re-run 2 (dated); tag submission-rc (4b20f05) predates the 6d3e72f docs fix | 2026-11-12T17:20Z–17:24Z | c194c8f | evidence/G9/run5c-20261112T172003Z/checks.txt (see §G9 run 5c) |
| G9 run 5b (step 3 on 88b99b3) | PASS (step 3 only). This resolves the G9 run 5 step-3 FAIL. Product code equals release 3: `git diff --stat 5f011bb 88b99b3 -- apps packages services contracts` is empty, and services/feed is unchanged since 3974b5b. README lines 3, 11, 26 and 139 point to EVIDENCE §"WO-34 production". The newest block there is "WO-34 production (release 3)" PASS 5f011bb, and its deployments match STATE's "PRODUCTION = RELEASE 3" (web dpl_BJNxqx…, docs dpl_DQubre…, Feed 3974b5b). README lines 3, 52, 84 and 139 point to §G3b / §G9. The newest G3b block is re-run 7b PASS on 5f011bb (runs 7 + 7b cover release 3), and the newest G9 block is this one. Hosted URLs: SITE 200, SITE /borrow 308 → APP, APP / 307 → /feed, /feed /borrow /docs 200, Feed /health 200 with commit 3974b5b and events_indexed 0 (as README says), 1 docs Feed href (/health), 0 x-robots-tag. Nothing in SUBMISSION.md or docs/process/x-post.md contradicts EVIDENCE or STATE. One note, not counted: SUBMISSION.md:85 still cites G9 run 3 as "G9 today". G9 run 5 (every step except 3) and run 5b (step 3) together cover release 3 | 2026-11-12T17:02Z–17:05Z | 88b99b3 | evidence/G9/run5b-20261112T170216Z/ (pointers.txt, hosted.txt, scripts) |
| WO-34 production (release 3) | PASS, which resolves the WO-34v2 FAIL. (1) In hydrated Chrome (networkidle + 4 s), the landing #chains innerText equals the JS-off server render, and textContent matches too. Both read "NEAR holds the book. Solana holds the stock." The Base node is off, so the heading names no Base. Each of the 3 sentences that names Base says "local fork": the intro, step 03 and step 04. 0 Base sentences without it anywhere in the hydrated body; 0 console errors. (2) crawl --polite over SITE + APP incl. /docs/*: 90 internal routes, all 200; 0 of our console errors; 12 FastNEAR CORS/429 page loads (third party); 29 external-soft warnings (nearblocks 403, solana 429). The script exits 1 on 2 redirect assertions that are not links, both identical to WO-34v and classed script/N/A there: APP / 307 `location: /feed` is relative where the script expects an absolute URL to the same target; www.<site> has no certificate on *.vercel.app. (3) curl: 0 x-robots-tag on SITE /, APP /feed, APP /docs + 4 docs pages. The docs origin sends XFO DENY + frame-ancestors 'none'. Feed /health has history "unavailable", chain_head_source "view_block", rpc 4 endpoints with 0 failovers, and chain_head = last_indexed. CORS: SITE and APP allowed, evil.example.com refused with 403. The release-3 Feed hrefs go to /health (200). (4) Lighthouse a11y on the landing: dark 100 / light 100 | 2026-11-12T16:40Z–17:01Z | 5f011bb (web dpl_BJNxqxnSZQWHtiouXYeWknkScxtY, docs dpl_DQubre8taPieUo4EBshyyrRNVjcT, Railway feed 3974b5b) | evidence/WO-34/production-release3-5f011bb/, evidence/WO-34/production-release3-5f011bb/claims/chains-hydrated.png (see §WO-34 production (release 3)) |
| G9 run 5 (release 3, verifier B) | FAIL, 1 reason (step 3; the remedy is evidence only). README lines 3, 11 and 139 send the reader to EVIDENCE §"WO-34 production" for the deployed commit and acceptance result "for each production release". At 5dd2a50 that section's newest block is release 3974b5b (FAIL). docs/process/state.md says PRODUCTION = RELEASE 3 (~16:40Z), and EVIDENCE has no release 3 block (WO-34v3 not recorded). The pointer resolves, but it gives a superseded release. No README edit is needed: the claim holds once the WO-34v3 block lands. Every other step PASSES: quick start about 2 min (pnpm i 12 s, demo:testnet 4 s, verify 28 s, docs build 20 s; ui 7, feed 79, keeper 301, x402 41, sdk 203, web 27 + 1 skip, 0 failed). `pnpm --filter web dev` on :3100 gave 21 README routes 200 (/markets, /earn 404 as README says). gitleaks found no leaks in 466 commits. Hosted SITE/APP/DOCS/Feed answer and match STATE (Feed commit 3974b5b, CORS SITE+APP only). Feed MCP stdio + HTTP return 8 tools and live values = demo. The payload builds with tracks defi/security/agents, `website` absent and no privacy text. Headers present; the Chrome selector shows 6 wallets with 0 CSP messages. R2, SECURITY items 11/12 and the zod line match code and FACTS. Home-path grep: only the 6 fixture wasm files hold a home path. Handoffs 11 DONE / 13 DEFAULT / 7 KUNAL-ONLY / 3 N/A / 0 OTHER-OPEN | 2026-11-12T16:40Z–16:47Z | 5dd2a50 | evidence/G9/20261112T164011Z/ (see §G9 run 5) |
| G3b re-run 7b (d) on release 3 | PASS. (d) `crawl.mjs --polite` in hosted mode (docs via serve-docs.mjs) → exit 0: 88 internal, 45 external, 0 failures, 0 of our console errors. `pnpm --filter docs-site build` → exit 0. The docs build has 2 hrefs to the hosted Feed, both https://feed-production-2f2776c9.up.railway.app/health (feed-rest, monitoring); curl → 200 (bare origin control → 404). Release 3 differs from release 2 under apps/packages/services/contracts only in those 2 docs lines, so runs 7 (a)–(l) except (d) + 7b (d) together cover release 3 | 2026-11-12T16:14Z–16:31Z | 5f011bb | evidence/G3b/verifier-rerun7b-20261112T1614Z/ (see §G3b re-run 7b) |
| G3b re-run 7 (release 2, run-7 order) | FAIL, 1 reason (docs only): (d) crawl --polite exit 1 with 1 failure. /docs/integrate/feed-rest links to the hosted Feed root https://feed-production-2f2776c9.up.railway.app, which answers 404; /health answers 200. The link arrived in 1419028 (WO-35g docs), after run 6. All other items PASS. (l) WO-35i hydrated: v7.spec #chains 8/8 (desktop + phone). My hand probe in real Chrome on my own `next start` found the following. With config flags, the hydrated #chains text equals the server HTML on desktop and phone ("NEAR holds the book. Solana holds the stock."). The section has 3 sentences naming Base, and all 3 say "local fork". Each pinned flag set (none, solana_remote, base, both) has 0 Base sentences without "local fork". The LandingNav "Chains" link is present exactly when section#chains is. (a) site-pages 19+19, screens 46+46 incl. /docs. Full e2e: exit 0, 483 passed / 0 failed / 108 skipped / 1 flaky. The flaky test is phone remote.spec:199, a mocked flow: remote-authority took longer than 5 s, and the retry passed. (b) hosts 7/7. (c) inventory 6/6: CSP enforced, 0 violations, 6/6 wallets, 12 hosts = committed, all in privacy.md. (e) LH 20×2 = 40/40 at 100. (f) prod build exit 0; the build with the null operator gives exit 1 + the guard message. (g) check-trace exit 0 twice. (h) orchestrator-run, reviewed: web 28/0, /api/health ok, hydrated landing check PASS; docs 56 pages + 6 assets, 0 failures, 307 → /docs/, XFO DENY + frame-ancestors, theme toggle reaches both themes. nodejs22.x = the same deviation as runs 5/6. (i) PASS in both the raw HTML and the hydrated text. (j) feed 79/0, keeper 301/0; /health has chain_head_source, history, rpc; chain_head = last block. (k) PASS with a note: the only hit besides the 6 wasm fixtures is the order file's own `"/Users/"` pattern, with 0 home paths. Real selector 6/6 in viewport. Headers OK, `pnpm verify` exit 0, branding exit 0 | 2026-11-12T15:30Z–16:09Z | 4c2a0bb | evidence/G3b/verifier-rerun7-20261112T1530Z/, evidence/G3b/chains-hydrated-20261112T1530Z.png (see §G3b re-run 7) |
| WO-34 production (release 3974b5b) | FAIL, 1 reason: in hydrated Chrome the production landing https://nectarlabs.vercel.app/ never says "local fork". Base still appears in settle steps 03/04 ("secp256k1 (Base)", "Base checks EIP-712 with ecrecover"). The server HTML heading reads "A Base local fork holds the stock.", but after hydration it becomes "Solana holds the stock." All three previous FAILs now PASS: 0/56 APP /docs pages send x-robots-tag; the docs origin /docs/ sends XFO DENY + frame-ancestors 'none'; 0 localhost/127.0.0.1 hrefs in the 56 pages. Also PASS: host check (14 hosts, 12 third party, 0 missing on /legal/privacy, 12 keys, 0 missing on /legal/cookies, 6/6 wallets, 0 CSP violations), SITE/APP headers + redirects, Feed /health + CORS, no "0123456789", TEE verifiable, worked example 40/70 + 10/25, event-history banner on /feed and /keepers, LH landing 2/2 = 100 and docs 10/10 ≥ 90 (min 93). Not checked: crawl --polite (still running at commit time) | 2026-11-12T15:00Z–15:18Z | 3974b5b (web dpl_5YACVWKHkdB6RKZY788okPYRF7Uk, docs dpl_9SobCo6o34dpRvhgwpBnUqq8jjoj, Railway feed SRC_SHA 3974b5b) | evidence/WO-34/production-release-3974b5b/ (see §WO-34 production (release 3974b5b)) |
| WO-34 production | FAIL. 3 reasons: (1) production APP sends `x-robots-tag: noindex` on https://nectarlabs-app.vercel.app/docs and /docs/start/quick-start; (2) the public docs origin https://nectar-labs-docs-kunals-projects-35d3a237.vercel.app/docs/ answers 200 with no CSP, no X-Frame-Options and no frame-ancestors; (3) https://nectarlabs-app.vercel.app/docs/integrate/feed-rest links to http://127.0.0.1:8788/. PASS: crawl (90 internal 200, 0 of our console errors, no failures in re-run 2 other than script/N/A items), redirects 308/308/307, LH 162/162 ≥ 90 (min 93), host check 12 third-party hosts all on /legal/privacy, 12 storage keys all on /legal/cookies, 0 cookies, SITE/APP headers, Feed health/CORS/MCP, wallet selector 6/6 rows clickable at 1440 and 400. N/A: www, preview noindex, x402, Node runtime log. Not checked: per-route screenshots | 2026-11-12T13:38Z–14:45Z | ca34111 (deployed; web dpl_6yqaQJPFBGYmM8e2Veofgr32BpRw, docs dpl_BtPA8juRKQKGfJbTkkYNEJzTwNNX) | evidence/WO-34/production-20261112/ (see §WO-34 production) |
| G0 toolchain + facts | PASS | 2026-11-09T23:09Z | b3a9090 | evidence/G0/verifier-20261109T230923Z/ (re-record: F-181/F-182/F-183 now record installed rustc/cargo 1.95.0 and node v22.23.4; network probes reused from verifier-20261109T230153Z; anchor/solana absent = P2 dependency H-TOOLCHAIN-SOLANA; prior FAIL 23:01Z 90af048: see §G0) |
| G1 contract tests | PASS | 2026-11-09T20:43Z | b721641 | evidence/G1/verifier-20261109T2043Z.log, evidence/G1/verifier-gas-20261109T2043Z.csv (prior FAIL 20:33Z, 3bc0de8: see §G1 history) |
| G2 testnet deploy | PASS | 2026-11-09T20:55Z | 5f27f44 | evidence/G2/verifier-20261109T2055Z.log (explorer pages returned HTTP 403 to WebFetch; see §G2) |
| G3 web E2E | PASS | 2026-11-09T21:15Z | 176914f | evidence/G3/verifier-20261109T2115Z/ (e2e 112 pass / 0 fail / 2 skip = write spec; LH 12/12 = 100; write flow cited from 20:57Z run, not repeated; prior FAIL 20:57Z c940dec: see §G3) |
| G4 OutLayer | PASS | 2026-11-09T22:10Z | d87eef6 | evidence/G4/verifier-20261109T2210Z/ (attestation via testnet-api.outlayer.ai/attestations/by-request/15114, TDX quote present, not verified; gates.md get_settlement view missing, criterion checked from events; fills = max until WO-10b) |
| G5 oracle | FALLBACK (disclosed) | 2026-11-09T22:55Z | 706d940 | evidence/G5/verifier-20261109T2254Z/ (no live Pyth price: pyth-oracle.testnet NVDA → null, Hermes 401, H13 key absent; nectar-core source = Owner; Pyth defences tested: unit 157/0 + sandbox 5/0 + sandbox_p1 4/0; gates.md filter `oracle_rejects` matches 0 tests; README $180 vs on-chain $112; see §G5) |
| G6 1Click depth | PASS | 2026-11-09T22:58Z | fea52b7 | evidence/G6/verifier-20261109T224955Z/ (re-run after FAIL at 578b006: 3-size live dry quotes verify, impact from base units, no amountIn/OutUsd use; GET /api/oneclick fixture + live match shape; /feed panel and NVDAx route status come from the API; web e2e 128 passed / 0 failed; see §G6) |
| G7 Solana + signer (v7) | PASS — release + settle round trip verified from both chains (read-only) | 2026-11-10T16:45Z–16:52Z | 91db9ea | evidence/G7/verifier-v7-20261110T1645Z/ (a) pos 2/3 stored authority == live derived_public_key (HRf3…/APU8…); (b) confirm txs 8XXv…/8hNq… source outlayer, trigger HrpQ… execution_completed + quoter_result + settlement_signed, 0 failed receipts; (c) devnet 5fTi… (Release) + 3cdc… (Settle) finalized err null, ix0 Ed25519SigVerify (pubkey = authority, msg = NEAR preimage) → ix1 ENZa…; PDAs FDUb…/E26i… null; recipient 2.54598, depositor 7.45402; (d) both sigs valid off-chain, 2 negative controls false; explorers: nearblocks 403, solana explorer 429; see §G7) |
| G7 Solana + signer (v6) | PARTIAL — superseded by G7 (v7) above | 2026-11-09T23:57Z | 97382fd | evidence/G7/verifier-20261109T2357Z/ (both gates.md commands fail: anchor absent, solana/ empty, no keeper test:settle-devnet script = H-TOOLCHAIN-SOLANA; NEAR side: trigger tx FCtApD2… → v1.signer-prod.testnet sign (payload_v2 Eddsa, domain_id 1) → SignatureResponse Ed25519 → settlement_signed; preimage event == get_pending_settlement; Ed25519 sig valid vs derived_public_key == config authority; tampered preimage → invalid; rebuild code hash == on-chain CFTfzY4…; cargo test 210/0 incl. sandbox_p2 3/0 + golden vectors; program id PLACEHOLDER, recipient throwaway, #6 stays Settling; see §G7) |
| G8 copilot | PASS (fixture) (re-run; earlier FAIL 2b49f42 was docs wording) | 2026-11-09T23:56Z | df4706f | evidence/G8/verifier-20261109T235453Z/ (fixture 10 pass / 0 fail / 1 skip = live; --live without key exit 1; e2e copilot 4/4 with exact "Key missing" banner; README/docs-site say built, no live answer verified, fixture = Phala sample + throwaway key; panel says browser vs server checks; live round trip not performed: H7 key absent, /v1/models HTTP 500) |
| G1 (v7 additions) | PASS | 2026-11-10T13:34Z–14:05Z | 09c4316 | evidence/G1/verifier-v7-20261110T1334Z/ (unit 318/0, sandbox 5/0, sandbox_p1 5/0, sandbox_p2 3/0, sandbox_v7 4/0, mock-ft 17/0, model.csv OK 87 rows; all 9 v7.rs methods gas-measured, max 8.93 Tgas; 10 owner setters (2 remote.rs, 8 p1/p2) lack a gas row, G11 scope, see §G1) |
| G10 v7 facts + toolchain | PASS with open items (F-351, F-352, F-353) | 2026-11-10T13:44Z | 09c4316 | evidence/G10/verifier-20261110T1334Z/g10.log (FACTS F-328/329/337/338/339/340–361 present; calendar source+retrieved; solana 2.3.0 / anchor 0.32.1 / forge 1.9.0 == F-340/F-341/F-343; live derived_public_key == F-338) |
| G7 prep (not G7) | RECORDED: vault deployed + 25 anchor tests | 2026-11-10T13:44Z | 09c4316 | evidence/G7/prep-verifier-20261110T1334Z/ (program ENZa… on devnet, vault PDA HGSF… owned by it; test:unit 7/0, test:anchor 25/0; G7 stays pending: needs v2 on testnet) |
| G11 v7 contract (re-run after D-027) | PASS — 608 unit + 50 sandbox + mock-ft 23 green; wasm hash = deployed 2.2.1-v7; max receipt 67.69 Tgas; every SR-1…33 has an sr-named test | 2026-11-11T08:02Z–08:20Z | 3ab3026 | evidence/G11/verifier-rerun-d027-20261111T0802Z/ (forge 105/0/3, Solana 10 cargo + 55 TS, keeper 293, x402 17, feed 63, sdk 178) |
| G11 v7 contract | PASS with open item (F-352) — re-run after WO-23c; prior FAIL block kept | 2026-11-10T15:47Z–16:12Z | 53f1e63 | evidence/G11/verifier-rerun-20261110T1547Z/ (unit 453/0 incl. tests_p2::deposit_forged_authority_refused, sandbox 5+5+4+2+9+4 = 29/0, mock-ft 17/0, model --v7 OK 132 rows; 81 v7_* + 103 tests_v7/v7b; wasm 734784 B sha256 252a6abe… (unchanged); set_shield_params 2.67 / set_job_config 2.57 Tgas; every non-private change method gas-measured, max 68.94 Tgas; see §G11) |
| G2b testnet deploy v2 | PASS (re-run after WO-16b; prior FAIL block kept) | 2026-11-10T16:45Z–16:52Z | 91db9ea | evidence/G2b/verifier-rerun-20261110T1645Z/ (pnpm i exit 0; pnpm verify exit 0: keeper 168/0, feed 57/0, x402 9/0, sdk 77/0 + lint/typecheck; demo:testnet exit 0; code_hash 3W5bif…31ey unchanged, contract_version 2.0.0-v7; live state 3 quotes / 4 positions (#2,#3 Closed = G7 v2, expected); see §G2b) |
| G2b (first run) | FAIL — superseded by re-run above | 2026-11-10T16:34Z–16:45Z | 1c4cdb3 | evidence/G2b/verifier-20261110T163415Z/ (rebuild sha256 252a6abe… == view_code == code_hash 3W5bif…; keeper-v2 one FC key, 5 methods; views OK; calendar 287; demo:testnet exit 0; live state drifted to 3 quotes / 3 positions during run (concurrent G7 v2 work); nearblocks 403; see §G2b) |
| G14 x402 | PASS (1–2 hold; F-328 keys hold) | 2026-11-10T16:48Z–16:52Z | 91db9ea (clone; tests) / 6ba1b09 (summary) | evidence/G14/verifier-20261110T1645Z/ (borrow tx GcHF… agent1 → nvdax-mock ft_transfer_call → v2 position_opened #4 $10, fee $0.03; relay tx 5VL1… signer x402-relayer, Delegate by agent1 (pk 3zyEty…) → usdc-mock ft_transfer 10000 → nectar.testnet, 0 failed receipts; no ft_transfer event log (mock-ft emits none) — transfer proven by the receipt; agent1 + x402-relayer each 1 FullAccess key; x402 test 9/0; rpc.testnet.near.org returned -429 deprecation, fastnear used; see §G14) |
| G9 run 4 (release, verifier B) | FAIL on one docs-only reason. Step 3: README lines 3 and 11 name ca34111 as the production deploy, but STATE says production = release 3974b5b. README lines 25–26 and 139 say WO-34v is "not in docs/EVIDENCE.md yet", but EVIDENCE has §WO-34v FAIL (ca34111). Every other step PASSES: quick start about 4.3 min (pnpm i 11 s, demo:testnet 4 s, verify 31 s, docs build 19 s; ui 7, feed 79, keeper 301, x402 41, sdk 203, web 27 of 28, 0 failed); 21 routes 200; gitleaks over 443 commits found no leaks; hosted SITE/APP/DOCS/Feed answer and match STATE; Feed MCP stdio + HTTP serve live data; payload builds with tracks defi/security/agents and `website` absent; headers present and the Chrome wallet selector shows 6 wallets with 0 CSP messages; R2 fixes, the SECURITY.md items 11/12 and the zod line match code and FACTS; handoffs 11 DONE / 12 DEFAULT / 7 KUNAL-ONLY / 0 OTHER-OPEN | 2026-11-12T15:00Z–15:10Z | 1f28a2f | evidence/G9/20261112T150002Z/ (see §G9 run 4) |
| G3b re-run 6 (FROZEN commit, run-6 order) | PASS with one disclosed deviation, the same as in run 5: nodejs22.x cannot be seen on the preview, and it is pinned by engines `>=22.22.2 <23`. One full e2e run: exit 0, 476 passed / 0 failed / 108 skipped / 0 flaky (desktop 265, phone 211). The run-5 shell.spec flake is gone because the allowlist now includes TESTNET_RPC_FALLBACKS. (a) site-pages 19+19 and screens 46+46 incl. /docs; (b) hosts.spec 7/7 incl. the /docs proxy; (c) inventory 6/6, CSP enforced, 0 violations, 6/6 wallets reached the prompt (none signed), 12 hosts = committed json, all in backticks in privacy.md; (d) crawl --polite exit 0: 89 internal + 45 external, 0 failures, 0 of our console errors, 0 third-party failures; (e) LH 20 routes × 2 themes = 40/40 at 100; (f) prod build exit 0; with site.operator nulled, exit 1 + guard message; (g) check-trace exit 0 after the local and the prod build; (h) orchestrator-run, reviewed: web 28 routes / 0 failures, /api/health ok:true, docs 56 pages + 6 assets / 0 failures, root 307 → /docs/ → 200, hydrated, theme toggle reaches both values, 0 console errors; nodejs22.x = deviation; (i) landing: no 0123456789, Base "local fork", 5/5 TEE lines verifiable and none private/confidential, no "until the Reserve ships", worked example 40%/70% LTV, 10%/25% haircut = config.yaml. Banner shown with a views-mode Feed (/feed, /keepers, /status) and absent without one; (j) feed 79/0 + keeper 301/0; /health has chain_head_source, history "unavailable", rpc{…}; chain_head 277375290 = last block, ≤ RPC final 277375294; (k) the home-path grep lists only the 6 contracts/nectar-core/tests/fixtures/*.wasm files. Real selector: 6/6 rows in the viewport, centre hit inside each, banner shown before connect. Headers XFO DENY, HSTS, CSP frame-ancestors 'none'. `pnpm verify` exit 0, branding exit 0 | 2026-11-12T14:13Z–14:58Z | 3126773 | evidence/G3b/verifier-rerun6-20261112T1413Z/, evidence/G3b/selector-phone-20261112T1413Z.png (see §G3b re-run 6) |
| G3b re-run 5 (code-final commit, run-5 order) | PASS with one disclosed deviation. (a)–(g) PASS. (h) PASS with deviation after the 13:29Z re-review, orchestrator-run and reviewed. Docs smoke: 56 pages + 6 assets, 0 failures. Theme toggle dark→light→dark→light, 0 console errors. The deviation: nodejs22.x does not appear in the preview runtime logs because they are empty; it is accepted on the engines pin `>=22.22.2 <23` (F-432) and re-checked in WO-34v. Full e2e twice, both exit 0 with 0 failed: run 1 475 passed / 0 failed / 108 skipped / 1 flaky; run 2 472 / 0 / 108 / 4 flaky. All 5 flaky = phone shell.spec:10 "no external requests except RPC before consent". The first attempt saw near-testnet.drpc.org, which is the WO-34g RPC fallback, and the retry passed. Spec gap, follow-up, non-blocking: the shell.spec:16 allowlist accepts only *.fastnear.com. Not a product defect. (a) site-pages 19/19 desktop + 19/19 phone (follows the filled site.*), screens.spec 46/46 + 46/46; (b) hosts.spec 7/7 incl. the WO-34t /docs proxy (E2E_DOCS=1, serve-docs); (c) inventory 6/6, CSP enforced, 0 violations, 6/6 wallets opened (no signing), 12 third-party hosts = committed json, all in backticks in privacy.md; (d) crawl --polite exit 0: 89 internal + 45 external, 0 failures, 0 of our console errors (12 page loads hit FastNEAR 429s, listed as third-party); (e) LH 20 routes × 2 themes = 40/40 at 100; (f) NECTAR_PRODUCTION=1 build with operator filled exit 0, with site.operator nulled exit 1 + guard message (both PASS); (g) check-trace 6/6 exit 0 (after the local build and after the prod build); real selector 6/6 rows in viewport, centre hit inside, banner shown before connect; headers XFO DENY, HSTS, CSP frame-ancestors 'none'; `pnpm verify` exit 0; branding exit 0 | 2026-11-12T10:41Z–11:40Z | ca34111 | evidence/G3b/verifier-rerun5-20261112T1041Z/, evidence/G3b/selector-phone-20261112T1041Z.png (see §G3b re-run 5) |
| G3b re-run 4 (final commit, after WO-34g) | PASS — resolves GATE_FAIL_G3B_R3. Full e2e twice, both exit 0: run 1 476 passed / 0 failed / 106 skipped, 0 flaky (desktop 265/0/23, phone 211/0/77, inventory 6 opt-in skips); run 2 476 / 0 / 106, 0 flaky, no retries in either log. testnet.spec:17 /api/health ✓ and live-views ×3 ✓ on desktop in both runs. (a) site-pages 38/38; screens.spec 46/46 desktop + 46/46 phone; (b) hosts.spec 6/6; (c) inventory 6/6, CSP enforced, 0 violations, 6/6 wallets opened (no signing); measured 14 hosts (12 third-party) = committed data-inventory.json, all 12 in backticks in privacy.md (dRPC reached on 3 pages; Intear declared, not reached); (d) crawl --polite exit 0: 89 internal + 44 external, 0 failures, 0 of our console errors; (e) LH 20 routes × 2 themes = 40/40 at 100; (f) NECTAR_PRODUCTION=1 build refused (operator/country/contact null): guard PASS; real selector 6/6 rows in viewport, centre hit inside, no banner overlap (desktop + phone); headers XFO DENY, HSTS, CSP frame-ancestors 'none', connect-src lists the 4 RPC hosts; `pnpm verify` exit 0; branding exit 0 | 2026-11-11T23:00Z–23:40Z | fd06e11 | evidence/G3/verifier-20261111T2300Z/, evidence/G3b/selector-phone-20261111T2300Z.png (see §G3b re-run 4) |
| G3b re-run 3 (final commit, WO-34 additions) | FAIL — strict criterion "0 failed in the full e2e" missed. Run 1: 475 passed / 1 failed / 106 skipped (desktop testnet.spec:15 /api/health ok:false, both FastNEAR RPCs answered "Rate limits exceeded"; phone same test ✓). Run 2: 472 / 1 / 106, 3 flaky (desktop live-views.spec:29 list_quotes RPC -429). Every failure is a public-RPC -429; no product assertion failed. All other items PASS: (a) site-pages.spec 38/38, /docs explainer ✓ (shell + screens, both themes); screens.spec 46/46 desktop + 46/46 phone; (b) hosts.spec 6/6; (c) inventory 6/6, CSP enforced, 0 violations, 6/6 wallets opened (no signing), 10 third-party hosts = committed data-inventory.json, all 10 in backticks in privacy.md; (d) crawl --polite exit 0: 89 internal + 44 external, 0 failures, 0 of our console errors; (e) LH 20 routes × 2 themes = 40/40 at 100; (f) NECTAR_PRODUCTION=1 build refused (operator/country/contact null): guard PASS; real selector: 6/6 wallet rows in viewport and unobstructed on desktop and phone; headers XFO DENY, HSTS, CSP frame-ancestors 'none'; `pnpm verify` exit 0; branding exit 0 | 2026-11-11T21:44Z–22:29Z | d4218d4 | evidence/G3/verifier-20261111T2144Z/, evidence/G3b/selector-phone-20261111T2144Z.png (see §G3b re-run 3) |
| G3b web E2E (re-run 2, after WO-49, WO-50) | PASS — supersedes the WO-48 FAIL row below. e2e exit 0: 404 passed / 0 failed / 88 skipped, 0 flaky (desktop 229/0/17, phone 175/0/71); screens.spec 38/38 desktop + 38/38 phone (76 screenshots); screens.spec + playwright.config unchanged since 3107a1a. LH 28/28 = 100 (14 routes × dark/light; a11y min dark 100, light 100). curl -sI: XFO DENY, HSTS, CSP frame-ancestors 'none'. `pnpm verify` exit 0; `node scripts/check-no-branding-all.mjs` exit 0 | 2026-11-11T17:26Z–17:44Z | fd6592d (⊇ a2387b5) | evidence/G3/verifier-20261111T1726Z/ (see §G3b WO-50) |
| G3b web E2E (re-run after review 2 web fixes, WO-48) | FAIL — e2e exit 1: 362 passed / 40 failed / 86 skipped, 0 flaky (desktop 199/28/17, phone 163/12/69); all 40 = screens.spec `waitForLoadState("networkidle")` 60 s timeouts (footer "Status" `/api/health` link gets an RSC prefetch that never completes). LH 28/28 = 100 (14 routes × dark/light; a11y min dark 100, light 100). curl -sI: X-Frame-Options DENY, HSTS max-age=63072000; includeSubDomains, CSP frame-ancestors 'none' | 2026-11-11T15:30Z–17:01Z | 3107a1a | evidence/G3/verifier-20261111T1530Z/ (see §G3b WO-48) |
| G3b web E2E (re-run after D-027 + design port) | PASS — e2e 392/0/82 exit 0; LH 22/22 ≥ 90 (21×100, home-light 97); 400 px no h-scroll 22/22 | 2026-11-11T08:08Z–08:24Z | 3ab3026 | evidence/G3b/verifier-rerun-d027-20261111T0802Z/ |
| G3b web E2E (v2) | PASS (re-run after WO-26f; prior FAIL block kept) | 2026-11-10T17:39Z–17:48Z | 0ed567f | evidence/G3b/verifier-rerun-20261110T1740Z/ (e2e exit 0: 244 passed / 0 failed / 18 skipped, 0 flaky; write spec ×2 skipped, no key; LH a11y 20/20 = 100 on 10 routes × 2 themes; 400 px no-scroll; /api/feed live (as_of = request time, age_s 0, matches RPC get_exit_capacity); /feed 0 5xx, 0 console errors without NEXT_PUBLIC_FEED_URL; see §G3b) |
| G3b (first run) | FAIL — superseded by re-run above; e2e 214/14/18 (7 flags-off/v1 specs × 2 projects); LH 20/20 ≥ 90; live v2 data OK | 2026-11-10T16:56Z–17:25Z | 2bf99e1 | evidence/G3b/verifier-20261110T1656Z/ (failing specs listed in §G3b; write spec skipped, no key; /notes list needs wallet) |
| v7 module runs | PASS (Profit-Lock state only; self_settled tx hash not recorded) | 2026-11-10T17:20Z | 2bf99e1 | §v7 module runs (pos 0 Closed, quote 1 −$4,522.50; reserve r 10,000,000, r-NVDAx-0 → buyer2; shield pos 5 Weekend 15 bps) |
| G12 Base toolchain + collateral | PASS — local fork of Base Sepolia (D-026), not Base Sepolia; scripts/06 + 26 NOT RUN by verifier; real Base Sepolia deploy pending H15 | 2026-11-10T18:03Z–18:04Z | 7bface5 | evidence/G12/verifier-20261110T180307Z/ (forge test 74 pass / 0 fail / 1 skip = test_createB20_localPrecompiles "B20 precompiles absent"; local fork of Base Sepolia (D-026) chain-id 84532; vault/MockB20/registry have code on the local fork of Base Sepolia (D-026); createB20 eth_call re-run on real Base Sepolia: no revert from 0x…dEaD and 0x1111…; no explorer for a local fork; see §G12) |
| G13 Base round trip | PASS — local fork of Base Sepolia (D-026), not Base Sepolia; ERC-8021 suffix not appended (D-026/H19); Solana-domain revert via forge tests only | 2026-11-10T18:03Z–18:05Z | 7bface5 | evidence/G13/verifier-20261110T180307Z/ ((a) authority pos 6/7 == last20(keccak(x‖y)) of live derived_public_key domain 0; (b) relay txs 0x759a…694b / 0x20d1…e4bb status 1 on the local fork of Base Sepolia (D-026), to vault, release/settle selectors, vault hashRelease/hashSettle == NEAR digest, ecrecover 0x01 == authority; (c) positions(6) status 3 Released, positions(7) status 2 Settled, buyer1 2357389, borrower1 7642611; (d) replay → NonceUsed(2) / NonceUsed(6); (e) NEAR pos 6/7 Closed, contract_version 2.1.0-v7; see §G13) |
| G2b testnet deploy v2 (after D-027) | PASS — supersedes the 16:45Z row as current state; open item: rebuild needed SDKROOT=MacOSX26.5.sdk on this host | 2026-11-11T08:02Z–08:25Z | 3ab3026 | evidence/G2b/verifier-20261111T080154Z/ (contract_version 2.2.1-v7; rebuilt wasm sha256 2938ebf8… == view_code, byte-identical, code_hash 3mv4LRm6…; keeper-v2 one FC key, 5 methods, receiver core-v2; get_config, get_exit_capacity, list_quotes {symbol} 5, get_remote_chains {symbol} solana ENZa… + base 0xC64b…, get_quoter_config pin 5f9bb287…; see §G2b) |
| G7 Solana + signer (re-run after D-027) | PASS — read-only, both chains | 2026-11-11T08:02Z–08:25Z | 3ab3026 | evidence/G7/verifier-20261111T080154Z/ (pos 8/9/10 authority == live derived_public_key domain 1; confirm txs source "outlayer", funded false/true/true, pos 8 refused aggregate_limit + refund; 3 Solana txs finalized, ix0 Ed25519 → ix1 vault, pubkey == authority, sig valid, tampered msg invalid; ProgramData 426,837 B = 45 B header + 426,792 B ELF; recipient +2.386856, depositor withdrew 3 / 3 / 0.613144; PDAs closed; NEAR Closed; see §G7) |
| G13 Base round trip (re-run after D-027) | PASS — local fork of Base Sepolia (D-026), not Base Sepolia; earlier caveats (ERC-8021, Solana-domain revert in forge only) stand, not re-checked | 2026-11-11T08:02Z–08:25Z | 3ab3026 | evidence/G13/verifier-20261111T080154Z/ (pos 11/12 authority == keccak addr of derived key domain 0; relay txs 0x12f5…0cd5 / 0xa2fe…c648 status 1; hashRelease/hashSettle == NEAR digest; ecrecover == authority; positionOf 3 / 2; borrower1 7→10→7.642611, buyer1 +2.357389; replay → NonceUsed(10) / NonceUsed(14); nonceUsed[slotKey] true; see §G13) |
| G14 x402 (re-run on HEAD; demo agent verifies the MCP borrow call before signing) | PASS — own x402 server from the clone on :8891: unpaid GET → 402 (near:testnet, usdc-mock, 10000, payTo nectar.testnet); demo exit 0: borrow_verified → borrow E2suM2LC… → core-v2 position_opened #15 $10, fee $0.03, 10 receipts 0 failed; relay 4vW2tPF5… x402-relayer → Delegate agent1 → usdc-mock ft_transfer {nectar.testnet, 10000}, 4 receipts 0 failed; 200 + 123 CSV rows (= free upstream); treasury 30000 → 40000; x402 test 34/0 | 2026-11-11T15:02Z–15:25Z (demo 15:02:29Z–15:02:48Z) | 48b5c5a | evidence/G14/verifier-20261111T145956Z/ (see §G14; agent1 now holds 0 mock NVDAx) |
| G14 x402 (re-run after D-027) | PASS — chain claims (08:02Z) + 402 → 200 verifier-run 2026-11-11T13:54Z–13:55Z: own x402 server from the clone on :8891, unpaid GET → 402 (near:testnet, usdc-mock, 10000, payTo nectar.testnet), paid → 200 CSV 110 rows | 2026-11-11T08:02Z–08:25Z; 13:52Z–14:18Z | 3ab3026; 45ed1f3 (402 → 200) | evidence/G14/verifier-20261111T080154Z/ (borrow HvFX6… #13, relay BemztvL…); evidence/G14/verifier-20261111T135216Z/ (borrow 7UFpexpd… agent1 → nvdax-mock ft_transfer_call → core-v2 position_opened #14 $10, fee $0.03, 10 receipts 0 failed; relay EskZKj9s… signer x402-relayer → Delegate agent1 (pk 3zyEty…) → usdc-mock ft_transfer {nectar.testnet, 10000}, 4 receipts 0 failed; treasury usdc 20000 → 30000; see §G14) |
| G1 (2.2.1 gas rows) | PASS (re-check after WO-45; prior FAIL 13:53Z at 45ed1f3 kept in §G1) — 67 of 67 non-private change methods have a GAS row, 0 rows ≥ 100 Tgas (max tx-total 78.60, max receipt 67.61); remove_extra_remote_chain 2.64, update_owner_price(oracle_rejected) 2.61; 608 unit + 51 sandbox, 0 failed; no contracts/*/src change since 2.2.1 (4a67bd6); tested wasm = deployed code_hash 3mv4LRm6… | 2026-11-11T15:01Z–15:25Z | 48b5c5a | evidence/G1/verifier-221b-20261111T145956Z/ (method-gas-diff.tsv, gas-summary.txt, wasm-vs-deployed.txt, src-unchanged.txt; see §G1) |
| G9 run 3 (after review 2) | PASS — quick start about 2.3 min (pnpm i 13 s, demo:testnet 5 s, verify 36 s, docs build 25 s; all exit 0; ui 7, feed 63, keeper 293, x402 34, 0 failed); gitleaks 305 commits, no leaks; R2-03/04/05/06/09/11 present in code; no "never joined to IPs" / "instead of being published"; GA "not configured"; `next start` sends X-Frame-Options DENY, HSTS, CSP frame-ancestors 'none'; Chrome wallet selector opens with 6 entries, 0 CSP console messages; Feed MCP stdio + HTTP live (own ports); ids answer on RPC; payload builds with `website` absent; handoffs 5 DONE / 13 DEFAULT / 8 KUNAL-ONLY / 0 OTHER-OPEN | 2026-11-11T15:30Z–15:38Z | 3107a1a | evidence/G9/20261111T153057Z/ (see §G9 run 3) |
| G9 fresh-clone rehearsal (re-run after WO-38) | PASS — quick start under 2 min; demo:testnet, verify (ui 7, feed 63, keeper 293, x402 17, sdk 178; 0 failed), verify:quick (repo-wide branding check first), docs build and gitleaks (272 commits, no leaks) all exit 0; no "hackathon" in the product sources, the built docs site or search-index.json; 21 README routes 200; Feed MCP stdio + HTTP live; no unbacked claim; payload builds with `website` absent | 2026-11-11T08:57Z–09:00Z | 0af5cdd | evidence/G9/20261111T085721Z/ (see §G9 re-run) |
| G9 (first run) | FAIL — superseded by the re-run above; one copy-rule breach: docs-site page Project › Evidence (`apps/docs-site/docs/project/evidence.md:11`, built to /project/evidence) says "built for the NEAR Hackathon". Everything else passed: quick start in about 3 min, demo:testnet / verify / docs build / gitleaks (268 commits) exit 0, Feed MCP stdio + HTTP live with no env, ids answer on RPC | 2026-11-11T08:43Z–08:50Z | c5f6349 | evidence/G9/20261111T084317Z/ (see §G9) |

Log notes: 2026-11-12: absolute home-directory paths in evidence logs replaced by `~/` at Kunal's request; no other content changed.

Block format (one per run, newest first within a gate):

```
### G2 — testnet deploy — PASS — 2026-11-10T19:42Z — commit 3f9c1a2
$ scripts/20-deploy-testnet.sh
... (≤ 40 lines)
Explorer: https://testnet.nearblocks.io/address/nectar-core.nectar.testnet  (opened: shows contract code hash …)
Views: get_collateral → {...}
Notes: faucet rate-limited once; retried after 90 s.
```

## WO-35 after-close takes (2026-11-13 21:00–21:16Z)

- Run: verifier, WO-96, base deefdda. This is a read-only review: no builds, no tests, no product change. I had not seen the edit before.
- Inputs (read-only, in the demo media folder outside the repo): `demo/weekend/` nectar-demo.mp4 (1080p master, 88.23 s),
  nectar-demo-captions.mp4, shotlist.md, nectar-demo.srt; `raw/take-a/txs.json` and `raw/take-b/txs.json`.
- **Session closed:** shotlist.md and take-a/txs.json say `get_exit_capacity` NVDAx at block 277562411 (21:00:36Z) returned
  `session_open: false`, `session_reason: outside_hours`, owner oracle $135.00 and headroom $2,537.92. I did NOT RE-CHECK this view.
  The video agrees: "Weekend parameters" badge, "Weekend parameters are on" card, oracle $135.00, free to borrow $2,537, haircut 25 %.
- **Tx check:** one script, `EXPERIMENTAL_tx_status` on rpc.testnet.near.org, calls 2.5 s apart, no 429s.
  Log: evidence/WO-35/weekend-txcheck-20261113T213157Z.log.

Take A (recorded 21:00:50Z–21:03:59Z, used in the edit):

| Step | Tx | Signer → receiver, method | Status | Events |
| --- | --- | --- | --- | --- |
| s2 faucet NVDAx | [35FK4ZjN…](https://testnet.nearblocks.io/txns/35FK4ZjNSeReYvzUNdEfsE5xdjsLUfGknomdFto27qG8) | demo → nvdax-mock, faucet_mint | SuccessValue | ft_mint |
| s2 faucet USDC | [G68Lvp41…](https://testnet.nearblocks.io/txns/G68Lvp41UADX1MS5ABefhcSVbEsEJEZZ3oWZsNTQSMCf) | demo → usdc-mock, faucet_mint | SuccessValue | ft_mint |
| s3 borrow | [9uwAk6Vy…](https://testnet.nearblocks.io/txns/9uwAk6Vyun9s2bi2wu1a7H5er3pRLpuVN3HYgYvsEfni) | demo → nvdax-mock, ft_transfer_call | SuccessValue | shield_opened (#22, Weekend, fee_bps 15, fee_usd_e6 150000, window_end_ns 1794839400000000000 = 2026-11-16 14:30Z); position_opened (#22, units 5000000, debt_usd_e6 100000000, premium 150000, origination 300000, net 99550000); nft_mint |
| s5 agent borrow | [8QrZ9cSX…](https://testnet.nearblocks.io/txns/8QrZ9cSXJ8twiZa1qCAN11TXkmg1d8n1oDF2RqrJqiek) | agent1 → nvdax-mock, ft_transfer_call | SuccessValue | position_opened (#23, units 1000000, debt 10000000, premium 0, origination 30000, net 9970000); nft_mint |
| s5 x402 payment | [AJ1Tf7f3…](https://testnet.nearblocks.io/txns/AJ1Tf7f3iNtGmS17oGdSGMfmcX5WF3YSHGkj9XGvks7w) | x402-relayer.nectar.testnet → agent1, Delegate (NEP-366): ft_transfer on usdc-mock by agent1 | SuccessValue | none (the mock FT emits no events). The HTTP 402 → 200 is only in the terminal log in the video, 1:15 |

Take B (recorded 21:05:40Z–21:15:29Z, backup, not used in the edit):

| Step | Tx | Signer → receiver, method | Status | Events / note |
| --- | --- | --- | --- | --- |
| off-camera owner mint 5 NVDAx | [4PL3GhLt…](https://testnet.nearblocks.io/txns/4PL3GhLtoEC9U4SSCYa9D9ueUVkFLoqqLx78GHNtadpn) | nectar.testnet → nvdax-mock, mint | SuccessValue | none |
| off-camera oracle refresh | [4ZpoqRuD…](https://testnet.nearblocks.io/txns/4ZpoqRuDVoA35sKXGnZEa9sRgP1LVgdfrLnACoBgSUj5) | nectar.testnet → nectar-core-v2, update_owner_price | SuccessValue | oracle_updated |
| s2 | n/a | skipped: the demo faucet cap was reached (15 NVDAx claimed) | n/a | n/a |
| s3 borrow | [475VLHwE…](https://testnet.nearblocks.io/txns/475VLHwE9Nvkgq2kc15NWVQJLDyLmvcyD2Y2fNAURF1W) | demo → nvdax-mock, ft_transfer_call | SuccessValue | shield_opened (#24, Weekend, 15 bps, 150000); position_opened (#24, debt 100000000, net 99550000); nft_mint |
| s5 attempt 1 | [EKKyuLng…](https://testnet.nearblocks.io/txns/EKKyuLngYHqFKYvkbUgpzknSJ67P4CfVgeAkRPiMhrqV) | agent1 → nvdax-mock, ft_transfer_call | SuccessValue (borrow landed) | position_opened #25. Payment FAILED: FastNear RPC 429 while it built the payment payload (from txs.json) |
| s5 attempt 2 | [HUrPnuei…](https://testnet.nearblocks.io/txns/HUrPnueisaxizthuNC2DGd6yWJ2m2hymbbEkYvtMVkLX) | agent1 → nvdax-mock, ft_transfer_call | SuccessValue (borrow landed) | position_opened #26. Payment FAILED: settle_failed invalid_exact_near_storage_check_failed (from txs.json) |
| s5 attempt 3 | [DBJQqSas…](https://testnet.nearblocks.io/txns/DBJQqSasjTGbY6wJGT5yS4tbjjf4gCdJp3rn3NhkecUs) | agent1 → nvdax-mock, ft_transfer_call | SuccessValue (borrow landed) | position_opened #27. Payment FAILED: settle_failed settlement_failed. "Relayer submitted nothing" is from txs.json and NOT VERIFIED: I made no history query on x402-relayer.nectar.testnet |

So the three take B s5 attempts left 3 extra agent1 loans open (#25–#27, $10 each). The payment failures are as claimed in
take-b/txs.json. The only payment tx this review saw is take A's AJ1Tf7f3.

- **Explorer links:** recorded, not opened with WebFetch, because of the known 403 to WebFetch (see §G2). Proof is the RPC tx status above.
  In the video, NEAR Rocks shows 9uwAk6Vy at block 277,562,578 (NFTMint p-22) and 8QrZ9cSX at block 277,562,714 (p-23).
- **Frame review** (evidence/WO-35/weekend-frame-review-20261113T213157Z.md). I read 1 frame/s over 0–87 s, with full-resolution
  crops at 16 timestamps. The scene-change check found 33 change points, all covered. The overlay sweep looked at every one of the
  2,647 frames.
  - **FIX BEFORE SENDING:** 0:48.000–0:48.067 (2 frames), a yellow Chrome banner "Debugger paused in another tab, click to
    switch to that tab." It is in the master, the captioned version and the 720p master.
  - **For Kunal to decide:** the footer email `kunal@nectarnetwork.fun` at 0:03–0:04 and 0:55, and the amber price badge
    `owner · 62s · no conf` at 0:05–0:11.
  - **Minor:** loading skeletons at 0:03–0:04 and 0:55; near.rocks "Loading transaction…" at 1:02–1:03 and 1:20; behind the
    Loan opened drawer at 0:53–0:54, a red "More than your balance" error and the no-balance notice; flag price $27.59 vs
    $27.57 on the Loan #22 screen at 0:56–1:01; a nearly empty terminal at 1:06–1:08.
  - **Cosmetic:** the "Who stands behind" column is cut off at 0:05–0:11; "$0.15" wraps at 0:37; the caption covers the
    Weekend Shield card at 0:27–0:31; the 402 and 200 log lines share one timestamp at 1:15.
  - **Not found anywhere:** error toasts, localhost or wrong URLs, the copilot "Key missing" notice, hackathon branding.
  - **Matches:** on-screen numbers match shotlist.md (loan #22, $100 debt, 15 bps / $0.15, $99.55 net, agent 402 → 200).
    The 5 captions match shotlist.md and the srt.

## G13

### G13 — Base round trip — RE-RUN after D-027 — PASS, local fork of Base Sepolia (D-026), not Base Sepolia — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. EVM = local fork at http://127.0.0.1:8545, chain 84532, block 57050724; redeployed vault 0xC64b…1226 (5,805 B code), MockB20 0x634F…af81d. NEAR via https://test.rpc.fastnear.com.
Claims checked: evidence/G13/rerun/summary.md. Commands: evidence/G13/verifier-20261111T080154Z/g13.sh (+ nv.sh). Output: fork.log.
```
derived_public_key(base-sepolia/pos/11, domain 0) = secp256k1:4FUssYkR… -> keccak addr 0x9de489d1…77246fe ; NEAR authority 0x9de489d1…77246fe ; MATCH
relay tx 0x12f5c29b…00600cd5 status=0x1 block=57050721 from=0xe4a5…c991 to=vault
decoded: struct=(11, 0x85D0…F30A, 10, 1794387383) depositor=0x85D0…F30A v=27
vault digest 0xfc9d2e23…945d1c49 ; NEAR signed message 0xfc9d2e23…945d1c49 ; EQUAL
ecrecover(digest,v,r,s) = 0x9de489d1…77246fe ; MATCH
positionOf(11, depositor) = 0x9DE4… 0x85D0… 3000000 3            (3 = Released)
nonceUsed(slotKey=0xa627…6269, nonce=10) = true
token balance borrower1 0x85D0… @57050720 7000000 -> @57050721 10000000
replay relay calldata from keeper EOA: execution reverted: NonceUsed(10)
derived_public_key(base-sepolia/pos/12, domain 0) = secp256k1:4RuhNCkk… -> keccak addr 0x8a8a0125…98c313 ; MATCH
relay tx 0xa2fea901…7839c648 status=0x1 block=57050724
decoded: struct=(12, 4, 308700000, 2357389, 0xcA61…1fa1, 14, 1794387594, 1) depositor=0x85D0…F30A v=27
vault digest 0x088c5a6f…1a4153 ; NEAR signed message 0x088c5a6f…1a4153 ; EQUAL
ecrecover(digest,v,r,s) = 0x8a8a0125…98c313 ; MATCH
positionOf(12, depositor) = 0x8A8A… 0x85D0… 3000000 2            (2 = Settled)
nonceUsed(slotKey=0x5a83…3960, nonce=14) = true
token balance borrower1 @57050723 7000000 -> @57050724 7642611 ; buyer1 0xcA61… 0 -> 2357389 (latest same)
replay relay calldata from keeper EOA: execution reverted: NonceUsed(14)   (selector 0x6d9650be = NonceUsed(uint64))
NEAR: get_position 11/12 status Closed, remote.source "keeper" (attest mode, as labelled), committed_depositor 0x85D0…F30A
```
Explorer: N/A (local fork).
Verdict: **PASS on the local fork of Base Sepolia (D-026), not Base Sepolia.** Every claim in the summary holds: authorities (domain 0), relay status 1, on-chain digest == NEAR digest,
ecrecover == authority, positionOf 3/2, balances (borrower1 back to 10.000000, then 7.642611; buyer1 +2.357389), replay → NonceUsed(14) (and NonceUsed(10) for the release).
The new slot-scoped nonce map (D-027 SR-1) is set for both slots. Notes: positionOf keeps amount 3000000 after a terminal status (status field is the guard). Earlier caveats are not
re-checked this run and still stand: no ERC-8021 suffix (D-026/H19), Solana-domain revert shown only in forge tests, real Base Sepolia pending H15.

### G13 — Base round trip — PASS, local fork of Base Sepolia (D-026), not Base Sepolia — 2026-11-10T18:03Z–18:05Z — commit 7bface5
Fresh clone /tmp/verify-G12G13-20261110T180307Z. Read-only. No secrets. EVM = local fork of Base Sepolia (D-026) at 127.0.0.1:8545, chain 84532, block 57050713. NEAR = public testnet via https://test.rpc.fastnear.com (finality final). Each claim in evidence/G13/summary.md was checked against the chains, not taken from the summary.
Commands (full output in evidence/G13/verifier-20261110T180307Z/):
```
# NEAR views (near-views.log): contract_version; get_position {"position_id":"6"|"7"} (U64 is a string: integer arg panics);
#   get_pending_release_evm {"position_id":"6"}; get_pending_settlement_evm {"position_id":"7"};
#   v1.signer-prod.testnet derived_public_key {"path":"base-sepolia/pos/<id>","predecessor":"nectar-core-v2.nectar.testnet","domain_id":0}
# base58 → 64-byte x‖y → cast keccak → last 20 bytes (authority-check.log)
# local fork of Base Sepolia (D-026) (fork-checks.log): cast receipt/tx; cast decode-calldata release(...)/settle(...);
#   cast call vault hashRelease/hashSettle(decoded struct); cast call 0x…01 (digest‖v‖r‖s); cast call vault <same calldata> --from <keeper>;
#   cast call vault positions(uint64); cast call MockB20 balanceOf(buyer1|borrower1)
contract_version "2.1.0-v7"
pos 6: NEAR status Closed, remote.status Closed, authority 0xd4189b46e51e93fee716b78ccf0325e622f0bdb5
       derived keccak 0x7d53…d4189b46e51e93fee716b78ccf0325e622f0bdb5 → 0xd4189b46…0bdb5  MATCH
pos 7: NEAR status Closed, remote.status Closed, authority 0xad6bc65253be35ca23696396f791bbbb83f6a31b
       derived keccak 0x7d21…ad6bc65253be35ca23696396f791bbbb83f6a31b → 0xad6bc652…a31b   MATCH
release 6: pending txHash 0x759a9a8b956831b054648605932ea8af72c5bfbc73b77e4f679591f96788694b status Relayed, digest 0xf5f93f43…c769 v 28
  receipt status true, block 57050710, from 0xe4A5…C991 (keeper) to vault 0xC4f4…3d09, selector 0xf8ac3116 = release((uint64,address,uint64,uint64),uint8,bytes32,bytes32)
  decoded (6, 0x85D0…F30A, nonce 2, expires 1794337122); vault.hashRelease = 0xf5f93f43…c769 (== NEAR digest)
  ecrecover precompile 0x01 → 0xd4189b46e51e93fee716b78ccf0325e622f0bdb5 == authority 6
  replay eth_call → custom error 0x6d9650be = NonceUsed(uint64), arg 2
settle 7:  pending txHash 0x20d13922df857bd352bde1e30bafde868c1c76d8cedd3bd33acbe38eda6fe4bb status Relayed, digest 0x260c067c…f2f3 v 27
  receipt status true, block 57050713, same keeper → vault, selector 0x29b82ac2 = settle((uint64,uint64,uint256,uint256,address,uint64,uint64,uint8),uint8,bytes32,bytes32)
  decoded (7, quote 4, repay 308700000, seize 2357389, 0xcA61…fa1, nonce 6, expires 1794337295, kind 1); vault.hashSettle = 0x260c067c…f2f3 (== NEAR digest)
  ecrecover precompile 0x01 → 0xad6bc65253be35ca23696396f791bbbb83f6a31b == authority 7
  replay eth_call → NonceUsed(uint64), arg 6
positions(6) = (0xd418…bdb5, 0x85D0…F30A, 3000000, 3)  enum 3 = Released
positions(7) = (0xaD6b…A31B, 0x85D0…F30A, 3000000, 2)  enum 2 = Settled
MockB20 balanceOf buyer1   0xcA61FE6F57a6A36Dedf2b99E1D4D8923b1D71fa1 = 2357389
MockB20 balanceOf borrower1 0x85D051D8CD3fEe54FdE043499C75fa95eeB9F30A = 7642611
```
Explorer links opened: none. The local fork of Base Sepolia (D-026) has no explorer; NEAR txs were checked by RPC view only.
Verdict: **PASS on the local fork of Base Sepolia (D-026), not Base Sepolia.** Claims (a) to (e) all hold. Points measured against gates-v7.md G13:
- "confirmed on 84532": confirmed on the local fork of Base Sepolia (D-026, chain id 84532), not on Base Sepolia. A real run is pending H15.
- "settle with ERC-8021 suffix": NOT MET, disclosed. The settle calldata is 714 hex chars, which is exact ABI length with no suffix. D-026 says "ERC-8021 suffix only if H19"; F-351 records the format as unverified.
- "Solana-domain signature revert": shown only by forge tests (test_settle_solanaMessageSignedBySameKey_reverts and test_settle_ed25519SignatureBytes_reverts PASS in §G12). No such revert was sent on the local fork of Base Sepolia (D-026).
- "ecrecover on-chain": ecrecover was run through the 0x01 precompile on the local fork of Base Sepolia (D-026). Both relay txs also have status 1, and the vault checks ecrecover == authority inside `_consume`.

## G12

### G12 — Base toolchain + collateral — PASS, local fork of Base Sepolia (D-026), not Base Sepolia — 2026-11-10T18:03Z–18:04Z — commit 7bface5
Fresh clone /tmp/verify-G12G13-20261110T180307Z. Read-only. No secrets. Foundry at ~/.foundry/bin (forge/cast/anvil).
Commands (full output in evidence/G12/verifier-20261110T180307Z/):
```
$ cd evm && find . -name '._*' -delete && forge test          # forge-test.log, exit 0
[SKIP: B20 precompiles absent: run `forge test --network base`] test_createB20_localPrecompiles() (gas: 0)
Suite result: ok. 12 passed / 2 passed / 1 passed / 59 passed (NectarVaultBase suite), 0 failed
Ran 5 test suites: 74 tests passed, 0 failed, 1 skipped (75 total tests)
$ cast chain-id --rpc-url http://127.0.0.1:8545                # local fork of Base Sepolia (D-026)
84532                                                           (block 57050713)
$ cast code <addr> --rpc-url http://127.0.0.1:8545              # fork-code.log; addresses = config.yaml base.*
vault      0xC4f46D859f9B555D95b68DC28564C5201F743d09  5383 B  keccak 0xd6070445…c946
collateral 0xD83A1571Ac3431A498f657512439B744c35CAd7E  3771 B  keccak 0x10731af1…0380 (MockB20)
registry   0x5A87057522B19A6B757a6FB1A7888d2AF5AA52D5  1297 B  keccak 0xb1d6f637…27e5
$ cast call 0xB20f000000000000000000000000000000000000 "createB20(uint8,bytes32,bytes,bytes[])(address)" 0 <fresh salt> \
    $(cast abi-encode "f((uint8,string,string,address,uint8))" "(1,Nectar Probe,NPRB,<from>,18)") "[]" --from <from> \
    --rpc-url https://sepolia.base.org                          # createB20-sim.log, 18:03:41Z, real Base Sepolia, chain 84532, block 57059770
from 0x…dEaD  → 0xB20000000000000000000026C5e93ECDE4629b7c   (no revert)
from 0x1111…  → 0xB2000000000000000000001F2281452A54ef1fc1   (no revert)
factory eth_getCode = 0 bytes (precompile, so no EVM bytecode)
```
Explorer links opened: none. A local fork of Base Sepolia (D-026) has no explorer, and nothing was deployed to real Base Sepolia.
Verdict: **PASS on the local fork of Base Sepolia (D-026), not Base Sepolia.** forge test is green (74/0/1); the skip is the B20-precompile test, which needs `--network base`. Chain id is 84532 and all three config.yaml base.* contracts have code on the local fork of Base Sepolia (D-026). The F-348 read-only createB20 simulation reproduces on real Base Sepolia from two arbitrary senders. Points measured against gates-v7.md G12:
- scripts/06-base.sh (keystores) and scripts/26-deploy-base.sh: NOT RUN by the verifier. Keystores are a secret, and these scripts send txs, so they fall outside a read-only check. The deployed result was checked by `cast code` instead.
- H15 funding: OPEN. Real Base Sepolia deployment is pending, and the collateral on the local fork of Base Sepolia (D-026) is MockB20 (DeployMock path, because B20 precompiles are absent on anvil).
- "addresses on explorer": N/A for a local fork of Base Sepolia (D-026).

## G3b

### G3b re-run 8b — c95cd0c, WO-66b items (d), (k), (p) hydration, local only — PASS — 2026-11-12T21:33Z–21:55Z — commit c95cd0c
Order: docs/process/work/wo-66b-verifier-g3b-run8b.md (at 9aa6661).
- Fresh clone /tmp/verify-G3b-r8b-20261112T2132Z (`git clone /Volumes/T7/nectar-labs`, `git checkout c95cd0c`, HEAD c95cd0cf9d3f56f570ba3847a9c8aed370e688e0) on the internal disk.
  - node v22.23.4, pnpm 10.34.9. `pnpm install --frozen-lockfile` exit 0.
  - No secrets. E2E keys and FEED env were unset. PW_CHANNEL=chrome (system Chrome).
- Own ports: 3992 hosted web, 3994 docs. Both stopped with 0 listeners left on 3990–3999.
  - Host services 8545 and 8788–8791 kept listening throughout. I signed nothing.
  - The clone ends with 1 change: my untracked probe (apps/web/hydration-probe.mjs).
- One background master script (r8b.sh), 21:33:07–21:54:57Z.
Scope check: $ git diff --stat 31809b1 c95cd0c -- apps packages services contracts → exactly 3 files, 265 insertions and 31 deletions: apps/web/scripts/crawl-hosts.mjs (new), crawl-hosts.test.mjs (new) and crawl.mjs.
- docs/ui: 1 line. Console.dc.html "Reserve discount" went from 4.00% to 6.00%, which now matches the deployed 600 bps (this resolves the run-8 (m) note).
- de17c86 redacted the WO-62b log.
- So run 8's PASS items (a), (b), (c), (e)–(j), (l)–(o) still hold for c95cd0c, and this run covers (d) and (k).
- `node --test scripts/crawl-hosts.test.mjs` → 7/0.
Hosted setup. Env HS = SITE_URL=http://site.localhost:3992 APP_URL=http://app.localhost:3992 DOCS_URL=http://docs.localhost:3994 STATUS_URL=http://status.localhost:3992 LEGACY_HOSTS=old-site.localhost:3992=site,old-app.localhost:3992=app.
- $ env HS pnpm --filter ./apps/docs-site build → exit 0. The sitemap has 56 locs on http://docs.localhost:3994/…
  - The order names DOCS_URL. I also set SITE/APP/STATUS so the docs' cross-host links point to the local hosts rather than the production fallback.
- $ node apps/web/scripts/serve-docs.mjs --port 3994 (pages at the root).
- $ (apps/web) env HS pnpm build → exit 0, then `env HS next start -p 3992`.
- Checks: site / 200, status / 200, app / 307 → /feed. /api/health ok, nectar-core-v2.nectar.testnet 2.2.1-v7.
(d) **PASS**. $ env HS PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --out <ev>/crawl (21:36:06–21:49:48Z) → **exit 0**.
- Summary: "crawl: 83 internal (rendered: site 15, app 9, status 1, docs 56), 41 external, 0 failures, 0 our console errors, 0 page loads with third-party network failures".
- Internal hosts: site.localhost:3992, app.localhost:3992, status.localhost:3992, docs.localhost:3994 (docsOwnOrigin true).
- 81 pages rendered in 4 variants (dark/light × 1440/400). 2 URLs redirect to a page already rendered. truncated false.
  - DOCS sitemap: 56 queued, 0 not linked from a rendered page.
  - Web routes: 15 + 9 + 1 = 25, the same as run 8.
- Redirect checks 14/14 ok:
  - APP / 307 → /feed
  - SITE app route 308 → APP, and APP landing route 308 → SITE
  - **SITE, APP and STATUS /docs/security/audits 308 → http://docs.localhost:3994/security/audits**. This is the run-8 failure, now expected correctly.
  - SITE /docs?x=1 308 → DOCS/?x=1
  - www 301
  - SITE /status?x=1 308 → STATUS/?x=1, and STATUS /status 308 → STATUS/
  - STATUS app/landing routes 308 → APP/SITE
  - legacy old-site and old-app 308, path + query kept
- Externals: 41. 12 answer 200, among them the hosted Feed railway URL. 29 are warnings, not failures (the crawler classes 403/429 as bot walls): testnet.nearblocks.io 403 ×25, explorer.solana.com 429 ×3, solana.com 429 ×1.
Log:
```
crawl: 83 internal (rendered: site 15, app 9, status 1, docs 56), 41 external, 0 failures, 0 our console errors, 0 page loads with third-party network failures → /tmp/verify-G3b-r8b-20261112T2132Z.ev/crawl
## Our console errors: 0
## Third-party network failures: 0 on 0 page loads
## Failures: 0
```
(k) **PASS**. $ git grep -n '/Users/[A-Za-z]' -- ':!*.wasm' → **0 lines**.
- $ git grep -n "/Users/" -- evidence/WO-62b/hosts-spec-20261112T195948Z.log → 0 (redacted in de17c86).
- Context: the loose `git grep -l "/Users/"` → 17 files, all in accepted classes:
  - 7 wasm fixtures (the same 7 as run 8)
  - 10 files that only quote the grep pattern: docs/EVIDENCE.md, 2 verifier memory notes, 3 run-7 and 4 run-8 evidence files
- Copied evidence from this run: 0 strict hits.
(p) **PASS: 0 hydration errors**. $ (apps/web) PW_CHANNEL=chrome node hydration-probe.mjs http://site.localhost:3992 http://status.localhost:3992 <out> plain 10 (21:33:36–21:36:06Z) → exit 0.
- Method: fresh context per load, plain `page.goto`, waitUntil networkidle + 2 s, no throttling, no init script.
- Viewports as in playwright.config: desktop = Desktop Chrome 1280×900, phone = Pixel 7 400×860.
- What it collects: console error/warning, pageerror, and a hydration regex (#418/#419/#421–#425, "hydrat", "did not match", "server rendered HTML").
- Result: **40 loads, 0 hydration errors, 0 console errors, 0 page errors, 0 navigation failures**. Load time 3.3–4.7 s.
  - SITE / desktop 10/0, SITE / phone 10/0, STATUS / desktop 10/0, STATUS / phone 10/0.
- Supplements (not PASS criteria; they test whether #418 is timing-dependent):
  - Crawler-style: 80 loads. The crawler's 4 contexts, each with its localStorage theme + consent init script, load in parallel, waitUntil load + 800 ms, 10 rounds per URL. Result: 0 hydration, 0 console errors, 0 page errors.
  - Fast crawl `env HS node apps/web/scripts/crawl.mjs --out <ev>/crawl-fast` (concurrency 4, no delay, 21:50:14–21:52:10Z) → exit 0: 84 internal (app 10, the extra one being /notes?tab=deposits, a link only found on this pass), 0 failures, 0 of our console errors, **0 hydration-like console texts**. 68 page loads had FastNEAR throttling: CORS refusal on a 429, then ERR_FAILED on test.rpc.fastnear.com / rpc.testnet.fastnear.com (third-party, listed).
  - Plain probe again, right after the fast crawl (21:52:10–21:54:52Z): 40 loads, **0 hydration**, 0 page errors.
    - It logged 216 console errors, all FastNEAR throttling while the RPC was still rate-limiting: 108 CORS refusals and 108 "Failed to load resource: net::ERR_FAILED" on those two hosts. 0 are ours.
- Conclusion: React #418 (the WO-62d agent's fast-crawl observation) did not reproduce in 200 targeted loads or in a fast crawl. If it exists, it is rare and timing-dependent, not reproducible. No GATE_FAIL file.
Explorer links: none opened. G3b has no explorer criterion, and the crawler classes nearblocks/explorer.solana.com 403/429 as bot walls.
Screenshot: none.
Evidence: evidence/G3b/verifier-rerun8b-20261112T2132Z/
- Scripts: r8b.sh, r8b-copy.sh, hydration-probe.mjs, analyze.cjs (+ analyze.out).
- Logs: run.txt, run-master.log, clone.log, install.log, build-docs.log, build-hosted.log, health-hosted.json.
- Scope: diff-stat-31809b1-c95cd0c.txt, diff-stat-docs-ui.txt, crawl-hosts-test.log.
- (k): k-git-grep-strict.log (empty), k-git-grep-l.log, k-git-grep-nonwasm-lines.log, k-wo62b-log.txt.
- (d): crawl/ and crawl-fast/ (crawl.json, crawl.md), plus crawl.log and crawl-fast.log.
- (p): hydration-plain.{json,log}, hydration-crawlstyle.{json,log}, hydration-plain-2.{json,log}.
- clone-status.txt.
**Final verdict, G3b re-run 8b: PASS for (d), (k), (p). With run 8's PASS items, G3b covers c95cd0c, except (h), which this order leaves out (local only).**

### G3b re-run 8 — release candidate 31809b1, WO-66 (a)–(o), local only — FAIL (2 non-product reasons: (d) stale crawler, (k) home path in an evidence log) — 2026-11-12T20:19Z–21:06Z — commit 31809b1
Order: docs/process/work/wo-66-verifier-g3b-run8.md (at a568d5c) + docs/process/work/g9-g3b-final-4.md (a)–(l) as in run 7, without (h): this run is local, with no preview.
- Fresh clone /tmp/verify-G3b-r8-20261112T2019Z (`git clone /Volumes/T7/nectar-labs`, `git checkout 31809b1`, HEAD 31809b1326c6c83480dae071ce6fd508c9d483f3) on the internal disk.
  - node v22.23.4, pnpm 10.34.9; `pnpm install --frozen-lockfile` exit 0.
  - No secrets: E2E keys, SITE/APP/DOCS/STATUS/LEGACY/FEED env all unset unless stated.
  - PW_CHANNEL=chrome (system Chrome). The Playwright headless shell 1254 is absent; only 1248 is cached.
- Own ports: 3981 local, 3982 hosted, 3984 docs, 3985 Feed (views), 3987 web + FEED_URL.
  - Every server stopped on kill, none refused, and 0 listeners were left on 3981–3987.
  - Host services 8545/8788–8791 kept listening throughout. I signed nothing.
- One master script (run8.sh) ran phase 1 20:23:39–20:38:55Z and phase 2 20:38:55–20:48:27Z. The cargo job ran in parallel (r8-cargo.sh, r8-cargo2.sh).
- Spec diff 4c2a0bb..31809b1 (e2e/, playwright.config): 5 files, +433/−73 (claims.spec + test-assets.spec new, hosts.spec rewritten for WO-62b, design-app.spec, inventory.spec comments).
  - design-app.spec only swaps the demo parameters for the deployed ones (haircut 400→1000, weekend 1200→2500, max LTV 8500→7000, Reserve 400→600 bps), with re-derived expected values (e.g. $78,720→$73,800, the −$820 delta kept).
  - No assertion was removed, and playwright.config is unchanged.
$ pnpm --filter web build → exit 0. (g) $ node apps/web/scripts/check-trace.mjs → exit 0.
$ curl -sI :3981{/,/borrow,/api/health,/docs,/about,/status} → all 6 carry XFO DENY, HSTS max-age=63072000, CSP frame-ancestors 'none' (local: X-Robots-Tag noindex). /api/health → ok true, nectar-core-v2.nectar.testnet 2.2.1-v7.
(a) $ PW_CHANNEL=chrome PORT=3981 E2E_BASE_URL=http://localhost:3981 pnpm --filter web e2e (20:24:53–20:33:07Z) → **exit 0: 510 passed · 0 failed · 116 skipped · 0 flaky**, 0 retries (desktop 282 ✓, phone 228 ✓).
- site-pages.spec 38 ✓ (19 + 19). screens.spec 92 ✓ (46 + 46), incl. /docs dark/light.
(e) $ LH_BASE_URL=http://localhost:3981 pnpm --filter web lighthouse → exit 0: 20 routes × 2 themes = 40/40 at a11y 100.
Real selector (g3b-selector-probe.mjs, real Chrome, fresh context, mock undefined, /borrow):
- The banner is visible before Connect. 6 wallets: Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI.
- Desktop rows y 268–692, phone from y 420. 6/6 are in the viewport without scrolling, with the centre hit inside each. 0 overlap the banner, which is hidden while the selector is open.
- The corner hit-tests miss, as in R3–R7. I clicked no wallet.
(b) PASS. Hosted build with all five env vars on *.localhost: SITE_URL=http://site.localhost:3982 APP_URL=http://app.localhost:3982 DOCS_URL=http://docs.localhost:3984 STATUS_URL=http://status.localhost:3982 LEGACY_HOSTS=old-site.localhost:3982=site,old-app.localhost:3982=app.
- `pnpm build` exit 0, then `next start -p 3982`. Docs: `node apps/web/scripts/serve-docs.mjs --port 3984` (WO-62b version, pages at the root).
- $ E2E_HOSTED=1 E2E_HOSTED_BROWSER=1 E2E_BASE_URL=http://localhost:3982 E2E_{SITE,APP,DOCS,STATUS}_URL=<same> E2E_LEGACY_HOST=old-app.localhost:3982=app npx playwright test e2e/hosts.spec.ts --project=desktop → **11/11**. It covers:
  - www 301
  - APP / 307
  - SITE app routes and APP landing routes 308
  - docs 308s from SITE/APP/STATUS, prefix dropped, query kept
  - the status host serving / and /status 308
  - STATUS other paths 308
  - legacy 308 with path + query kept
  - per-host robots/sitemap/canonical/og:url
  - the browser check "status host hydrates with the app shell and no console errors" (system Chrome, 1.8 s)
- The same suite with `E2E_LEGACY_HOST=old-site.localhost:3982=site -g "legacy host"` → 1/1.
- curl spot checks (hosted-curl.txt):
  - status / 200
  - SITE /docs/integrate/sdk?x=1 → 308 http://docs.localhost:3984/integrate/sdk?x=1
  - APP /docs?x=1 → 308 …:3984/?x=1
  - old-app /feed?x=1 → 308 APP/feed?x=1
  - old-site /about?y=2 → 308 SITE/about?y=2
  - SITE /status?x=1 → 308 STATUS/?x=1
(c) PASS. Same hosted server. $ E2E_INVENTORY=1 INV_SITE=http://site.localhost:3982 INV_APP=http://app.localhost:3982 … --project=inventory → 6/6 in 4.4 min.
- cspBypassed false, cspViolations []. 6/6 wallets reached the prompt with 0 violations each.
- 12 measured third-party hosts = 12 committed, and all are in backticks in privacy.md (inv-compare.log). The clone's content/ was restored.
(d) **FAIL (tool-only)**. $ PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3982 --app http://app.localhost:3982 --docs http://docs.localhost:3984 (20:43:44–20:47:56Z) → exit 1.
- Result: 26 internal, 20 external, **1 failure**, 0 of our console errors, 30 page loads with third-party failures (FastNEAR CORS on 429; listed, not counted).
- The failure: redirect "SITE /docs/* → APP (legal pages link /docs/<slug>)": got 308 http://docs.localhost:3984/security/audits; want 308 http://app.localhost:3982/docs/security/audits.
  - The expectation is hard-coded at crawl.mjs:83 (WO-34a). WO-62b §2 replaced it ("APP and SITE `/docs` and `/docs/<rest>` → 308 `${DOCS_URL}/<rest>`").
  - hosts.spec asserts the new behaviour. **The product is right and the crawler is stale.**
- Coverage gap in the same tool: `internal` = SITE + APP only. The DOCS host (and the STATUS host) count as external, so the crawler renders no docs page. It only GET-checks 13 docs-host links (all 200) and status / (200).
  - The 25 web routes = run 7b's 26 minus SITE /status, which moved to the status host.
- Supplement 1 (docs-sweep.mjs), docs at the root: 56 sitemap pages answer 200 with no /docs/ prefix, 0 old-prefix hrefs, 6 /assets|/img files 200. Old /docs, /docs/, /docs/<slug> still answer 200 (serve-docs rewrite). /docs?x=1, /docs/start/quick-start?x=1 and /docs/integrate/feed-rest from SITE, APP and STATUS → 308 to DOCS/<rest> with the query kept, then 200 (9/9). 0 failures.
- Supplement 2 (g3b-docs-render.mjs): real Chrome, 56 pages × (dark@1440, light@400) = 112 loads, 0 problems (console errors, page errors, docs-origin ≥ 400 or failed requests, "did not load properly" banner).
- The docs build ran without DOCS_URL (local-mode docs: sitemap origin localhost:3000, app links to localhost:3100), as in runs 7/7b.
- Fix (web, apps/web/scripts/crawl.mjs): when --docs is its own origin, expect `${DOCS}/security/audits`, and add the DOCS and STATUS hosts to `internal`. Then re-run (d) alone.
(f) PASS. `NECTAR_PRODUCTION=1 SITE_URL=https://nectarlabs.io APP_URL=https://testnet.nectarlabs.io DOCS_URL=https://docs.nectarlabs.io STATUS_URL=https://status.nectarlabs.io LEGACY_HOSTS=old-site.example.dev=site,old-app.example.dev=app pnpm build` → exit 0, and check-trace after it → exit 0.
- With `operator: null` at config.yaml:108 (clone only), the build exits 1 with "Production build refused (WO-34a guard): config.yaml site.operator is null (TODO-H-LEGAL)". Restored, 0 changes under packages/config.
(i) WO-35w claims PASS.
- Raw HTML (landing-check.cjs): no "0123456789" in the text or meta. Base lines all say "local fork". TEE lines all verifiable, 0 private/confidential. No "until the Reserve ships".
  - landing-check exits 1 only on "10% missing from the worked example". The static HTML holds state 01 only, as in runs 6/7. ("20040%" in its list is "$22,200" + "40%" joined by the tag stripper.)
- Chamber probe: phase 01 40%, phase 02 haircut 10% + 70%, weekend 25%, health < 1 25% = config.yaml 4000/7000/1000/2500.
- Banner with a views-mode Feed from this clone (:3985 → web :3987): /feed shows the banner + views-empty settlements line, /keepers the banner, /status "isn't indexed on this host (the Feed reads contract views only)". Negative control :3981 without a Feed: no banner, "not configured" ×2.
(j) PASS. feed 79/0, keeper 327/0 (keeper grew from 301 with the WO-63 refresher tests).
- Feed /health: chain_head_source "view_block", history "unavailable", rpc {4 endpoints, last_served test.rpc.fastnear.com, failovers 4, cooling []}.
- chain_head 277413364 = last_indexed_block (lag 0) ≤ RPC final 277413367. Second sample: 277413426 = 277413426.
(k) **FAIL (evidence hygiene)**. `git grep -l "/Users/"` → 14 files:
- The 7 wasm fixtures: the 6 contracts/nectar-core/tests/fixtures/*.wasm, plus the new contracts/mock-ft/tests/fixtures/mock-ft-deployed.wasm.
  - The mock-ft fixture is byte-identical to the deployed pre-upgrade code: archival view_code of usdc-mock and nvdax-mock at block 277406854 have sha256 f96721a6… = fixture (n/fixture-archival.log), so it is the same accepted class.
- 6 files only quote the grep pattern: docs/EVIDENCE.md, .claude/agent-memory/verifier/reference_g3b_v2_web.md and reference_g9_rehearsal.md, and evidence/G3b/verifier-rerun7-…/{phase1.txt, run-master.log, run7.sh}.
- The failing hit: **evidence/WO-62b/hosts-spec-20261112T195948Z.log:20 and :42**. Both lines hold a real home path, `/Users/<user>/Library/Caches/ms-playwright/chromium_headless_shell-1254/…` (committed in fae7e36).
  - `git grep -l '/Users/[A-Za-z]' -- ':!*.wasm'` → exactly this 1 file.
  - Fix (orchestrator owns evidence/WO-62b): redact the two lines.
(l) WO-35i hydrated, PASS.
- `npx playwright test e2e/v7.spec.ts -g "landing #chains"` → 8/8 (desktop + phone).
- Hand probe (g3b-chains-probe.mjs, real Chrome on :3981, real RPC):
  - Config flags: hydrated #chains text == server HTML on desktop and phone, 3 Base sentences, 0 without "local fork", 0 console errors.
  - Pins:
    - [] → no hydrated section, no Chains link.
    - [solana_remote] → equal, 3/3.
    - [base] → 8 Base sentences, 0 without local fork, #nbase present.
    - [both] → 8 Base sentences, 0 without local fork, #nbase present.
  - The pinned base runs differ from the server HTML only by the client-side pin, which is expected.
  - LandingNav "Chains" link consistent in all 6 runs.
(m) Claims PASS.
- `npx playwright test e2e/claims.spec.ts e2e/test-assets.spec.ts` (desktop + phone) → 26/26: claims 5 × 2, test-assets 8 × 2. The full e2e also ran these 26, all ✓.
- By hand (g3b-claims-probe.mjs, :3981, no mocks, consent declined, live views from test.rpc.fastnear.com at block 277411972) → 20/20 PASS:
  - JS off: section#chains says "Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia.", and all 3 Base sentences say local fork. Hydrated: the same text, and the same 3 sentences.
  - The Reserve card shows **$10.00** = live get_reserve r_usd_e6 10000000, and "After all quotes, at 600 bps" = discount_bps 600, notice "7 days". The #how prose says "the Reserve as deployed holds $10". Chamber R (#lr) $10 = live get_exit_capacity r_usd_e6 10000000.
  - LTV/haircut shown: "A static lender stops at 40%." / "reach the deployed 70% cap" / #lh 10% / "haircut widens to 25%" / code panel "// 2500 / 1000 on testnet", "// 70% on testnet". These equal **live get_collateral** base_ltv 4000, max_nectar_ltv 7000, base_haircut 1000, weekend_haircut 2500.
    - The landing takes these four from config.yaml (Landing.tsx:384, server-rendered), and config.yaml = chain.
    - The page also calls get_collateral, get_reserve and get_exit_capacity (RPC methods seen).
  - Counters: the raw server HTML has no "0123456789" anywhere. JS off: 3 [data-roll] counters show plain values ($80,000 / 57.7% / $22,200), 0 [data-reels]. Hydrated: each counter's reels are aria-hidden="true" with the plain value readable. Hydrated innerText has no 0123456789 and 0 console errors.
- Grep for 85% / 4% / 12% in apps/web, packages/ui, docs/ui, landing/index.html (m/param-grep-raw.txt) → 12 lines, 0 parameter figures:
  - CSS gradient positions (12% −12% / 12% 112%) in tokens.css, app.css, nectar-app.css, landing.module.css, landing/index.html
  - claims.spec's own "no 85%" checks
  - docs/ui/app/Console.dc.html:110 "Reserve discount 4.00%" (design mockup). Note: the mockup shows 4.00% while the deployed discount is 600 bps. It is not a haircut/LTV parameter, and B3 lists only 85% / 4%, 12% haircut figures, so it is reported, not counted.
  - Parameter words within 60 chars of 85/4/12%: 0. `8500|1200` hits: 0.
(n) G11 delta (mock-ft) PASS.
- Host SDK trap (env only, no repo change; same as the D-027 run): with the default CLT SDK MacOSX27.0, build scripts fail to link ("tapi error: malformed file … unknown architecture arm64e.x1-macos"). This hit both `cargo test` and `cargo near build` (first attempts: n/*-default-sdk.tail.log). Re-run with `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`.
- $ cargo test -p mock-ft → exit 0: unit 38/0, sandbox_faucet 1/0 (`deployed_mock_ft_upgrades_code_only_and_faucet_works`: deploys tests/fixtures/mock-ft-deployed.wasm, asserts its sha256, upgrades code-only, faucet works).
- $ (contracts/mock-ft) cargo near build non-reproducible-wasm → target/near/mock_ft/mock_ft.wasm, 171771 B, sha256 **e3d4ded52c1a5e64d4e05750f793ca4f2a177076e13d53cf9d733a99c37c6d14** = expected.
- RPC view_code (final, blocks 277413504 / 277413519): usdc-mock.nectar.testnet and nvdax-mock.nectar.testnet are both 171771 B with sha256 e3d4ded5… = built. view_account code_hash GLMp3W4JXjMqrr2sqTouA6rgWNp9aaUrmt9MPyVj1WgB = base58(sha256).
- faucet_config:
  - nvdax-mock {enabled true, amount_per_claim 5000000, cap_per_account 15000000, cooldown_s 3600}
  - usdc-mock {enabled true, 500000000, 1500000000, 3600}
  - Both = config.yaml `faucet`.
- EXPERIMENTAL_tx_status 2A4jN155i6AEbZv35qj8c7XZLV7TjWZejr3mnJmneQrW: signer borrower1.nectar.testnet → nvdax-mock.nectar.testnet, FunctionCall faucet_mint args {} deposit 0.00093 NEAR gas 30 Tgas.
  - Status SuccessValue "", FINAL, block 277410673 at 2026-11-12T20:11:54Z, no receipt failure.
  - Log EVENT_JSON nep141 ft_mint {owner_id borrower1.nectar.testnet, amount 5000000, memo "faucet"} (5 NVDAx).
- $ cargo test --workspace → exit 0, 710 passed / 0 failed / 0 ignored: mock-ft 38 + 1; nectar-core unit 608; nectar-core sandbox 51 (sandbox 5, evm 20, p1 5, p2 6, reserve 2, v7 9, v7b 4); test-stubs 12.
(o) PASS. `git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app"` → 3063 lines in 87 files (o-git-grep.log). Every hit is in an allowed class:
- Redirect config: apps/web/lib/hosts.ts:38 and apps/web/.env.example:17, the LEGACY_HOSTS docs ("the real *.vercel.app list lives in the Vercel env only").
- Test fixture: apps/web/lib/test-assets.test.ts:28 (`nectar-git-branch.vercel.app`).
- Historical records: evidence/ (75 files, mostly WO-34 crawl/inventory JSON), docs/EVIDENCE.md, docs/process/state.md, docs/FACTS.md, docs/process/work/* (13), docs/process/final-report.md, docs/process/prd.md, docs/process/prd-v6.md, docs/process/build-prompt.md.
- docs/process/human-handoff.md:108,124: lines under "Earlier answer" / "Original request (kept for the record)" in the CLOSED H-DOMAIN entry.
- 0 hits in README.md, docs/SUBMISSION.md, docs/process/x-post.md, apps/docs-site, packages, services.
(h) Not part of this run. WO-66: local only, no preview. Production acceptance and G9 follow in WO-67.
$ pnpm verify → exit 0: ui 7/0, feed 79/0, keeper 327/0, x402 41/0, sdk 218/218, web unit 43 pass / 0 fail / 1 skipped. demo-testnet read: 2.2.1-v7, Q_c $16,119.22, R_c $10.00, haircut 2500 bps, session closed.
$ node scripts/check-no-branding-all.mjs → exit 0.
Clone state afterwards: 145 tracked changes, all regenerated test output (evidence/G3/screens 92, evidence/G3/design 45 PNGs from the e2e, apps/web 6 LH/test outputs, .feedtmp, ev). No source file changed. config.yaml restored.
Explorer links: none opened (G3b has no explorer criterion; tx 2A4jN155… was proven through RPC tx status).
Screenshot: evidence/G3b/claims-how-20261112T2019Z.png (hydrated #how section, live Reserve $10, desktop).
Evidence: evidence/G3b/verifier-rerun8-20261112T2019Z/
- Scripts: run8.sh, r8-setup.sh, r8-cargo.sh, r8-cargo2.sh, r8-copy.sh, r8-greps.sh, r8-paramgrep.sh, r8-docs-render.sh; probes g3b-claims-probe.mjs, g3b-docs-render.mjs, docs-sweep.mjs, chain-views.mjs.
- Phase logs: phase1/2.txt, run-master.log.
- Test logs: e2e-local.log, e2e-claims-assets.log, e2e-v7-chains.log, e2e-hosts*.log, e2e-inventory.log, lh.log, selector-*.
- Claims: claims-probe.{json,log}, chains-probe.*, landing.html, landing-check.*, chamber-probe.json, banner-probe.*.
- Hosts and docs: hosted-curl.txt, docs-sweep.*, docs-render.*, crawl/ (crawl.json, crawl.md).
- Greps: k-git-grep*.log, o-git-grep.log, m/param-grep-*.txt.
- Cargo: n/ (cargo-phase.txt, chain-views.{json,log}, fixture-archival.log, mockft-test-sdkroot.log, workspace-summary.txt, workspace-tests-list.log, default-SDK failure tails; the home path in the cargo-near command line of mockft-build-default-sdk.tail.log is redacted to `~`, so my evidence adds 0 `/Users/[A-Za-z]` hits).
- Feed: feed-*.json.
- Other: verify.log, branding.log.
**Final verdict, G3b re-run 8: FAIL, 2 reasons. Neither is a product assertion, so no docs/process/gate-fail-g3b-r8.md, per the gate rule.**
- (d): crawl.mjs:83 expects the pre-WO-62b docs redirect, and the crawler does not crawl a separate DOCS/STATUS origin. Fix in apps/web/scripts/crawl.mjs, then re-run (d).
- (k): a real home path in evidence/WO-62b/hosts-spec-20261112T195948Z.log:20,42. Redact it.
- PASS: (a), (b), (c), (e), (f), (g), (i), (j), (l), (m), (n), (o) and the real selector. (h) was not run (local only, by order).

### G3b re-run 7b — RELEASE 3 5f011bb, item (d) only — PASS — 2026-11-12T16:14Z–16:31Z — commit 5f011bb
Order: item (d) of docs/process/work/g9-g3b-final-4.md + `pnpm --filter docs-site build`, plus a curl of every hosted-Feed href in the docs build.
- Fresh clone /tmp/verify-G3b-r7b-20261112T1614Z (`git clone /Volumes/T7/nectar-labs`, `git checkout 5f011bb7f2ddc1df18c11c1464cdf12f3b993dd0`) on the internal disk. node v22.23.4, pnpm 10.34.9, `pnpm install --frozen-lockfile` exit 0. No secrets: SITE_URL / APP_URL / FEED_URL / DOCS_ORIGIN / E2E keys unset. PW_CHANNEL=chrome.
- `git diff --stat 4c2a0bb HEAD -- apps packages services contracts` → 2 files changed, 2 insertions(+), 2 deletions(-): apps/docs-site/docs/integrate/feed-rest.md and operations/monitoring.md.
- Own ports 3983 (site/app) and 3984 (docs). Both servers stopped on kill, 0 listeners left. Host services untouched. The clone has 0 tracked changes afterwards.
$ pnpm --filter docs-site build → exit 0 ("Generated static files in build").
Hosted-Feed hrefs in apps/docs-site/build (grep `href="https://feed-production-2f2776c9.up.railway.app…"`):
- 2 hrefs, both https://feed-production-2f2776c9.up.railway.app/health, on integrate/feed-rest.html and operations/monitoring.html (source lines feed-rest.md:9, monitoring.md:9; the link text still shows the bare origin).
- `curl` /health → 200 (0.72 s); /health body ok:true, chain_head = last_indexed_block 277386308, lag 0. Control: bare origin → 404.
- Code-block URLs in feed-rest.md:65–66 (not hrefs): /healthz → 200, /api/feed → 200.
(d) docs via `node apps/web/scripts/serve-docs.mjs --port 3984`; web `SITE_URL=http://site.localhost:3983 APP_URL=http://app.localhost:3983 DOCS_ORIGIN=http://localhost:3984 pnpm build` (exit 0) + `next start -p 3983`; app /docs/integrate/feed-rest → 200.
$ PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3983 --app http://app.localhost:3983 (16:15:17–16:30:28Z) → **exit 0**: 88 internal, 45 external, 0 failures, 0 of our console errors, 0 page loads with third-party failures. Politeness: concurrency 1, 1500 ms.
- Against run 7 (ports normalised): the external https://feed-production-2f2776c9.up.railway.app/ (404) is replaced by …/health (200, from /docs/integrate/feed-rest).
- One internal route fewer: /notes?tab=deposits. It is linked from Earn.tsx ("Your commitments … Portfolio"), which is unchanged between releases 2 and 3, so this is crawl discovery that varies with the page's data, not a missing page.
- 33 warnings, none failing: local-run links (localhost:3100) not fetched, and soft external statuses (e.g. solana.com 429).
Explorer links: none opened (G3b has no explorer criterion).
Evidence: evidence/G3b/verifier-rerun7b-20261112T1614Z/ (r7b.sh, run.txt, run-master.log, build-docs.log, build-hosted.log, feed-hrefs.txt, feed-href-pages.txt, feed-curl.txt, feed-health.json, docs-src-railway.txt, crawl/ (crawl.json, crawl.md), crawl.log, crawl-diff-vs-r7.txt).
**Verdict, G3b re-run 7b (d): PASS.** Runs 7 (a)–(l) except (d), on release 2 4c2a0bb, and 7b (d), on release 3 5f011bb, together cover release 3. The only difference under apps/packages/services/contracts is the 2 docs lines that (d) re-tested.

### G3b re-run 7 — RELEASE 2 4c2a0bb, run-7 order (a)–(l) + real selector — FAIL (1 docs-only reason, (d)) — 2026-11-12T15:30Z–16:09Z — commit 4c2a0bb
Order: docs/process/work/g9-g3b-final-4.md at 4c2a0bb (run 6 block + run 7 block) + wo-50 (→ wo-48).
- Fresh clone /tmp/verify-G3b-20261112T1530Z (`git clone /Volumes/T7/nectar-labs`, `git checkout 4c2a0bba01296f932d26bda131163adbb3c8bae6`) on the internal disk.
- No secrets: NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER / SITE_URL / APP_URL / FEED_URL unset. node v22.23.4, pnpm 10.34.9, `pnpm install --frozen-lockfile` exit 0.
- Own ports: 3971 local, 3972 hosts, 3973 inventory/crawl, 3974 docs, 3975 Feed (views mode), 3977 web + FEED_URL.
- Host services were untouched: 8545/8788–8791 kept listening throughout. I signed nothing.
- All 7 of my servers stopped on kill, none refused, and afterwards 0 listeners were left on 3971–3977.
- One master script ran every step (run7.sh = the run-6 run.sh plus (l)), with timestamps in phase1.txt and phase2.txt.
Spec diff 3126773..4c2a0bb (e2e/, playwright.config): only v7.spec.ts, +56 lines (the WO-35i #chains tests). No assertion was removed, and playwright.config is unchanged.
$ pnpm --filter web build → exit 0. (g) $ node apps/web/scripts/check-trace.mjs → exit 0.
$ curl -sI :3971{/,/borrow,/api/health,/docs,/about} → all 5 carry XFO DENY, HSTS, CSP frame-ancestors 'none'. /api/health → ok true, nectar-core-v2.nectar.testnet 2.2.1-v7.
$ PW_CHANNEL=chrome PORT=3971 E2E_BASE_URL=http://localhost:3971 pnpm --filter web e2e (15:33:44–15:42:02Z) → exit 0: 483 passed · 0 failed · 108 skipped · 1 flaky.
- The flaky test is phone remote.spec.ts:199 (Solana remote borrow, mocked). getByTestId('remote-authority') was not found within 5 s, and retry #1 passed.
- The spec is unchanged since run 6, which had 0 flaky. This is a timing flake, non-blocking; the error context is in flaky-remote-199-phone-error-context.md.
- (a) site-pages.spec 19/19 desktop + 19/19 phone. screens.spec 46/46 + 46/46, incl. /docs dark/light.
$ LH_BASE_URL=http://localhost:3971 pnpm --filter web lighthouse → exit 0. (e) 20 routes × 2 themes = 40/40 at a11y 100.
Real selector (g3b-selector-probe.mjs, real Chrome, fresh context, mock undefined, /borrow):
- The banner is visible before Connect. 6 wallets: Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI.
- Desktop rows y 268–692, phone y 420–844. 6/6 rows are in the viewport without scrolling, with the centre hit inside each. 0 overlap the banner, which is hidden while the selector is open.
- As in R3–R6, the corner hit-tests miss. I clicked no wallet.
(l) WO-35i, hydrated.
- `npx playwright test e2e/v7.spec.ts -g "landing #chains"` → 8 passed (desktop + phone), covering config flags with a v2 mock plus pinned solana_remote / base / both.
- The hand check (g3b-chains-probe.mjs) ran in real Chrome on my `next start` :3971 against the real testnet RPC, with consent declined and no pins except the localhost __NECTAR_E2E_MOCK__ flags. Output: chains-probe.{json,log}, PASS.
- Config flags as shipped (solana_remote true, base false):
  - On desktop and phone, the hydrated section#chains textContent equals the server-HTML section text (normalised). The heading is "NEAR holds the book. Solana holds the stock.", and #hublinks is drawn.
  - 3 sentences name Base, and all 3 say "local fork": "The Base leg runs on a local fork of Base Sepolia, not on Base Sepolia itself." / "…secp256k1 (the Base Sepolia local fork)." / "On the Base Sepolia local fork, NectarVaultBase checks EIP-712 with ecrecover."
  - 0 console errors.
- Pinned flags:
  - [] → no section, no Chains link.
  - [solana_remote] → text equals the server HTML, 3/3 Base sentences say local fork.
  - [base] → heading "A Base Sepolia local fork holds the stock.", #nbase present, 6/6 Base sentences say local fork.
  - [both] → "Solana and a Base Sepolia local fork hold the stock.", 6/6.
  - The pinned runs differ from the server HTML only where the pin differs from config.yaml. Pins act on the client only, so this is expected.
- LandingNav: the "Chains" link (#chains) is present exactly when section#chains is, in both the server HTML and the hydrated DOM, in all 6 runs.
- The console errors in the pinned runs are FastNEAR CORS refusals (a throttled 429 without a CORS header) and net::ERR_FAILED. Third-party.
- Screenshot: evidence/G3b/chains-hydrated-20261112T1530Z.png (hydrated section, config flags, desktop).
(i) WO-35w claims.
- Raw HTML (landing-check.cjs): no "0123456789" in the text or meta. 3 Base lines, all with local fork. TEE 5/5 verifiable, 0 private/confidential. No "until the Reserve ships".
  - landing-check exits 1 only because 10% is absent from the static HTML, which holds state 01 only (as in run 6).
- Chamber probe: phase 01 40%, phase 02 70% + haircut 10%, weekend 25%, matching config.yaml 4000/7000/1000/2500.
- Hydrated innerText (per the WO-34v2 trap): no 0123456789; Base lines 3/3 local fork; TEE lines all verifiable, none private/confidential; no "until the Reserve ships".
- Banner with a views-mode Feed from this clone (:3975 → web :3977):
  - /feed: banner + views-empty settlements line. /keepers: banner. /status: "isn't indexed on this host (the Feed reads contract views only)".
  - Negative control, :3971 with no Feed: no banner; "not configured" ×2.
(j) feed 79/0, keeper 301/0.
- Feed /health: chain_head_source "view_block", history "unavailable", rpc {4 endpoints, last_served test.rpc.fastnear.com, failovers 4, cooling []}.
- chain_head 277383379 = last_indexed_block (lag 0) ≤ RPC final 277383382. Second sample: 277383442 = 277383442.
(k) `git grep -l "/Users/"` → 7 files: the 6 contracts/nectar-core/tests/fixtures/*.wasm (sha256 in k-git-grep.log) + docs/process/work/g9-g3b-final-4.md:39.
- The 7th hit is the run-6 order line quoting the grep pattern itself (`git grep -l "/Users/"`), not a home path.
- `git grep -l '/Users/[A-Za-z]' -- ':!*.wasm'` → 0. PASS with this note. The literal list holds one more file than the order states.
(b) Hosted build, `next start -p 3972`, docs via serve-docs :3974: `E2E_HOSTED=1 E2E_DOCS=1 … hosts.spec.ts --project=desktop` → 7/7, incl. the APP /docs/* proxy.
(c) Hosted build on site/app.localhost:3973; app /docs/start/quick-start → 200.
- `E2E_INVENTORY=1 … --project=inventory` → 6/6 in 4.3 min. cspBypassed false, cspViolations [], 6/6 wallets reached the prompt with 0 violations each.
- 12 measured hosts = 12 committed, all in backticks in privacy.md (inv-compare.log). The clone's content/ was restored.
(d) **FAIL.** `PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3973 --app http://app.localhost:3973` (15:52–16:07Z) → exit 1: 89 internal, 45 external, **1 failure**, 0 of our console errors, 25 page loads with third-party network failures.
- The failure is external https://feed-production-2f2776c9.up.railway.app/ → status 404, linked from http://app.localhost:3973/docs/integrate/feed-rest.
- The source is apps/docs-site/docs/integrate/feed-rest.md:9, which reads "Hosted, read-only, at [https://feed-production-2f2776c9.up.railway.app](…)". It was added in 1419028 ("fix(docs-site): security headers; no localhost link"), after 3126773.
- Re-probed 16:08:51Z: / → 404, /health → 200 (feed-root-probe.txt).
- The third-party failures are FastNEAR CORS refusals on 429 replies. They are listed, not counted.
(f) `NECTAR_PRODUCTION=1 SITE_URL=… APP_URL=… pnpm build` → exit 0, and check-trace after it → exit 0.
- With `operator: null` at config.yaml:108 (clone only), the build exits 1 with "Production build refused (WO-34a guard): config.yaml site.operator is null (TODO-H-LEGAL)". Restored, 0 changes left.
$ pnpm verify → exit 0: ui 7/0, feed 79/0, keeper 301/0, x402 41/0, sdk 203/203. demo-testnet read: 2.2.1-v7, Q_c $16,119.22, R_c $10.00, session closed.
$ node scripts/check-no-branding-all.mjs → exit 0.
(h) Orchestrator-run, reviewed read-only (main repo evidence/WO-34/*4c2a0bb*):
- Web (preview-smoke-web-4c2a0bb-20261112T153223Z.log, dpl_5Uwn…): 28 routes, 0 failures (/quote 307, the rest 200), /api/health ok:true.
- The hydrated landing check in the same log: #chains present on server + hydrated, server text == hydrated text, heading "Solana holds the stock.", 3 Base sentences with 0 lacking local fork, no 0123456789. This agrees with my (l).
- 2 console errors on the preview = third-party (FastNEAR CORS / vercel.live feedback.js blocked by CSP), as classified in earlier runs.
- Docs (preview-smoke-docs-4c2a0bb-20261112T153401Z.log, dpl_ArXm…):
  - / → 307 /docs/, with CSP frame-ancestors 'none' and XFO DENY.
  - "pages 56, assets 6, failures 0", smoke exit 0.
  - Client nav to quick-start works, 0 failed same-origin requests, 0 console errors.
  - The theme toggle reaches both dark and light.
- The PNG shows the docs hydrated with no "did not load properly" banner.
- nodejs22.x: no runtime log, the same accepted deviation as runs 5/6 (engines `>=22.22.2 <23`).
- My call: (h) = PASS with deviation.
Explorer links: none opened (G3b has no explorer criterion).
Evidence: evidence/G3b/verifier-rerun7-20261112T1530Z/
- Scripts: run7.sh, r7-setup.sh, r7-copy.sh.
- Phase logs: phase1/2.txt, run-master.log.
- Test logs: e2e-local.log, e2e-v7-chains.log, chains-probe.{mjs,json,log}, lh.log, selector-*.
- Landing and banner: landing.html, landing-check.*, chamber-probe.json, banner-probe.*.
- Feed: feed-*.json, rpc-final.json.
- Item logs: k-git-grep.log, e2e-hosts.log, e2e-inventory.log, inv-compare.log, crawl/ (crawl.json, crawl.md), feed-root-probe.txt, verify.log, branding.log.
**Final verdict, G3b re-run 7: FAIL, 1 reason (d).**
- The docs link to the hosted Feed root answers 404, so the crawl exits 1. A docs-only fix is possible, e.g. link /health or /api/feed instead of the bare origin.
- (a)–(c), (e)–(g), (i), (j), (l) PASS. (h) PASS with deviation (nodejs22.x). (k) PASS with a note.

### G3b re-run 6 — FROZEN commit 3126773, run-6 order (a)–(k) + real selector — PASS with one disclosed deviation — 2026-11-12T14:13Z–14:58Z — commit 3126773
Order: docs/process/work/g9-g3b-final-4.md at b684b64 ("Run 6" block) + wo-50 (→ wo-48). Fresh clone /tmp/verify-G3b-20261112T1413Z (`git clone /Volumes/T7/nectar-labs`, `git checkout 312677303720a70e76823901f7968e4ff7c0891d`), on the internal disk. Setup:
- No secrets: NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER / SITE_URL / APP_URL / FEED_URL unset. node v22.23.4, pnpm 10.34.9, `pnpm install --frozen-lockfile` exit 0.
- Own ports: 3961 local, 3962 hosts, 3963 inventory/crawl, 3964 docs, 3965 Feed (views mode, this clone), 3967 web + FEED_URL.
- I touched no host service (8545/8788–8791 kept listening) and signed nothing. All 7 of my servers stopped on kill (none refused); afterwards 0 listeners on 3961–3967.
- One master script ran every step in order: ev/run.sh, timestamps in phase1.txt / phase2.txt.
Spec diff ca34111..3126773 (e2e/, playwright.config, scripts):
- shell.spec:16 allowlist adds the TESTNET_RPC_FALLBACKS hostnames. This is the run-5 follow-up.
- notes.spec:178 and p1.spec:29 regexes add the new views-mode text "Event history isn't indexed on this host" as an alternative. The old texts are still accepted.
- playwright.config is unchanged, and no assertion was removed.
$ pnpm --filter web build → exit 0. (g) $ node apps/web/scripts/check-trace.mjs → exit 0.
$ curl -sI :3961{/,/borrow,/api/health,/docs,/about} → all 200, each with XFO DENY, HSTS max-age=63072000; includeSubDomains, CSP frame-ancestors 'none'. /api/health → ok true, nectar-core-v2.nectar.testnet 2.2.1-v7.
$ PW_CHANNEL=chrome PORT=3961 E2E_BASE_URL=http://localhost:3961 pnpm --filter web e2e (14:16–14:24Z) → exit 0: 476 passed · 0 failed · 108 skipped · 0 flaky (desktop 265, phone 211; skips are the opt-in inventory/hosted tests).
- (a) site-pages.spec 19/19 desktop + 19/19 phone. screens.spec 46/46 + 46/46, incl. /docs dark/light.
$ LH_BASE_URL=http://localhost:3961 pnpm --filter web lighthouse → exit 0. (e) 20 default routes (incl. /about /status /changelog /brand /talk /security) × 2 themes = 40/40 at a11y 100.
Real selector (g3b-selector-probe.mjs, real Chrome, fresh context, __NECTAR_E2E_MOCK__ undefined, /borrow):
- The consent banner is visible before Connect. Connect → 6 wallets: Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI.
- Desktop rows y 268–692, phone y 420–844. All rows are in the viewport without scrolling, and the centre hit lands inside every row.
- With the selector open the banner is hidden, so nothing overlaps a row. As in R3–R5, the 3 px-inset corner hit-tests miss the row element; the screenshot shows nothing covering any row. I clicked no wallet.
(i) WO-35w landing claims. Rendered HTML of / from the local build: ev/landing.html, checked by landing-check.cjs → landing-check.log. After hydration, chamber-probe.json.
- Visible text and meta description / og / twitter contain no "0123456789". It is absent from the raw HTML too, scripts included.
- Base: "NEAR holds the book. A Base local fork holds the stock." No Base Sepolia line lacks the local-fork wording.
- TEE lines: 5/5 say verifiable/verifiably, 0 say private/confidential, and "confidential" appears nowhere in the visible text. No "until the Reserve ships".
- Worked example (chamber, reduced motion, buttons 01–04): static lender 40%, in-session ceiling 70% with haircut 10%, weekend haircut 25%. These match config.yaml base_ltv 4000 / max 7000 / haircut 1000 / weekend 2500.
  - The static HTML holds only state 01, so the 10% shows after a click on 02. Hence the browser probe.
- Event-history banner, using a views-mode Feed from this clone: `FEED_INDEXER=views FEED_PORT=3965 FEED_MCP_PORT=off FEED_DB_PATH=<clone> CORE_ACCOUNT_ID=nectar-core-v2.nectar.testnet node src/main.ts`. Web: the same build, `FEED_URL=http://localhost:3965 next start -p 3967`.
  - /api/indexer/healthz → source "views", events_indexed 0, history "unavailable".
  - /feed: "Event history isn't indexed on this host" banner, plus the views-empty settlements line. /keepers: banner. /status: "Event history: isn't indexed on this host (the Feed reads contract views only)".
  - Negative control, :3961 with no Feed: no banner; "Feed indexer not configured" ×2 (banner-probe.json).
(j) WO-35k. `pnpm --filter ./services/feed test` 79/0 and `pnpm --filter ./services/keeper test` 301/0.
- Feed /health (views mode) has `chain_head_source` "view_block", `history` "unavailable" and `rpc` {endpoints: the 4 fallback hosts, last_served test.rpc.fastnear.com, failovers 0, cooling []}.
- chain_head 277375290 ≥ last_indexed_block 277375290 (lag 0). RPC final was 277375294 one second later, so the head is not ahead of the chain. Second sample: 277375349 = 277375349.
- /api/settlements → items [] with history "unavailable".
(k) `git grep -l` for the home-path prefix (slash-Users-slash) on 3126773 → 6 files, all contracts/nectar-core/tests/fixtures/nectar_core_{p0,v1,v1c,v2,v21,v22}.wasm, 0 others. sha256 values are in k-git-grep.log.
(b) Hosted build (SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=http://localhost:3964), `next start -p 3962`, docs via `node apps/web/scripts/serve-docs.mjs --port 3964`.
- `E2E_HOSTED=1 E2E_DOCS=1 E2E_BASE_URL=http://localhost:3962 npx playwright test e2e/hosts.spec.ts --project=desktop` → 7/7, incl. the APP /docs/* proxy with the prefix kept.
(c) Hosted build on site/app.localhost:3963, `next start -p 3963`. App /docs/start/quick-start → 200.
- `E2E_INVENTORY=1 INV_SITE=… INV_APP=… PW_CHANNEL=chrome npx playwright test --project=inventory` → 6/6 in 4.4 min. cspBypassed false, cspViolations [], 6/6 wallets reached the frame / connect prompt with 0 violations each.
- Measured 12 third-party hosts = committed 12. All 12 are in backticks in privacy.md (inv-compare.log). The clone's content/ was restored afterwards.
(d) `PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3963 --app http://app.localhost:3963` → exit 0: 89 internal, 45 external, 0 failures, 0 of our console errors, 0 third-party network failures.
(f) `NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build` (apps/web) with operator as committed → exit 0. check-trace after it → exit 0.
- Then, in the clone only: config.yaml:108 → `operator: null`, same build → exit 1 with "Production build refused (WO-34a guard): config.yaml site.operator is null (TODO-H-LEGAL)". Guard PASS. Restored with `git checkout`; 0 changes under packages/config.
$ pnpm verify → exit 0: ui 7/0, feed 79/0, keeper 301/0, x402 41/0, sdk 203/203. demo-testnet (read-only): 2.2.1-v7, Q_c $16,119.22, R_c $10.00, session closed.
$ node scripts/check-no-branding-all.mjs → exit 0.
(h) Orchestrator-run, reviewed read-only (main repo evidence/WO-34/*3126773*):
- web (preview-smoke-web-3126773-20261112T141408Z.log, dpl_5etJ…): 28 routes, 0 failures (/quote 307, the rest 200), /api/health ok:true. Landing counters 0123456789=0, local_fork=1, verifiable=5, tee_private=0, reserve_stale=0, which agree with my (i). /about /talk /security show operator + contact, TODO-H=0.
- docs (preview-smoke-docs-3126773-20261112T141531Z.log, dpl_DT8r…):
  - / → 307 /docs/, /docs/ → 200, no loop (WO-34w).
  - "pages 56, assets 6, failures 0", smoke exit 0 (WO-34q/WO-34s). 56 = the page count of my docs build.
  - legal + quoter-tee pages: TODO-H=0, tee_private=0.
- Browser (preview-browser-docs-3126773-20261112T141531Z.log): /docs/ + 3 pages show banner false and hydrated true, client navigation works, 0 failed same-origin requests, 0 console errors. Theme toggle dark→light→dark→light reaches both values.
- nodejs22.x: no runtime log for 3126773, the **same accepted deviation as run 5**. Engines `>=22.22.2 <23` (apps/web/package.json:52, this clone) is the cover, re-checked in WO-34v.
- My call: (h) = PASS with deviation.
Observations (non-blocking, follow-up):
1. The docs preview's feedLink points at nectar-labs-f6wqvmtcz-…, not at the web preview under test (nectar-labs-q10asadem-…). The docs build's APP_URL names another web deployment. Check it on the production URLs (WO-34v).
2. The web shows the banner when Feed `source == "views"` or `events_indexed == 0`; it does not read `history`. A views-mode Feed with KEEPER_DB_PATH (source "views+tx_status") that has stored tx-status events would report history "unavailable" while the banner stays hidden. Not reproduced here: it needs a keeper DB.
Explorer links: none opened (G3b has no explorer criterion).
Screenshot: evidence/G3b/selector-phone-20261112T1413Z.png (real selector, phone).
Evidence: evidence/G3b/verifier-rerun6-20261112T1413Z/
- run.sh, phase0–2.txt, install and build-* logs, check-trace{,-prod}.log
- headers-local.txt, health-local.json, e2e-local.log, lh.log, selector-probe.log + selector-visibility.json
- landing.html, landing-check.{cjs,log}, chamber-probe.json, banner-probe.{json,log}
- feed-health*.json, feed-healthz.json, feed-settlements.json, web-indexer-healthz.json, rpc-final.json, feed/keeper-test.log
- k-git-grep.log, e2e-hosts.log, e2e-inventory.log, data-inventory.*, inv-compare.log, crawl/, verify.log, branding.log
**Final verdict, G3b re-run 6: PASS with one disclosed deviation** (nodejs22.x unobservable on the preview, pinned). (a)–(g), (i), (j), (k) PASS; (h) PASS with deviation. The full e2e has 0 failed and 0 flaky.

### G3b re-run 5 — code-final commit, run-5 order (a)–(h) + real selector — PASS with one disclosed deviation ((h) re-reviewed 13:29Z) — 2026-11-12T10:41Z–11:40Z — commit ca34111
Order: docs/process/work/g9-g3b-final-4.md at f1d74d9 + wo-50 (→ wo-48). Fresh clone /tmp/verify-G3b-20261112T1041Z (`git clone /Volumes/T7/nectar-labs`, `git checkout ca3411115aed1d6c127e2d82ba9f31a163221496`). Only docs/process/work/g9-g3b-final-4.md changes between ca34111 and f1d74d9. Setup:
- No secrets: NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER / SITE_URL / APP_URL unset. node v22.23.4, pnpm 10.34.9, `pnpm install --frozen-lockfile` exit 0.
- Own ports: 3951 (local), 3952 (hosts), 3953 (inventory/crawl), 3954 (docs). I touched no host service and signed nothing.
- All 4 of my servers stopped on kill (none refused); afterwards 0 listeners on 3951–3954.
Spec diff fd06e11..ca34111 (e2e/ + scripts):
- site-pages.spec now reads config.yaml `site:` through the app's loader and asserts the configured operator/contact/X handle. When a field is null it falls back to the "not configured" text.
- hosts.spec adds the WO-34t /docs proxy test (opt-in E2E_DOCS=1).
- check-trace.mjs and serve-docs.mjs gain the /docs prefix.
- engines.node is now ">=22.22.2 <23".
- No assertion was weakened, and playwright.config is unchanged.
$ pnpm --filter web build → exit 0. (g) $ node apps/web/scripts/check-trace.mjs → exit 0, "6/6 routes carry packages/config/config.yaml" (/api/health, /api/feed, /feed/[symbol], /position/[id], /note/[id], /quote/[id]).
$ curl -sI :3951{/,/borrow,/api/health,/docs,/about} → all 200, each with X-Frame-Options DENY, HSTS max-age=63072000; includeSubDomains, CSP frame-ancestors 'none'. /api/health → ok true, nectar-core-v2.nectar.testnet 2.2.1-v7, rpc[] lists the 4 fallback hosts.
$ PW_CHANNEL=chrome PORT=3951 E2E_BASE_URL=http://localhost:3951 pnpm --filter web e2e
  Run 1 (10:43–10:54Z): exit 0. 475 passed · 0 failed · 108 skipped · 1 flaky (desktop 265/0/24; phone 210 + 1 flaky / 0 / 78; inventory 6 opt-in skips). The skips are 2 more than R4 because hosts.spec gained 1 test per project (it skips in local mode).
  Run 2 (11:00–11:12Z, same server): exit 0. 472 · 0 · 108 · 4 flaky.
  All 5 flaky are phone shell.spec:10 (/, /security, /changelog ×2, /legal/terms). The first attempt fails at shell.spec:26 "no external requests except RPC before consent" with received ["near-testnet.drpc.org", …], and the retry passes.
  Cause: the shell.spec:16 allowlist accepts only `localhost` and `*.fastnear.com`. When FastNEAR throttles under e2e load, the SDK fails over to dRPC (WO-34g, which is in the CSP and privacy.md). dRPC is an RPC, so the product behaves as declared and the spec allowlist is stale. Open item: add TESTNET_RPC_FALLBACKS to that allowlist. rpc-status.log (11:12Z): all 4 hosts answer chain_id testnet.
  (a) site-pages.spec 19/19 desktop + 19/19 phone, with /about /talk /security asserting the filled operator/contact. screens.spec 46/46 desktop + 46/46 phone in both runs, including /docs. testnet.spec and live-views ✓ on desktop in both runs.
$ LH_BASE_URL=http://localhost:3951 pnpm --filter web lighthouse → exit 0. (e) 20 routes (incl. /about /status /changelog /brand /talk /security) × 2 themes = 40/40 at a11y 100.
Real selector (g3b-selector-probe.mjs from R4, real Chrome, fresh context, __NECTAR_E2E_MOCK__ undefined, /borrow):
- The consent banner was visible before Connect. Connect → 6 wallets (Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI).
- Desktop rows are at y 268–692 and every row is in the viewport without scrolling; the centre hit-test lands inside each row. Phone: same.
- With the selector open the banner is hidden, so nothing can overlap. As in R3/R4, the 3 px-inset corner hit-tests miss the row element. The screenshot shows nothing covering any row. I clicked no wallet.
(b) Hosted build (SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=http://localhost:3954), `next start -p 3952`, `node apps/web/scripts/serve-docs.mjs --port 3954`.
  `E2E_HOSTED=1 E2E_DOCS=1 E2E_BASE_URL=http://localhost:3952 npx playwright test e2e/hosts.spec.ts --project=desktop` → 7/7: www 301, APP / → /feed, SITE↔APP 308, per-host routes, robots/sitemap/canonical, and APP /docs/* proxy with the prefix kept (/docs 200, /docs/ 308 → /docs, quick-start 200, main.<hash>.js 200).
(c) Hosted build (SITE_URL=http://site.localhost:3953 APP_URL=http://app.localhost:3953 DOCS_ORIGIN=http://localhost:3954), `next start -p 3953`. App /docs/start/quick-start → 200.
  `E2E_INVENTORY=1 INV_SITE=… INV_APP=… PW_CHANNEL=chrome npx playwright test --project=inventory` → 6/6 in 4.9 min.
  - cspBypassed false, cspViolations []. All 6 wallets reached their sandboxed frame / connect prompt with 0 violations each.
  - Third-party hosts measured 12 = committed apps/web/content/data-inventory.json 12 (nothing only-committed or only-measured). All 12 appear in backticks in apps/docs-site/docs/legal/privacy.md (inv-compare.log).
(d) `PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3953 --app http://app.localhost:3953` → exit 0: 89 internal, 45 external, 0 failures, 0 of our console errors.
  12 page loads (/feed, /reserve, /keepers, /quote/new, /console) logged third-party network failures: FastNEAR 429 answers without a CORS header. crawl.md lists these as non-failures. In R4 there were 0.
(f) `NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build` (apps/web), operator fields as committed → exit 0, 26/26 pages generated. check-trace after it → exit 0.
  Then in the clone only: `operator: "Nectar Labs"` → `operator: null` (config.yaml:108) and the same build → exit 1 with "Production build refused (WO-34a guard): config.yaml site.operator is null (TODO-H-LEGAL)". Guard PASS. The file was restored (`git checkout`), and git status shows no config change.
$ pnpm verify → exit 0. ui 7/0, feed 73/0, keeper 293/0, x402 41/0, sdk 203/203. demo-testnet (read-only): nectar-core-v2 2.2.1-v7, Q_c $16,119.22. $ node scripts/check-no-branding-all.mjs → exit 0.
(h) Orchestrator-run, reviewed read-only (main repo evidence/WO-34/*ca34111*). As of 11:40Z: **PENDING, not FAIL**, because some bullets had no log yet. Superseded by the 13:29Z re-review below.
  - web (preview-smoke-web-ca34111-20261112T104227Z.log, dpl_5H5z…): 28 routes, 0 failures (/quote 307, the rest 200), /api/health ok:true. /about, /talk and /security show the operator/contact, TODO-H=0.
  - nodejs22.x: NOT observed. preview-runtime-ca34111-note.log says the runtime logs are empty, and the only cover is the engines pin "<23".
  - docs root (preview-smoke-docs-ca34111-20261112T104350Z.log, dpl_Choo…): / → 307 /docs/, /docs/ → 200, /index.html 308 → /, no loop (WO-34w met). The legal pages show the operator, TODO-H=0, governing=0.
  - docs pages + assets: that log has NO "docs smoke …: pages N, assets M, failures F" line, which is the smoke-docs.sh page + asset check. So "every page 200 without .html" (WO-34q) and "every /docs/assets/* and /docs/img/* 200" (WO-34s) are not evidenced for ca34111.
  - Browser (preview-browser-docs-ca34111-…log): /docs/ and 3 more pages show banner false, hydrated true, 0 failed same-origin requests, 0 console errors, and client navigation works. A theme-toggle check is not in the log.
Explorer links: none opened (G3b has no explorer criterion).
Screenshot: evidence/G3b/selector-phone-20261112T1041Z.png (real selector, phone).
Evidence: evidence/G3b/verifier-rerun5-20261112T1041Z/
- phase1.txt, phase2.txt
- install, build-local/-docs/-hosts/-inv/-prod/-prod-guard logs, check-trace{,-prod}.log
- headers-local.txt, health-local.json, rpc-status.log
- e2e-local{,-run2}.log, lh.log, selector-probe.log + selector-visibility.json
- e2e-hosts.log, e2e-inventory.log, data-inventory.{committed,measured}.json, inv-compare.log
- crawl/, verify.log, branding.log, probe scripts
The 40 LH JSON reports stay in the clone.
Verdict (11:40Z): PASS on (a)–(g) + selector + headers + verify + branding: both full e2e runs have 0 failed. Disclosed: 1 and 4 flaky, all from the same stale shell.spec allowlist (dRPC fallback). (h) PENDING until the docs page + asset smoke output and the theme-toggle check for ca34111 are logged. nodejs22.x is not observable on the preview and rests on the engines pin.
(h) re-review 2026-11-12T13:29Z (read-only, main repo evidence/WO-34/):
- Smoke-docs (WO-34q/WO-34s): preview-smoke-docs-ca34111-20261112T104350Z.log now has line 10, "docs smoke https://nectar-labs-docs-l5tlzksl5-…vercel.app: pages 56, assets 6, failures 0", and line 11, "smoke exit 0". The coordinator says this was committed in a6269cf; my earlier read showed only 9 lines. 56 equals the page count of my clone's docs build (56 .html excluding 404, 56 sitemap `<loc>`), and failures 0 covers the referenced /docs/assets/* and /docs/img/* as well. Met.
- Theme toggle: preview-theme-docs-ca34111-20261112T132826Z.log (dpl_Choo…, system Chrome headless) shows 1 toggle button and themes dark/dark → light/light → dark/dark → light/light over 3 clicks. Both data-theme values are reached, with 0 console errors, exit 0. Met. Together with the browser log (no banner, hydrated, 0 failed same-origin requests), the WO-34s Chrome bullet is met.
- nodejs22.x: NOT observable. preview-runtime-ca34111-note.log says the runtime logs for dpl_5H5z… are empty because no function logged. I record this as an **accepted deviation**. It is covered by the engines pin `>=22.22.2 <23` (apps/web/package.json, verified in this clone's diff; Vercel selects 22.x per F-432) and is re-checked in WO-34v if a function log appears.
- My call: (h) = **PASS with deviation**, not PENDING. Every other (h) bullet has a ca34111 log. The runtime line cannot be produced on a preview with no function invocations, and the version the bullet protects against is pinned in code.
Follow-up (non-blocking, spec gap): phone shell.spec:10 flake. The shell.spec:16 allowlist should accept the TESTNET_RPC_FALLBACKS hosts (dRPC, Intear) as RPC; the product's failover is declared in the CSP and privacy.md.
**Final verdict, G3b re-run 5: PASS with one disclosed deviation** (nodejs22.x unobservable on the preview, pinned). (a)–(g) PASS, (h) PASS with deviation. Both e2e runs have 0 failed; the 5 flaky tests are a spec gap, follow-up.

### G3b re-run 4 — final commit after WO-34g (cross-provider RPC fallback), WO-34 additions (a)–(f) + real selector — PASS — 2026-11-11T23:00Z–23:40Z — commit fd06e11
Fresh clone /tmp/verify-g3b-20261111T2300Z (`git clone` of this worktree, `git checkout fd06e11`). No secrets: NECTAR_E2E_BORROWER_KEY and NEXT_PUBLIC_E2E_KEY_ADAPTER unset. `pnpm install --frozen-lockfile` exit 0. My own ports only: 3881 (local), 3882 (hosts.spec), 3883 + 3884 (inventory/crawl + docs). I did not touch any host service (keeper 8790, x402 8791, Feed 8788/8789, anvil 8545, the 3217/3533 listeners), and I signed nothing. All four of my servers stopped on kill, none refused, and 0 listeners remained afterwards.
Read docs/process/gate-fail-g3b-r3.md first. Spec diff d4218d4..fd06e11 (e2e/ + playwright.config + scripts):
- testnet.spec, live-views and p1 get `describe.configure({ retries: 2 })` (WO-34g item 4).
- testnet.spec:17 polls /api/health for up to 40 s. It still requires ok true and core = config, and adds stale_s ≤ 60.
- live-views reads through the SDK's resilientRpcTransport instead of a FastNEAR-only fetch.
- inventory.spec lists TESTNET_RPC_FALLBACKS as declared when a run does not reach them.
- No product assertion was removed. playwright.config is unchanged.
$ pnpm --filter web build → exit 0. Server: `next start -p 3881`.
$ curl -sI :3881{/,/borrow,/api/health,/docs} → all 200, with X-Frame-Options: DENY, Strict-Transport-Security: max-age=63072000; includeSubDomains, and a CSP with frame-ancestors 'none'. connect-src lists test.rpc.fastnear.com, rpc.testnet.fastnear.com, near-testnet.drpc.org and testnet-rpc.intea.rs. GET /api/health → ok true, 2.2.1-v7, nectar-core-v2.nectar.testnet, and rpc[] shows the same 4 hosts in fallback order.
RPC status probe (rpc-status.log, 23:22Z): all 4 hosts answer chain_id testnet, with heads 277282177–277282183 (within 6 blocks).
$ PW_CHANNEL=chrome PORT=3881 E2E_BASE_URL=http://localhost:3881 pnpm --filter web e2e
  Run 1 (23:01:44Z–23:09:48Z): exit 0. 476 passed · 0 failed · 106 skipped · 0 flaky.
    desktop 265 passed / 23 skipped; phone 211 / 77; inventory 6 skipped (opt-in project).
  Run 2 (23:10:06Z–23:18:09Z, same server): exit 0. 476 · 0 · 106 · 0 flaky. Neither log contains a "retry #" line.
  Both runs: testnet.spec:17 "api health answers from the contract" ✓ on desktop and phone. live-views:27/40/51 ✓ on desktop. Skips are the write spec (no key), phone copies of desktop-only specs, and capture-only specs.
  (a) site-pages.spec 38/38. screens.spec desktop 46/46, phone 46/46, including /docs dark + light.
$ LH_BASE_URL=http://localhost:3881 pnpm --filter web lighthouse → exit 0. (e) Default list = 20 routes (including /about /status /changelog /brand /talk /security), × 2 themes = 40 pairs, all a11y 100.
Real selector (g3b-selector-probe.mjs, real Chrome, fresh context, typeof __NECTAR_E2E_MOCK__ = undefined, /borrow):
- The consent banner was visible on load, and I did not dismiss it. Connect wallet → 6 wallets: Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI.
- Desktop 1280×900: rows at y 268–692. Phone 400×860: rows at y 420–844. Every row was inside the viewport without scrolling, and the centre hit-test landed inside the row.
- With the selector open, the banner is not visible, so no overlap is possible.
- As in R3, the probe's 3 px-inset corner hit-tests do not land on the row element. The screenshot shows nothing covering any row. PASS on viewport + centre hit + screenshot.
- I clicked no wallet.
(b) Hosted build (SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=https://docs.nectar.test), `next start -p 3882`, then `E2E_HOSTED=1 E2E_BASE_URL=http://localhost:3882 npx playwright test e2e/hosts.spec.ts --project=desktop` → 6/6: www 301, APP / → /feed, SITE↔APP 308, per-host routes + /api, per-host robots/sitemap/canonical.
(c) Setup: `pnpm --filter docs-site build`, a hosted build (SITE_URL=http://site.localhost:3883 APP_URL=http://app.localhost:3883 DOCS_ORIGIN=http://localhost:3884), `node apps/web/scripts/serve-docs.mjs --port 3884` and `next start -p 3883`. App /docs/start/quick-start → 200.
  `E2E_INVENTORY=1 INV_SITE=… INV_APP=… PW_CHANNEL=chrome npx playwright test --project=inventory` → 6/6 in 4.3 min.
  - CSP enforced (cspBypassed false), cspViolations []. All 6 wallets reached their sandboxed frame / connect prompt with 0 violations.
  - Measured hosts[] = 14 (12 third-party + 2 localhost). The third-party set equals the committed data-inventory.json (12 = 12, nothing missing either way). All 12 appear in backticks in apps/docs-site/docs/legal/privacy.md (inv-compare.log).
  - near-testnet.drpc.org was actually reached during the run (on /shield, /quote/new, /quote/0), so the failover was used, under the enforced CSP. testnet-rpc.intea.rs is listed as declared but was not reached.
(d) `PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3883 --app http://app.localhost:3883` → exit 0: 89 internal, 44 external, 0 failures, 0 of our console errors, 0 page loads with third-party network failures.
(f) `NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build` (apps/web) → exit 1, "Production build refused (WO-34a guard): config.yaml site.operator is null (TODO-H-LEGAL); site.country is null; site.contact is null". The failure is expected, so the guard PASSES. As in R3, the null fields stop the build before the TODO-H page-text branch runs, so that branch was not exercised on its own.
$ pnpm verify → exit 0. ui 7, feed 73, keeper 293, x402 41, sdk 203/203, web 28; no suite reports a failure. demo-testnet (read-only): nectar-core-v2 2.2.1-v7, Q_c $16,119.22. The x402 "Facilitator getSupported failed (401)" line is informational. $ node scripts/check-no-branding-all.mjs → exit 0.
Explorer links: none opened (G3b has no explorer criterion).
Screenshot: evidence/G3b/selector-phone-20261111T2300Z.png (real selector, phone, banner state as loaded).
Evidence: evidence/G3/verifier-20261111T2300Z/ (e2e-local.log, e2e-local-run2.log, lh.log, headers-local.txt, rpc-status.log, e2e-hosts.log, e2e-inventory.log, data-inventory.{committed,measured}.json, inv-compare.log, crawl.md, build logs including build-prod-guard.log, verify.log, branding.log, probe scripts). The 40 LH JSON reports stay in the clone.
Verdict: PASS. Both full e2e runs (desktop + phone, screens.spec included) have 0 failed and 0 flaky, and items (a)–(f), the selector, Lighthouse, headers, verify and branding all pass. **GATE_FAIL_G3B_R3 resolved**: the cross-provider fallback is live in CSP and /api/health, and was exercised (dRPC reached during the inventory run).

### G3b re-run 3 — final commit, WO-34 additions (a)–(f) + real selector — FAIL (RPC rate limits in the full e2e) — 2026-11-11T21:44Z–22:29Z — commit d4218d4
Fresh clone /tmp/verify-g3b-20261111T2144Z (`git clone` of this worktree at d4218d4; `git checkout d4218d4`). No secrets: NECTAR_E2E_BORROWER_KEY and NEXT_PUBLIC_E2E_KEY_ADAPTER unset. `pnpm install --frozen-lockfile` exit 0. My own ports only: 3297 (local), 3771 (hosts.spec), 3761 + 3762 (inventory/crawl + docs). No host service was touched, and nothing was signed. All four of my servers stopped on kill (no refusal); none of those ports had a listener afterwards.
Spec diff fd6592d..d4218d4 (e2e/ + playwright.config): hosts/inventory/site-pages specs added; shell.spec +43; helpers ROUTES +/about /status /changelog /brand; hardening.spec Status link now `/status`, and the /api/health no-RSC-prefetch + networkidle assertions are kept. Nothing was weakened.
$ pnpm --filter web build → exit 0.
$ curl -sI http://localhost:3297/borrow → 200 with X-Frame-Options: DENY, Strict-Transport-Security: max-age=63072000; includeSubDomains, and a CSP that includes frame-ancestors 'none'; object-src 'none'; frame-src 'self' https://wallet.intear.tech.
$ PW_CHANNEL=chrome PORT=3297 E2E_BASE_URL=http://localhost:3297 pnpm --filter web e2e
  Run 1 (21:45:45Z–21:54:17Z): exit 1. 475 passed · 1 failed · 106 skipped. ✓ desktop 264, phone 211.
    FAILED: [desktop] testnet.spec.ts:15 "api health answers from the contract": j.ok false, and the retry failed too. The server log shows "health: RPC read failed: contract_version / get_pool: Rate limits exceeded" (FastNEAR). The phone run of the same test passed. Afterwards, curl /api/health → ok true, 2.2.1-v7, nectar-core-v2.
  Run 2 (21:58:58Z–22:08Z, same command and server): exit 1. 472 passed · 1 failed · 3 flaky · 106 skipped.
    FAILED: [desktop] live-views.spec.ts:29 "a real /quote/[id] renders its figures and Note link": list_quotes RPC {"code":-429,"message":"Rate limits exceeded"}. Flaky (passed on retry): live-views:53, p1.spec:17, p1.spec:30. All of them are RPC reads.
  (a) site-pages.spec 38 passed / 0 failed. The /docs explainer is covered by shell.spec (/docs dark + light, axe clean, no h-scroll) and screens.spec. screens.spec: desktop 46/46, phone 46/46.
$ LH_BASE_URL=http://localhost:3297 pnpm --filter web lighthouse → exit 0. (e) Default list = 20 routes, including /about /status /changelog /brand /talk /security. That makes 40 route×theme pairs, all a11y 100 (min dark 100, light 100).
Real selector (apps/web g3b-selector-probe.mjs, copied to evidence): real Chrome, fresh context, no __NECTAR_E2E_MOCK__ (typeof undefined), /borrow. The consent banner was visible on load, and I did not dismiss it. Connect wallet → .hot-connector-popup lists 6 wallets: Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI. Desktop 1280×900: rows y 268–692. Phone 400×860: rows y 420–844. Every row was fully inside the viewport without scrolling, and the elementFromPoint at each row centre lands inside the row. With the selector open, the consent banner is no longer visible (isVisible false, so no overlap is possible). The probe's 3 px-inset corner hit-tests did not land on the row element; the screenshot shows nothing covering the rows, and I did not investigate the cause (probably rounded row corners). PASS on viewport + centre hit + screenshot. I clicked no wallet and signed nothing.
(b) hosted build with SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=https://docs.nectar.test → next start -p 3771 → `E2E_HOSTED=1 E2E_BASE_URL=http://localhost:3771 npx playwright test e2e/hosts.spec.ts --project=desktop` → 6/6 passed: www 301, APP / 307 → /feed, SITE→APP 308, APP→SITE 308, per-host routes + /api on both, per-host robots/sitemap/canonical.
(c) `pnpm --filter docs-site build`, then a hosted build with SITE_URL=http://site.localhost:3761 APP_URL=http://app.localhost:3761 DOCS_ORIGIN=http://localhost:3762, `node apps/web/scripts/serve-docs.mjs --port 3762`, next start -p 3761 (app /docs/start/quick-start → 200). Then `E2E_INVENTORY=1 INV_SITE=… INV_APP=… PW_CHANNEL=chrome npx playwright test --project=inventory` → 6/6 passed in 4.4 min, CSP enforced (cspBypassed false), cspViolations []. All 6 wallets were opened to the connect prompt with 0 violations each. The third-party hosts I measured (10) equal the committed apps/web/content/data-inventory.json (10), with nothing missing on either side; localhost hosts differ by port only. All 10 appear in backticks in apps/docs-site/docs/legal/privacy.md (inv-compare.cjs in evidence).
(d) `PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3761 --app http://app.localhost:3761` → exit 0: 89 internal, 44 external, 0 failures, 0 of our console errors. 17 page loads had third-party network failures, which are listed separately as the script designs.
(f) `NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build` → exit 1, "Production build refused (WO-34a guard): config.yaml site.operator is null (TODO-H-LEGAL); site.country is null; site.contact is null". This failure is expected, so the guard PASSES. The TODO-H page-text branch was not reached on its own, because the null fields stop the build first.
$ pnpm verify → exit 0 (sdk 198/198; keeper, feed, x402 and ui tests green; demo-testnet read-only). $ node scripts/check-no-branding-all.mjs → exit 0.
Explorer links: none opened (G3b has no explorer criterion).
Screenshot: evidence/G3b/selector-phone-20261111T2144Z.png (real selector, phone).
Evidence: evidence/G3/verifier-20261111T2144Z/ (e2e-local.log, e2e-local-run2.log, lh.log, headers, hosts/inventory/crawl logs, crawl.md, data-inventory.measured.json, selector-visibility.json, build logs including build-prod-guard.log, verify.log, branding.log, chain.log, probe scripts).
Verdict: FAIL on the strict "0 failed in the full e2e" criterion. Each of the two full runs had exactly 1 failure, both caused by FastNEAR public-RPC rate limiting (-429) on live testnet reads. No product assertion failed, and the failing tests pass when the RPC answers (phone run 1; desktop runs of other passes). Items (a)–(f), the selector visibility, Lighthouse, headers, verify and branding all PASS.

### G3b — web E2E after WO-49 (/api/health prefetch fix) — RE-RUN 2 (WO-50) — PASS — 2026-11-11T17:26Z–17:44Z — commit fd6592d
Fresh clone /tmp/verify-g3b-20261111T1726Z (git clone /Volumes/T7/nectar-labs). main HEAD fd6592d; a2387b5 (WO-49 merge) is an ancestor, and a2387b5..fd6592d is one docs work-order commit. No secrets: NECTAR_E2E_BORROWER_KEY and NEXT_PUBLIC_E2E_KEY_ADAPTER unset. `pnpm install --frozen-lockfile` exit 0.
Read docs/process/gate-fail-g3b-r2.md first. Since 3107a1a, `git diff --stat 3107a1a fd6592d -- apps/web/e2e apps/web/playwright.config.ts apps/web/scripts` shows a change only in hardening.spec.ts (+20 lines: a 204 RSC-prefetch test, and a test that the footer Status link is a plain anchor and /borrow reaches networkidle). screens.spec.ts and its networkidle wait are unchanged, so the fix did not weaken the spec.
Port: an earlier run still holds 3217 (node pid 14369). I did not touch it. I started my own server with `pnpm exec next start -p 3291` in apps/web and pointed the gate scripts at it, as WO-48 did: e2e with `PORT=3291 E2E_BASE_URL=http://localhost:3291`, lighthouse with `LH_BASE_URL=http://localhost:3291` and no LH_START. I ran everything in sequence: build, e2e, lighthouse, then stopped the server, then verify. No host service was stopped.
$ pnpm --filter web build → exit 0 (Next.js 16.4.5; /api/health ƒ dynamic).
$ curl -sI http://localhost:3291{/,/borrow,/api/health,/note/0} → all HTTP 200, each with X-Frame-Options: DENY, Strict-Transport-Security: max-age=63072000; includeSubDomains, and Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'. GET /api/health → ok true, version "2.2.1-v7", core nectar-core-v2.nectar.testnet. curl with `RSC: 1` (with or without Next-Router-Prefetch) → 307 in < 5 ms, so it does not hang. The 204 path needs the full router header set, and the hardening spec covers it.
$ PW_CHANNEL=chrome pnpm --filter web e2e → exit 0. 492 tests, 1 worker, 10.6 min (17:27:53Z–17:38:32Z):
  404 passed · 0 failed · 88 skipped · 0 flaky (no retries in the log).
  desktop 229 passed / 0 failed / 17 skipped; phone 175 / 0 / 71.
  screens.spec: desktop 38/38 and phone 38/38 passed, 0 skipped. That includes every route that timed out in R2 (/feed/NVDAx /borrow /shield /quote* /reserve /notes /position/0 /console /keepers /talk /security /docs). 76 PNGs were written to the clone's evidence/G3/screens/.
  hardening.spec.ts:41 (RSC prefetch → 204, empty body) ✓ and :47 (footer Status = plain anchor, no RSC request, /borrow networkidle 2.7 s) ✓ on desktop. Both are skipped on phone.
$ LH_BASE_URL=http://localhost:3291 pnpm --filter web lighthouse → exit 0. 14 routes × 2 themes = 28 pairs, all 100. a11y min: dark 100, light 100.
  Routes: / /feed /feed/NVDAx /borrow /shield /position/0 /quote /quote/new /quote/0 /reserve /notes /console /agents /keepers. The gate text says 6 routes; the script covers 14.
Server stop: `kill 26566` (next-server, port 3291) succeeded. Port 3291 then had 0 listeners. No kill was refused.
$ pnpm verify (same clone) → exit 0. Branding check, lint and typecheck green. Tests: packages/ui 7/0, services/feed 63/0, services/keeper 293/0, services/x402 34/0, packages/sdk 190/190. scripts/50-verify.sh (demo-testnet) reports nectar-core-v2 2.2.1-v7, Q_c $16,119.22, 5 live quotes, positions #0–#15. One x402 test logs "Facilitator getSupported failed (401)" as an informational line; it is not a failure.
$ node scripts/check-no-branding-all.mjs → "No hackathon branding in landing, web app or docs site", exit 0.
Explorer links: none opened (G3b has no explorer criterion; nearblocks returns 403 to WebFetch, see §G2).
Screenshot: evidence/G3/verifier-20261111T1726Z/borrow-desktop-dark.png (screens.spec output for a route that failed in R2).
Evidence: evidence/G3/verifier-20261111T1726Z/ (install.log, build.log, headers.txt, e2e.log (full), e2e-start.txt, lighthouse.log, lighthouse-scores.tsv (28 rows), verify.log, branding.log). The 5.6 MB of LH JSON and the other 75 screenshots stay in the clone.
Verdict: PASS. Full e2e has 0 failures (desktop + phone, screens.spec included), LH 28/28 = 100 in both themes, security headers are present, and pnpm verify and the branding check both exit 0. GATE_FAIL_G3B_R2 cause resolved.

### G3b — web E2E after the review 2 web fixes (WO-41, WO-42a/b/c) — RE-RUN (WO-48) — FAIL — 2026-11-11T15:30Z–17:01Z — commit 3107a1a
Fresh clone /tmp/verify-g3b-20261111T1530Z (git clone /Volumes/T7/nectar-labs, HEAD 3107a1a ⊇ 31aeba9). No secrets; NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER unset. pnpm install --frozen-lockfile exit 0.
Port: the gate's `pnpm start` / `LH_START=1` hardcode `next start -p 3100`. A parallel G9 verifier was running, so I started my own server (`pnpm exec next start -p 3217` in apps/web) and pointed the scripts at it with their own env vars: e2e `PORT=3217 E2E_BASE_URL=http://localhost:3217`, lighthouse `LH_BASE_URL=http://localhost:3217` (no LH_START). No host service was stopped. Lighthouse ran while the e2e run was still going (the e2e verdict was already fixed by repeatable failures).
$ pnpm --filter web build → exit 0 (Next.js 16.4.5; 2 non-fatal Turbopack tracing warnings in packages/sdk/src/config-node.ts; metadataBase warning).
$ curl -sI http://localhost:3217{/,/borrow,/api/health,/note/0} → all HTTP 200 with X-Frame-Options: DENY · Strict-Transport-Security: max-age=63072000; includeSubDomains · Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' (+ nosniff, Referrer-Policy, Permissions-Policy). /api/health: version "2.2.1-v7", core nectar-core-v2.nectar.testnet.
$ PW_CHANNEL=chrome pnpm --filter web e2e → exit 1. 488 tests, 1 worker, 1.5 h:
  40 failed · 86 skipped · 362 passed · 0 flaky. desktop 199 passed / 28 failed / 17 skipped; phone 163 / 12 / 69.
  Every failure is e2e/screens.spec.ts:12 "screenshot <route> <theme>": `page.waitForLoadState("networkidle")` hits the 60 s test timeout, then fails again on retry.
    desktop (dark + light, 14 routes each): /feed/NVDAx /borrow /shield /quote /quote/new /quote/0 /reserve /notes /position/0 /console /keepers /talk /security /docs
    phone (dark + light, 6 routes each): /feed/NVDAx /shield /quote/0 /notes /position/0 /docs
  Passing: everything else, including / /feed /agents /legal/* screenshots and every functional, a11y and h-scroll spec (shell, hardening, notes, shields, v7, remote, copilot, oneclick, live-views, design*).
  Cause, as observed (not fixed): `node evidence/G3/verifier-20261111T1530Z/probe-idle.mjs /borrow` (same prime + reducedMotion as the spec) → networkidle TIMEOUT. The one request left pending is `GET fetch /api/health?_rsc=…`, a Next <Link> RSC prefetch of the footer "Status" link (apps/web/components/SiteChrome.tsx:107 `{ href: "/api/health" }`). The request never finishes in Chrome, so networkidle never fires on any page where that footer link enters the viewport. /feed → networkidle in 2.2 s. `curl -H "RSC: 1" /api/health` → 307 to `?_rsc=…`. Trace (borrow-dark): all 82 requests finished within 1.6 s of navigation.
$ LH_BASE_URL=http://localhost:3217 pnpm --filter web lighthouse → exit 0. 14 routes × 2 themes = 28 pairs, every one 100. a11y min: dark 100, light 100. 0 failing audits.
  Routes: / /feed /feed/NVDAx /borrow /shield /position/0 /quote /quote/new /quote/0 /reserve /notes /console /agents /keepers (the gate text says 6 routes; the script now covers 14).
Explorer links: none opened (G3b has no explorer criterion).
Screenshot: none (the screens spec failed to write the failing routes).
Evidence: evidence/G3/verifier-20261111T1530Z/ (install.log, build.log, e2e.log (full), e2e-partial-snapshot.log (15:59Z copy), lighthouse.log, lighthouse-summary.json (28 rows; the 6 MB of JSON reports are not committed), headers.txt, networkidle-probe.txt, probe-idle.mjs).
Verdict: FAIL — the gate's e2e command exits 1 (40 screens.spec networkidle timeouts, desktop 28 + phone 12). Lighthouse 28/28 = 100 in both themes and the security headers (XFO DENY, HSTS, CSP frame-ancestors 'none') PASS. Fix is out of verifier scope (web owner: e.g. `prefetch={false}` / plain <a> for /api/health, or a spec that doesn't wait on networkidle).

### G3b — web E2E after the design port (WO-33a/b/c, WO-34w) — RE-RUN after D-027 — PASS — 2026-11-11T08:08Z–08:24Z — commit 3ab3026

- Same fresh clone as the G11 re-run (main@3ab3026). No secrets: no NECTAR_E2E_BORROWER_KEY, no Feed URL. Live testnet reads went through FastNEAR. Runs were sequential, never overlapping.
- Commands:
```
pnpm i && pnpm --filter web build
PW_CHANNEL=chrome pnpm --filter web e2e
cd apps/web && npx next start -p 3100 &
node scripts/lh-d027.mjs     # copy of scripts/lighthouse.mjs: ROUTES = the 11 gate routes, outDir evidence/G3b/rerun-d027/lighthouse (evidence/G3b/verifier-rerun-d027-20261111T0802Z/lh-d027.mjs)
node probe-d027.mjs          # 400x860, colorScheme dark + light, documentElement.scrollWidth <= clientWidth (evidence/G3b/verifier-rerun-d027-20261111T0802Z/probe-d027.mjs)
```
- Output (trimmed):
```
pnpm i EXIT=0 · web build EXIT=0 (30 app routes)
e2e: 392 passed, 0 failed, 82 skipped (9.5m)  EXIT=0   08:08:58Z → 08:18:28Z
  skips (e2e-skips-by-spec.txt): testnet write spec 1 desktop + 1 phone (no key) · remote.spec 14x2 (REMOTE_SCREENS unset) ·
  notes.spec 2x2 (NOTES_SCREENS unset) · phone copies of desktop-only specs: design-app 40, design 5, live-views 3
  live reads passed on desktop: live-views x3 (real /quote/[id], open /position/[id], closed remote position), testnet read-only x2
/api/health: deployed true · core nectar-core-v2.nectar.testnet · version 2.2.1-v7
Lighthouse a11y          dark  light
  /                       100    97   (only deduction: color-contrast on <span class="nx-delta up">)
  /feed /feed/NVDAx /borrow /shield /position/10 /notes /quote /reserve /console /agents   100 / 100 each
  lighthouse.log EXIT=0 (22/22 >= 90)
400 px probe: 22/22 route x theme noHScroll=true (scrollW 400 = clientW 400); 0 responses >= 500
  dark body-bg rgb(13, 15, 18) · light body-bg rgb(249, 250, 251)  -> both themes render
```
- Screenshot: evidence/G3b/verifier-rerun-d027-20261111T0802Z/borrow-400px-dark.png. The 22 LH JSON reports (4.8 MB) stay in the clone. Scores are in lighthouse-scores.tsv.
- Explorer links opened: none (this gate sends no transactions).
- Verdict: **PASS**. Advisory: the home page fails light-theme contrast on `.nx-delta.up` (97, above the 90 threshold).

### G3b — web E2E against nectar-core-v2 — PASS (re-run after WO-26f) — 2026-11-10T17:39Z–17:48Z — commit 0ed567f
Fresh clone /tmp/verify-G3b-20261110T173957Z (git clone /Volumes/T7/nectar-labs, main HEAD 0ed567f), no secrets; NECTAR_E2E_BORROWER_KEY, NEXT_PUBLIC_E2E_KEY_ADAPTER, NEXT_PUBLIC_FEED_URL all unset. Config unchanged: core nectar-core-v2, 8 flags on.
$ pnpm i                                   → exit 0 (pnpm 10.34.9)
$ pnpm --filter web build                  → exit 0; /api/feed is now ƒ (dynamic), was prerendered in the FAIL run
$ PW_CHANNEL=chrome pnpm --filter web e2e  → exit 0: 244 passed / 0 failed / 18 skipped (3.7 m), no flaky/retried tests
  The 7 specs that failed before now pass on both projects, under new titles that pin flag state, e.g. v7.spec.ts:45 "flags off: … no module sections", :58 "flags on: every module section renders",
  :98/:112 "v1 path (mocked v1 contract, every flag on)", shields.spec.ts:175/:242, notes flags-off, agents-console x402. They also pass against live config with flags on.
  Skipped 18: testnet write "borrow with demo key" ×2 (SKIPPED: no key, as expected); notes screenshots ×4 and remote screenshots ×12 (capture-only).
  400 px: shell.spec.ts "/<route> renders in dark|light, no horizontal scroll, axe clean" passes on phone (400×860) and desktop for every route.
$ LH_START=1 pnpm --filter web lighthouse  → exit 0: / /feed /borrow /quote/new /console /agents /keepers = 100/100 (dark/light)
$ LH_START=1 node scripts/lh-g3b-extra.mjs → exit 0: /shield /reserve /notes = 100/100. This is a verifier copy of the repo script with only ROUTES/outDir changed; the repo script still leaves out these 3 routes.
  All 20 = 100, no failing a11y audit (heading-order from the FAIL run is gone). Theme proof (mean brightness of the LH screenshot, dark/light): home 33/242, feed 33/235, shield 33/243, reserve 32/244, notes 32/244.
Live probe (next start :3100, RPC https://test.rpc.fastnear.com, 17:47Z), g3b-rerun-probe.mjs:
  GET /api/health → core nectar-core-v2.nectar.testnet, version "2.0.0-v7"
  GET /api/feed ×3, 8 s apart → HTTP 200, cache-control no-store, as_of = request time (17:47:07.439Z / :16.057Z / :24.452Z), age_s 0, stale false.
    NVDAx: session_open false, "stale_price", haircut 2500, q 16,107.06, r 10.00, debt 9,199.00, capacity 12,087.795. oracle_age_s 3101 → 3109 → 3118 tracks the chain,
    and each read equals RPC get_exit_capacity at the same moment. Not a build-time snapshot.
  GET /api/indexer/api/oneclick → HTTP 200 {"configured":false,"error":"Feed indexer not configured"}
  /feed in Chrome, 15 s settle → 0 responses ≥ 500, 0 console errors; the 1Click panel says "Feed indexer not configured … Set NEXT_PUBLIC_FEED_URL and run pnpm --filter feed start".
Screenshot: evidence/G3b/verifier-rerun-20261110T1740Z/feed-live-no-feed-url-dark.png
Evidence: evidence/G3b/verifier-rerun-20261110T1740Z/ (install, build, e2e, lighthouse-script, lighthouse-extra logs; lighthouse-scores.tsv; theme-brightness.txt; live-probe.log; probe + LH-copy scripts). LH JSON not committed.
Explorer links: none opened (G3b has no explorer criterion; nearblocks returns 403 to WebFetch, see §G2).
Verdict: PASS. e2e exit 0, LH a11y 100 on all 10 routes × 2 themes, 400 px no-scroll, /api/feed live with as_of/age_s, /feed clean without a Feed URL.
Open (not gate criteria): the repo LH script leaves out /shield /reserve /notes; the Notes list needs a wallet (not UI-verified); write flow verified only by skip.

### G3b — web E2E against nectar-core-v2 — FAIL — 2026-11-10T16:56Z–17:25Z — commit 2bf99e1
Fresh clone /tmp/verify-G3b-20261110T165651Z (git clone /Volumes/T7/nectar-labs), no secrets. config.yaml: core nectar-core-v2.nectar.testnet; features on = weekend_guard, shields, profit_lock, notes, reserve, agent_skill, x402, solana_remote (multiplier, pay_to, referrals, base off).
$ pnpm i                                   → exit 0 (pnpm 10.34.9; ignored build scripts core-js, secp256k1)
$ pnpm --filter web build                  → exit 0 (26 routes incl. /shield /reserve /notes /note/[id]; 2 Turbopack "dynamic fs tracing" warnings)
$ PW_CHANNEL=chrome pnpm --filter web e2e  → exit 1: 214 passed / 14 failed / 18 skipped (10.0 m, 1 worker, retries 1)
  Failed (each on desktop AND phone, failed on retry too):
  e2e/agents-console.spec.ts:48  /agents › … x402 not run yet …     getByTestId('agents-x402').getByText('not run on testnet yet') not found
  e2e/notes.spec.ts:147          /notes › flags off: honest disabled states, no nav links   'Position Notes are not enabled on this deployment' not found
  e2e/shields.spec.ts:175        /shield › flags off: honest disabled state, no Shields nav link   'Shields are not enabled on this deployment' not found
  e2e/shields.spec.ts:242        /quote/new voluntary fills › flag off: no checkbox      getByTestId('voluntary-fills') count expected 0, got 1
  e2e/v7.spec.ts:33              landing v7 › … no module sections while flags are off …  locator('[data-feature]') expected 0, got 8
  e2e/v7.spec.ts:64              v1 path (live contract) › feed equation card … no v2 aggregate rows   eq-total-debt expected 0, got 1
  e2e/v7.spec.ts:78              v1 path (live contract) › borrow: fee stack …           expected "the v1 contract charges none", got "Limit premium … $0.00 Origination (30 bps) $0.03 Total fees $0.03"
  Cause (observed, not fixed): these specs assert flags-off / v1-contract behaviour; the committed config now enables the flags and points at v2, so the app shows the v7 UI and the specs fail. No test was edited.
  Skipped 18: testnet write spec ×2 (NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER unset, as expected); notes screenshots ×4, remote screenshots ×12 (capture-only specs).
  No horizontal scroll at 400 px: shell.spec.ts "/<route> renders …, no horizontal scroll, axe clean" + notes/shield h-scroll checks all passed (desktop + phone 400×860).
$ LH_START=1 pnpm --filter web lighthouse  → exit 0. Script routes: / 100/100, /feed 100/100, /borrow 98/98, /quote/new 100/100, /console 98/98, /agents 100/100, /keepers 100/100 (dark/light)
  /shield /reserve /notes are not in the script's ROUTES; verifier ran an unmodified copy with only ROUTES/outDir changed (evidence lh-g3b-extra.mjs, untracked in clone):
  /shield 98/98, /reserve 100/100, /notes 100/100. All 20 ≥ 90. Only failing audit anywhere: heading-order (/borrow, /console, /shield).
  Theme proof (LH full-page screenshot mean brightness, dark/light): home 33/242, shield 33/243, reserve 32/244, notes 32/244.
Live testnet render (next start on :3100, Chrome, 17:13Z–17:22Z; RPC https://test.rpc.fastnear.com):
  contract_version (RPC) "2.0.0-v7", get_state_version 2; GET /api/health {"core":"nectar-core-v2.nectar.testnet","version":"2.0.0-v7"}. Pages show "v2" on /feed; the 2.0.0-v7 string itself appears only via /api/health.
  4 quotes: list_quotes {"symbol":"NVDAx"} → ids 0–3, remaining 5,000 + 5,477.50 + 629.56 + 5,000 = $16,107.06; /feed, / show "Qc committed quotes $16,107" (aggregate; no per-quote list on /feed).
  Reserve: /reserve "R_c (counts toward limits) $10.00", share price $1.00, discount 600 bps; /feed and / show "Rc $10".
  Session badge: renders "Weekend parameters · stale price (> 15 min)" on /, /feed, /borrow; matches get_exit_capacity at 17:2xZ (session_open false, session_reason "stale_price", haircut 2500, oracle_age_s 1046).
  Notes: /notes shows "Connect a wallet to see your Notes" (no wallet in a stranger run, so the list itself is NOT verified in UI); /note/r-NVDAx-0, /note/q-1, /note/p-5 → HTTP 200 with the Note titles; chain nft_total_supply 11.
  Observations: /api/feed is prerendered (revalidate 10 s) and on first hit returned the build-time snapshot (session_open true, oracle_age 113 s) while the chain said stale_price; browser console 2× HTTP 503 on /feed (1Click panel: "Feed API not configured (NEXT_PUBLIC_FEED_URL)").
Screenshot: evidence/G3b/verifier-20261110T1656Z/feed-live-desktop-dark.png
Evidence: evidence/G3b/verifier-20261110T1656Z/ (build.log, e2e.log, lighthouse-script.log, lighthouse-extra.log, lighthouse-scores.tsv, theme-brightness.txt, live-probe.log, probe scripts). LH JSON reports not committed (3.9 MB).
Explorer links: none opened (G3b has no explorer criterion; nearblocks returns 403 to WebFetch, see §G2).
Verdict: FAIL — the gate's e2e command exits 1 (14 failures, 7 specs × 2 projects). Lighthouse 20/20 ≥ 90, both themes, 400 px no-scroll, and live v2 data (version, Q_c from 4 quotes, R_c $10, session badge) PASS. Open: Notes list needs a wallet; heading-order on 3 routes.

## v7 module runs

### v7 module runs — read-only chain check of evidence/v7-modules/summary.md — PASS (Profit-Lock event not chain-confirmed) — 2026-11-10T17:20Z — commit 2bf99e1
RPC https://test.rpc.fastnear.com, account nectar-core-v2.nectar.testnet, finality final.
Profit-Lock — PASS (state): get_position {"position_id":"0"} → status "Closed", units 0, debt 0. list_quotes NVDAx → quote 1 committed 10,000,000,000 / remaining 5,477,500,000 = 10,000 − 4,522.50 ✓.
  self_settled event: present only in the repo log (evidence/v7-modules/profitlock-20261110T165420Z.log EVENT_JSON {position_id 0, debt_repaid 4,500,000,000, fee 22,500,000, fill 4,522,500,000, units_repaid 30,923,077}); the log records no tx hash (only signer key + signature), so the event could not be fetched from chain. Open item.
Reserve — PASS: get_reserve {"symbol":"NVDAx"} → r_usd_e6 "10000000", shares 10,000,000, discount_bps 600, notice 604800 s. nft_token {"token_id":"r-NVDAx-0"} → owner_id "buyer2.nectar.testnet", title "Reserve Note r-NVDAx-0".
Shield — PASS: get_shield {"position_id":"5"} → kind "Weekend", fee_bps 15, fee_usd_e6 283500, window_end_ns "1794407400000000000", active true.
Notes — PASS: nft_total_supply "11"; nft_tokens lists q-0…q-3, p-0…p-4, r-NVDAx-0 (+ p-5 via /note/p-5 page 200).
Evidence: commands and outputs in this block; G3b live-probe.log.

## G14

### G14 — x402 paid call — RE-RUN ON HEAD (borrow guard) — PASS — 2026-11-11T15:02Z–15:25Z (demo 15:02:29Z–15:02:48Z) — commit 48b5c5a
Fresh clone `git clone /Volumes/T7/nectar-labs /tmp/verify-g1g14-20261111T145956Z` (HEAD 48b5c5a; includes services/x402/src/borrow-guard.ts). `pnpm i --frozen-lockfile` exit 0.
Host services untouched (keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545 still listening after the run). Host Feed /healthz `ok:false`, last_error "neardata block
277098197 HTTP 429" (the same as at 13:53Z). Its views path answered (MCP borrow build + CSV). /healthz is not the claim under test.
Keys read by path only (both files 0600). No key material printed, copied or committed. No .env written. Logs: evidence/G14/verifier-20261111T145956Z/.
```
$ X402_PORT=8891 X402_RELAYER_KEY_PATH=~/.nectar/keys/x402-relayer.json X402_RPC_URL=https://test.rpc.fastnear.com pnpm --filter x402 start   # own server, clone
  x402_started port 8891 near:testnet asset usdc-mock.nectar.testnet amount 10000 pay_to nectar.testnet facilitator in-process (relayer x402-relayer.nectar.testnet)
$ curl -i http://127.0.0.1:8891/api/feed/export.csv        # unpaid
  HTTP/1.1 402 Payment Required · body {} · PAYMENT-REQUIRED (base64) → {"x402Version":2,"accepts":[{"scheme":"exact","network":"near:testnet",
  "amount":"10000","asset":"usdc-mock.nectar.testnet","payTo":"nectar.testnet","maxTimeoutSeconds":120}]}
$ AGENT1_KEY_PATH=~/.nectar/keys/agent1.json X402_URL=http://127.0.0.1:8891/api/feed/export.csv FEED_MCP_URL=http://127.0.0.1:8789/mcp \
  X402_RPC_URL=https://test.rpc.fastnear.com pnpm --filter x402 demo:testnet                                                  → EXIT=0
  borrow_verified receiver nvdax-mock.nectar.testnet method ft_transfer_call core nectar-core-v2.nectar.testnet amount 1000000
                  fees {limit_premium 0, origination 30000, referrer_share 0, total 30000, net 9970000}
  borrow_sent tx E2suM2LC4ac2AE9TZ66AGY72ZDrBdu1Yz8pEnwAs65hz ok true
  challenge status 402 network near:testnet asset usdc-mock.nectar.testnet amount 10000 pay_to nectar.testnet
  paid_fetch status 200 rows 123 transaction 4vW2tPF5Gqemkm5uoafQE6eaXidSMSCuqLcDVMTTB77b
  server log: payment_required 402 ×3 (my curl + demo) → paid transaction 4vW2tPF5… at 15:02:48Z; server stopped (kill of its own pid 6798, cwd = clone; :8891 free)
$ node g14-verify.mjs <borrow> <relay>     # EXPERIMENTAL_tx_status wait_until FINAL, https://test.rpc.fastnear.com (D-025)
tx E2suM2LC… signer=agent1.nectar.testnet pk=ed25519:3zyEty… receiver=nvdax-mock.nectar.testnet final=SuccessValue FINAL receipts=10 failed=0 burnt 14.01T
  FunctionCall ft_transfer_call {receiver_id nectar-core-v2.nectar.testnet, amount 1000000, msg LockCollateralAndBorrow {NVDAx, borrow 10000000, pre_liq 8000}} deposit 1
  core-v2 EVENT_JSON position_opened {position_id 15, borrower agent1, units 1000000, debt 10000000, premium 0, origination_fee 30000, net 9970000} ;; nft_mint p-15
tx 4vW2tPF5… signer=x402-relayer.nectar.testnet pk=ed25519:GVaHZ4… receiver=agent1.nectar.testnet final=SuccessValue FINAL receipts=4 failed=0 burnt 3.26T
  Delegate sender=agent1.nectar.testnet receiver=usdc-mock.nectar.testnet delegate_pk=ed25519:3zyEty… nonce 277093880000008
    inner FunctionCall ft_transfer {"receiver_id":"nectar.testnet","amount":"10000"} deposit 1
  receipts agent1 SuccessValue · usdc-mock SuccessValue · x402-relayer SuccessValue ×2
keys agent1: 3zyEty… FullAccess (1 key) · x402-relayer: GVaHZ4… FullAccess (1 key)
$ node bal.mjs before|after   # ft_balance_of, final
  before 15:02:08Z  usdc agent1 29880000 · usdc nectar.testnet 30000 · nvdax agent1 1000000
  after  15:02:52Z  usdc agent1 39840000 (+9970000 net −10000 paid) · usdc nectar.testnet 40000 (+10000) · nvdax agent1 0 (−1 NVDAx locked)
$ curl http://127.0.0.1:8788/api/feed/export.csv   # free upstream, same Feed → 200, 124 lines = header + 123 rows (= paid count)
$ pnpm --filter x402 test    # supplementary, not a gates-v7 command → tests 34 · pass 34 · fail 0 (x402-test.log)
```
Borrow guard: the demo logged `borrow_verified` before it signed. The signed transaction decoded from chain is the expected call: collateral token nvdax-mock, ft_transfer_call,
receiver core-v2, 1 NVDAx, msg LockCollateralAndBorrow {NVDAx, 10000000, 8000} with no pay_to/referrer, deposit 1 yocto. The refusal path (exit 3) was not exercised on chain.
Its coverage is the unit tests in x402 test (34/0).
Explorer: opened https://testnet.nearblocks.io/txns/4vW2tPF5Gqemkm5uoafQE6eaXidSMSCuqLcDVMTTB77b with WebFetch → HTTP 403 (as in §G2). The RPC output above is the proof.
Notes: mock-ft emits no ft_transfer event. The $0.01 transfer is proven by the decoded delegate action, the successful usdc-mock receipt and the treasury balance delta. agent1 now holds
0 mock NVDAx, so another borrow run needs a top-up first.
Verdict: **PASS.** On HEAD, with the borrow guard in place: unpaid GET → 402 with the right terms, a verified borrow on chain, a relayed NEP-366 delegate payment, and 200 with the CSV.

### G14 — x402 paid call — 402 → 200 VERIFIER-RUN — PASS — 2026-11-11T13:52Z–14:18Z (demo 13:54:46Z–13:55:05Z) — commit 45ed1f3
Fresh clone `git clone /Volumes/T7/nectar-labs /tmp/verify-g14-20261111T135216Z` (HEAD 45ed1f3; f0efa1e..45ed1f3 = docs/process/state.md only). `pnpm i --frozen-lockfile` exit 0.
Host services untouched (keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545 still listening after the run). Host Feed /healthz: `ok:false`, last_error
"neardata block 277097811 HTTP 429" (13:53Z and 14:17Z); its views path answered (MCP borrow build + CSV), and /healthz is not the claim under test.
Keys read by path only (both files 0600); no key material printed, copied or committed; no .env written. Logs: evidence/G14/verifier-20261111T135216Z/.
```
$ X402_PORT=8891 X402_RELAYER_KEY_PATH=~/.nectar/keys/x402-relayer.json X402_RPC_URL=https://test.rpc.fastnear.com pnpm --filter x402 start   # own server, clone
  x402_started port 8891 near:testnet asset usdc-mock.nectar.testnet amount 10000 pay_to nectar.testnet facilitator in-process (relayer x402-relayer.nectar.testnet)
$ curl -i http://127.0.0.1:8891/api/feed/export.csv        # unpaid
  HTTP/1.1 402 Payment Required · body {} · PAYMENT-REQUIRED (base64) → {"x402Version":2,"accepts":[{"scheme":"exact","network":"near:testnet",
  "amount":"10000","asset":"usdc-mock.nectar.testnet","payTo":"nectar.testnet","maxTimeoutSeconds":120}]}
$ AGENT1_KEY_PATH=~/.nectar/keys/agent1.json X402_URL=http://127.0.0.1:8891/api/feed/export.csv FEED_MCP_URL=http://127.0.0.1:8789/mcp \
  X402_RPC_URL=https://test.rpc.fastnear.com pnpm --filter x402 demo:testnet                                                  → EXIT=0
  borrow_built receiver nvdax-mock.nectar.testnet ft_transfer_call fees {origination 30000, total 30000, net 9970000}
  borrow_sent tx 7UFpexpdEH2nhmDVqXar8vZHQcK1iBFXznu9rybn24wU ok true
  challenge status 402 network near:testnet asset usdc-mock.nectar.testnet amount 10000 pay_to nectar.testnet
  paid_fetch status 200 rows 110 transaction EskZKj9sXxcpTWYoKRiagRvvkh3H5hjz8KQFL7qNRQQ7
  server log: payment_required 402 ×3 (my curl + demo) → paid transaction EskZKj9s… at 13:55:05Z; server stopped (kill of its own pid; :8891 free)
$ node g14-verify.mjs <borrow> <relay>     # EXPERIMENTAL_tx_status wait_until FINAL, https://test.rpc.fastnear.com (D-025)
tx 7UFpexpd… signer=agent1.nectar.testnet pk=ed25519:3zyEty… receiver=nvdax-mock.nectar.testnet final=SuccessValue FINAL receipts=10 failed=0 burnt 14.01T
  FunctionCall ft_transfer_call {receiver_id nectar-core-v2.nectar.testnet, amount 1000000, msg LockCollateralAndBorrow {NVDAx, borrow 10000000, pre_liq 8000}} deposit 1
  core-v2 EVENT_JSON position_opened {position_id 14, borrower agent1, units 1000000, debt 10000000, origination_fee 30000, net 9970000} ;; nft_mint p-14
tx EskZKj9s… signer=x402-relayer.nectar.testnet pk=ed25519:GVaHZ4… receiver=agent1.nectar.testnet final=SuccessValue FINAL receipts=4 failed=0 burnt 3.26T
  Delegate sender=agent1.nectar.testnet receiver=usdc-mock.nectar.testnet delegate_pk=ed25519:3zyEty… nonce 277093880000006
    inner FunctionCall ft_transfer {"receiver_id":"nectar.testnet","amount":"10000"} deposit 1
  receipts agent1 SuccessValue · usdc-mock SuccessValue · x402-relayer SuccessValue ×2
keys agent1: 3zyEty… FullAccess (1 key) · x402-relayer: GVaHZ4… FullAccess (1 key)
$ node bal.mjs before|after   # ft_balance_of, final
  before 13:54:25Z  usdc agent1 19920000 · usdc nectar.testnet 20000 · nvdax agent1 2000000
  after  13:55:08Z  usdc agent1 29880000 (+9970000 net −10000 paid) · usdc nectar.testnet 30000 (+10000) · nvdax agent1 1000000 (−1 NVDAx locked)
$ curl http://127.0.0.1:8788/api/feed/export.csv   # free upstream, same Feed → 200, 111 lines = header + 110 rows (= paid count)
```
Explorer: opened https://testnet.nearblocks.io/txns/EskZKj9sXxcpTWYoKRiagRvvkh3H5hjz8KQFL7qNRQQ7 with WebFetch → HTTP 403 (as in §G2). The RPC output above is the proof.
Notes: the 402 body is `{}`. The terms are in the x402 v2 `PAYMENT-REQUIRED` header, decoded above (unpaid-402-decoded.json). mock-ft emits no ft_transfer event, so the
$0.01 transfer is proven by the decoded delegate action, the successful usdc-mock receipt and the treasury balance delta. CSV row count is the demo's own count, matched by the free upstream.
Verdict: **PASS.** The verifier ran the HTTP leg itself: unpaid GET → 402 with the right terms, a borrow on chain, a relayed NEP-366 delegate payment, and 200 with the CSV.
This replaces the "SELF-ATTESTED" note on the 08:02Z re-run below.

### G14 — x402 paid call — RE-RUN after D-027 — PASS (chain claims) — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. Claims checked: evidence/G14/rerun/summary.md. Command: node evidence/G14/verifier-20261111T080154Z/g14.mjs
(EXPERIMENTAL_tx_status on https://test.rpc.fastnear.com). Output: chain.log.
```
tx HvFX6YRaY64YWss7KBQSpucM1vnVUtHFraQvqjGs6Q1V signer=agent1.nectar.testnet receiver=nvdax-mock.nectar.testnet final=SuccessValue failed_receipts=0
  FunctionCall ft_transfer_call args={"receiver_id":"nectar-core-v2.nectar.testnet","amount":"1000000","msg":"{\"LockCollateralAndBorrow\":{\"collateral\":\"NVDAx\",\"borrow_usd_e6\":\"10000000\",\"pre_liq_ltv_bps\":8000}}"} deposit=1
  receipt executor=nectar-core-v2.nectar.testnet status=SuccessValue logs: EVENT_JSON position_opened {position_id 13, borrower agent1, units 1000000, debt_usd_e6 10000000, origination_fee 30000} ;; nft_mint
tx BemztvL9jzTCm5wzbA8tD7Kj3q7qKEe9fJTLA8Zsn35G signer=x402-relayer.nectar.testnet receiver=agent1.nectar.testnet final=SuccessValue failed_receipts=0
  Delegate sender=agent1.nectar.testnet receiver=usdc-mock.nectar.testnet nonce=277093880000004 max_block_height=277187802
    inner FunctionCall ft_transfer args={"receiver_id":"nectar.testnet","amount":"10000"} deposit=1
  receipt executor=agent1.nectar.testnet SuccessValue · usdc-mock.nectar.testnet SuccessValue · x402-relayer.nectar.testnet SuccessValue ×2
```
Explorer: not opened this run (nearblocks returns 403 to WebFetch, see §G2); RPC proof above.
Verdict: **PASS for the chain claims.** The borrow (position #13, $10, agent1) and the NEP-366 delegate relay (ft_transfer of 10000 usdc-mock base units = $0.01 to nectar.testnet,
signed by agent1, relayed by x402-relayer) are on chain and succeeded. Not re-run by the verifier: the HTTP leg (unpaid GET → 402, paid → 200 CSV 37 rows); that rests on
evidence/G14/rerun/demo-20261111T080042Z.log. mock-ft emits no ft_transfer event, so the transfer is proven by the decoded delegate action plus the successful usdc-mock receipt.

### G14 — x402 paid call — PASS — 2026-11-10T16:48Z–16:52Z — clone 91db9ea (tests), summary at 6ba1b09
Verified evidence/G14/summary.md against the chain, read-only. rpc.testnet.near.org answered `-429 "THIS ENDPOINT IS DEPRECATED"`, so
the reads used https://rpc.testnet.fastnear.com (the repo's other configured RPC). Logs: evidence/G14/verifier-20261110T1645Z/.
```
$ pnpm --filter x402 test → exit 0  # tests 9 # pass 9 # fail 0
$ EXPERIMENTAL_tx_status GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt sender agent1.nectar.testnet
  signer agent1 → nvdax-mock ft_transfer_call {receiver nectar-core-v2, amount 1000000, LockCollateralAndBorrow NVDAx borrow 10000000, pre_liq 8000}
  status SuccessValue, 0 failed receipts
  nectar-core-v2 position_opened {position_id 4, borrower agent1, units 1000000, debt_usd_e6 10000000, origination_fee 30000, net 9970000, remote false}
  nectar-core-v2 nft_mint p-4
$ EXPERIMENTAL_tx_status 5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx sender x402-relayer.nectar.testnet
  signer x402-relayer → receiver agent1, actions [Delegate]; status SuccessValue, 0 failed receipts
  delegate_action sender agent1, pk ed25519:3zyEtyWb… (agent1's key), receiver usdc-mock: ft_transfer {receiver nectar.testnet, amount 10000}
  receipts: agent1 (Delegate) → usdc-mock FunctionCall (pred agent1) SuccessValue → relayer gas refunds
$ view_access_key_list agent1        → [ed25519:3zyEtyWb2BJzYZdTEsQeBNhnoqrNFw6KeQLjJQE925hm FullAccess]
$ view_access_key_list x402-relayer  → [ed25519:GVaHZ4FfWf3DnJXLXfnjXN3rDCjiTSfd1KT4GCdmWuXR FullAccess]
```
Discrepancy (not a fail): no `ft_transfer` EVENT_JSON in the relay tx — contracts/mock-ft emits no NEP-141 event logs at all; the transfer is
proven by the successful usdc-mock `ft_transfer` receipt with the decoded args. The 402 → 200 HTTP leg is off-chain (summary/server log only; not re-run).
**PASS** — (1) borrow tx opened position #4 for $10; (2) relay tx carries agent1's SignedDelegate paying 10000 usdc-mock e6 to nectar.testnet; (3) one FullAccess key each.

## G2b

### G2b — testnet deploy v2 — RE-RUN after D-027 (2.2.1-v7) — PASS — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. NEAR RPC https://test.rpc.fastnear.com. Scope as asked: version, code-hash rebuild, keeper key, views (pnpm verify not re-run).
```
$ cd contracts/nectar-core && cargo near build non-reproducible-wasm
  exit 1: host build scripts fail to link — ld-1267: "/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk/usr/lib/libSystem.B.tbd: unknown architecture arm64e.x1-macos"
  (build-default-sdk-FAILED.log; this host's default SDK, not the repo)
$ SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo near build non-reproducible-wasm   → exit 0, 1m 23s (build-sdk26.5.log)
local  sha256 2938ebf84c3d89cb66c39be98184befd8908a55543eaa1c2e60e7e27cb2df78d  (818,668 B)
deploy sha256 2938ebf84c3d89cb66c39be98184befd8908a55543eaa1c2e60e7e27cb2df78d  (view_code) → cmp: BYTE-IDENTICAL; base58 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk == view_account code_hash
contract_version → "2.2.1-v7"; get_config.contract_version "2.2.1-v7", keeper keeper-v2.nectar.testnet, paused false
get_exit_capacity {symbol:NVDAx} → q 16119220000, oracle 135000000 (Owner, fresh, age 264 s), session_open false (outside_hours), capacity 12096915000, total_debt 9209000000
list_quotes {} → panics "missing field symbol"; list_quotes {symbol:NVDAx} → 5 quotes
get_remote_chains {} → panics "missing field symbol"; {symbol:NVDAx} → solana-devnet ENZa…pubW domain 1 primary; base-sepolia 0xC64b…1226 domain 0, 84532, rpc 127.0.0.1:8545
get_quoter_config → enabled, outlayer.testnet, nectar.testnet/nectar-quoter, version_key 5f9bb28796c6c355522444252be380f09e0a1067a453a6d48e06724f581bc062
keeper-v2 access keys → 1 key ed25519:7GknDBk6…, FunctionCall receiver nectar-core-v2.nectar.testnet, methods [trigger_preliquidation, relay_settlement_result,
  confirm_remote_deposit, keeper_attest_deposit, relay_release_result]
```
Explorer: not opened this run (nearblocks 403 to WebFetch, §G2); code proven by view_code above.
Verdict: **PASS.** Deployed code is byte-identical to the clone's build; version, keeper key and every requested view hold. Open item (host, not repo): on this Mac the default
Command Line Tools SDK 27.0 cannot be read by the installed linker, so the plain build command fails until SDKROOT points at an older SDK; a stranger on the same setup hits this.
list_quotes and get_remote_chains need `{"symbol":"NVDAx"}`.

### G2b — testnet deploy v2 — RE-RUN — PASS — 2026-11-10T16:45Z–16:52Z — commit 91db9ea
Fresh clone /tmp/verify-G2b-G7-20261110T164524Z (main 91db9ea, includes WO-16b 12e8347). No secrets. Logs: evidence/G2b/verifier-rerun-20261110T1645Z/.
```
$ pnpm i                 → exit 0 (Done in 4.5s, pnpm 10.34.9)
$ pnpm verify            → exit 0   (= verify:quick [lint, typecheck, pnpm -r test] + scripts/50-verify.sh)
  services/keeper  # tests 168 # pass 168 # fail 0
  services/feed    # tests 57  # pass 57  # fail 0    (incl. "repo config defaults" — the GATE_FAIL_G2b test, now green)
  services/x402    # tests 9   # pass 9   # fail 0
  packages/sdk     Test Files 6 passed, Tests 77 passed
$ pnpm demo:testnet      → exit 0
  account nectar-core-v2.nectar.testnet  version 2.0.0-v7
  Q_c $15,629.56  R_c $0.00  D_c $0.00  haircut 1000 bps  session open
  oracle $150.00 (age 306s, STALE)  effective limit 7000 bps
  pool available $36,500.00 utilised $13,500.00 treasury $49.04
  quotes #0 $5,000 400 bps · #1 $10,000 250 bps · #2 $629.56 300 bps (all live)
  positions #0 Open $4,500 · #1 Open $9,000 · #2 Closed · #3 Closed
$ view_account nectar-core-v2 (final, block 277093894) → code_hash 3W5bifwgurTNyZwHsseLU8NmJxaW5Dt2221CfhvQ31ey (== first run)
$ contract_version {} → "2.0.0-v7"
```
Note: oracle shows STALE (age > max) at read time — the owner price push from the G7 demo is aging; display-only, not a G2b criterion.
State drift vs first run is the deliberate G7 work (positions #2/#3 Closed, quote #2 drawn). Explorer: not re-opened (403 in first run).
**PASS** — the only first-run failure (`pnpm verify` exit 1) is fixed; code hash and version unchanged.


### G2b — testnet deploy v2 (nectar-core-v2) — FAIL — 2026-11-10T16:34Z–16:45Z — commit 1c4cdb3
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G2b-20261110T163415Z (HEAD 1c4cdb3); public RPC https://rpc.testnet.near.org, read-only;
  no secrets, no transactions. Logs: evidence/G2b/verifier-20261110T163415Z/ (accounts-code.log, views.log, demo.log, verify.log, pnpm-i.log).
1. Accounts (view_account, final, block ~277092673): nectar-core-v2 code_hash 3W5bifwgurTNyZwHsseLU8NmJxaW5Dt2221CfhvQ31ey (== expected);
   keeper-v2 exists, no code; usdc-mock + nvdax-mock exist, code_hash 55hvEq… . view_code → 734784 B, sha256 252a6abe1803b262…29e8937a,
   base58(sha256) = 3W5bif…31ey. $ (contracts/nectar-core) SDKROOT=…/MacOSX26.5.sdk cargo near build non-reproducible-wasm → exit 0 (37 s);
   target/near/nectar_core/nectar_core.wasm 734784 B sha256 252a6abe… — byte-identical to deployed code. HOLDS.
2. keeper-v2 view_access_key_list → exactly 1 key ed25519:7GknDB…, FunctionCall, receiver nectar-core-v2.nectar.testnet, allowance 0.4 NEAR,
   methods [trigger_preliquidation, relay_settlement_result, confirm_remote_deposit, keeper_attest_deposit, relay_release_result]; no full-access key. HOLDS (D-019).
3. Views (call_function, final): contract_version "2.0.0-v7" · get_config (keeper keeper-v2, usdc usdc-mock, paused false) · get_pool
   (available $36,500 / utilised $13,500 at first read) · get_collateral NVDAx + list_collaterals (1: NVDAx, remote_chain solana-devnet ENZa…, domain 1)
   · get_exit_capacity NVDAx first read: session_open true, reason "open", Q $15,000, R $0, D $0, total debt $13,500, aggregate capacity $13,500,
     headroom $0, oracle Owner $180 (age 161 s, fresh false); second read: Q $16,000, headroom $900, oracle fresh
   · list_quotes first read: #0 $5,000 @400 buyer2 voluntary=false; #1 $10,000 @250 buyer1 voluntary=true (next_quote_id 2)
   · list_positions first read: #0 $4,500 Open; #1 $9,000 Open (next_position_id 2)
   · get_session_calendar: page cap 100 → 100+100+87 = 287 windows (first [1794321000…,1794344400…], last [1807018200…,1807041600…])
   · get_fee_stack (premium 300, origination 30, keeper 50, split 7000/2000/1000) · get_reserve NVDAx (empty, discount 600, share price 1.000000)
   · nft_tokens: q-0 buyer2, p-0 borrower1, q-1 buyer1, p-1 borrower1 (+ q-2 after drift) · nft_token_svg p-1: 1280 B, xmllint --noout OK
   · get_quoter_config version_key 5d90edb8840bb292…0f891fc9, enabled · get_remote_config vault_read_version_key 5d90edb8… (same), keeper deposit attestation allowed.
   NOTE drift: within ~4 min of the first reads, quote #2 ($1,000 @300 buyer1, Solana recipient) and position #2 (remote_path solana-devnet/pos/2) appeared
   (next ids 3/3; untracked evidence/G7/v2-*.log in the main worktree at 16:35–16:38Z = concurrent G7 v2 run). Expected 2/2 seed state held at first read.
4. $ pnpm i → exit 0 (4.8 s). $ pnpm demo:testnet → exit 0, reads v2: "account nectar-core-v2.nectar.testnet version 2.0.0-v7", Q_c $16,000,
   quotes #0–#2, positions #0–#2 (#2 debt $370.44), explorer links for core-v2/usdc-mock/nvdax-mock.
   $ pnpm verify → exit 1 (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL), so scripts/50-verify.sh never runs inside verify:
     services/feed test/defaults.test.ts:21 "reads config.yaml with no env…" expected 'nectar-core.nectar.testnet', actual 'nectar-core-v2.nectar.testnet'
     services/keeper test/keyfile.test.ts:43 "treats TODO-* ids as unset and falls back to config.yaml" — same assertion
     (both tests hard-code the v1 core id; config.yaml now points at v2). Other suites in the log ran green.
5. Explorer links (WebFetch tried on the first; HTTP 403, same as G2 v1 — human browser check still open):
   https://testnet.nearblocks.io/address/nectar-core-v2.nectar.testnet (403) · https://testnet.nearblocks.io/address/keeper-v2.nectar.testnet
   · https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet · https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet (not opened)
Verdict: FAIL — reason: `pnpm verify` exits 1 (2 stale v1-id assertions in services/feed + services/keeper tests). Criteria 1–3 and demo:testnet hold.
  Observations (not failure reasons): config.yaml line 79–80 comments still say "TODO-G2b (not created yet; needs H-NEAR-FAUCET)" though v2 exists;
  live state moves under concurrent G7 work, so later checks will see ≥ 3 quotes/positions.

## G11

### G11 — v7 contract — RE-RUN after the D-027 security wave — PASS — 2026-11-11T08:02Z–08:20Z — commit 3ab3026

- Fresh clone `/tmp/verify-G11-G3b-20261111T080207Z` (APFS) of main@3ab3026. Main later moved to 54cca8d; 3ab3026..54cca8d changes no code outside apps/docs-site. No secrets. SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk.
- Commands (scripts: evidence/G11/verifier-rerun-d027-20261111T0802Z/g11.sh, solevm.sh):
```
cargo test -p nectar-core --no-fail-fast -- --nocapture      # unit + all 7 sandbox targets
cargo test -p mock-ft
python3 contracts/nectar-core/tests/model.py --check --v7
(cd contracts/nectar-core && cargo near build non-reproducible-wasm); shasum -a 256 target/near/nectar_core/nectar_core.wasm
curl rpc.testnet.fastnear.com view_account nectar-core-v2.nectar.testnet          # deployed code_hash
cd evm && find . -name '._*' -delete && forge test
cd solana && pnpm install --ignore-workspace && pnpm run test:unit && pnpm run test:anchor   # PATH += ~/.avm/bin, solana active_release/bin
pnpm --filter keeper|x402|feed|@nectar/sdk test                                    # SR tests outside contracts/
```
- Output (trimmed):
```
unittests src/lib.rs        608 passed; 0 failed
sandbox.rs 5 · sandbox_evm.rs 19 · sandbox_p1.rs 5 · sandbox_p2.rs 6 · sandbox_reserve.rs 2 · sandbox_v7.rs 9 · sandbox_v7b.rs 4   (50, 0 failed)
cargo test -p nectar-core   EXIT=0   (08:02:40Z → ~08:19Z)
mock-ft                     23 passed; 0 failed   EXIT=0
model.py --check --v7       model.csv OK (132 rows)   EXIT=0
cargo near build            EXIT=0   nectar_core.wasm 818668 bytes
  sha256 2938ebf84c3d89cb66c39be98184befd8908a55543eaa1c2e60e7e27cb2df78d = base58 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk
  RPC view_account nectar-core-v2 (block 277189948) code_hash 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk  -> MATCH (/api/health version 2.2.1-v7)
GAS (1264 rows, gas-summary.txt / gas-rows.csv):
  per-receipt max 67.69 Tgas confirm_remote_deposit(64 fitting quotes); next 19.86 trigger+sign(64 fitting quotes)
  tx-total max 78.72 Tgas (same call); label-only max 55.73 Tgas trigger_preliquidation(8 legs)
  rows >= 100 Tgas: 0   (4 `attached,300T` prepaid rows excluded)
forge test                  105 passed, 0 failed, 3 skipped (108)   EXIT=0   incl. 16 test_SR* (SR-1 x4, SR-8 x8, SR-30 x4)
solana test:unit            10 passed (cargo)   EXIT=0
solana test:anchor          # tests 55 # pass 55 # fail 0   EXIT=0
keeper 293/0 · x402 17/0 · feed 63/0 · @nectar/sdk 178/0   (all EXIT=0)
sr*-named contract tests that ran and printed ok: 124
```
- Security findings → reproducing tests (names in evidence/G11/verifier-rerun-d027-20261111T0802Z/sr-test-names.txt, counts in sr-map.txt; status per SECURITY.md at 54cca8d). Every finding SR-1…SR-33 has at least one test named after it, so **no fixed finding lacks a test**. Counts: SR-1 3 TS + 4 forge · SR-2 1 · SR-3 15 · SR-4 1 (Solana; EVM part open) · SR-5 29 (partial) · SR-6 10 (partial) · SR-7 6 (partial) · SR-8 10 + 8 forge · SR-9 8 · SR-10 3 · SR-11 1 · SR-12 2 · SR-13 1 · SR-14 6 · SR-15 2 · SR-16 4 · SR-17 6 · SR-18 3 · SR-19 5 · SR-20 6 · SR-21 1 · SR-22 3 · SR-23 1 · SR-24 3 · SR-25 1 · SR-26 3 · SR-27 7 · SR-28 1 · SR-29 2 · SR-30 4 forge · SR-31 4 · SR-32 1 · SR-33 1.
- Notes: (1) SR-28 is mitigated only on the keeper side (base.test.ts:511 "deposit reported unsupported, never confirmed"). quoter/src/jobs.rs:9 still says "base-sepolia (SR-28 not implemented)". (2) I ran the tests on the fixed code only. I did not re-run them on the pre-fix code to show they fail there. The EVM `_v1_` variants (SR-1, SR-8, SR-30) are the only in-suite old-path reproductions. (3) The G1 method-vs-GAS-label coverage diff was NOT RUN in this re-run. Only the 100 Tgas ceiling was checked.
- Log edit: line 9893 of cargo-test-nectar-core.log (a sandbox EVENT_JSON with the public anvil test account #1 address as `token`) is elided, because gitleaks flagged it as generic-api-key, a false positive. It is not a secret. No other change.
- Explorer links opened: none. The code hash comes from RPC (nearblocks returns 403 to WebFetch).
- Verdict: **PASS**.

### G11 — v7 contract — RE-RUN — PASS with open item F-352 — 2026-11-10T15:47Z–16:12Z — commit 53f1e63
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G11-20261110T154726Z (HEAD 53f1e63); SDKROOT=.../MacOSX26.5.sdk; no secrets.
Exit codes captured by a bash script (ev/status). Trimmed logs: evidence/G11/verifier-rerun-20261110T1547Z/ (unit-tests.txt, sandbox*.txt,
  mock-ft.txt, model.txt, build.txt, gas-max.csv, status).
$ cargo test -p nectar-core                       → exit 0: unit 453/0 · sandbox 5/0 · sandbox_p1 5/0 · sandbox_p2 4/0 · sandbox_reserve 2/0 ·
                                                      sandbox_v7 9/0 · sandbox_v7b 4/0 · doc 0 → 482 passed, 0 failed, 0 ignored
     v7: 81 unit tests named *v7_* (the `cargo test -p nectar-core v7_` filter set) + 103 in tests_v7/tests_v7b; new unit test
         tests_p2::deposit_forged_authority_refused ... ok
$ cargo test -p nectar-core --test <t> -- --nocapture  for t in sandbox sandbox_p1 sandbox_p2 sandbox_reserve sandbox_v7 sandbox_v7b
     5/0 · 5/0 · 4/0 · 2/0 · 9/0 (167–279 s) · 4/0 — all exit 0; 591 GAS rows ("attached,…" prepaid rows excluded)
$ cargo test -p mock-ft                           → 17 passed; 0 failed, exit 0
$ python3 contracts/nectar-core/tests/model.py --check --v7 → model.csv OK (132 rows), exit 0
$ (contracts/nectar-core) cargo near build non-reproducible-wasm → exit 0
     -                  Size: 734.8 KB (734784 bytes)
     - SHA-256 checksum hex : 252a6abe1803b2628b0adadb7b5ec120853ddbd8e1f698dddf4f629a29e8937a  (identical to 74ce8be: fix touched tests only)
$ git diff --stat add9427 53f1e63                 → src/tests_p2.rs +25, tests/sandbox_v7b.rs +23, docs only otherwise (no product code)
$ git status --short (clone, after runs)          → only ?? ev/ (verifier scratch)
Gas: previously missing rows now present (sandbox_v7b): GAS,set_shield_params,2672958059192 (2.67 Tgas);
  GAS,set_job_config,2558697971305 / 2565438983317 (2.56 / 2.57 Tgas; two jobs). Test asserts < 100 Tgas for both.
  Method diff: 68 `pub fn …(&mut self` in contracts/nectar-core/src/*.rs (non-test) vs GAS labels → every method measured except the 10
  #[private] callbacks (on_payout, on_pyth_price, on_quoter_result, on_signature, nft_resolve_transfer, on_session_check, on_multiplier_read,
  on_authority, on_deposit_verified, on_release_signature; counted inside caller totals) and ft_on_transfer (NEP-141 receiver, measured via the
  ft_transfer_call:* rows, e.g. LockCollateralAndBorrow 13.00–13.48, JoinNectarReserve 7.85, FundPappusQuote 7.99).
  Max label total 68.94 Tgas (trigger+pyth+quoter+8legs); no label >= 100 Tgas. All v7 method values from the FAIL run are reproduced in gas-max.csv.
PRD §6.11 tests: same mapping as the FAIL block below, all green again; forged deposit attestation now has a unit test
  (tests_p2::deposit_forged_authority_refused) in addition to sandbox_p2 remote_refusals_attestation_and_expiry. Missing: none.
F-352 (supersedes F-327): still "GATE G11 open" in docs/FACTS.md — xStocks multiplier mechanism unverified. Listed, not a FAIL reason
  (criterion is "F-327 answered or open").
Explorer: none (local sandbox).
Result: PASS — the only prior FAIL reason (no gas row for set_shield_params / set_job_config) is closed; all tests, model --v7 and build green.
  Open: F-352.

### G11 — v7 contract — FAIL (2 owner setters without a gas row; every test and PRD §6.11 criterion green) — 2026-11-10T15:12Z–15:39Z — commit 74ce8be
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G11-20261110T151225Z (HEAD 74ce8bea59d5); SDKROOT=.../MacOSX26.5.sdk; no secrets.
Exit codes via bash -c. Trimmed logs: evidence/G11/verifier-20261110T1512Z/ (unit-tests.txt, sandbox*.txt, gas-max.csv, coverage.txt).
$ cargo test -p nectar-core                       → exit 0: unit 452/0 · sandbox 5/0 · sandbox_p1 5/0 · sandbox_p2 4/0 · sandbox_reserve 2/0 ·
                                                      sandbox_v7 9/0 · sandbox_v7b 3/0 · doc 0 → total 480 passed, 0 failed
     v7: 81 tests named v7_* (tests_notes 43 + tests_reserve 38; = `cargo test -p nectar-core v7_` filter) + 103 in tests_v7/tests_v7b
         (names without the prefix) + 14 sandbox v7 tests (sandbox_v7 9 incl. tests/v7/notes.rs, sandbox_v7b 3, sandbox_reserve 2)
$ cargo test -p nectar-core --test <t> -- --nocapture  (targets listed from contracts/nectar-core/tests/*.rs)
     sandbox 5/0 · sandbox_p1 5/0 · sandbox_p2 4/0 · sandbox_v7 9/0 (181.9 s) · sandbox_v7b 3/0 · sandbox_reserve 2/0 — all exit 0
$ cargo test -p mock-ft                           → 17 passed; 0 failed, exit 0
$ python3 contracts/nectar-core/tests/model.py --check --v7 → model.csv OK (132 rows), exit 0 (--v7 asserts shield/self/reserve + agg_/mult_ rows)
$ (contracts/nectar-core) cargo near build non-reproducible-wasm → exit 0
     -                  Size: 734.8 KB (734784 bytes)
     - SHA-256 checksum hex : 252a6abe1803b2628b0adadb7b5ec120853ddbd8e1f698dddf4f629a29e8937a
$ git status --short (clone, after runs)          → only ?? ev/ (verifier scratch logs)
PRD v7 §6.11 "Tests added before any v7 service code" → passing test(s):
  two borrowers vs aggregate capacity — tests_v7::two_borrowers_cannot_both_draw_full_capacity; sandbox_v7 aggregate_debt_two_borrowers_repay_settle
  2-for-1 split leaves LTV unchanged — tests_v7::split_two_for_one_leaves_ltv_and_value_unchanged; sandbox_v7 multiplier_bounds_announce_and_split
  price > 900 s → weekend parameters — tests_v7::price_older_than_900s_flips_to_weekend_parameters; sandbox_v7 weekend_guard_calendar_stale_and_forced
  Reserve fills only after every quote — tests_reserve::v7_reserve_fills_only_after_every_quote; sandbox_reserve reserve_waterfall_late_depositor_transfer_and_exit
  Note transfer moves authority / refused while Settling — tests_notes::v7_notes_quote_authority_moves_with_transfer,
    v7_notes_loan_transfer_refused_while_settling, v7_notes_candidate_quote_transfer_refused_while_settling;
    sandbox_v7 notes::notes_authority_follows_transfer, notes::notes_transfer_refused_while_settling
  voluntary-fill cap holds — tests_v7b::self_settle_above_daily_cap (should panic), self_settle_daily_cap_resets_next_day; sandbox_v7b self_settle_refusals_and_exact_units
  referrer == borrower refused — tests_v7::referrer_equal_to_borrower_refused_with_full_refund; sandbox_v7 pay_to_claimable_and_referrers
  failed pay_to credits claimable_usdc — tests_v7::pay_to_failure_credits_borrower_claimable_then_withdraw; sandbox_v7 pay_to_claimable_and_referrers
  forged deposit attestation (wrong authority) refused — sandbox_p2 remote_refusals_attestation_and_expiry (reason authority_mismatch,
    borrower USDC 0); no unit test named for it. Missing: none.
Gas (max total per label from sandbox --nocapture GAS rows; 129 labels; max receipt chain trigger+pyth+quoter+8legs 68.94 total / 14.24 per receipt;
  "attached,300" rows are prepaid, excluded). New v7 methods: set_session_calendar 9.16 · force_session_closed 2.63 · set_multiplier 2.68 ·
  announce_corporate_action 2.67 · apply_corporate_action 2.74 · register_referrer 2.47 · unregister_referrer 2.47 · set_origination_fee_bps 2.35 ·
  withdraw_claimable 7.58 · nft_transfer 3.65 · nft_transfer_call 9.12 · set_quote_remote_recipient 2.68 · set_reserve_params 2.81 ·
  initiate_reserve_exit 2.91 · complete_reserve_exit 12.61 · ft_transfer_call(JoinNectarReserve) 7.82 · trigger_preliquidation(reserve) 17.93 ·
  set_max_voluntary_fill 2.64 · self_settle(remote)+sign 18.81 · LockCollateralAndBorrow(shield) 13.42 · set_multiplier_source 2.64 ·
  request_session_check+calendar 8.11 · request_multiplier_read+multiplier 8.47. G1-flagged owner setters now measured: set_allow_keeper_deposit_attestation
  2.45 · set_vault_read_config 2.55 · set_max_conf_bps 2.31 · set_oracle_source 2.57 · set_outlayer_account 2.31 · set_quoter_pin 2.42 ·
  set_quoter_secrets_ref 2.51 · set_vol_bps 2.66 · set_remote_chain 2.72 · set_signer_config 2.53 (+ set_quoter_config 2.39). All measured < 100 Tgas.
  MISSING gas row (never called in any sandbox target; grep of tests/*.rs + tests/v7/ finds no call): shields.rs set_shield_params,
  jobs.rs set_job_config (both owner setters, unit-tested only). Private callbacks excepted (nft_resolve_transfer, on_session_check,
  on_multiplier_read, on_authority, on_deposit_verified, on_release_signature).
F-327 → superseded by F-352: OPEN ("GATE G11 open": xStocks multiplier mechanism not verified; no primary source ties xStocks mints to
  Token-2022 ScaledUiAmount).
Explorer: none (local sandbox).
Result: FAIL — reason: set_shield_params and set_job_config have no recorded sandbox gas (criterion "gas per new v7 method < 100 Tgas,
  recorded from sandbox output, include the owner setters"). All tests, model --v7 and build green; F-352 open (listed, not a FAIL reason).

## G10

### G10 — v7 facts + toolchain — PASS with open items — 2026-11-10T13:44Z — commit 09c4316
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-v7-20261110T133401Z (HEAD 09c4316). No secrets. Read-only.
FACTS rows present (docs/FACTS.md:212–242): F-328, F-329 (x402), F-336 (superseded → F-353), F-337 (near-contract-standards 5.30.1),
  F-338 (derived_public_key, live), F-339 (keccak256_array), F-340…F-361 all present, dated 2026-11-10.
packages/config/nyse-calendar.json: "source": "https://www.nyse.com/markets/hours-calendars", "source_resolved": ".../trade/hours-calendars",
  "retrieved": "2026-11-10T11:45:14Z" (matches F-342).
$ solana --version  → solana-cli 2.3.0 (src:a2e21dda; feat:3640012085, client:Agave)   == F-340/F-341
$ anchor --version  → anchor-cli 0.32.1 (also printed "info: uninstalling toolchain solana" — avm side effect)   == F-340
$ forge --version   → forge Version: 1.9.0 (6056c58, built 2026-11-02)   == F-343
$ near contract call-function as-read-only v1.signer-prod.testnet derived_public_key json-args
    '{"path":"solana-devnet/pos/0","predecessor":"nectar-core-v2.nectar.testnet","domain_id":1}' network-config testnet now
  → "ed25519:2fhY3GjCcp4LU75uiiChUqQg9fS6xCtptLYZUdKJibpN"   == F-338 (exact match)
Code use of open items: grep of *.rs/*.ts/*.tsx/*.mjs/*.sol/*.yaml/*.json (excluding docs/, evidence/, lockfile) for
  8021 / ref-finance / rhea / burrow / ScaledUiAmount → only services/feed/test/fixtures/oneclick-tokens.json (1Click token list fixture).
  No product code depends on F-351/F-352/F-353.
Explorer: none opened (G10 is facts + read-only RPC).
Result: PASS with open items F-351 (ERC-8021 format, G12/G13 scope), F-352 (xStocks multiplier, G11), F-353 (Rhea ids). None used in code.

## G9

### G9 run 9b — step 4 re-check on the WO-79 commit (WO-80) — PASS (resolves the G9 run 9 FAIL) — 2026-11-13T14:27Z–14:33Z — commit 0904aec
- Clone: `git clone /Volumes/T7/nectar-labs /tmp/verify-g9-run9b-20261113`, then checkout 0904aecaed7fd9771cc19bd072b73cce40225824 (main, the commit the orchestrator named). No install was needed, no secrets were used, and nothing was signed. I touched no wallet,
  faucet or host service. Every probe was a public GET, HEAD or OPTIONS. `git status --porcelain` in the clone is empty at the end. Script: evidence/G9/run9b-20261113T1427Z/run9b.sh.
- Explorer links opened: none. No new tx is cited; README:29's 8bXCY34S… was RPC-checked in run 9, and nearblocks blocks WebFetch.
  ```
  $ git diff --stat d863f55 0904aec -- apps packages services contracts      → empty (exit 0)
  $ git diff --stat 1a95022 HEAD -- apps packages → empty; 37dfec9 HEAD -- services/feed → empty; c95cd0c HEAD -- apps/docs-site → empty
  $ git diff --stat d863f55 HEAD -- README.md docs/process/human-handoff.md docs/EVIDENCE.md → README 17, EVIDENCE +84, HUMAN_HANDOFF 11 (WO-78/WO-79)
  APP https://testnet.nectarlabs.io/borrow (14:29:12Z) → 200, 0 redirects, 14 chunks, x-vercel-cache HIT, age 2219 s, etag "d3e1527c…" (same as WO-78)
    /_next/static/immutable/chunks/3htcm-0feao4j.js: function T({onClaimed:e}={}) · {onClaimed:eT.reload} · test-assets-connect ×1; chunks with onClaimed: 1
  DOCS / (14:29:15Z) → last-modified Fri, 13 Nov 2026 02:03:23 GMT, age 44752 s (not redeployed); /docs/start/quick-start?x=1 → 308 /start/quick-start?x=1
  STATUS / 200; nectarlabs.io/status and testnet.nectarlabs.io/status → 308 https://status.nectarlabs.io/; SITE /borrow → 308 APP/borrow
  5 legacy vercel.app hosts /feed?y=2 → 308 to SITE/APP/APP/DOCS/DOCS with path + query kept
  Feed /health ×3 (14:29:18Z–14:29:25Z) → ok true ×3, commit 37dfec96262f…, source views+neardata, start_block "277503800", events_indexed 2,
    indexer_cursor present, indexer_lag_blocks 0 / -2 / 0
  Feed CORS → SITE, APP, STATUS: exact ACAO, /mcp preflight 204; docs.nectarlabs.io, evil.example.com: no ACAO, preflight 403
  scripts/deploy/smoke-prod.sh <4 custom hosts + 5 legacy pairs> (14:29:34Z) → web routes 28, docs pages 56 + assets 6, 43 ok, production smoke: failures 0, exit 0
  gitleaks dir evidence/G9/run9b-20261113T1427Z → no leaks; 0 home paths
  ```
1. Product unchanged since run 9: **PASS** (repo-checks.txt). The diff is empty, so G9 run 9 items 1–3 and 5–7 (commands, web delta + e2e, copy and secrets, payload, handoffs) carry over.
2. Step 4, claims vs EVIDENCE and the live hosts: **PASS** (repo-checks.txt, live-probes.txt, prod-smoke.log, chunk-sums.txt).
   - README:3 and :11–16 name web 1a95022 (release 4 + WO-74, deployed 13:51Z, dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K) and docs release 4 (c95cd0c, dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE). The cited blocks exist: §"WO-34 production (web 1a95022, WO-74)" (WO-78 PASS
     5/5) and §"WO-34 production (custom hosts)" (PASS 8/8). evidence/WO-34/deploy-web-cli-20261113T135102Z.log has the dpl id, `"readyState": "READY"` and "Production URL: https://nectarlabs.io". Live: APP /borrow carries the onClaimed→reload
     marker, and c95cd0c → 1a95022 changes only TestAssets.tsx, BorrowComposer.tsx and the spec. DOCS last-modified 02:03:23Z (docs not redeployed). README:17–22 host routing, status 308s, docs 308 and the 5 legacy 308s all match the live probes.
     The source commit 1a95022 is still only orchestrator-attested (WO-78 SELF-ATTESTED part); the content check agrees with it.
   - README:34–39: evidence/WO-34/prod-smoke-20261112T133529Z.log shows routes 28, pages 56, assets 6, failures 0, HSTS and no noindex, "failed requests: 0" and "console errors: 0". The pointers to §custom hosts and §web 1a95022 resolve. The QA log
     (self-attested, so labelled in README) shows line 30 "Balance 0.00 NVDAx", line 43 "Balance 5.00 NVDAx", and last line "••• borrow": disabled, as README:39 says.
   - README:29 and :66 (Feed rows): the live /health matches commit 37dfec9 (= the clone's services/feed), start_block 277503800, indexer_cursor / indexer_lag_blocks and views+neardata. evidence/ops/feed-v2-reindex-20261113T121107Z.log shows 1 event at
     start 277503800, lag 4151 at 12:12:02Z and 0 at 12:27:04Z. evidence/ops/x402-paid-download-20261113T122853Z.log: status 200, 112 rows, tx 8bXCY34S…. evidence/WO-71/fields.md exists. CORS matches (SITE/APP/STATUS only). Railway deploy d2861e5f
     is labelled "orchestrator run, no verifier record" and was not checked. "1 event" is dated 12:11:32Z; it is 2 now (run 8 note c).
   - README:66 and :150: G9 run 3 (3107a1a) is in EVIDENCE:1523, and 837cd12, a677689 and 2e16f9b exist. G14 verifier-run 402 → 200 on 2026-11-11 (EVIDENCE §G14 13:52Z) and the HEAD re-run with the guarded agent (§G14 15:02Z) exist. MCP stdio + HTTP,
     8 tools, holds as of run 9 (carried over).
   - HUMAN_HANDOFF H-DEPLOY (lines 150–157) names release 4 = c95cd0c (web dpl_Bm1uwQcX… replaced at 13:51Z, docs dpl_DpqAmb6… still serving) and web 1a95022 = dpl_4ExxeLH… via the CLI, approved for that fix only, verified in §"WO-34 production (web
     1a95022, WO-74)". That matches README and EVIDENCE.
Verdict: **PASS** (step 4, plus items 1–3 and 5–7 carried over from run 9 because the product is unchanged). This resolves the G9 run 9 FAIL. Run 9's notes (a)–(c) stay as notes. Screenshot: none.

### G9 run 9 — fresh-clone rehearsal on the WO-74 commit (WO-77) — FAIL (1 reason, step 4: README:11–13 names release 4 / c95cd0c, but production web serves the WO-74 deploy, which has no §"WO-34 production" block; docs/evidence only) — 2026-11-13T14:10Z–14:19Z — commit d863f55
- Clone: `git clone /Volumes/T7/nectar-labs` into /tmp/verify-G9-r9-20261113T141500Z/repo at 14:10:44Z (APFS, outside /Volumes/T7; the "141500Z" in the dir name is only a label). Checked out d863f55801cc9c5600fe899450812cfe41c94ec0, the commit the orchestrator named. Per WO-77 I cloned the local commit and noted the URL. README:82 now says `git clone https://github.com/NectarLabsio/nectar-labs.git`. `ls-remote` without credentials shows public main = b6d6f41 with no tags. `git diff --stat b6d6f41 d863f55 -- apps packages services contracts scripts/deploy` is empty, so a clone from that URL gets the same product. No secrets were used. Nothing was installed outside the clone and nothing was signed. I did not claim from the faucet and did not use demo.nectar.testnet or any wallet profile. `build-submission.mjs` ran only with `--dry-run`, and submit.sh was not run. The host Feed (pid 56878, :8788/:8789) was up before and after. My Feed used ports 18788/18789 with a DB in /tmp. :3100, :18788 and :18789 were free before and after. `git status --porcelain` in the clone is empty at the end. Method: run 8's scripts (evidence/G9/run9-20261113T141044Z/scripts/a, b, b2, c, d, e.sh). Two log lines had a home path, now redacted to `~`.
- WebFetch (opened): https://github.com/NectarLabsio/nectar-labs. It showed the "Public" label, "747 Commits" (= b6d6f41) and the README heading "Nectar Labs: committed buyers, higher limits". No explorer link was opened, because nearblocks blocks WebFetch. The two README tx claims were checked over public RPC instead.
  ```
  pnpm i                        → exit 0, 11 s
  pnpm demo:testnet             → exit 0, 5 s   (oracle $135.00 age 9793 s fresh; Open #1 #4 #5 #13 #14 #15)
  pnpm verify                   → exit 0, 28 s  (check-no-branding-all first; ui 7/0, feed 89/0 incl. `ok 28 - real nectar-core-v2 (2.0.0) log lines`,
                                  keeper 327/0, x402 41/0, web 43 pass + 1 skip, 0 failed)
  pnpm --filter web dev         → ready in 4 s; 21 README routes 200 (+ /status 200); /markets 404, /earn 404
  pnpm --filter docs-site build → exit 0, 18 s; 0 built files contain "hackathon"
  FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=/tmp/… pnpm --filter feed start → MCP HTTP nectar-feed 0.3.0, 8 tools,
                                  get_exit_capacity NVDAx q_usd_e6 16119220000 r_usd_e6 10000000 (block 277520736); /health see note (a)
  pnpm -s --filter feed mcp (stdio) → 8 tools, same Q_c / R_c (block 277520740)
  gitleaks detect --log-opts=--all → exit 0, 559 commits scanned, no leaks (non-merge commits 559 of 755)
  node scripts/build-submission.mjs --dry-run → exit 0
  (apps/web) pnpm build → exit 0; npx playwright test e2e/test-assets.spec.ts e2e/claims.spec.ts
      bundled headless shell → 28 failed at browserType.launch: chromium_headless_shell-1254 not installed (only 1248 cached); environment, not product
      PW_CHANNEL=chrome (Google Chrome 157.0.8103.78) → 28 passed (14 tests × desktop + phone), incl. test-assets.spec.ts:83
      "after a claim the composer balance refreshes without a reload and Review borrow can enable (WO-74)"
  APP /borrow (14:11:35Z) → 22 chunks; 3htcm-0feao4j.js has `function T({onClaimed:e}={})` and `(0,t.jsx)(T,{onClaimed:eT.reload})` + `test-assets-connect`;
      header age 1169 s, x-vercel-cache HIT (cached ≈ 13:52Z). DOCS / last-modified 02:03:23Z (docs not redeployed)
  scripts/deploy/smoke-prod.sh <4 custom hosts + 5 vercel.app legacy pairs> → web routes 28, docs pages 56 + 6 assets, production smoke: failures 0 (41 s)
  hosted Feed /health 14:11:43Z–14:11:52Z → ok true ×3, views+neardata, start_block "277503800", events_indexed 2, commit 37dfec9, indexer_lag_blocks 0
  CORS 14:11:57Z → nectarlabs.io, testnet., status. exact ACAO + /mcp preflight 204; docs.nectarlabs.io, evil.example.com no ACAO, 403
  RPC tx De6aVqqN… SuccessValue true, EVENT_JSON nectar 2.0.0 oracle_updated NVDAx 135000000; RPC tx 8bXCY34S… SuccessValue ""
  ```
1. Quick start: **PASS**. The commands took about 1.1 min, well under 15 min. Only one step needed a choice, and the WO made it: clone the local commit, not the URL, because public main lags by 4 docs/evidence commits.
2. Commands: **PASS** (above; summary.txt, demo-testnet.log, verify.log, web-dev-routes.txt, docs-build.log, feed-*.log, gitleaks.log, build-submission.log).
3. Web delta (WO-77 item 2): **PASS** (web-build.log, e2e.log, e2e-chrome.log, prod-release.txt, prod-smoke.log). The new WO-74 case passes in the clone on both projects. Production serves the fix (marker check: one /borrow chunk carries the `onClaimed` prop and the composer's `onClaimed:…reload` call). smoke-prod shows 0 failures. The production QA claim is **SELF-ATTESTED**: evidence/WO-74/prod-qa-check-20261113T140705Z.log shows throwaway qa-faucet-1113b.nectar.testnet going from 0.00 to 5.00 NVDAx without a reload. I did not re-run it. Its key handling looks clean: the log prints only "privkey: typed into 1 text field", and `gitleaks dir evidence/WO-74` finds no leaks.
4. Claims vs EVIDENCE and the live hosts: **FAIL**, 1 reason (prod-release.txt, checks-d.txt).
   - README:11–13: "Production runs release 4, commit c95cd0c, deployed 2026-11-13 ~02:00Z … (… Vercel web dpl_Bm1uwQcX…, docs dpl_DpqAmb6…) … If production is redeployed later, that release and its result get their own block in §"WO-34 production"." Production web is no longer c95cd0c. APP /borrow ships the WO-74 code, which c95cd0c does not have: `git diff --stat c95cd0c d863f55 -- apps/web` lists TestAssets.tsx, BorrowComposer.tsx and the spec. evidence/WO-34/deploy-web-cli-20261113T135102Z.log records dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K READY on production at 13:51Z. STATE at 9be1e2a (one commit after d863f55) gives its source as 1a95022. EVIDENCE §"WO-34 production" still has 4 blocks, and the newest is c95cd0c. README:34 ("release 4 on the custom hosts") and HUMAN_HANDOFF H-DEPLOY ("release 4 = c95cd0c deployed") have the same gap. Docs were not redeployed (last-modified 02:03:23Z), so the docs half of README:11–12 still holds.
   - Remedy (not mine to make): a verifier §"WO-34 production" block for the 1a95022 web deploy, plus README:11–13 and :34 naming it. Runs 5 and 6 failed on the same class of gap.
   - Re-probed and PASS: the hosted Feed commit 37dfec9 equals the clone's Feed (`git diff --stat 37dfec9 HEAD -- services/feed` is empty), and CORS matches README:26. Both RPC txs that README:26/:58 cite succeeded. Besides the repo URL, README changed only at :82 and :96 since b6d6f41. Both are true now: :82 is the public URL and :96 is "re-run from the public URL follows" (done in run 8).
5. Copy rules, branding, hosts, secrets: **PASS** (branding.log, repo-shape.txt, checks-d.txt). `check-no-branding-all.mjs` exits 0. There are 3 copy-rule hits, all copy-rule comments. The host grep has 24840 lines, and only the same 4 allowed lines lie outside the history (README:18, apps/web/.env.example:17, lib/hosts.ts:38, lib/test-assets.test.ts:28). There are 0 `ac.nectarlabs.io` hits outside the history. The key-material grep has 0 hits that are not signatures. The new evidence (6 WO-74 QA logs, qa-account-create, the CLI deploy log) contains only public keys, signatures and redacted actions. intear-setup.mjs prints only through redact() (:35), and its new `privkey` command prints only a count line. The home-path grep has 1 hit, EVIDENCE.md:1188, which quotes the pattern `/home/x/`: a false positive, so 0 real home paths.
6. Submission payload (dry run): **PASS** (checks-e.txt). `website` is absent. projectUrl = "https://github.com/NectarLabsio/nectar-labs". Tracks are ["defi","security","agents"]. Open TODO-H fields: leadName/email/size (H10), nearAddress/consent (H14), demoUrl (H3).
7. Handoffs (37 entries): **PASS**. Since run 8 the only change is H2, now "PUSH DONE, tags pending" (the tag push is still Kunal's). Census: 17 DONE/CLOSED, 11 DEFAULT-AT-DEADLINE, 7 KUNAL-ONLY (H1, H2 tags, H3, H10, H11, H12, H14), 2 N/A and **0 OTHER-OPEN**.
Notes, not counted:
- (a) Local Feed /health showed `ok:false` at the first probe (14:13:44Z, "neardata last_block HTTP 429"). In a re-probe (feed-health-reprobe.txt) it read ok true 4 times (14:16:48Z–14:17:18Z), then `ok:false` again on a neardata 429 at 14:17:38Z. The cause is the keyless public Neardata endpoint rate-limiting the default local indexer. Snapshots and every MCP tool still answer from views. README promises only that `feed start` runs with no env, and it does.
- (b) In the self-attested QA log, after 5 units were entered the "••• borrow" button stayed disabled (last line). The e2e case says Review borrow "can enable". README:34–35 claims no hosted borrow ("No wallet has signed a borrow on the hosted app yet").
- (c) docs/SUBMISSION.md:85 ("G9 today: PASS on release 3 …") and README:95–99 (run 3 timings) are dated stale cites. Recurring note.
Verdict: **FAIL** (1 reason, step 4, docs/evidence only). Every command, the web delta and the e2e specs pass on d863f55. G9 passes once the WO-74 production release has its §"WO-34 production" block and README:11–13/:34 name it. No product change is needed.
**Resolved** (2026-11-13T14:33Z, G9 run 9b / WO-80, commit 0904aec): §"WO-34 production (web 1a95022, WO-74)" now exists (WO-78 PASS), and README:3, :11–16, :34–39 and HUMAN_HANDOFF H-DEPLOY name web 1a95022 / dpl_4ExxeLH… and docs c95cd0c. The live hosts match. Product code is unchanged since d863f55, so items 1–3 and 5–7 carry over. See §G9 run 9b.

### G9 run 8 — fresh clone from the public GitHub URL (WO-76) — PASS — 2026-11-13T13:44Z–13:52Z — commit b6d6f41
- Clone: `git clone https://github.com/NectarLabsio/nectar-labs.git` (HTTPS, anonymous) into /tmp/verify-G9-r8-20261113T134430Z/repo at 13:45:56Z, so not from the local path and not on /Volumes/T7. `git rev-parse HEAD` = b6d6f411a1bf4e7dec0cdaa9fe3b15eebab84a94, the expected b6d6f41. No secrets were used. Nothing was installed outside the clone and nothing was signed. `build-submission.mjs` ran only with `--dry-run`, and submit.sh was not run. Host services were not touched: the host Feed (pid 56878, :8788/:8789) was up before and after, my Feed used ports 18788/18789 with a DB in /tmp, and :3100, :18788 and :18789 were free before and after. `git status --porcelain` is empty after the run. Same method as run 7. Scripts: evidence/G9/run8-public-20261113T134430Z/scripts/a–e.sh. Logs are in the same directory. host-grep.txt is gzipped. A redaction pass found no home paths to remove.
- WebFetch (opened): https://github.com/NectarLabsio/nectar-labs showed the "Public" label, "747 Commits" on main, and the README heading "Nectar Labs: committed buyers, higher limits". No explorer link was opened: nearblocks blocks WebFetch, so the two tx claims were checked over public RPC.
  ```
  curl api.github.com/repos/NectarLabsio/nectar-labs (no token) → "private": false, "visibility": "public", pushed_at 2026-11-13T13:38:36Z
  GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote … → b6d6f41 HEAD, refs/heads/main (exit 0); no tags on the remote
  pnpm i                        → exit 0, 12 s
  pnpm demo:testnet             → exit 0, 4 s   (oracle $135.00 age 8341 s fresh; pool $40,761.00 / $9,239.00 utilised; Open #1 #4 #5 #13 …)
  pnpm verify                   → exit 0, 36 s  (check-no-branding-all first; ui 7/0, feed 89/0 incl. `ok 28 - real nectar-core-v2 (2.0.0) log lines`,
                                  keeper 327/0, x402 41/0, web 43 pass + 1 skip; sdk count not re-extracted, covered by verify exit 0)
  pnpm --filter web dev         → ready in 4 s; 21 README routes 200 (+ /status 200); /markets 404, /earn 404
  pnpm --filter docs-site build → exit 0, 24 s; 0 built files contain "hackathon"
  FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=/tmp/… pnpm --filter feed start → /health ok true; MCP HTTP nectar-feed 0.3.0, 8 tools,
                                  get_exit_capacity NVDAx q_usd_e6 16119220000 r_usd_e6 10000000 (block 277518212)
  pnpm -s --filter feed mcp (stdio) → 8 tools, same Q_c / R_c (block 277518216)
  gitleaks detect --log-opts=--all → exit 0, 553 commits scanned, no leaks (git rev-list --count --no-merges --all = 553 of 747)
  node scripts/build-submission.mjs --dry-run → exit 0
  scripts/deploy/smoke-prod.sh <4 custom hosts + 5 vercel.app legacy pairs> → production smoke: failures 0 (exit 0, 44 s)
  hosted Feed /health 13:49:51Z–13:50:00Z → ok true, views+neardata, start_block "277503800", events_indexed 2, commit 37dfec96262f…, indexer_lag_blocks -1 / 0 / 0
  CORS 13:50:05Z → nectarlabs.io, testnet., status. exact ACAO + /mcp preflight 204; docs.nectarlabs.io, evil.example.com no ACAO, 403
  RPC tx De6aVqqN… SuccessValue true, EVENT_JSON nectar 2.0.0 oracle_updated NVDAx 135000000; RPC tx 8bXCY34S… SuccessValue ""
  ```
1. Quick start: **PASS**. The commands took about 1.3 min, well under 15 min. Nothing had to be guessed this time, because the WO gives the repo URL. README:82 still says `<repo-url>` with "repo URL TODO-H2 (private until published)", and README:96 says the verifier cloned the local path. Per the WO, both are recorded as "filled in a later commit", not as a failure.
2. Commands: **PASS** (above; summary.txt, demo-testnet.log, verify.log, web-dev-routes.txt, docs-build.log, feed-*.log, gitleaks.log, build-submission.log, prod-smoke.log).
3. Public-repo hygiene (WO-76): **PASS** (repo-shape.txt, checks-d.txt).
   - Size: no working-tree file over 50 MB, and no history blob over 50 MB. The largest blob is 3.48 MB (home-1440-light.png). The pack is 63.26 MiB.
   - .env: only `.env.example` and `apps/web/.env.example` are tracked or ever added in history. Their values are `TODO-G*` placeholders, public URLs, public ids and key paths. Every secret field is empty (ONE_CLICK_API_KEY, NEAR_AI_API_KEY, the x402 paths).
   - ~/.nectar: no tracked file lives under a `.nectar` dir, and there are 0 expanded home paths (`[/]Users[/]x` or `/home/x/`, excluding wasm). `~/.nectar` appears in 194 lines across 85 files. Outside docs/evidence/md, these are the documented key and DB locations (CLAUDE.md §1): .env.example paths, ignore files, scripts that create 0600 files there, and the Feed/keeper default DB paths. They name paths, never key contents. I read the WO item as "no expanded home path and no copy of ~/.nectar", and on that reading it is met.
   - Key material: gitleaks finds no leaks over the history, and `gitleaks dir scripts/demo` is also clean. Every ed25519 string of 80+ characters sits under a `signature`, `public_key` or `signer_public_key` JSON key in RPC dumps or fixtures, or on a "Signature:" line of a near-cli log. No 0x+64-hex value is assigned to a key-like name in code. Anvil key 0 is absent. The new evidence/ops/qa-account-create log shows only public keys and a signature. intear-setup.mjs prints only through redact() (:35).
4. Claims vs EVIDENCE and the live hosts: **PASS** (public-repo.txt, prod-release.txt, hosted-claims.txt, prod-smoke.log). README, HUMAN_HANDOFF, SUBMISSION and DEMO_SCRIPT have not changed since d92a199 (run 7), so run 7's claim checks carry over. These were re-probed:
   - Production release (README:11, "release 4, commit c95cd0c"): APP /borrow references 14 chunks. One of them carries the TestAssets marker `test-assets-connect`, and none contains WO-74's `onClaimed` prop. The page header shows `age: 42579` (cached since about 02:00Z) and `x-vercel-cache: HIT`. So production is still release 4, as the README says. Method limit: this is a marker check, not a deployment-id read.
   - smoke-prod.sh: 0 failures. Hosted Feed: commit 37dfec9 equals the clone's Feed (`git diff --stat 37dfec9 HEAD -- services/feed` is empty), and CORS matches README:26. Both RPC txs that README:26/:58 cite succeeded.
5. Copy rules, branding, hosts: **PASS** (branding.log). `check-no-branding-all.mjs` exits 0. There are 3 copy-rule hits, all copy-rule comments (Shields.tsx:3, Landing.tsx:5, sdk shields.ts:19). The host grep has 24799 lines. Only 4 lie outside the historical records, and they are the same 4 allowed lines as in run 7 (README:18, apps/web/.env.example:17, lib/hosts.ts:38, lib/test-assets.test.ts:28). There are 0 `ac.nectarlabs.io` hits outside the history.
6. Submission payload (dry run): **PASS** (checks-c.txt). The keys are requestId, projectName, leadName, email, size, tracks, nearAddress, projectUrl, demoUrl, idea and consent. `website` is absent. Tracks are ["defi","security","agents"]. Open TODO-H fields: leadName/email/size (H10), nearAddress/consent (H14), projectUrl (H2), demoUrl (H3).
7. Handoffs: **PASS**. There are 37 entries, and HUMAN_HANDOFF is unchanged since d92a199, so run 7's census stands: 17 DONE/CLOSED, 11 DEFAULT-AT-DEADLINE, 7 KUNAL-ONLY, 2 N/A and **0 OTHER-OPEN**.
Not re-checked in this run: the sdk test count (verify exit 0 covers it), the scripts/demo seed-reader census beyond the grep above, and a screenshot (none taken).
Notes, not counted:
- (a) README:82 and :96 (TODO-H2, "private until published", "cloned the local path") are out of date now that the repo is public. Filled in a later commit, per the WO. HUMAN_HANDOFF H2 is still OPEN (Kunal-only). The remote has no tags yet, so `submission-rc` is not on GitHub.
- (b) The clone's web code differs from production by WO-74 (3 files under apps/web). WO-74 is merged but not deployed, and the README does not claim it.
- (c) The hosted Feed shows events_indexed 2. README:26 gives "1 event" dated 12:11:32Z, so the claim is dated, not stale. One /health poll showed indexer_lag_blocks -1 (cursor 277518298, head 277518300 from view_block). The next two polls read 0.
- (d) README:95–99 still quotes G9 run 3 timings. That text is dated and attributed. Recurring note.
Verdict: **PASS**. G9 passes on b6d6f41, cloned anonymously from the public GitHub URL.

### G9 run 7 — fresh-clone rehearsal on the Feed-fix commit (WO-73) — PASS — 2026-11-13T12:33Z–12:40Z — commit d92a199
- Clone: `git clone /Volumes/T7/nectar-labs` into /tmp/verify-G9-r7-20261113T123302Z/repo (APFS, outside /Volumes/T7), checkout d92a199c043ea87751196ab85fb4df468d5a75f1. I used no secrets and did not install anything outside the clone. Nothing was signed. Host services were not touched: the host Feed (pid 56878, :8788/:8789) was running before and after. My Feed used ports 18788/18789 and a DB in /tmp. Ports :3100, :18788 and :18789 were free before and after. `git status --porcelain` in the clone is empty after the run. WebFetch was not used: nearblocks blocks it, so the two chain claims below were checked over public RPC. Logs: evidence/G9/run7-20261113T123302Z/. Scripts: evidence/G9/run7-20261113T123302Z/scripts/ (same method as run 6).
- Scope since run 6/6b (product c95cd0c): `git diff --stat c95cd0c d92a199 -- apps contracts` → empty (exit 0). packages + services: 11 files (ops.oracle_refresher config, keeper test, services/feed v2 events). Also scripts/demo/** and docs. `git diff --stat 37dfec9 d92a199 -- services/feed` → empty, so the hosted Feed commit equals the clone's Feed.
  ```
  pnpm i                        → exit 0, 25 s
  pnpm demo:testnet             → exit 0, 5 s   (oracle $135.00 age 3974 s fresh; pool $40,771.00 / $9,229.00 utilised; Open #1 #4 #5 #13 #14 #15)
  pnpm verify                   → exit 0, 37 s  (check-no-branding-all first; ui 7/0, feed 89/0, keeper 327/0, x402 41/0, sdk 218/0 (13 files), web 43 pass + 1 skip, 0 failed)
  pnpm --filter web dev         → ready in 4 s; 21 README routes 200 (+ /status 200); /markets 404, /earn 404 (as README:104 says)
  pnpm --filter docs-site build → exit 0, 42 s
  FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=/tmp/… pnpm --filter feed start → /health ok true; MCP HTTP initialize nectar-feed 0.3.0, tools/list 8,
                                  get_exit_capacity {"symbol":"NVDAx"} q_usd_e6 16119220000 r_usd_e6 10000000 (block 277510731)
  pnpm -s --filter feed mcp     → stdio: initialize, 8 tools, same Q_c / R_c (block 277510735)
  gitleaks detect --log-opts=--all → exit 0, 543 commits scanned, no leaks found
  node scripts/build-submission.mjs --dry-run → exit 0
  scripts/deploy/smoke-prod.sh <4 custom hosts + 5 vercel.app legacy pairs> → web routes 28 / docs pages 56 + 6 assets, production smoke: failures 0
  curl https://feed-production-2f2776c9.up.railway.app/health (12:33:55Z, 12:34:00Z, 12:34:05Z) →
    ok true, source views+neardata, start_block "277503800", events_indexed 1, history indexed, commit 37dfec96262f…,
    indexer_cursor 277510472 / 277510482 / 277510490, indexer_lag_blocks 0 / 0 / 0, lag_blocks 0
  CORS (12:38Z): nectarlabs.io, testnet.nectarlabs.io, status.nectarlabs.io → exact ACAO + /mcp preflight 204; docs.nectarlabs.io, evil.example.com → no ACAO, 403
  RPC tx De6aVqqN… (nectar.testnet → nectar-core-v2): SuccessValue true; EVENT_JSON nectar 2.0.0 oracle_updated NVDAx 135000000; tx block 277503816, event receipt block 277503817
  RPC tx 8bXCY34S… (x402-relayer → agent1, delegate): SuccessValue ""
  ```
1. Quick start: **PASS**. The commands took about 1.2 min, well under 15 min. One guess, the same as in every run: the repo URL is `TODO-H2`, so I cloned the local path. pnpm i took 25 s, against the 13 s that README:83 gives. README:83 itself says a cold store takes longer.
2. Commands: **PASS** (above; summary.txt, demo-testnet.log, verify.log, web-dev-routes.txt, docs-build.log, feed-*.log, gitleaks.log, build-submission.log, prod-smoke.log).
3. Hosted Feed (WO-73 item 2): **PASS** (hosted-feed.txt, checks-d.txt, hosted-claims.txt). Commit 37dfec9, source views+neardata, events_indexed 1 (≥ 1), indexer_cursor present, indexer_lag_blocks 0. README:26 and :61 match: start block 277503800, 1 event (the 11:28Z `oracle_updated`, block 277503817, confirmed on RPC), `/health` with indexer_cursor / indexer_lag_blocks, and CORS for Site + App + Status. The evidence files README cites exist: evidence/ops/feed-v2-reindex-20261113T121107Z.log (lag reached 0 at 12:27:04Z), feed-v2-railway-log-20261113.txt (names d2861e5f), x402-paid-download-20261113T122853Z.log (402 → 200, 112 rows, tx 8bXCY34S, which succeeded on RPC) and evidence/WO-71/fields.md. The local Feed tests include the real v2 fixtures: services/feed/test/v2-events.test.ts reads test/fixtures/nectar-core-v2-events.json (archival RPC receipts, 9 lines at version 2.0.0). verify.log shows `ok 28 - real nectar-core-v2 (2.0.0) log lines`, with 8 subtests that include De6aVqqN… and "all fixtures together: 6 events".
4. scripts/demo/** (WO-73 item 3): **PASS** (demo-scripts.txt).
   - No secret or key material. `gitleaks dir scripts/demo` finds no leaks. A grep for ed25519 keys, 0x64-hex, PEM, mnemonic and secret_key matches only the field reads `KEY.seed_phrase` / `KEY.private_key` (intear-setup.mjs:22, :25).
   - No home path. `[/]Users[/]` matches 0 lines in scripts/demo, and 0 files repo-wide (excluding wasm).
   - Seed file readers. Only scripts/demo/intear-setup.mjs:21 reads ~/.nectar/keys/demo.nectar.testnet.json. scripts/ops/create-demo-account.mjs writes it (0600) and prints only account_id, public_key and key_file (line 36). Its line 6 is a comment for a human. The other seed/mnemonic hits are not readers: services/keeper/src/base.ts:129 is an env-name filter, and the rest are its test, vendored forge-std and lockfiles.
   - Redact path. intear-setup.mjs:34 `out = (...a) => console.log(redact(...))` is the only console call in the file. redact() (:28–33) replaces the private key, the password file value and each phrase word with "•••", and $HOME with "~". The seed is typed with keyboard.type (:80) and only the word count is printed (:81). Thrown errors print only counts. The file makes no screenshots or traces.
5. Claims vs EVIDENCE and the live hosts: **PASS**. Since 8a54b4c (run 6b), README changed only rows 26, 58 and 61. The Feed rows are checked in item 3. Row 58 (oracle refresher) gives first refresh 11:28Z and tx De6aVqqN…. That tx succeeded on RPC with oracle_updated, and the demo's oracle age 3974 s at 12:34Z points back to about 11:28Z. Lines 3 and 10–38 are unchanged, and production still serves release 4: smoke-prod.sh shows 0 failures and STATE:1 says release 4 (c95cd0c). DEMO_SCRIPT step 3 and HUMAN_HANDOFF H-FEED-EVENTS give the same values as the README.
6. Copy rules, branding, hosts: **PASS** (branding.log). `check-no-branding-all.mjs` exit 0. 3 copy-rule hits, all copy-rule comments (Shields.tsx:3, Landing.tsx:5, sdk shields.ts:19). 0 built docs files contain "hackathon". Host grep: 12390 lines. 4 are outside the historical records and all are allowed: README:18 (legacy vercel.app hosts redirect, no host named), apps/web/.env.example:17, lib/hosts.ts:38 and lib/test-assets.test.ts:28 (all three as in run 6). 0 `ac.nectarlabs.io` hits outside the history.
7. Submission payload (dry run): **PASS**. Keys: requestId, projectName, leadName, email, size, tracks, nearAddress, projectUrl, demoUrl, idea, consent. `website` is absent. Tracks are ["defi","security","agents"], and the payload has 0 "privacy" mentions. Open TODO-H fields: leadName/email/size (H10), nearAddress/consent (H14), projectUrl (H2), demoUrl (H3).
8. Handoffs (37 entries): **PASS**. 17 DONE/CLOSED: run 6's 12, plus H-DEPLOY, H-ORACLE, H-NEARDATA and H-DEMO-WALLET now DONE, plus the new H-FEED-EVENTS. 11 DEFAULT-AT-DEADLINE, each with a "Default if silent" line: H-EXPLORER, H13, H4, H-KEYS, H7, H8, H-GUARD-V7, H15, H18, H19, H20. 7 KUNAL-ONLY: H1, H2, H3, H10, H11, H12, H14. 2 N/A: H5 (superseded) and H6 (out of scope). **0 OTHER-OPEN**.
Notes, not counted:
- (a) scripts/demo hard-codes the operator's external-volume path `/Volumes/T7/…` in 9 lines across 8 files: CAPTURE.md:33/:92, EDIT.md:30, apptest.mjs:12, compose.mjs:19, encode.mjs:16, recorder.mjs:309, terminal/server.mjs:10 and intear-setup.mjs:16. It also names `~/.nectar/…`, which is resolved with homedir() at runtime. Neither is a home path and neither names a user. No README claim says these scripts run from a clone. Only scripts/demo-testnet.mjs is cited, and it is a different file.
- (b) docs/process/state.md does not record the 12:10Z Feed redeploy (line 53 still says WO-71 "dispatched"). The README cites the evidence/ops logs, not STATE, and live /health agrees.
- (c) README:95–99 still quotes G9 run 3 timings. That text is dated and attributed. Recurring note.
- (d) x402 tests print one "Facilitator getSupported failed (401)" log line. The suite still passes 41/41.
Verdict: **PASS**. G9 passes on d92a199. With the web/docs product unchanged since c95cd0c, this covers production release 4 plus the hosted Feed at 37dfec9.

### G9 run 6b — step 3 (claims) re-check after WO-68, plus smoke-prod.sh from the clone (WO-67b) — PASS — 2026-11-13T02:33Z–02:40Z — commit 8a54b4c (product = c95cd0c)
Scope: run 6 failed only on step 3 (docs/process/gate-fail-wo67.md). Fresh clone: `git clone /Volumes/T7/nectar-labs` into /tmp/verify-G9-20261113T023332Z/repo (APFS, not exFAT), checkout 8a54b4c0528f4eb2778d9aee69f99d3c65fa1e59. Nothing was installed, signed or restarted. Host services were not touched. Every probe was a read-only curl or headless Chrome. WebFetch was not used because this step has no explorer link. Logs: evidence/WO-67b/.
```
$ git diff --stat c95cd0c 8a54b4c -- apps packages services contracts   → (empty, exit 0)
$ git diff --stat b7fa381 8a54b4c   → README, DEMO_SCRIPT, HUMAN_HANDOFF, EVIDENCE, FACTS, STATE, GATE_FAIL_WO67, docs/process/work, evidence/WO-67, 67 scripts mode 100644→100755
$ scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
    https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
    https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
    https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io
  web smoke https://testnet.nectarlabs.io: routes 28, failures 0
  docs smoke https://docs.nectarlabs.io: pages 56, assets 6, failures 0
  43 ok (host split, status host, docs 308s, 5 legacy 308s with path + query, HSTS/CSP/no noindex on 4 hosts)
  production smoke: failures 0          → exit 0, 02:35:25Z
$ Feed /health 02:35:25Z → ok true, source views+neardata, history indexed, start_block head-50000, last_indexed_block = chain_head 277449722,
    lag_blocks 0, events_indexed 0, commit 3974b5b
```
1. Product unchanged: **PASS**. The diff above is empty, so run 6 items 1, 2 and 4–7 carry over (§G9 run 6).
2. Step 3, claims vs EVIDENCE and the live hosts: **PASS** (claims-probe.log, hydrated-probe.log). Each line GATE_FAIL_WO67 named:
   - README:11–13, release 4 = c95cd0c, deployed ~02:00Z with Kunal's approval, dpl_Bm1uwQcX…/dpl_DpqAmb6…, acceptance PASS 8 of 8 at 02:05Z–02:40Z: matches §"WO-34 production (custom hosts)" and H-DEPLOY (DONE). README:3 says the same. `hosted_until` "2026-11-25" and `production_hosts` match config.yaml. `dig NS nectarlabs.io` → ns1/ns2.vercel-dns.com (F-458).
   - README:15–19 and the Status row (README:25): STATUS / is 200 with title "Status · Nectar Labs" and h1 "Status". SITE /status and APP /status 308 → STATUS/, and SITE /status?x=1 keeps the query.
   - Docs row (README:24): DOCS/sitemap.xml has 56 locs, 0 with a /docs/ prefix. DOCS /docs/start/quick-start?x=1 308 → /start/quick-start?x=1.
   - Legacy: all 5 vercel.app hosts 308 with path + query kept (smoke), and also /about?q=1 and /start/quick-start?q=1.
   - Site row (README:22): /, /about, /security, /changelog, /legal/privacy 200. /borrow, /quotes, /feed, /notes, /console and an unknown path 308 → APP. App row (README:23): /borrow, /feed, /notes, /console 200. "quotes" is the /quote/<id> pages (/quote 307 → /quote/new, /quote/1 200); APP /quotes is 404, but the row names features, not paths.
   - Faucet line (README:36–38) and "Get test assets": hydrated Chrome (1440 px, networkidle + 4 s, no wallet). APP /borrow: 1 `test-assets` + 1 `test-assets-connect`, text "Get test assets: connect a wallet first. Mock assets, no value", 0 console errors. SITE /, /about and STATUS /: 0 and 0. Raw HTML has 0 on every host, so the button renders on the client. Faucet numbers match config.yaml `faucet` (5/500 per claim, 3600 s, caps 15/1500 = 3 claims). evidence/rollout/mockft-faucet-20261112T200937Z.log exists. Screenshot: evidence/WO-67b/app-borrow-test-assets.png.
   - Feed rows (README:26 and :61): the neardata switch at 02:22Z, the fresh DB and cursor 277398512 are in STATE:20–21, and H-NEARDATA is DONE. Live /health (above) shows the same values README quotes for 02:29Z. CORS: SITE, APP and STATUS each get exact-origin ACAO + `vary: Origin` and a 204 /mcp preflight. evil.example.com and docs.nectarlabs.io get no ACAO and a 403 preflight. "No verifier run on the indexed history" still holds, because this run read /health only.
   - DEMO_SCRIPT step 3 (lines 20–24) matches the above. HUMAN_HANDOFF H-DEPLOY and H-NEARDATA are DONE with the same release, dpl ids and Feed settings. services/feed/src/hosted.ts:20 reads `FEED_NEARDATA_API_KEY`, as H-NEARDATA says. HUMAN_HANDOFF:160 "Merged but not deployed" is inside the kept original request, so it is not counted.
   - A grep for the run 6 phrases ("next production release", "not deployed", "origins only", "until then", "no verifier run on these hosts") finds 0 hits in README and DEMO_SCRIPT.
3. `scripts/deploy/smoke-prod.sh` run by path from the fresh clone: **PASS**, exit 0, 0 failures (prod-smoke-20261113T023525Z.log). Git and filesystem modes are 100755 / -rwxr-xr-x for smoke-prod/web/docs.sh. No copy or chmod was needed (f5a3152).
Notes, not counted: "about 8.5 h before the switch" is an estimate. 50,000 blocks at the observed ~0.6–0.65 s per block is 8.3–9 h. STATE:21 forecast catch-up at ≈ 04:05Z, but /health shows lag 0 by 02:35Z.
Verdict: **PASS** for step 3 on 8a54b4c. Together with run 6 (every other step PASS on the same product), G9 is PASS for c95cd0c.

### G9 run 6 — fresh-clone rehearsal on the deployed commit (WO-67 B) — FAIL (1 reason, step 3: the README hosted-demo section describes the pre-release state; docs only) — 2026-11-13T02:05Z–02:40Z — commit b7fa381 (product = c95cd0c)
- Clone: the same fresh clone as §WO-34 production (custom hosts), `git clone /Volumes/T7/nectar-labs` into /tmp/verify-wo67-20261113T0205Z/repo, checkout b7fa381. `git diff --stat c95cd0c b7fa381 -- apps packages services contracts` printed nothing, so G9 covers the deployed product. No secrets were used. Host services were not touched (own Feed ports 18788/18789, own DB in /tmp; :3100 was free before and after). Full logs: evidence/WO-67/B/. Scripts: evidence/WO-67/scripts/.
- Commands (README "Quick start" + "Optional", gates.md G9):
  ```
  pnpm i                      → exit 0, 10.8 s
  pnpm demo:testnet           → exit 0, 5 s   (oracle $135.00 age 39480 s fresh; pool $40,771.00 / $9,229.00 utilised; positions #0–#15, Open #1 #4 #5 #13 #14 #15)
  pnpm verify                 → exit 0, 29 s  (check-no-branding-all first; ui 7/0, feed 79/0, keeper 327/0, x402 41/0, sdk 218/0 (13 files), web 43 pass + 1 skip (live copilot), 0 failed)
  pnpm --filter web dev       → ready in 5 s; 21 README routes 200 (+ /status 200); /markets 404, /earn 404 (as README says)
  pnpm --filter docs-site build → exit 0, 19 s
  FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=/tmp/… pnpm --filter feed start → MCP HTTP: initialize nectar-feed 0.3.0, tools/list 8, get_exit_capacity {"symbol":"NVDAx"} live (block 277447729)
  pnpm -s --filter feed mcp (stdio) → initialize, 8 tools, get_exit_capacity live (block 277447734, same Q_c 16119220000 / R_c 10000000 as the demo)
  gitleaks detect --log-opts=--all → exit 0, 510 commits scanned, no leaks found
  node scripts/build-submission.mjs --dry-run → exit 0 (the script never sends without --send-mode)
  ```
1. Quick start: **PASS**, about 1 minute of commands, well under 15 min. One guess: the repo URL is `TODO-H2` in the README, so I cloned the local path. No other guesses. Note: the local Feed /health, polled right after the server first answered, showed `ok:false` with no poll done yet; MCP answered with live data a moment later.
2. Commands: **PASS** (above; B/summary.txt, demo-testnet.log, verify.log, docs-build.log, gitleaks.log, web-dev-routes.txt, feed-mcp-http.log, feed-mcp-stdio.log).
3. Claims vs EVIDENCE and the hosted URLs: **FAIL** (docs only). Every hosted URL answers, but the README describes the hosted demo as it was before release c95cd0c:
   - README:15–18: "The status host, docs at the root of docs.nectarlabs.io and the "Get test assets" button come with the next production release (merged as WO-62b, WO-64, WO-62c; not deployed, it needs Kunal's approval, HUMAN_HANDOFF H-DEPLOY). Until then status.nectarlabs.io shows the landing page … and docs.nectarlabs.io redirects to its `/docs/` path." What production does now:
     - STATUS / is the status page (h1 "Status").
     - The 56 docs pages answer at the DOCS root, and DOCS /docs/<path> 308s to /<path>.
     - The 5 platform hosts already 308.
     - APP /borrow shows "Get test assets" (§WO-34 production (custom hosts) items 1, 3, 4).
   - README:24, Status row: "status page from the next release; until then https://nectarlabs.io/status". In fact SITE /status 308s to STATUS/.
   - README:35: "its web button is merged but not deployed". It is deployed.
   - README:25: "CORS allows the Site and App origins only". The STATUS origin is also allowed (item 7 there).
   - README:14: "no verifier run on these hosts is recorded yet". This block supersedes it.
   - The same pre-release text is in docs/DEMO_SCRIPT.md:18, and HUMAN_HANDOFF H-DEPLOY still reads OPEN. Both are notes, not README claims.
   - Remedy: docs only (README hosted-demo section). No product change is needed.
   - Everything else in step 3 holds. The README pointer to §"WO-34 production" resolves to the custom-hosts block (c95cd0c, PASS). The README diff c194c8f..b7fa381 touches only the hosted-demo section and the docs dev-server URL, so the other live claims are as checked in run 5c. The demo output matches README:74. Feed /health shows events_indexed 0, as README:25 says.
4. Copy rules and branding: **PASS**. `node scripts/check-no-branding-all.mjs` exit 0. "insurance" / "without liquidation" in apps + packages (tests excluded): 3 hits, all copy-rule comments (Shields.tsx:3, Landing.tsx:5, sdk shields.ts:19). The built docs site (apps/docs-site/build): 0 files contain "hackathon". Home-path grep `git grep -l -a '[/]Users[/][A-Za-z]' -- ':!*.wasm'`: 0 files.
5. Host grep `git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app"`: **PASS**. 6163 lines. Outside the historical records (evidence/, EVIDENCE, FACTS, STATE, DECISIONS, docs/process/work, FINAL_REPORT, PRD/BUILD_PROMPT, HUMAN_HANDOFF) there are 3 lines, all allowed: apps/web/.env.example:17 and apps/web/lib/hosts.ts:38 (comments saying the real `*.vercel.app` list lives only in the Vercel env) and apps/web/lib/test-assets.test.ts:28 (a test fixture host). 0 `ac.nectarlabs.io` hits outside history (B/host-grep-nonhistory.txt).
6. Submission payload (dry run): **PASS**. Tracks ["defi","security","agents"]; `website` key absent; no privacy track. Open TODO-H fields: consent, demoUrl (H3), email, leadName, size (H10), nearAddress (H14), projectUrl (H2).
7. Handoffs (36 entries in docs/process/human-handoff.md): 12 DONE/CLOSED, 14 DEFAULT-AT-DEADLINE, 8 KUNAL-ONLY (H1, H2, H3, H10, H11, H12, H14, H-DEPLOY), 2 N/A (H5 superseded, H6 out of scope), **0 OTHER-OPEN**. Note: H-DEPLOY is stale. It still says OPEN, but the work order says Kunal approved and the release is deployed.

### G9 run 5c — step 3 (claims) only, on c194c8f — PASS — 2026-11-12T17:20Z–17:24Z — commit c194c8f
Scope: only step 3. Since run 5b (88b99b3) the only changes are to docs. Fresh clone of the repo → /tmp/verify-G9-5c/repo, checkout c194c8fee90332c7832686800a9e1aca0c405e9c. Nothing was installed or signed. WebFetch was not used because this step has no explorer link.
```
$ git diff --stat 5f011bb c194c8f -- apps packages services contracts   → (empty)
$ git diff --stat 4b20f05 c194c8f   → README.md 2 +-, docs/process/final-report.md, docs/SUBMISSION.md 2 +-
$ grep -niwE 'live|lives' README.md docs/SUBMISSION.md docs/process/x-post.md   → README 21 lines, SUBMISSION 6, X_POST 0 (classified in checks.txt)
```
1. No unbacked "live": **PASS**. README:153 now reads "oracle (G5: owner-oracle fallback, disclosed)" (it used to say "live oracle"). README:47, README:139 and SUBMISSION:34 say Pyth is not live, which agrees with §G5 FALLBACK. Each positive "live" in README is backed by a PASS block: lines 29–45 (§G2b, §G7, §G14) and lines 113 and 122–128 (§G4, §G7, §G14 borrow tx). The SUBMISSION header now says "re-read the published …HACKATHON.md". X_POST post 4 says "owner oracle for now (disclosed)".
2. Pointers resolve to the newest blocks: **PASS**. In §"WO-34 production" the newest block is "release 3 (WO-34v3): PASS" on 5f011bb. In §G3b it is re-run 7b PASS, which covers release 3 together with re-run 7. In §G9 it is run 5b PASS, and now this block. SUBMISSION:85–88 cites "runs 5 + 5b" with 87be719 and b945f42. Both commits exist with the matching subjects, and "every step except 3" matches the run 5 block.
3. No contradiction with STATE: **PASS**. The STATE entry at ~17:10Z says release 3 is 5f011bb, G3b 7 + 7b PASS, WO-34 (release 3) PASS, G9 5 + 5b PASS, and submission-rc is 4b20f05. That matches the tag and EVIDENCE.
Notes, not counted (same class as the run 5b note): SUBMISSION.md:53 still cites G3b re-run 2 (fd6592d) as the web row. It is dated and attributed and does not claim to be the latest. Tag submission-rc (4b20f05) predates the README:153 and SUBMISSION header fix (6d3e72f), so moving the tag is the orchestrator's choice.
Verdict: **PASS** for step 3 on c194c8f. Log: evidence/G9/run5c-20261112T172003Z/checks.txt.

### G9 run 5b — step 3 (claims) only, on 88b99b3 — PASS — 2026-11-12T17:02Z–17:05Z — commit 88b99b3
Scope: only step 3, the step that failed in G9 run 5. Fresh clone `git clone /Volumes/T7/nectar-labs` → /tmp/verify-G9-5b-20261112T170216Z, checkout 88b99b3. Nothing was installed and nothing was signed. WebFetch was not used: this step has no explorer link.
```
$ git diff --stat 5f011bb 88b99b3 -- apps packages services contracts   → (empty)   # product code = release 3
$ git diff --stat 3974b5b 88b99b3 -- services/feed                      → (empty)   # Feed image 3974b5b still current
$ git log -1 --format=%s 5f011bb   → "chore: STATE — release 3 (release 2 + docs Feed link fix)"
$ curl (17:03:36Z)  SITE / 200 · SITE /borrow 308 → APP/borrow · APP / 307 → /feed · APP /feed 200 · /borrow 200 · /docs 200 · /docs/integrate/feed-rest 200
                    Feed /health 200 {"ok":true,"source":"views","events_indexed":0,"history":"unavailable","lag_blocks":0,"commit":"3974b5bb…f653"}
                    APP /api/health {"ok":true,"core":"nectar-core-v2.nectar.testnet","version":"2.2.1-v7",…}
                    hosted feed-rest: 1 × href="https://feed-production-2f2776c9.up.railway.app/health" · APP /docs x-robots-tag lines: 0
```
1. Deployed commit and production acceptance: **PASS**. README lines 3, 11, 26 and 139 send the reader to EVIDENCE §"WO-34 production". The newest block there is "WO-34 production (release 3) (WO-34v3): PASS … release 3 5f011bb7f2dd…". It names web dpl_BJNxqxnSZQWHtiouXYeWknkScxtY, docs dpl_DQubre8taPieUo4EBshyyrRNVjcT and Feed 3974b5b. STATE gives the same three values ("**PRODUCTION = RELEASE 3 (~16:40Z)**"; "Feed stays on 3974b5b"). The block's hosted facts still hold at 17:03Z: Feed links go to /health, no noindex, Feed views mode. README names no commit itself, so no line can go stale.
2. Latest G3b and G9: **PASS**. README lines 3, 52, 84 and 139 point to §G3b and §G9 ("latest … with commit and result"). §G3b opens with re-run 7b PASS on 5f011bb, which runs 7 + 7b cover release 3 per STATE. §G9 opens with this block. The other line-84 sentences (run 3 timings, 0af5cdd, c5f6349) match those blocks.
3. No contradictions: **PASS**. README hosted table: SITE, APP and DOCS on vercel.app and the Feed on Railway in views mode with events_indexed 0, all equal to STATE and to the live answers. docs/process/x-post.md uses the same three production URLs and the gate tags G1/G2/G2b/G4/G5 FALLBACK/G7, all as in EVIDENCE. SUBMISSION.md names no production commit or release. Note, not counted (same class as the run 5 line-84 note): SUBMISSION.md:85/87 still say "G9 today: PASS … §G9 run 3". That is dated and attributed, and with 5b, G9 passes on release 3. Refreshing the cite to run 5 + 5b is a docs choice.

Coverage: G9 run 5 (5dd2a50; every step except 3 PASS) and run 5b (88b99b3; step 3 PASS) together cover release 3. Product code is identical across 5f011bb, 5dd2a50 and 88b99b3.
Verdict: **PASS** for step 3. G9 on release 3: **PASS** (runs 5 + 5b). Logs: evidence/G9/run5b-20261112T170216Z/.

### G9 run 5 — fresh-clone rehearsal on release 3 (verifier B) — FAIL (step 3: EVIDENCE has no WO-34 production block for release 3; evidence-only) — 2026-11-12T16:40Z–16:47Z — commit 5dd2a50
Work order: docs/process/work/g9-g3b-final-4.md "G9 (verifier B)". It covers g9-final.md steps 1–7, g9-final-2.md steps 8–10, plus 11 and 12. Fresh clone `/tmp/verify-G9-20261112T164011Z` of
`/Volumes/T7/nectar-labs` (`git clone`, then checkout 5dd2a50921e9767d5053d08e62dec03c80fde166). That commit is a docs/evidence-only descendant of RELEASE 3 5f011bb: `git diff --stat 5f011bb HEAD` touches only
docs/ and evidence/. No secrets, nothing pushed, nothing installed under /Volumes/T7. Own ports: Feed REST :18788 / MCP :18789 (FEED_DB_PATH in my scratch dir), `next start -p 3517`.
:3100 was free, so command 5 ran as written. Host keeper :8790, x402 :8791, Feed :8788/:8789 (pid 56878) and anvil :8545 were left running. PATH per the gates.md host notes.
```
$ git clone /Volumes/T7/nectar-labs /tmp/verify-G9-20261112T164011Z    16:40:11Z   checkout 5dd2a50
$ pnpm i                         exit 0  12 s
$ pnpm demo:testnet              exit 0   4 s   2.2.1-v7; Q_c $16,119.22 R_c $10.00 D_c $0; oracle $135.00 (age 5411 s, fresh), session closed;
                                                pool $40,771 / $9,229; quotes #0–#4 live; positions #0–#15 (#1 #4 #5 #13 #14 #15 Open)
$ pnpm verify                    exit 0  28 s   branding check, lint, typecheck; ui 7/0, feed 79/0, keeper 301/0, x402 41/0, sdk 203/0, web 27 pass / 0 fail / 1 skip; testnet views
$ pnpm --filter web dev          ready 4 s on :3100; 21 README routes → 200 (/, /borrow, /feed, /feed/NVDAx, /quote/new, /console, /notes, /reserve, /shield, /agents, /keepers,
                                 /security, /talk, /docs, /legal/{privacy,cookies,terms,disclaimers}, /position/0, /quote/0, /note/q-0); /markets 404, /earn 404   done 16:42:13Z
$ pnpm --filter docs-site build  exit 0  20 s   [SUCCESS] Generated static files in "build".
$ gitleaks detect --log-opts=--all -v            exit 0   466 commits scanned, no leaks found   (git rev-list --all --count = 629; merges carry no patch)
$ git grep -l "[/]Users[/]"      5 text files, each quoting the grep pattern itself (EVIDENCE.md:6/230–232, G3b run-7 logs + run7.sh, verifier memory note).
  git grep -n '[/]Users[/][A-Za-z]' -- ':!*.wasm' → 0 lines; git grep -c -a "[/]Users[/]" -- '*.wasm' → the 6 contracts/nectar-core/tests/fixtures/*.wasm
$ node scripts/build-submission.mjs   exit 0   keys requestId,projectName,leadName,email,size,tracks,nearAddress,projectUrl,demoUrl,idea,consent; tracks ["defi","security","agents"];
  website absent; 0 "privacy"/"private" in the payload. Open fields: leadName/email/size TODO-H10 · nearAddress/consent TODO-H14 · projectUrl TODO-H2 · demoUrl TODO-H3
Feed MCP stdio (scripted JSON-RPC client): initialize nectar-feed 0.3.0 · tools/list 8 tools · get_exit_capacity{symbol:NVDAx} q_usd_e6 16119220000, r_usd_e6 10000000 (= demo)
Feed MCP HTTP :18789/mcp: initialize 200 text/event-stream · tools/list 8 · get_exit_capacity same values. feed_started core nectar-core-v2.nectar.testnet (no env but ports/DB).
  Local REST /health ok:false: neardata HTTP 429 from this host, the same as run 4. MCP is unaffected
Hosted (16:42Z): SITE https://nectarlabs.vercel.app/ 200 · SITE /borrow 308 → APP · APP https://nectarlabs-app.vercel.app/ 307 → /feed, /borrow 200 · DOCS https://nectarlabs-app.vercel.app/docs 200
  · APP /api/health 200 {ok, 2.2.1-v7, pool 40771/9229} · Feed https://feed-production-2f2776c9.up.railway.app/health 200 {ok:true, lag_blocks 0, source "views", events_indexed 0,
  history "unavailable", commit 3974b5b…} · Feed CORS: SITE and APP origins echoed, https://evil.example gets no ACAO
$ pnpm --filter web build        exit 0  12 s ;  next start -p 3517 ; curl -sI /
HTTP/1.1 200 OK · X-Frame-Options: DENY · Strict-Transport-Security: max-age=63072000; includeSubDomains · CSP … frame-ancestors 'none'
Chrome (Playwright, channel chrome) /borrow 200 → "Connect wallet": the selector lists Meteor Wallet, Intear Wallet, Ledger, Nightly Wallet, Ethereum Wallets and NEAR CLI
  (connect-wallet.png). CSP console messages 0, console errors 0. Nothing signed.
```
Quick start: clone 16:40:11Z → last route 16:42:13Z, about 2 min including reading the README. Guesses: (1) the repo URL is TODO-H2, so I cloned the local path per gates.md.
(2) The host Feed holds 8788/8789, so I used the FEED_PORT / FEED_MCP_PORT / FEED_DB_PATH that README documents (README says the default ports fail with EADDRINUSE). No other guess.
Results per step:
1. Quick start: PASS, about 2 min, with the 2 guesses above.
2. Commands: PASS. pnpm i, demo:testnet, verify, docs build and gitleaks (466 commits) all exit 0, and gitleaks found no leaks.
3. Claims: **FAIL**, 1 reason. The README names no deployed commit. Lines 3 and 11 ("Production runs the release recorded in docs/EVIDENCE.md §"WO-34 production": the deployed commit
   and the verifier's acceptance result for each production release are there") and line 139 send the reader to that section. At 5dd2a50, and in the main working copy at 16:46Z,
   the newest block there is "WO-34 production (release 3974b5b) (WO-34v2): FAIL". docs/process/state.md says "**PRODUCTION = RELEASE 3 (~16:40Z)**", with web dpl_BJNxqx… and docs dpl_DQubre….
   Release 3 has no block, because WO-34v3 is not recorded yet. A stranger who follows the README pointer therefore lands on 3974b5b, a superseded release. That is the same symptom as run 4
   by another route. The README needs no edit: the sentence becomes true when the WO-34v3 block for release 3 lands, whatever its verdict. The orchestrator's public smoke for release 3
   (evidence/WO-34/prod-smoke-release3-20261112T163758Z.log) exists, but EVIDENCE does not cite it.
   Backed: §G3b (re-run 7b, release 3, PASS) and §G9 resolve. The gate list in lines 3 and 139 matches the table rows (G1/G2/G3/G4/G6 PASS, G5 FALLBACK, G8 fixture, G1 v7, G10, G12/G13 fork,
   G2b/G7/G11/G14 re-runs, G1 2.2.1 "67 of 67 … max tx-total 78.60" at 48b5c5a). The cited commits a677689, 2e16f9b, b8784c1, 5083d30, 837cd12, 89f83ee, 2bf99e1 and 3107a1a all exist.
   The smoke log evidence/WO-34/prod-smoke-20261112T133529Z.log exists. FINAL_REPORT 11:20:55Z lag 0 is there. `site.hosted_until` "2026-11-25" is set. README ids match config.yaml accounts.
   demo:testnet answers on public RPC and its state matches README line 66. Hosted URLs match STATE (SITE/APP/DOCS on vercel.app, Feed on Railway, which stays on 3974b5b per STATE).
   Note, not counted: line 84 "What works today (2026-11-11, … §G9 run 3 …): G9 PASS" is dated and attributed to run 3, while the latest recorded G9 run (run 4) is FAIL. Rewording it
   as "G9 run 3 PASS" would stop it reading as the current G9 status.
4. Copy rules: PASS. "insurance" and "without liquidations" appear only in comments and specs that state the rule (Landing.tsx:5, Shields.tsx:3, e2e/v7.spec.ts:38). No "hackathon" in
   apps/web app/components/lib/public, packages/ui, landing/, docs-site docs/src/config or the built docs site (incl. search index). The apps/web hits are e2e negatives and the
   build-changelog.mjs filter. check-no-branding-all.mjs exits 0. "mock collateral" appears in 19 apps/web files, and landing/index.html says testnet 17 times.
5. Feed MCP: PASS. Stdio and HTTP both answer initialize and tools/list (8 tools), and get_exit_capacity returns live values equal to demo:testnet.
6. / 11. Submission dry run: PASS. The payload builds, `website` is absent and the tracks are ["defi","security","agents"]. SUBMISSION.md:18/56/61 and README:131 say `privacy` is not entered.
   docs/process/x-post.md has no "privacy". No privacy-track framing remains. The open TODO-H fields are listed above.
7. Handoffs (34 headings, H-NEAR-FAUCET twice, H-ORACLE new): PASS. DONE/CLOSED 11: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-NEAR-FAUCET ×2, H-SOL-AIRDROP, H-DOMAIN, H-LEGAL, H-HOST, H9, H16, H17.
   DEFAULT-AT-DEADLINE 13: H-EXPLORER, H-ORACLE, H13, H4, H-KEYS, H-NEARDATA, H7, H8, H12, H15, H18, H19, H20. KUNAL-ONLY 7: H1, H2, H3, H10, H11, H14, H-GUARD-V7.
   N/A / superseded 3: H5, H-DNS, H6. OTHER-OPEN 0.
8. Review 2: PASS. The fixes are at these lines: R2-03 `request_matches_input` verify.ts:119; R2-04 guard.ts:86–96 (403 → 415 → 413) + 429 at :155; R2-05 services/x402/src/borrow-guard.ts; R2-06 "1,5" refused
   packages/sdk/src/format.ts:28; R2-09 `accountExists` views.ts:76; R2-11 "."/".." refused feed-paths.ts:20. Neither "never joined to IPs" nor "instead of being published" appears in README, SUBMISSION, docs-site, apps/web or landing.
   Privacy page: "No analytics vendor is configured" (legal/privacy.md:28).
9. Headers + wallet selector: PASS (above).
10. G14 / G1 2.2.1 rows: PASS. README cites what the rows say: G14 re-run on HEAD 48b5c5a (a677689), 67/67, max 78.60 Tgas.
12. SECURITY.md: PASS. Item 11 (C-020) matches packages/sdk/src/network.ts:5–6. Item 12 matches notes.rs:332 `move_note` / :347 `p.borrower = to`, and also remote.rs:957 `request_remote_release`,
    which takes `r.depositor` (:968). The zod lines (SECURITY.md:115 Feed zod 4.6.7; :123 zod 3.25.76 only via @x402/core 2.18.0, not reachable, F-385) match F-383–F-385 and F-451. The lockfile has
    zod@3.25.76 + zod@4.6.7, and services/feed pins "zod": "4.6.7".
Extra: hosted URLs PASS; home-path grep PASS (with the note above); gitleaks over the full history PASS; quick start under 15 min PASS.
Note (for the orchestrator, not a README claim): `SESSION_MAX_PRICE_AGE_NS` = 900 s (lib.rs:75), so in NYSE hours the session is open only within 15 min of an owner price update.
At 16:42Z (in hours) the oracle was "fresh" (age 5411 s < 86,400) yet the session was closed with `session_reason "stale_price"`. STATE's "fresh, session open" at ~15:12Z was therefore
transient. H-ORACLE describes only the 86,400 s limit.
Explorer: WebFetch https://testnet.nearblocks.io/address/nectar-core-v2.nectar.testnet → HTTP 403, body not returned. Ids were proven over public RPC (demo:testnet, MCP views, APP /api/health).
Verdict: **FAIL** for one reason, step 3: EVIDENCE §"WO-34 production" has no block for release 3, which STATE says is in production. The remedy is the WO-34v3 evidence block, then a step-3
re-check. Every command, code check and other claim passed.
Logs: evidence/G9/20261112T164011Z/ (times.txt, pnpm-i, demo-testnet, verify, web-dev, web-dev-routes.txt, docs-build, gitleaks, grep-users, commit-count.txt, build-submission, feed-start,
feed-mcp-stdio, feed-mcp-http, hosted.txt, checks.log, next-build, next-start, headers.txt, connect-wallet.log, connect-wallet.png).

### G9 run 4 — fresh-clone rehearsal on the release (verifier B) — FAIL (step 3, README hosted-demo status stale; docs-only) — 2026-11-12T15:00Z–15:10Z — commit 1f28a2f
Work order docs/process/work/g9-g3b-final-4.md "G9 (verifier B)": g9-final.md steps 1–7, g9-final-2.md steps 8–10, plus 11 and 12. Fresh clone `/tmp/verify-G9-20261112T150002Z`
of `/Volumes/T7/nectar-labs` (`git clone`, HEAD 1f28a2fb18c86c13085af36cba4f087634596d58, a docs-only descendant of release 3974b5b). No secrets, nothing pushed.
Own ports only: web `next dev -p 3417`, Feed REST :18988 / MCP :18989, FEED_DB_PATH in the verifier's scratch dir. Host keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545 left running.
```
$ git clone /Volumes/T7/nectar-labs /tmp/verify-G9-20261112T150002Z      15:00:02Z   HEAD 1f28a2f
$ pnpm i                         exit 0  11 s
$ pnpm demo:testnet              exit 0   4 s   2.2.1-v7; Q_c $16,119.22 R_c $10.00; oracle $135.00 STALE (age 111785 s); pool $40,771 / $9,229;
                                                quotes #0–#4; positions #0–#15 (#1 #4 #5 #13 #14 #15 Open)
$ pnpm verify                    exit 0  31 s   ui 7/0, feed 79/0, keeper 301/0, x402 41/0, sdk 203/0, web 27 pass / 0 fail of 28 (+ lint, typecheck, testnet views)
$ pnpm --filter docs-site build  exit 0  19 s   [SUCCESS] Generated static files in "build".
$ next dev -p 3417 (apps/web)    21 README routes → 200 (/, /borrow, /feed, /feed/NVDAx, /quote/new, /console, /notes, /reserve, /shield, /agents, /keepers,
                                 /security, /talk, /docs, /legal/{privacy,cookies,terms,disclaimers}, /position/1, /quote/0, /note/q-0)    done 15:04:17Z
$ gitleaks detect --source . --log-opts=--all     exit 0   443 commits scanned, no leaks found
$ git grep -l "[/]Users[/]"      the 6 contracts/nectar-core/tests/fixtures/*.wasm + docs/process/work/g9-g3b-final-4.md:39 (the work order's own text of this command; no home path)
$ node scripts/build-submission.mjs   exit 0   keys requestId,projectName,leadName,email,size,tracks,nearAddress,projectUrl,demoUrl,idea,consent; tracks ["defi","security","agents"]; website absent
  open fields: leadName/email/size TODO-H10 · nearAddress/consent TODO-H14 · projectUrl TODO-H2 · demoUrl TODO-H3
Feed MCP stdio (scripted JSON-RPC client, no env but FEED_DB_PATH): initialize nectar-feed 0.3.0 · tools/list 8 tools · get_exit_capacity{symbol:NVDAx} q_usd_e6 16119220000, r_usd_e6 10000000 (= demo)
Feed MCP HTTP :18989/mcp: initialize 200 text/event-stream · tools/list 8 tools · get_exit_capacity same values. Local REST /health 503 ok:false: neardata HTTP 429 from this host
Hosted: SITE https://nectarlabs.vercel.app/ 200 · APP https://nectarlabs-app.vercel.app/ 307 → /feed, /borrow 200 · DOCS https://nectarlabs-app.vercel.app/docs 200
  · Feed https://feed-production-2f2776c9.up.railway.app/health 200 {"ok":true, lag_blocks 0, source "views", events_indexed 0, history "unavailable", commit "fd06e11…"} · SITE /borrow 308 → APP
```
Quick start: clone 15:00:02Z → last route 15:04:17Z, about 4.3 min including reading. Guesses: (1) the repo URL is TODO-H2; cloned the local path per gates.md. (2) `pnpm --filter web dev`
hard-codes :3100; ran `pnpm exec next dev -p 3417` in apps/web so a parallel run could keep :3100. (3) host Feed holds 8788/8789; used the documented FEED_PORT / FEED_MCP_PORT.
Step 9 (second part, 15:06Z–15:10Z):
```
$ pnpm --filter web build        exit 0  16 s
$ next start -p 3418 ; curl -sI http://127.0.0.1:3418/
HTTP/1.1 200 OK · X-Frame-Options: DENY · Strict-Transport-Security: max-age=63072000; includeSubDomains · Content-Security-Policy: default-src 'self'; … frame-ancestors 'none'
Chrome (Playwright, channel chrome) /borrow → 200 → click "Connect wallet": manifest raw.githubusercontent.com/hot-dao/near-selector/…/manifest.json → 200;
  "Select wallet" dialog lists Meteor Wallet, Intear Wallet, Ledger, Nightly Wallet, Ethereum Wallets, NEAR CLI (screenshot connect-wallet.png); CSP console messages 0; console errors 0. Nothing signed.
```
Results per step:
1. Quick start: PASS, about 4.3 min. Guesses as listed above.
2. Commands: PASS. pnpm i, demo:testnet, verify, docs build and gitleaks (443 commits) exit 0, no leaks.
3. Claims: **FAIL**. README "Hosted demo" line 11 says "Deployed to production on 2026-11-12 (~13:35Z) from commit `ca34111`", and line 3 says "The hosted demo below is deployed from ca34111".
   docs/process/state.md says "PRODUCTION = RELEASE 3974b5b (2026-11-12 ~15:00Z)". README lines 25–26 say "The verifier's independent acceptance on these URLs (WO-34v) is not in docs/EVIDENCE.md yet",
   and line 139 says WO-34v is "not recorded yet". EVIDENCE has "### WO-34 production acceptance (WO-34v): FAIL, 2026-11-12T13:38Z–14:45Z, deployed commit ca34111". So README calls
   a recorded verifier result "not recorded", and it names a superseded deployment as the current one. The rule broken: "pending or not run only where EVIDENCE lacks it". The README hosted URLs
   (SITE, APP, DOCS, Feed) match STATE and all answer. Every other claim checked is backed: chain ids (demo:testnet = README), G14 and G1 2.2.1 rows, G3b re-run 5/6, SECURITY.md cites.
   Note, not a FAIL: Feed /health reports `"commit":"fd06e11…"`, but STATE says the Feed was redeployed from SRC_SHA 3974b5b. `history "unavailable"` and `source "views"` match STATE's new start command.
4. Copy rules: PASS. "insurance" appears only in two code comments that state the rule (Landing.tsx:5, Shields.tsx:3). No "without liquidations". No "hackathon" in apps/web, landing/, docs-site
   docs/src/config, packages/ui or the built docs site. "mock collateral" appears in 6 apps/web pages, and landing/index.html says testnet 18 times.
5. Feed MCP: PASS. Stdio and HTTP initialize, tools/list returns 8 tools, and get_exit_capacity returns live values equal to demo:testnet.
6. / 11. Submission dry run: PASS. Payload builds and `website` is absent. tracks ["defi","security","agents"] matches README:131 and SUBMISSION:18. `privacy` is "not entered" in README and SUBMISSION, and docs/process/x-post.md has no
   "privacy". Open fields: TODO-H10 (leadName, email, size), TODO-H14 (nearAddress, consent), TODO-H2 (projectUrl), TODO-H3 (demoUrl).
7. Handoffs (33 headings, H-NEAR-FAUCET twice): PASS. DONE/CLOSED 11: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-NEAR-FAUCET ×2, H-SOL-AIRDROP, H-DOMAIN, H-LEGAL, H-HOST, H9, H16, H17.
   DEFAULT-AT-DEADLINE 12: H-EXPLORER, H13, H4, H-KEYS, H-NEARDATA, H7, H8, H12, H15, H18, H19, H20. H-KEYS and H-NEARDATA defaults (local keeper; views mode) are what README says.
   KUNAL-ONLY 7: H1, H2, H3, H10, H11, H14, H-GUARD-V7. Superseded / N/A / out of scope 3: H5, H-DNS, H6. OTHER-OPEN: 0.
8. Review 2: PASS. R2-03 `request_matches_input` is at apps/web/lib/copilot/verify.ts:119. R2-04 guard 403/415 is at guard.ts:86–89. R2-05 borrow-guard.ts is present. R2-06 "1,5" is refused (format.ts:28).
   R2-09 `accountExists` is at views.ts:76. R2-11 "." and ".." are refused (feed-paths.ts:20). Neither "never joined to IPs" nor "instead of being published" appears anywhere.
9. Headers + wallet selector: PASS (above).
10. G14 / G1 2.2.1 rows: PASS. README lines 3, 30, 43 and 139 and SECURITY.md line 50 cite exactly what the EVIDENCE rows say (G14 re-run on HEAD 48b5c5a; 67/67, max 78.60 Tgas).
12. SECURITY.md: PASS. Item 11 (C-020) matches packages/sdk/src/network.ts:5–6 (`/^[0-9a-f]{64}$/`, `/^0x[0-9a-f]{40}$/`). Item 12 matches the code:
   notes.rs:332 `fn move_note` with `p.borrower = to` (line 347), lib.rs:824 `on_repay`, lib.rs:852–858 local release to the borrower, and remote.rs:957 `request_remote_release`, which signs the release to `r.depositor`.
   The zod line (SECURITY.md:123, "zod < 4.6.6 … @x402/core 2.18.0 (zod 3.25.76) … not reachable (F-385)") and line 115 (Feed zod 4.6.7) match F-383–F-385 and F-451.
   pnpm-lock.yaml has zod@3.25.76 only through @x402/core@2.18.0, plus zod@4.6.7, and services/feed pins "zod": "4.6.7".
Extra checks: hosted URLs PASS (above). `git grep -l "[/]Users[/]"` finds the 6 fixture wasm files plus the work order's own copy of this command (no home path), so PASS. gitleaks over the full history: PASS.
Notes: demo:testnet shows the owner oracle stale (age about 31 h) and the session closed. Both are disclosed, but a borrow on testnet would be refused until the owner updates the price.
Explorer: no explorer page was opened (nearblocks returns 403 to WebFetch). Ids were proven over RPC via demo:testnet only.
Verdict: **FAIL** for one reason, step 3 (README hosted-demo status is stale against docs/process/state.md and EVIDENCE §WO-34v). The fix is docs only (README lines 3, 11, 25–26, 139). Every command, code check and other claim passed.
Logs: evidence/G9/20261112T150002Z/ (times.txt, pnpm-i, demo-testnet, verify, docs-build, web-dev, web-dev-routes.txt, gitleaks, grep-users, feed-start, feed-mcp-stdio, feed-mcp-http, hosted.txt,
checks.log, checks2.log, next-build, next-start, headers.txt, connect-wallet.log, connect-wallet.png).

### G9 run 3 — fresh-clone rehearsal after review 2 — PASS — 2026-11-11T15:30Z–15:38Z — commit 3107a1a
Work order docs/process/work/g9-final-2.md (steps 1–7 of g9-final.md plus 8–10). Fresh clone `/tmp/verify-G9-20261111T153057Z` of local main (HEAD 3107a1a). No secrets.
Own ports only: Feed REST :8988, MCP HTTP :8989, web `next start` :3291; host keeper :8790 and Feed :8788 left running. FEED_DB_PATH in the verifier's scratch dir.
```
$ pnpm i                         exit 0  13 s
$ pnpm demo:testnet              exit 0   5 s   nectar-core-v2 2.2.1-v7; Q_c $16,119.22 R_c $10.00; pool $40,771 / $9,229; quotes #0–#4; positions #0–#15 (#1 #4 #5 #13 #14 #15 Open)
$ pnpm verify                    exit 0  36 s   ui 7/0, feed 63/0, keeper 293/0, x402 34/0 (+ lint, typecheck, sdk, testnet views)
$ pnpm --filter docs-site build  exit 0  25 s   [SUCCESS] Generated static files in "build".
$ gitleaks detect --source <clone> --log-opts=--all   exit 0   305 commits scanned, no leaks found
$ node scripts/build-submission.mjs                   exit 0   keys requestId,projectName,leadName,email,size,tracks,nearAddress,projectUrl,demoUrl,idea,consent; website absent
  open fields: leadName/email/size TODO-H10 · nearAddress/consent TODO-H14 · projectUrl TODO-H2 · demoUrl TODO-H3
Feed MCP stdio (scripted JSON-RPC client): initialize nectar-feed 0.3.0 · tools/list 8 tools · get_exit_capacity{symbol:NVDAx} q_usd_e6 16119220000, r_usd_e6 10000000 (= demo)
Feed MCP HTTP :8989/mcp: initialize (SSE) ok · tools/list 8 tools · get_exit_capacity same values · REST /healthz 200; feed_started core nectar-core-v2.nectar.testnet
RPC (test.rpc.fastnear.com view_account): nectar-core-v2 code_hash 3mv4LRm6…FvK (= README) · nvdax-mock, usdc-mock HnZj9e… · x402-relayer, agent1 exist
Solana devnet getAccountInfo ENZaNFHo…pubW: executable true, owner BPFLoaderUpgradeab1e… (= config.yaml program_id, in README)
$ curl -sI http://127.0.0.1:3291/   (next build && next start)
HTTP/1.1 200 OK · X-Frame-Options: DENY · Strict-Transport-Security: max-age=63072000; includeSubDomains
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
Chrome (Playwright channel chrome) /borrow → 200 → click "Connect wallet": manifest raw.githubusercontent.com/hot-dao/near-selector … 200; "Select wallet" dialog lists
  Meteor Wallet, Intear Wallet, Ledger, Nightly Wallet, Ethereum Wallets, NEAR CLI; CSP console messages 0; console errors 0. Nothing signed.
```
Logs: evidence/G9/20261111T153057Z/ (times.txt, pnpm-i, demo-testnet, verify, docs-build, gitleaks, build-submission, feed-mcp-stdio, feed-start, next-build, headers.txt, connect-wallet.log, connect-wallet.png).
Explorer: no explorer page opened (nearblocks answers WebFetch with 403); ids proven over RPC only, as handoff H-EXPLORER's default says.

Step 8, review 2: R2-03 `request_matches_input` (apps/web/lib/copilot/verify.ts:119) · R2-04 403/415/413/429 (apps/web/lib/api/guard.ts:82–153; tests api.test.ts:50–96)
· R2-05 services/x402/src/borrow-guard.ts present · R2-06 "1,5" refused (packages/sdk/src/format.ts:28, BorrowComposer.tsx:58) · R2-09 `accountExists` via view_account
(packages/sdk/src/views.ts:69, note/[id]/page.tsx:78) · R2-11 "." and ".." refused (apps/web/lib/api/feed-paths.ts:19; test api.test.ts:140). Privacy (review 2 §C): no
"never joined to IPs" and no "instead of being published" in README, docs/SUBMISSION.md, docs-site docs/src, apps/web or landing/; landing (Landing.tsx:652) and the cookie banner
now say "in logs we control" and that the RPC providers see the IP; privacy.md:38 says analytics are "not configured in this build"; README:109 and SUBMISSION:59 disclose the
operator-set parameters, the coordinator plaintext (F-167) and the q·γ leak. Step 10: README and SECURITY cite G14 (re-run on HEAD, 15:02Z, 48b5c5a) and G1 2.2.1 gas rows
(67/67, max 78.60 Tgas) exactly as the EVIDENCE rows above say; no stronger claim found.
Copy rules: no "insurance" / "without liquidations" in README, apps/web, landing/, docs-site, packages/ui; "hackathon" in none of the product sources nor the built docs site;
"mock collateral" in SiteChrome, LandingLive, Shields, OneClickPanel; landing/index.html says testnet (17×).
Handoffs (27 entries): DONE 5 (H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-NEAR-FAUCET ×2, H-SOL-AIRDROP) · DEFAULT-AT-DEADLINE 13 (H-EXPLORER, H4, H5, H7, H8, H9, H12, H13, H15,
H17, H18, H19, H20) · KUNAL-ONLY 8 (H1, H2, H3, H10, H11, H14, H16, H-GUARD-V7) · not in scope 1 (H6) · OTHER-OPEN 0. No README claim rests on an open item.
Guesses / deviations (a stranger would hit the first two): (1) the repo URL is TODO-H2; cloned the local path per gates.md. (2) README does not name the MCP tool argument;
`get_exit_capacity` with `asset` failed input validation, `symbol` (from tools/list's schema) worked. (3) Feed default ports 8788/8789 are taken on this host by the host Feed;
used the documented FEED_PORT / FEED_MCP_PORT. (4) `pnpm --filter web dev` (:3100) was not run because the parallel G3b run uses that port; the app was checked with
`next build && next start` on :3291 instead (step 9).
Notes, not failures: README "On 2026-11-11 it showed … positions #0–#13 with #1, #4, #5 and #13 Open" is a dated snapshot; live now shows #14 and #15 Open too and pool
$40,771 / $9,229. The cookie banner sits over the bottom of the wallet selector (NEAR CLI row partly covered) until the user answers it.
Verdict: PASS. No reason for FAIL found.

### G9 — final fresh-clone rehearsal — RE-RUN after WO-38 — PASS — 2026-11-11T08:57Z–09:00Z — commit 0af5cdd
Fresh clone `/tmp/verify-G9r-1794387441` of the local repo (main HEAD 0af5cdd: WO-38 b143b72 merged as d0e8465, plus 0af5cdd, which adds `scripts/check-no-branding-all.mjs` to `verify:quick`). No remote, nothing pushed, no keys.
Since c5f6349 nothing changed in packages/config, contracts/, services/ or apps/web. The changes are in README, docs-site pages, HUMAN_HANDOFF and the new scan script.
The host Feed on :8788/:8789 (pid 56878) was left running. My Feed used FEED_PORT=18788, FEED_MCP_PORT=18789 and FEED_DB_PATH inside the clone. Full logs: evidence/G9/20261111T085721Z/.
```
quick start (README §Quick start; clone 08:57:25Z → every README route answering 08:58:43Z)
$ pnpm i                              exit 0   6 s                                                                pnpm-i.log
$ pnpm demo:testnet                   exit 0   3 s   2.2.1-v7; Q_c $16,119.22 R_c $10; pool $40,791 / $9,209;       demo-testnet.log
                                                    quotes #0–#4; positions #0–#13, Open #1 #4 #5 #13 (= README line 47)
$ pnpm verify                         exit 0  15 s   check-no-branding-all ("no hackathon branding in landing, web app   verify.log
                                                    or docs site") → lint → typecheck → ui 7/0, feed 63/0, keeper 293/0, x402 17/0, sdk 178/0 → views
$ pnpm --filter web dev               21 README routes 200 (/, /borrow, /feed, /feed/NVDAx, /quote/new, /console, /notes, /reserve,   web-dev-curl.txt
                                      /shield, /agents, /keepers, /security, /talk, /docs, /legal/{privacy,cookies,terms,disclaimers},
                                      /position/1, /quote/0, /note/q-0); /markets and /earn 404 as README says; every page: hackathon 0, testnet ≥ 16, "mock collateral" ≥ 8
optional / gate
$ pnpm verify:quick                   exit 0   8 s   branding scan runs first                                           verify-quick.log
$ pnpm --filter docs-site build       exit 0  10 s   "[SUCCESS] Generated static files in build"                        docs-build.log
$ gitleaks detect --log-opts=--all    exit 0   1 s   "272 commits scanned … no leaks found"                            gitleaks.log
$ node scripts/build-submission.mjs   exit 0   dry run, no --send; `website` key absent                         build-submission.log
```
Guesses: one. The clone URL is TODO-H2, so I used the local path. The other five guesses from the first run are now answered in the README:
the Feed env line, the optional FEED_PORT / FEED_MCP_PORT / FEED_DB_PATH variables and the EADDRINUSE behaviour, a pointer to the MCP client snippets plus the accept header, the route list, and current timings.

Copy rules / branding (step 4): **PASS.**
- `grep -ri hackathon` over apps/web, apps/docs-site, landing and packages/ui (excluding node_modules and build output) finds only apps/web/scripts/check-no-branding.mjs and the e2e negative assertions.
- The built docs site, including build/search-index.json (971 kB) and build/project/evidence.html, has 0 files containing "hackathon".
- "insurance" and "without liquidations" appear only in code comments and e2e negative assertions; the built docs site has 0 hits.
- The new check-no-branding-all.mjs covers landing, apps/web/{app,components,lib,public}, packages/ui and the docs-site docs/blog/src/static/sidebars/config.

Feed MCP (step 5): **PASS** using only the README commands.
- stdio `pnpm -s --filter feed mcp` on an empty store: initialize nectar-feed 0.3.0 (2025-06-18). tools/list returns 8 tools. get_exit_capacity source "view", block 277193574, q_usd_e6 16119220000. list_quotes is live.
- HTTP :18789/mcp from the clone's own `pnpm --filter feed start` (pid 59708, cwd = clone): the same answers, block 277193596. `feed_started core nectar-core-v2.nectar.testnet` with no CORE_ACCOUNT_ID. REST /healthz 200 `ok:true`.

Claims (step 3): **PASS.**
- The README and docs-site wording added in WO-38 (Feed env, routes, timings, demo state, the `agents` line "scripted JSON-RPC client, not an LLM agent", G9 FAIL / re-run pending) matches §G9 and this run.
- Ids and config are unchanged since the first run. Spot check: nectar-core-v2 code_hash is still 3mv4LRm6…ovFvk.
- The first-run claim trace still holds, including the mock-ft code_hash record.
- README and docs-site still say "G9 FAIL … re-run pending". That understates this result; it does not overclaim.

Submission (step 6): the payload builds and `website` is absent. Tracks are defi, security, privacy. Open fields: leadName / email / size = TODO-H10 · nearAddress / consent = TODO-H14 · projectUrl = TODO-H2 · demoUrl = TODO-H3.

Handoffs (step 7), 26 entries:
- DONE 4: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-SOL-AIRDROP, H-NEAR-FAUCET (now DONE, citing the §G2b deploy).
- KUNAL-ONLY 7: H1, H2, H3, H10, H11, H14, H16.
- DEFAULT-AT-DEADLINE 13: H-EXPLORER, H4, H5, H7, H8, H9, H12, H13, H15, H17, H18, H19, H20.
- Not in scope 1: H6.
- OTHER-OPEN 1: H-GUARD-V7, marked "Kunal-only; no product claim depends on it". No README claim rests on it.

Explorer links: none opened. Ids were proven by RPC, as in the first run.
Result: **PASS.** The only reason for the first run's FAIL (hackathon copy on a docs-site page) is fixed. Every other step passes again.

### G9 — final fresh-clone rehearsal — FAIL (one copy-rule breach in the docs site; every command and claim check passed) — 2026-11-11T08:43Z–08:50Z — commit c5f6349
Fresh clone `/tmp/verify-G9-1794386597` of the local repo (`git clone /Volumes/T7/nectar-labs`, main HEAD c5f6349; no remote, nothing pushed). Node v22.23.4, pnpm 10.34.9,
PATH per the gates.md host notes. No keys or env, except `FEED_DB_PATH=<scratch>` for the Feed so this host's ~/.nectar store was not used (a new machine has none). Full logs: evidence/G9/20261111T084317Z/.
```
quick start (README §Quick start, followed in order; clone 08:43:20Z → web app answering ~08:47Z, about 3 min of wall clock including reading)
$ pnpm i                              exit 0   7 s   (pnpm store already warm on this host)             pnpm-i.log
$ pnpm demo:testnet                   exit 0   5 s   2.2.1-v7; Q_c $16,119.22 R_c $10 D_c $0; owner oracle $135 fresh;   demo-testnet.log
                                                    pool $40,791 / $9,209; quotes #0–#4; positions #0–#13 (#1 #4 #5 #13 Open)
$ pnpm verify                         exit 0  18 s   lint + typecheck + tests: ui 7/0, feed 63/0, keeper 293/0, x402 17/0,        verify.log
                                                    sdk 178/0; then the testnet views again
$ pnpm --filter web dev               GET / 200 (75 kB; "testnet" ×38, "mock collateral" ×12, "hackathon" 0) · GET /feed 200   web-dev-curl.txt
optional
$ pnpm --filter docs-site build       exit 0   9 s   "[SUCCESS] Generated static files in build"                docs-build.log
$ gitleaks detect --log-opts=--all    exit 0   1 s   "268 commits scanned … no leaks found"                   gitleaks.log
$ node scripts/build-submission.mjs   exit 0   dry run, --send NOT used; `website` key absent (= empty)       build-submission.log
```
Guesses a stranger has to make:
1. The clone URL is `TODO-H2`; I used the local path from the host notes.
2. README line 68 is out of date. It says that without `CORE_ACCOUNT_ID` the Feed does not poll and MCP reads the local SQLite store. In fact the Feed falls back to
   `accounts.core` in config.yaml (`feed_started core nectar-core-v2.nectar.testnet`, healthz `ok:true`, source `views+neardata`). This understates what works; it does not overclaim.
3. The root README names no port or DB variables. On this host 8788/8789 were already held by an older Feed process (pid 30818, last poll 08:04Z), so my
   `pnpm --filter feed start` failed with EADDRINUSE and my first HTTP probe reached that older process. I stopped it and re-ran against the clone's own Feed (feed-mcp.log notes this).
4. The root README shows no MCP client snippet; it points to services/feed/README.md. I used a minimal JSON-RPC client. HTTP needs `accept: application/json, text/event-stream`.
5. Which web routes exist: the README names only http://localhost:3100. /markets and /earn (my guesses) return 404.
6. "What works today (2026-11-10)" and "`pnpm verify` 39 s" are a day old. Today verify took 18 s.

Feed MCP (step 5, decides `agents`): **PASS.** Using only the root README commands:
- stdio `pnpm -s --filter feed mcp`, before any `feed start`, on an empty store: initialize → nectar-feed 0.3.0, protocol 2025-06-18.
  tools/list returns 8 tools. get_exit_capacity {NVDAx} → source "view", block 277192292, q_usd_e6 16119220000 (= demo:testnet).
- HTTP http://127.0.0.1:8789/mcp, served by the clone's `pnpm --filter feed start`: same initialize and tools/list answers. get_exit_capacity block 277192360, list_quotes live; notification HTTP 202; REST /healthz 200 `ok:true`.
- README lines 31 and 101 ("no gate has run the MCP server with an agent client") are now conservative. G9 ran a scripted client, not an LLM agent.

Live ids (step 3): README ids == packages/config/config.yaml and all answer on public RPC (https://test.rpc.fastnear.com, devnet api.devnet.solana.com):
nectar-core-v2 code_hash 3mv4LRm6…ovFvk (= README) · keeper-v2 no code, one FunctionCall key → nectar-core-v2, 5 methods (trigger_preliquidation, relay_settlement_result,
confirm_remote_deposit, keeper_attest_deposit, relay_release_result) · usdc-mock + nvdax-mock code_hash HnZj9etb…k4TrM · nectar.testnet, x402-relayer, agent1 exist ·
v1.signer-prod.testnet code CpGX8ywX… · v1 nectar-core CFTfzY4A… (= README) · keeper (v1) exists · ENZaNF…pubW executable, BPFLoaderUpgradeable, ProgramData authority 3pF3vKew… ·
nft_tokens on v2: 19 Notes (q-0…q-4, p-0…p-7, p-9…p-13, r-NVDAx-0; position 8 was refused and has no Note) · Base ids == config `base.*`, which is disclosed as `local-fork-of-base-sepolia` (not checked on chain, by design).
Explorer links: none opened this run. NearBlocks returns 403 to WebFetch (§G2) and H-EXPLORER is still OPEN. Every id above is proven by RPC instead.

Claims (step 3): every PASS / live / deployed / verified statement in README.md and SECURITY.md was traced to an EVIDENCE row (summary rows G0–G8, G1 v7, G10, G11 re-run, G12,
G2b/G7/G13/G14 re-runs, G3b re-run, §v7 module runs; Notes → §G2b `nft_tokens`/`nft_token_svg` and §G14 `nft_mint p-4`; vault slot 521021977 → evidence/G7/verifier-20261111T080154Z/chain.log).
"Pending" is used only where EVIDENCE lacks a record: the G14 402 → 200 step, the 2.2.1 gas-row check, and G9 itself.
[Updated 2026-11-11T14:20Z, WO-39: both are now recorded. G14 402 → 200: PASS, verifier-run 2026-11-11T13:54Z–13:55Z (§G14, evidence/G14/verifier-20261111T135216Z/). 2.2.1 gas rows: FAIL, `remove_extra_remote_chain` has no GAS row (§G1, evidence/G1/verifier-221-20261111T135216Z/).]
One gap closed here. Before this run no EVIDENCE row recorded the mock-ft upgrade (README line 17; SECURITY SR-27 "fixed and deployed"). It is now recorded: the on-chain code_hash of
usdc-mock and nvdax-mock, HnZj9etb…k4TrM, equals the mock_ft.wasm checksum built in the verifier's G11 re-run (evidence/G11/verifier-rerun-d027-20261111T0802Z/cargo-test-nectar-core.log:10405).

Copy rules (step 4): no "insurance" and no "without liquidations" in README, SECURITY, SUBMISSION, apps/, landing/ or packages/ui; the only hits are code comments and e2e assertions that check the words are absent.
apps/web and landing/ have no hackathon wording; only the check-no-branding script and the e2e negative assertions mention it. Disclosures say "testnet" and "mock collateral" (landing, SiteChrome, layout).
**FAIL:** `apps/docs-site/docs/project/evidence.md:11` reads "Nectar Labs is being built for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC, F-001)…". The page sits in the docs-site
sidebar (Project › Evidence, sidebars.ts:12) and ships in build/project/evidence.html and search-index.json. Hackathon context may appear only in README.md, docs/EVIDENCE.md and docs/SUBMISSION.md.
apps/web/scripts/check-no-branding.mjs scans web/ui sources only, so it does not cover the docs site.

Submission dry run (step 6): payload keys requestId, projectName, leadName, email, size, tracks, nearAddress, projectUrl, demoUrl, idea, consent. `website` is absent.
Open fields: leadName / email / size = TODO-H10 · nearAddress / consent = TODO-H14 · projectUrl = TODO-H2 · demoUrl = TODO-H3. The tracks field holds the core three (defi, security, privacy); README proposes
five pending H16.

Handoffs (step 7), 26 entries:
- DONE 3: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-SOL-AIRDROP.
- KUNAL-ONLY 7: H1 send, H2 publish, H3 X post, H10 team, H11 video, H14 payout, H16 tracks.
- DEFAULT-AT-DEADLINE 13: H-EXPLORER (RPC proof; README says a browser check is open), H4, H5, H7, H8, H9, H12, H13, H15, H17, H18, H19, H20.
- Not in scope 1: H6.
- OTHER-OPEN 2: H-NEAR-FAUCET (still OPEN although v2 deployed) and H-GUARD-V7 (default "P2b does not start", yet P2b ran on the fork). Both are stale bookkeeping and no README claim depends on them.

Result: **FAIL** for one reason: NEAR Hackathon copy on a docs-site page (step 4). Steps 1–3 and 5–7 pass.
Host side effect: I stopped the older Feed process that held :8788/:8789 (pid 30818).

### G9 rehearsal (pre-check) — NOT the G9 gate (G9 row stays pending) — 2026-11-10T00:23Z–00:28Z — commit 5cd7364
Fresh clone `/tmp/verify-G9pre-1794270192` of the local repo (main HEAD 5cd7364). PATH per gates.md host notes. No keys. Logs: evidence/G9/rehearsal-20261110T0027Z/
```
$ pnpm i                         exit 0   9 s   (pnpm store already warm on this host; a cold machine will be slower)
$ pnpm demo:testnet              exit 0  22 s   p2 contract; Q_c $3,850; oracle $89 Owner; quotes #1-#3; positions #0-#6 (#1 Open $10, #6 Settling)
$ pnpm verify                    exit 0  39 s   lint+typecheck+test: keeper 101/0, feed 38/0, sdk 18/0; then demo views again
$ pnpm --filter docs-site build  exit 0  22 s   no warnings, no broken links
$ pnpm --filter web dev          ready 4 s; GET / 200 (50 KB), GET /feed 200 (24 KB); "testnet" + "mock collateral" present, "hackathon" absent; stopped
$ pnpm --filter docs-site start  ready 10 s; GET / 200; "hackathon" absent; stopped
$ gitleaks detect --log-opts=--all   exit 0; 123 commits (all non-merge), 9.46 MB, "no leaks found" (.gitleaks.toml = defaults + narrow 64-hex content-hash allowlist)
Quick start wall clock from clone start: 154 s. Whole rehearsal incl. checks: 285 s (target < 900 s)
```
Spot checks (evidence/G9/rehearsal-20261110T0027Z/08-spotchecks.log):
1. RPC view_account nectar-core.nectar.testnet → code_hash `CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t` = README. usdc-mock / nvdax-mock / v1.signer-prod.testnet exist (have code).
2. RPC view_access_key_list keeper.nectar.testnet → one FunctionCall key, receiver nectar-core, methods [trigger_preliquidation, relay_settlement_result], no full-access key = README (D-012).
3. RPC EXPERIMENTAL_tx_status FCtApD2L…MHhe → SuccessValue, keeper → nectar-core `trigger_preliquidation`, receipts touch outlayer.testnet + v1.signer-prod.testnet, log `settlement_signed` position 6 = README.
4. GET testnet-api.outlayer.ai/attestations/by-request/15148 → HTTP 200, request_id 15148, caller keeper.nectar.testnet, project nectar.testnet/nectar-quoter, wasm_hash 3ce17749…6cc2 = README version_key. (159 bps itself is backed by EVIDENCE §G4 / F-179, not visible in the attestation, which carries only output_hash.)
5. Explorer: WebFetch https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe → HTTP 403; curl to the nectar-core address page → 403. Proven by RPC instead (items 1-3).
README figures: $50,000 pool, $11,250 / $7,200 limits, quotes #0/#1 → evidence/G2/demo-testnet-20261109T2049Z.log + EVIDENCE §G2 model check. Upgrade log, G2–G8 evidence paths in the table: all exist. No README claim found without a backing.
EVIDENCE table: G0–G8 each have a status, UTC, commit and evidence path. They agree with the README banner and the README Evidence section (G0–G4, G6 PASS; G5 FALLBACK; G7 PARTIAL; G8 PASS fixture; G9 pending).
HUMAN_HANDOFF OPEN items: H-TOOLCHAIN-SOLANA, H-EXPLORER, H13, H-NEAR-FAUCET, H4, H5, H7, H8, H9, H10, H11, H12, H2, H1, H3, H14 (H6 not in scope; H-TOOLCHAIN DONE).
Final-G9 blockers (OPEN, not in H1/H2/H3/H10/H11): H-TOOLCHAIN-SOLANA, H-EXPLORER, H13, H-NEAR-FAUCET, H4, H5, H7, H8, H9, H12, H14. They must each be DONE, DEFAULTED or explicitly cut before the final G9.
Feed MCP (decides `agents`): runnable YES. stdio (`pnpm --filter feed mcp`) and HTTP (`pnpm --filter feed start`, :8789/mcp) both answer initialize (nectar-feed 0.2.0, protocol 2025-06-18) and tools/list = get_exit_capacity, preview_borrow, list_quotes, explain_limit (09/10/12 logs).
With CORE_ACCOUNT_ID=nectar-core.nectar.testnet the tools return live views (Q_c 3850000000, oracle Owner $89, quotes #1-#3).
As the root README literally says (no env): polling disabled ("CORE_ACCOUNT_ID unset (TODO-G2)"), /healthz 503, get_exit_capacity → isError "no data for NVDAx", list_quotes → []. Only services/feed/README names CORE_ACCOUNT_ID.
Guesses / confusion a stranger hits:
- Quick start lists `git clone <repo-url>` (TODO-H2) and `docs-site start`; it does not list `pnpm verify` or `docs-site build` (gates.md does). Ran both anyway.
- Root README `pnpm --filter feed start` gives an empty Feed/MCP unless you know CORE_ACCOUNT_ID; the stale "TODO-G2" in services/feed/src/main.ts log text points at a gate that already passed.
- `pnpm --filter feed mcp` prints the pnpm banner on stdout before the JSON-RPC stream; a strict stdio client may reject it (registration snippets use `node … mcp-stdio.ts` directly, which avoids this).
- services/feed/README still carries "TODO-FACTS: … claude mcp add flags … Verify them before G9".
- `pnpm --filter web dev` writes an untracked apps/web/AGENTS.md into the clone (Next.js agentRules default).
- Feed uses ~/.nectar/feed.sqlite by default; this rehearsal set FEED_DB_PATH to a scratch dir to leave the host alone.
Rehearsal verdict: quick start PASS in time; gitleaks clean; claims backed. Final G9 is not yet passable: 11 handoff blockers above, plus the Feed env gap if `agents` is to be claimed.

## G7

### G7 — Solana + signer — RE-RUN after D-027 (2.2.1-v7, vault v2) — PASS — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. NEAR https://test.rpc.fastnear.com · Solana https://api.devnet.solana.com. Claims: evidence/G7/rerun/summary.md.
Command: node evidence/G7/verifier-20261111T080154Z/g7.mjs <clone> (tx hashes from evidence/rollout/keeper-20261111T070745Z.log; Solana sigs cross-checked with get_pending_*). Output: chain.log.
```
pos 8/9/10: status=Closed; remote.authority == derived_public_key(solana-devnet/pos/<id>, nectar-core-v2.nectar.testnet, domain 1): 3N1d7fSw… / 3DAHsvVA… / BCnWuATG… MATCH ×3
  committed_depositor 2s7mnWvg…zKS (all three)
confirm_remote_deposit (keeper-v2) 9ykov…/9R8Bd…/DkYpn… SuccessValue, 0 failed receipts; OutLayer execution_completed wasm hash 5f9bb287…
  remote_deposit_confirmed pos 8 source "outlayer" funded false → remote_loan_refused aggregate_limit → reservation_deposit_refunded 0.04403 NEAR (loan_refused)
  remote_deposit_confirmed pos 9 / pos 10 source "outlayer" funded true → position_opened debt 370440000, net_proceeds 364695480 (×2)
trigger_preliquidation 6TKH… → quoter_result fills [{quote 2, disc 300 bps}] → settlement_signed preimage NECTAR_SETTLE_V1|…|pos=10|quote=2|repay_e6=370440000|seize_units=2386856|…|nonce=9|…|kind=PRELIQ
relay_release_result E7qp… (8), 7t1t… (9); relay_settlement_result 9s8H… (10, status Closed) — all SuccessValue
get_pending_release(8/9).solana_tx_sig, get_pending_settlement(10).solana_tx_sig == keeper-log sigs 4rn4VdeK…, 5vF6HxQT…, 3Qm6H4sW…; status Relayed
program ENZa…pubW executable; programData 55ZD9n58… space 426837 (= 45 B header + 426,792 B ELF); last deploy slot 521021977 (< first re-run tx slot 521022774)
release pos=8 4rn4VdeK…dtPE slot 521024256 err null finalized; programs [Ed25519, VAULT]; pubkey 3N1d… == authority; sig_valid true; tampered false
  msg NECTAR_RELEASE_V1|chain=solana-devnet|vault=ENZa…|pos=8|recipient=2s7mn…|nonce=7|expires=1794384870 (== get_pending_release message)
release pos=9 5vF6HxQT…N51d slot 521033668 finalized; [Ed25519, VAULT]; pubkey 3DAH… == authority; valid true; tampered false; nonce=8
settle pos=10 3Qm6H4sW…izA4 slot 521034149 finalized; [Ed25519, VAULT]; pubkey BCnW… == authority; valid true; tampered false
  token: vault HGSF… 3 → 0.613144 | recipient FtWQZk7K… 2.54598 → 4.932836 (+2.386856)
PDAs (from deposit-<id>.log; included in the vault ix accounts): At266Cu… / 7weJCk7… / 3iQ8Jrd… → getAccountInfo null (closed)
  pos 8: OpenPosition depositor 7.45402→4.45402 · Release · Withdraw 4.45402→7.45402
  pos 9: OpenPosition 7.45402→4.45402 · Release · Withdraw 4.45402→7.45402
  pos 10: OpenPosition 7.45402→4.45402 · Settle · Withdraw 4.45402→5.067164 (+0.613144)
```
Explorer: WebFetch https://explorer.solana.com/tx/3Qm6H4sW…izA4?cluster=devnet → HTTP 429 (no content). NEAR explorer not opened (403, §G2). RPC proof above.
Verdict: **PASS.** Every claim in the summary holds from the chains: authorities (domain 1) for 8/9/10; OutLayer-sourced confirms, pos 8 refused (aggregate_limit) and refunded,
9/10 funded at $364.695480; three finalized Solana txs with the Ed25519 verify ix at index 0 right before the vault ix, signed by the stored authority over the exact NEAR preimage;
vault v2 program 426,792 B ELF upgraded before the runs; recipient +2.386856 ≈ 370.44 / (160 × 0.97) = 2.3868557 (rounded up at the 6th decimal); depositor withdrawals 3 / 3 / 0.613144; slots closed; NEAR Closed.
The 180 → 160 owner price move is a disclosed demo control (current owner price 135 after G13).

### G7 — Solana + signer (v7) — PASS — 2026-11-10T16:45Z–16:52Z — commit 91db9ea
Every claim in evidence/G7/v2-roundtrip-summary.md re-derived from public RPC (NEAR rpc.testnet.near.org, Solana api.devnet.solana.com, finalized),
read-only, no transactions sent. Logs: evidence/G7/verifier-v7-20261110T1645Z/.
```
(a) get_position 2 → remote.authority ed25519:HRf3veyfWvAccxvAgkDvp9eCKTuCpfobLVMJ9TVstarz, status Closed, source outlayer, deposit_ref 520805167
    v1.signer-prod.testnet derived_public_key {path solana-devnet/pos/2, predecessor nectar-core-v2.nectar.testnet, domain_id 1} → HRf3…tarz  MATCH
    get_position 3 → ed25519:APU8mbdwRLFR884iW2om4pQmP126ueKXCWL2B4JrYXCw, Closed, outlayer, 520805657; derived (pos/3) → APU8…YXCw  MATCH
(b) 8XXvnBVN… (keeper-v2 confirm_remote_deposit) → outlayer execution_requested 16443 / execution_completed → remote_deposit_confirmed {pos 2, source outlayer} → position_opened
    8hNqxAdC… (keeper-v2 confirm_remote_deposit) → outlayer 16449 completed → remote_deposit_confirmed {pos 3, source outlayer} → position_opened
    54eukmJT… (borrower1 ft_transfer_call) → repaid {pos 2, 370440000, remaining 0}
    DKH57jdP… (borrower1 request_remote_release) → remote_release_signed {pos 2, nonce 0, sig 813709fd…, pubkey HRf3…}
    7biCvPbA… (keeper-v2 relay_release_result) → remote_release_relayed {pos 2, solana_tx_sig 5fTihnbJ…}
    HrpQsuMW… (keeper-v2 trigger_preliquidation) → preliq_triggered → quoter_requested → outlayer 16453 execution_completed (wasm 5d90edb8…)
      → quoter_result fills [q1 250, q2 300, q0 400] → settlement_sign_requested → v1.signer-prod receipts Success → settlement_signed {pos 3, quote 2, nonce 1}
    all six: status SuccessValue, 0 failed receipts
(c) 5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv  slot 520805448 err null
      ix0 Ed25519SigVerify111… (pubkey HRf3…tarz, sig 813709fd…, msg NECTAR_RELEASE_V1|…|pos=2|…|nonce=0|expires=1794332328)  ix1 ENZaNF… "Instruction: Release"
    3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6  slot 520806179 err null   (== get_pending_settlement(3).solana_tx_sig, status Relayed)
      ix0 Ed25519SigVerify111… (pubkey APU8…YXCw, sig 2ffb74b9…, msg == stored preimage …|pos=3|quote=2|seize_units=2545980|…|kind=PRELIQ)  ix1 ENZaNF… "Instruction: Settle"
    getAccountInfo FDUbeLRb… (pos 2 PDA, in release tx keys) → null; E26iv84F… (pos 3 PDA, in settle tx keys) → null   (closed)
    getTokenAccountsByOwner FtWQZk7K… mint 3Ve8GiDB… → ATA GARN7FTb… 2.54598 (raw 2545980); depositor 2s7mn… 7.45402
(d) node scripts/verify-ed25519.mjs ed25519:APU8… '<get_pending_settlement 3>'           → signature_valid true
    node scripts/verify-ed25519.mjs ed25519:HRf3… '{preimage:<release message>, signature_hex}' → signature_valid true
    negative: release sig vs pos-3 key → false; settle preimage with seize_units+1 → false
```
Explorer links (WebFetch): https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet → HTTP 429;
https://testnet.nearblocks.io/txns/HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u → HTTP 403. Not opened (listed for judges):
https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet,
https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet, https://testnet.nearblocks.io/txns/8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3,
https://testnet.nearblocks.io/txns/8hNqxAdC61nAwmTWeUbK5auA4CbB35ppkPcnNX7PYe5C, https://testnet.nearblocks.io/txns/7biCvPbApT6RU7hoxUcKGeMxNX2aG6PWEv79KzPxsz2e.
Chain data came from RPC; a human browser check of the explorer pages is still open.
Notes: the price drop 180 → 150 that triggered pre-liquidation is an owner-oracle demo control (disclosed in the summary). Positions #2/#3 are the only remote positions checked.
**PASS** — (a), (b), (c) hold from chain data; (d) both signatures valid off-chain with negative controls.


### G7 prep — vault deployed + 25 anchor tests — RECORDED (not a G7 PASS) — 2026-11-10T13:44Z — commit 09c4316
Clone as §G10; PATH += ~/.avm/bin ~/.local/share/solana/install/active_release/bin; SDKROOT=.../MacOSX26.5.sdk (solana/deploy.md:13).
$ solana program show ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW --url devnet
  Owner: BPFLoaderUpgradeab1e11111111111111111111111 · ProgramData 55ZD9n58bZKC9PfVcsiuRMoDyGVkJSPQX2AtTvUL1vzR
  Authority: 3pF3vKewQdsKd4TEZvWYZrHZfRRJnzW3EsgtU3x8bZgS · Last Deployed In Slot 520746382 · Data Length 397240 · 2.01885804 SOL
$ solana account HGSFKMWWnXeHJtPyaCEysWb5vHvQZJLvTkeB6YntEbeX --url devnet
  Owner: ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW · 95 bytes · data contains "NVDAx" · 0.00113284 SOL
  (vault holds no authority key; per deploy.md:40-41 positions carry their own authority, so the derived-key == authority check is G7.)
declare_id! in programs/nectar_vault/src/lib.rs == ENZa… == Anchor.toml [programs.devnet]; [programs.localnet] = GdCVqcg2….
$ (solana) pnpm install --ignore-workspace → exit 0
$ pnpm run test:unit → 7 passed; 0 failed, exit 0  (first attempt without SDKROOT failed at link: verifier omission, documented in deploy.md)
$ pnpm run test:anchor → exit 0: # tests 25 · # pass 25 · # fail 0 (4 client + 5 happy paths + 16 negative paths incl. wrong authority,
  replayed nonce, expired, tampered signature, verify ix offset, recipient mismatch)
Explorer: none opened (Solana explorer not fetched; RPC output above).
Result: RECORDED as "G7 prep: vault deployed + 25 anchor tests". G7 itself stays pending (needs nectar-core-v2 on testnet).

### G7 — Solana + signer — PARTIAL: NEAR side verified; Solana leg not built — 2026-11-09T23:57Z — commit 97382fd
Fresh clone /tmp/verify-G7-1794268628 at main 97382fd. PATH += ~/.cargo/bin ~/.local/bin, SDKROOT per gates.md host notes.
No secrets used, no transactions sent (RPC reads only). Logs: evidence/G7/verifier-20261109T2357Z/.
Not PASS (no Solana devnet tx exists), not FAIL-by-bug (Solana toolchain absent: H-TOOLCHAIN-SOLANA).
$ cd solana && anchor test 2>&1 | tail -40                 → "command not found: anchor" (solana/ holds only .gitkeep)
$ pnpm --filter keeper test:settle-devnet                  → ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT (script does not exist)
Explorer links: none for Solana (no tx). NEAR: https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe
  opened with WebFetch → HTTP 403; proven via RPC instead (below).
NEAR side, source = evidence/G7/signer-roundtrip-20261109T2348Z.log (latest, position #6), trigger tx FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe:
$ RPC EXPERIMENTAL_tx_status (sender keeper.nectar.testnet, rpc.testnet.near.org) → tx_status_FCtApD2.json, rpc_checks.log
  status SuccessValue, FINAL; keeper.nectar.testnet → nectar-core trigger_preliquidation {"position_id":"6"}
  receipt chain: outlayer.testnet request_execution → on_quoter_result → nectar-core → v1.signer-prod.testnet `sign`
    deposit 1 yocto, 30 Tgas, request {path:"solana-devnet-v1", payload_v2:{Eddsa:<hex>}, domain_id:1}
  → signer return_signature_and_clean_state_on_success SuccessValue {"scheme":"Ed25519","signature":[64 u8]}
    (SignatureResponse shape per F-035) → nectar-core on_signature → keeper reward ft_transfer 11634 units
  nectar events: preliq_triggered, quoter_requested, quoter_result, settlement_sign_requested, settlement_signed
  Eddsa payload hex decodes to the raw preimage bytes (not pre-hashed) == view preimage: true (sign_args_check.log)
  sign_requested.preimage == signed.preimage == get_pending_settlement {"position_id":"6"}.preimage: true true
  SignatureResponse bytes == event signature_hex == view signature_hex: true
$ node scripts/verify-ed25519.mjs ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV '<pending json>' → "signature_valid":true
  negative control (repay_e6 205000000→205000001 in preimage) → "signature_valid":false (verify_ed25519_negative.log)
$ view v1.signer-prod.testnet derived_public_key {"path":"solana-devnet-v1","predecessor":"nectar-core.nectar.testnet","domain_id":1}
  → "ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV" == config.yaml signer.authority: true
$ view get_position {"position_id":"6"} → status "Settling", units 0, debt 0 (no relay; stays Settling)
Code:
$ (cd contracts/nectar-core && cargo near build non-reproducible-wasm) → exit 0, bs58(sha256) CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t
  == on-chain view_account code_hash CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t: true (code_hash.log)
$ cargo test --workspace → exit 0 (cargo_test.log): mock_ft 11/0, nectar_core unit 179/0 (incl.
  tests_p2::preimage_golden_vectors_byte_for_byte ok), sandbox 5/0, sandbox_p1 4/0, sandbox_p2 3/0, test_stubs 8/0
Disclosures (must stay true in README/submission):
  - preimage program id EgfPYZfKHksk1P5x9z8WXKGr7cKcQ7sr5Zf8sdo68NYZ is a PLACEHOLDER (random address from
    scripts/55-g7-signer-roundtrip.sh); no Solana vault is deployed; config.yaml solana.program_id/authority = TODO-G7.
  - recipient DbrceqSnyAcm2EkTD2j5npcc16BdkWtZuW73MULaUt98 is a throwaway address (key generated and discarded per script).
  - position #6 stays Settling: the signature was never relayed to Solana (solana_tx_sig null).
Notes for the orchestrator (not fixed by verifier):
  - README line 51 says in present tense "A Solana program verifies it before releasing collateral"; line 23 says the vault is
    "not built". Line 56 says pre-hashing is "open until G7"; the on-chain sign args show the raw preimage is signed (no pre-hash).
  - scripts/55-g7-signer-roundtrip.sh says the placeholder is "disclosed in EVIDENCE/README"; README does not mention it.
  - gates.md G7 commands reference a keeper script `test:settle-devnet` that does not exist yet.
Remaining for PASS: Solana toolchain (H-TOOLCHAIN-SOLANA) → nectar_vault on devnet → devnet tx with Ed25519 verify ix + settle,
both explorer links opened.

## G8

### G8 — copilot verifier — FAIL (docs overclaim; every offline check green) — 2026-11-09T23:45Z — commit 2b49f42
Fresh clone /tmp/verify-G8-1794267776 at main 2b49f42 (main has since moved to c0c2a2f; not re-run). PATH += ~/.cargo/bin ~/.local/bin
(gates.md host notes). NEAR_AI_API_KEY unset (H7). No secrets used. Logs: evidence/G8/verifier-20261109T2343Z/.
$ pnpm i --frozen-lockfile                                   → exit 0
$ pnpm --filter web test:copilot                             → exit 0: tests 11, pass 10, fail 0, skipped 1 (live round trip)
  ✔ DCAP: Phala sample TDX quote verifies against Intel root with recorded collateral (TCB UpToDate)
  ✔ DCAP: patched report_data breaks the quote signature
  ✔ quote offsets match dcap-qvl Quote.parse (report_data, mr_config_id)
  ✔ fixture: signature, hashes, model id and report_data pass; DCAP fails → answer hidden
  ✔ gate logic: with an accepted DCAP verdict over the same quote bytes the answer is released
  ✔ negative: tampered response, stale nonce, foreign signer, gateway signature
  ✔ F-075: MRCONFIGID check is a prefix match on 01 || sha256(app_compose)
  ✔ F-074/F-076/C-018: request paths carry no provider param or aliasing header; 404 backoff grows
  ✔ F-077: NRAS verdict needs overall=true and both nonces equal ours
  ✔ system prompt forbids prices and amounts; request carries it
  ﹣ live round trip (only with --live and NEAR_AI_API_KEY) # fixture run
$ pnpm --filter web test:copilot -- --live  (no key)        → exit 1: "--live needs NEAR_AI_API_KEY (TODO-H7). Fixture run: pnpm --filter web test:copilot"
$ pnpm --filter web build                                    → exit 0
$ PW_CHANNEL=chrome pnpm --filter web exec playwright test e2e/copilot.spec.ts → 4 passed (/console, /borrow × phone, desktop)
$ next start -p 3917 (no key): GET /api/copilot → 200 {"configured":false,...}; POST {nonce,notes} → 503 {"status":"key_missing"};
  POST {fixture:true} → quoteVerdict {ran:true, ok:false, detail:"dcap-qvl rejected the quote: ISV enclave report signature is invalid"}
UI probe (Chrome, /console): "Key missing" banner visible; "Ask copilot" disabled; after fixture run badge "unverified — hidden",
  12 checklist rows each start with the word passed / failed / not run (0 tick glyphs), 0 .copilot-answer blocks, "Answer hidden: TDX quote …".
NEAR AI probe 23:44:34Z: GET https://cloud-api.near.ai/v1/models → HTTP 500 "Database connection pool error" (5.2 s).
Explorer links: none for this gate.

What the fixture is (scripts/build-copilot-fixture.ts, lib/copilot/fixtures/): Phala-Network/dcap-qvl sample/tdx_quote + collateral
(MIT), a real Intel-signed TDX quote, verified at fixed nowSecs 2025-06-20 inside the collateral window. The chat is synthetic: built
locally and signed with a throwaway secp256k1 key that is then discarded. The synthetic quote is that sample with report_data patched to
signer‖nonce. It is NOT a recorded NEAR AI response. Verdict end to end: report_data checks pass, DCAP fails → "unverified — hidden" (correct).
Exercised with real crypto offline: EIP-191 recovery (+ foreign signer rejected), sha256 request/response hashes (+ tampered response
rejected), provider_tee 3-part text + model id (gateway 2-part rejected), report_data F-075 right-padded signer ‖ nonce (+ stale nonce
rejected), dcap-qvl 0.7.1 on the genuine sample (accepts) and patched quote (rejects), quote offsets vs dcap-qvl Quote.parse, MRCONFIGID
prefix 01‖sha256(app_compose) (F-075), NRAS verdict logic on synthetic JWTs (F-077), signature 404 backoff.
Live only (not run): NEAR AI chat / signature / attestation, Phala PCCS collateral fetch, NVIDIA NRAS POST, /v1/models listing, MRCONFIGID
on a real app_compose. RTMR3 replay is not implemented (shown "not run").
FACTS match: attestationPath = /attestation/report?model=&signing_algo=ecdsa&nonce= (F-074); signaturePath = /signature/<id>?model=&signing_algo=ecdsa
(F-076); compose read at info.tcb_info.app_compose (F-074); no provider= / x-no-aliasing anywhere in apps/web (C-018); signer must match a
model_attestations[].signing_address (F-076); model id shown "unverified (F-078)". SYSTEM_PROMPT forbids prices, amounts, LTVs.
Live round trip not performed (H7 key absent; API returned 500).
FAIL reasons (docs/UI wording only; no check is wrong):
  1. README.md:61 (`privacy` track): "copilot answers are TEE-signed and verified". Present tense. No NEAR AI answer has ever been
     received or verified, and only the fixture path runs. Overclaim.
  2. README.md:24 status row says "not built; live mode needs key H7". The fixture verifier and panel are built and merged, so this row
     is inaccurate and contradicts line 61.
  3. CopilotPanel.tsx intro: "shown only after the browser verifies the TEE signature and attestation". The Intel DCAP chain runs
     server-side; the browser checks the server's verdict and the quote hash. The checklist row does say "(server)". Minor.
Notes: e2e spec asserts /Key missing|Ask copilot/, so on its own it would pass without the banner; the UI probe above checked the
  banner directly. Optional checks (MRCONFIGID, NRAS, model list) do not block release in live mode, so a "verified in TEE" answer
  proves some TDX VM holds the signing key, not which compose it runs. That is consistent with F-075/F-077 and disclosed as (optional).

### G8 (re-run) — copilot verifier — PASS (fixture) — 2026-11-09T23:56Z — commit df4706f
Fresh clone /tmp/verify-G8b-1794268483 at main df4706f (merge WO-17c, after WO-4f merge c294b22). PATH += ~/.cargo/bin ~/.local/bin.
NEAR_AI_API_KEY unset (H7). No secrets used. Never pushed. Logs: evidence/G8/verifier-20261109T235453Z/.
$ pnpm i --frozen-lockfile                                   → exit 0 (Done in 4.3s, pnpm v10.34.9)
$ pnpm --filter web test:copilot                             → exit 0: tests 11, pass 10, fail 0, skipped 1 (live round trip); same 10 checks as the FAIL block
$ pnpm --filter web test:copilot -- --live  (no key)        → exit 1: "--live needs NEAR_AI_API_KEY (TODO-H7). Fixture run: pnpm --filter web test:copilot"
$ pnpm --filter web build                                    → exit 0
$ PW_CHANNEL=chrome pnpm --filter web exec playwright test e2e/copilot.spec.ts → 4 passed (/console, /borrow × phone, desktop)
NEAR AI probe 23:55:49Z: GET https://cloud-api.near.ai/v1/models → HTTP 500 (status only, no key).
Explorer links: none for this gate.
FAIL items re-checked:
  1/2. Docs wording. Grep of README.md + apps/docs-site/docs for "verif" within 3 lines of copilot/answer/NEAR AI (grep-copilot.txt). Every hit:
    README.md:24 "**built; no live NEAR AI answer has been verified yet.** Live mode needs key H7 … run on a fixture built from a real
      Intel-signed sample TDX quote (Phala dcap-qvl sample, MIT) plus a chat signed by a throwaway key, not a NEAR AI recording; it correctly
      ends "unverified — hidden". Intel DCAP quote verification runs on the server …; EIP-191 … run in the browser … G8 re-run pending"
    README.md:61 "the copilot shows an answer only after signature and attestation checks pass (no live NEAR AI answer verified yet: key H7
      absent, NEAR AI Cloud 500 on 2026-11-09)"
    docs-site start/live-on-testnet.md:27 same text as README:24 ("built; no live NEAR AI answer has been verified yet" + honest fixture).
    docs-site security/trust-model.md:22 "the answer is shown only after the checks pass: Intel DCAP … on the server, EIP-191 … in the
      browser. No live answer has been verified yet (key H7 absent; /v1/models 500 on 2026-11-09, F-078)"; :8 is the page's "Verified against: F-…" facts line.
    docs-site legal/privacy.md:37-39 NEAR AI Cloud, Phala PCCS, NVIDIA NRAS each "live mode only"; "not called in fixture mode". No verification claim.
    Other hits (README:74, project/evidence.md:17/23 "pending", project/roadmap.md:15/19) are plans/status, not claims. → no overclaim; built; fixture honest.
  3. Panel intro (components/CopilotPanel.tsx:54-56): "In your browser: EIP-191 signature recovery, request/response hashes, and the
     report_data/nonce binding. On this server: the Intel TDX quote (DCAP, via dcap-qvl) and, in live mode, NVIDIA GPU attestation (NRAS)."
     Matches code: dcap-qvl imported only in lib/copilot/server.ts; panel imports verifyBundle (lib/copilot/verify.ts, pure) and POSTs /api/copilot.
  Weak test fixed: e2e/copilot.spec.ts (no key) filters .banner by .b-title /^Key missing$/, toHaveText("Key missing"), asserts the full banner
     sentence and "Ask copilot" disabled; also asserts both browser/server intro sentences. 4/4 green.
Live round trip not performed (H7 key absent; API 500).
PASS (fixture): no overclaim in README/docs-site/panel; all offline checks green. Notes: docs still say "G8 re-run pending" (stale after this PASS, not an overclaim).

## G0

### G0 — toolchain + facts — FAIL — 2026-11-09T23:01Z — commit 90af048
Recorded late: the orchestrator ran G0 on 2026-11-09 (evidence/G0/toolchain.log, help.log, help-1954.log; mtimes 19:53-19:55Z UTC) but it never reached this file. This verifier run comes after the tags `p0-green` and `p1-green` were set (both tags are in the repo at 90af048), so G0 did not gate P0 as CLAUDE.md §1 requires.
Fresh clone /tmp/verify-G0-1794265313 at main 90af048. PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH". `pnpm i --frozen-lockfile` → Done in 4.6s using pnpm v10.34.9. No secrets used. Logs: evidence/G0/verifier-20261109T230153Z/{toolchain,help,network}.log.
I ran the gates.md G0 lines exactly (`near account create-account --help | head -40`, `near account add-key --help | head -40`, Hermes through the gates.md mirror pyth.dourolabs.app). I also ran the orchestrator's variants (`create-account fund-myself --help | head -25`, `add-key x.testnet grant-function-call-access --help | head -25`, hermes.pyth.network and hermes-beta directly). The first loop failed under zsh (no word-splitting: "command not found: rustc --version"), so I reran it in bash. That was my harness mistake, not a product fault.
```
$ rustc --version        → rustc 1.95.0 (59807616e 2026-04-14)     FACTS: none (F-010 lists only near-sdk rust_version 1.95, the minimum)
$ cargo --version        → cargo 1.95.0 (f2d3ce0bd 2026-03-21)     FACTS: none
$ cargo near --version   → cargo-near-near 0.23.0                  FACTS: F-011, F-023 (2026-11-10)
$ near --version         → near-cli-rs 0.31.1                      FACTS: F-022 (2026-11-10)
$ node -v                → v22.23.4                                FACTS: none (F-012 + package.json engines give only the floor >=22.22.2)
$ pnpm -v                → 10.34.9                                 FACTS: F-026 (2026-11-10), packageManager pnpm@10.34.9
$ anchor --version       → command not found [exit 127]            P2 only: F-081 Anchor 0.32.1; H-TOOLCHAIN-SOLANA OPEN
$ solana --version       → command not found [exit 127]            P2 only: F-025 agave v4.4.1; H-TOOLCHAIN-SOLANA OPEN
$ gitleaks version       → 8.30.1                                  FACTS: F-024 (2026-11-10)
$ near account create-account --help | head -40
  Usage: near account create-account [COMMAND]  … sponsor-by-faucet-service … fund-myself
$ near account create-account fund-myself --help | head -25
  Usage: near account create-account fund-myself [NEW_ACCOUNT_ID] [INITIAL_BALANCE] [COMMAND]
$ near account add-key x.testnet grant-function-call-access --help | head -25
  Usage: near account add-key grant-function-call-access [OPTIONS] [COMMAND]
      --allowance <ALLOWANCE>   --contract-account-id <CONTRACT_ACCOUNT_ID>   --function-names <FUNCTION_NAMES>
$ curl -s https://1click.chaindefuser.com/v0/tokens | head -c 400
  [{"assetId":"nep141:wrap.near","decimals":24,"blockchain":"near","symbol":"wNEAR","price":3.64,"priceUpdatedAt":"2026-11-09T23:01:00.667Z",…},{"assetId":"nep141:eth.bridge.near",…
$ curl -s "https://pyth.dourolabs.app/hermes/v2/updates/price/latest?ids[]=b1073854…a593" | head -c 400   (id = config.yaml oracle.nvda_price_id = F-053)
  unauthorized [http 401]
$ (same path on hermes.pyth.network, hermes-beta.pyth.network) → unauthorized [http 401] on both
```
F-020: resolved. It is marked V (2026-11-10) and cites evidence/G0/help-1954.log:36-38 and evidence/G0/help.log:2-7. I opened both: the lines are `--contract-account-id`, `--function-names` and `--signature-scheme` (ed25519 | ml-dsa-65). This run's help.log shows the same flags again. C-004 is closed 2026-11-10 and points to F-020.
Hermes 401 matches F-056 / C-007 (still open, needs the human key H13). It is expected and is not a G0 failure.
Explorer: none. G0 has no explorer step.
Verdict: FAIL. Reasons:
 1. The installed versions of rustc 1.95.0, cargo 1.95.0 and node v22.23.4 are not recorded in FACTS. Only the minimums appear: F-010 (rust_version 1.95) and F-012 / engines (node >=22.22.2). The pass rule is "all recorded in FACTS with today's date". Fix: the researcher adds FACTS entries with a date and the evidence path.
Not failures:
 - anchor and solana are absent. They are a P2 / G7 dependency (H-TOOLCHAIN-SOLANA OPEN, F-025, F-081).
 - All other P0 tools are present and match FACTS. F-020 is resolved. 1Click /v0/tokens is live.
Notes:
 - FACTS dates look like local time (IST, +05:30), not UTC. Example: F-053 is dated 2026-11-10 but cites a curl made at 2026-11-09T19:59:55Z. UTC was still 2026-11-09 when this gate ran.
 - The gates.md G0 commands differ from the orchestrator's brief: help subcommand depth and the Hermes host. I ran both sets.

### G0 — toolchain + facts — PASS — 2026-11-09T23:09Z — commit b3a9090
Re-record after GATE_FAIL_G0. Fresh clone /tmp/verify-G0-20261109T230923Z at main b3a90906. Commands run in bash with PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH". No secrets used. Logs are in evidence/G0/verifier-20261109T230923Z/: toolchain.log, help.log, and facts.log (the FACTS rows I checked).
Network probes are reused from evidence/G0/verifier-20261109T230153Z/network.log, taken at 23:01Z, 8 minutes earlier and inside the 2 h limit. 1Click /v0/tokens was live. All three Hermes hosts returned 401, which matches F-056 / C-007.
```
$ rustc --version        → rustc 1.95.0 (59807616e 2026-04-14)   FACTS: F-181 (2026-11-09, V, evidence verifier-20261109T230153Z/toolchain.log)
$ cargo --version        → cargo 1.95.0 (f2d3ce0bd 2026-03-21)   FACTS: F-182 (2026-11-09, V, same log)
$ node -v                → v22.23.4                              FACTS: F-183 (2026-11-09, V, same log)
$ cargo near --version   → cargo-near-near 0.23.0                FACTS: F-011, F-023 (2026-11-10, V)
$ near --version         → near-cli-rs 0.31.1                    FACTS: F-022 (2026-11-10, V)
$ pnpm -v                → 10.34.9                               FACTS: F-026 (2026-11-10, V)
$ gitleaks version       → 8.30.1                                FACTS: F-024 (2026-11-10, V)
$ anchor --version       → bash: anchor: command not found       P2 only (F-081, F-187; H-TOOLCHAIN-SOLANA OPEN)
$ solana --version       → bash: solana: command not found       P2 only (F-025, F-187)
$ near account create-account --help | head -40 → Commands: sponsor-by-faucet-service, fund-myself, fund-later, help
$ near account add-key --help | head -40        → captured in help.log
```
I opened the evidence that F-181, F-182 and F-183 cite (evidence/G0/verifier-20261109T230153Z/toolchain.log). It shows the same three version strings as this run.
F-020 is V (2026-11-10). It cites help-1954.log:36-38 and help.log:2-7, and the 23:01Z run already confirmed those flags. C-004 is closed.
Explorer: none. G0 has no explorer step.
Verdict: PASS. Every G0 tool version is in FACTS with a date and evidence, and every installed version matches its FACTS row. F-020 is resolved.
Not failures:
 - anchor and solana are absent. They are a P2 / G7 dependency (H-TOOLCHAIN-SOLANA).
 - Hermes returns 401 (C-007, H13).
Note: the FACTS date convention is mixed. F-181 to F-183 use the UTC date (2026-11-09), while F-010 to F-026 use the IST date (2026-11-10) for the same session. Both dates fall within this session, so I did not count it as a failure.

## G5

### G5 — oracle — FALLBACK (disclosed) — 2026-11-09T22:55Z — commit 706d940
Fresh clone /tmp/verify-G5-1794264871 at main 706d940. PATH and SDKROOT set per the gates.md host notes. Only read-only calls, no transactions sent. Logs are in evidence/G5/verifier-20261109T2254Z/.
$ORACLE and $NVDA_PRICE_ID are not defined anywhere in the repo: config.yaml has `oracle.nvda_price_id: TODO-G5` and .env.example has `NVDA_PRICE_ID=TODO-G5`. I used ORACLE=pyth-oracle.testnet (C-012) and the F-053 Equity.US.NVDA id b1073854…a593.
```
$ near contract call-function as-read-only pyth-oracle.testnet get_price json-args '{"price_identifier":"b1073854…a593"}' network-config testnet now   # near-cli-get_price.log 22:55:09Z
null                                                       -> criterion "publish_time < 600 s" NOT met
# live-probes.log 22:55:28Z (RPC rpc.testnet.near.org, finality final)
pyth-oracle.testnet get_price_no_older_than {price_id, age:86400} @276984374 -> null
pyth-oracle.testnet get_price_unsafe @276984380 -> null ; price_feed_exists -> false (no update pushed)
price-oracle.testnet get_price -> MethodResolveError(MethodNotFound)        (C-012 holds)
hermes.pyth.network /v2/updates/price/latest?ids[]=<id> -> HTTP 401 ; hermes-beta -> HTTP 401   (C-007 holds, H13 open)
nectar-core get_oracle_source {NVDAx} @276984398 -> "Owner"
nectar-core get_exit_capacity {NVDAx} @276984404 -> oracle_price_usd_e6 112000000, oracle_age_s 623, oracle_fresh true, session_open false, oracle_source Owner
$ cargo test -p nectar-core oracle_rejects                 # cargo-oracle_rejects.log
test result: ok. 0 passed; 0 failed; 4 filtered out ; ... 0 passed  -> the gates.md filter matches NO test (stale name)
$ cargo test -p nectar-core -- --nocapture                 # cargo-test-nectar-core.log, EXIT 0
unittests 157 passed 0 failed ; tests/sandbox.rs 5 passed ; tests/sandbox_p1.rs 4 passed
$ env -i PATH HOME pnpm --filter keeper oracle-updater     # keeper-oracle-updater-nokey.log (no .env in clone)
{"level":"warn","service":"oracle-updater","msg":"oracle_updater_disabled","reason":"PYTH_API_KEY_PATH unset (TODO-H13)"}  EXIT 0
$ node --test services/keeper/test/oracle-updater.test.ts  # keeper-oracle-updater-test.log: 14 pass / 0 fail
```
Tests covering each defence (all passed in the full run):
- Staleness, 120 s with the session open and 86,400 s closed: `pyth_acceptance_rules` (121 s rejected at 120 s, accepted at 86,400 s), `pyth_rejects_stale_in_session`, `pyth_trigger_open_session_age` (age_s 120), `pyth_trigger_closed_session_age` (age_s 86400) and `pyth_age_rounds_up_to_seconds`. The contract calls `get_price_no_older_than(price_id, age)` (p1.rs:11,312). Sandbox `upgrade_v1_then_pyth_secrets_cancel` covers a 25 h-old price with the session closed → `no_price`, and a 3 min-old price with the session open → `no_price`. P0: `lock_and_borrow_stale_oracle_refunds`, `trigger_stale_oracle`.
- Confidence (max_conf_bps): `pyth_acceptance_rules` accepts exactly 100 bps and rejects 100 bps + 1 unit (`conf_too_wide`). Also `pyth_rejects_wide_conf`, `max_conf_bound`, and the sandbox `conf_too_wide` case.
- Band: `pyth_acceptance_rules` (119 accepted, 118.99 → `out_of_band`), `pyth_rejects_out_of_band` and the sandbox `out_of_band` case. Owner-oracle band from P0: `update_owner_price_band` (emits `oracle_rejected`), `propose_apply_bypasses_band`, `apply_price_same_block_rejected`, `apply_price_without_proposal`.
- Negative price: `pyth_rejects_negative_price`, the sandbox `non_positive` case, and the `pyth_to_usd_e6` / `check_pyth_price` non_positive asserts.
- Expo conversion: `pyth_expo_to_usd_e6` covers expo -5, -8, 0, +1 and -6, flooring, zero_price and overflow.
- Rejection returns the position to Open: `pyth_reject_case` asserts `oracle_rejected{reason}` + `settlement_aborted{oracle_rejected}`, status Open and the price untouched. It is used by the null, failed, parse and too_long cases and by the conf, band and negative cases above. The sandbox loop asserts `status == "Open"` for every reason.
Disclosure (disclosure-grep.log, at 706d940):
- README.md:18 is the first place a reader meets the oracle: "owner oracle on nectar-core (`update_owner_price`, $180) | **fallback**, badge in UI | owner oracle (P0, disclosed); live source decided at G5".
- apps/docs-site/docs/start/live-on-testnet.md:20 has the same row; lines 29-30 say "the owner-set price" and "The P0 oracle is owner-set instead of Pyth or OutLayer"; line 45 says "owner price $180 (disclosed fallback)".
Explorer: none opened. No transaction was involved; all evidence comes from RPC views.
Verdict: FALLBACK (disclosed). This is NOT a PASS, because no live Pyth price was read by nectar-core: pyth-oracle.testnet has no NVDA update, Hermes returns 401 and the H13 key is absent. The defences are tested and the owner oracle is disclosed.
Findings for the orchestrator:
- (1) The gates.md G5 line `cargo test -p nectar-core oracle_rejects` runs 0 tests. The tests are named `pyth_rejects_*` / `pyth_acceptance_rules`.
- (2) $ORACLE and NVDA_PRICE_ID are still TODO-G5 in config.yaml and .env.example.
- (3) README and docs say "owner price $180", but the live nectar-core NVDAx price is $112 (age 623 s at 22:55Z). The README is not truthful about the current value.

## G6

### G6 — 1Click depth — FAIL — 2026-11-09T22:14Z — commit 578b006
Fresh clone /tmp/verify-G6-1794262313 at main 578b006. `pnpm i --frozen-lockfile` exit 0. Logs: evidence/G6/verifier-20261109T221158Z/.
gates.md line (`pnpm --filter keeper test:oneclick`) is out of date. The sampler is in services/feed (WO-11a), so the correct commands are:
```
$ NECTAR_IT=1 pnpm --filter feed test                       # feed-test-live.log
ok 8 - 1Click recorded fixture (F-062)   (fixture verifies; tampering breaks the signature)
ok 10 - 1Click client is dry-only (Q-007) (non-dry body refused before any network call)
ok 11 - 1Click sampler (NVDAx -> "no_route", no request; bad signature -> dropped)
ok 12 - 1Click live (NECTAR_IT=1; read-only, dry only)
    ok 1 - fetches tokens and gets a verified dry quote for the reference pair   (1086 ms)
# tests 32  pass 32  fail 0  skipped 0
$ node <scratch>/vq.mjs services/feed/test/fixtures/oneclick-quote-ref.json   # fixture-verify.json (offline, SDK 0.1.26)
verify true · correlationId f8df1d4c-99c8-4599-86f9-7bc881c4ced8 · 2026-11-09T21:34:05Z · dry true · EXACT_INPUT
nep141:wrap.near -> nep141:17208628…133a1 (USDC) · amountIn 276.2431 wNEAR · amountInUsd 1000.000000000000
amountOut 1004397702 (1004.397702 USDC) · minAmountOut 994353724 · amountOutUsd 1000.000000000000 · no depositAddress
$ curl -sS https://1click.chaindefuser.com/v0/tokens   # 22:11:58Z, HTTP 200, tokens.json + tokens-check.txt
count 216 · NVDA/xStock/stock/equity/TSLA/AAPL/SPYx/QQQx matches: none · only *x symbol: USDCx (a stablecoin) · F-063 holds
near wNEAR nep141:wrap.near 3.64 · near USDC 0.999486
$ pnpm --filter web build                                   # exit 0, web-build.log
$ PW_CHANNEL=chrome pnpm --filter web exec playwright test -g feed   # pw-feed.log
12 passed (14.1s): p1 "feed shows oracle badge, no 1Click route for NVDAx…" desktop + phone; shell /feed dark/light axe clean; testnet feed lists NVDAx; screenshots
```
The live test does not log the reference pair or the response; it runs the sampler with default config (`near:wNEAR -> near:USDC`, $1,000) and asserts at least one `verified` row and 0 dropped. The only signed quote stored in the repo is the fixture above, which re-verifies offline. I made no POST myself. The live test posted one dry quote (dry is checked in code at oneclick.ts:142, and only GET /v0/tokens and POST /v0/quote are allowed at l.13/124).
Screenshot: evidence/G6/verifier-20261109T221158Z/feed-desktop-dark.png (from this run's screens spec).
Criteria:
- Signed quote recorded and verified: PASS (live verify = true for the wNEAR->USDC ref pair; the fixture re-verifies offline).
- Assets with no route show "no 1Click route": PASS (web /feed badge for NVDAx; MCP `get_exit_capacity` returns status "no 1Click route" from a sampler `no_route` row). However, the web badge comes from a hard-coded `NO_1CLICK_ROUTE = new Set(["NVDAx"])` (apps/web/components/OracleBadge.tsx:6), not from sampler data.
- Implied depth shown on Feed: FAIL. apps/web has no oneclick/gap/depth sample consumer, so /feed never shows a depth number for the reference pair. Only the MCP `explain_limit`/`get_exit_capacity` show `gap_bps`.
- C-014: FAIL. services/feed/src/oneclick.ts:179-181 computes `gap_bps = (amountInUsd - amountOutUsd)/amountInUsd`, which is exactly the field C-014/F-064 say not to use. On the fixture it gives 0 bps. The realised `amountOut` 1004.397702 USDC against $1,000 in (token-list price) would read about -44 bps, and `minAmountOut` 994.353724 about +56 bps. The stored response keeps `amountOut`, so samples can be recomputed.
FAIL reasons: (1) the depth metric uses `amountOutUsd`, contrary to FACTS C-014/F-064; (2) /feed shows no implied depth, and the no-route badge is static rather than driven by the sampler. The gates.md wording ("Feed shows R_c or no 1Click route") alone would pass on the NVDAx badge, but the orchestrator's criteria do not. gates.md G6 command also needs to change to the feed commands above.

### G6 — 1Click depth (re-run) — PASS — 2026-11-09T22:58Z — commit fea52b7
Fresh clone /tmp/verify-G6b-1794264583 at main fea52b7. `pnpm i --frozen-lockfile` exit 0. Logs: evidence/G6/verifier-20261109T224955Z/. Dry quotes only; nothing deposited. The previous FAIL block above stays as the record.
```
$ NECTAR_IT=1 pnpm --filter feed test                    # feed-test.log
# tests 39  # pass 39  # fail 0  # skipped 0
ok 14 - 1Click live (NECTAR_IT=1; read-only, dry only)   (2.66 s, real network)
  three verified dry quotes for the reference pair; NVDAx no_route from the live token list   (asserts dropped == 0, 3 samples)
# [{"id":"wnear-usdc","samples":[[500,"3636470",0,100],[1000,"3636440",0,100],[2000,"3636378",0,100]]}]   # [usd, rate_e6, impact_bps, worst_impact_bps]
$ grep -rn "amountInUsd\|amountOutUsd" services/feed/src
services/feed/src/oneclick.ts:14:// amountInUsd / amountOutUsd are never read (amountOutUsd mirrors the input value, C-014).   # comment only
  rate_e6 = rateE6(BigInt(quote.amountIn), BigInt(quote.amountOut), decIn, decOut); worst uses minAmountOut (oneclick.ts:175-188)
  each response goes through verifyQuoteSignature; one false drops the whole set (oneclick.ts:244-269)
$ FEED_FIXTURES=1 FEED_PORT=8798 FEED_MCP_PORT=off pnpm --filter feed start ; curl -i :8798/api/oneclick   # api-oneclick-fixture.json
HTTP/1.1 200  {"as_of":"2026-11-09T22:22:14.925Z","pairs":[{"id":"wnear-usdc",...,"verified":true,"samples":[
  {"notional_usd":500,...,"rate_e6":"3627157","impact_bps":0,"worst_impact_bps":100},{"notional_usd":1000,...,"rate_e6":"3627652","impact_bps":0,"worst_impact_bps":98},
  {"notional_usd":2000,...,"rate_e6":"3627652","impact_bps":0,"worst_impact_bps":98}]}],"assets":[{"symbol":"NVDAx","status":"no_route",...}]}
$ FEED_PORT=8799 FEED_MCP_PORT=off pnpm --filter feed start (live, no fixtures) ; curl :8799/api/oneclick   # api-oneclick-live.json
oneclick_tick sets:1 dropped:0 no_route:1 ; samples 500/1000/2000 rate_e6 3635521/3635449/3635922, impact 0/0/0, worst 99/100/98; NVDAx no_route
$ pnpm --filter web build  -> exit 0 ;  PW_CHANNEL=chrome pnpm --filter web e2e   # web-e2e.log
  128 passed, 2 skipped (testnet.spec write specs self-skip without a demo key), 0 failed; oneclick.spec 3/3 x2 projects, p1.spec feed 1/1 x2
$ NEXT_PUBLIC_FEED_URL=http://127.0.0.1:8798 pnpm --filter web build && pnpm --filter web start ; GET :3100/api/indexer/api/oneclick -> 200 (fixture body)
/feed panel text (feed-panel-text.log): "1Click reference depth · As of 2026-11-09 22:22 UTC · WNEAR → USDC signature verified ·
  0.5× $500 3.627157 0 % 1 % · 1× $1,000 3.627652 0 % 0.98 % · 2× $2,000 3.627652 0 % 0.98 % · NVDAx no 1Click route"
$ curl https://1click.chaindefuser.com/v0/tokens   # v0-tokens.json
216 tokens; equity-pattern hits AVAX FRAX GMX INX ITLX SPX TRX USDCx are all crypto (SPX = eth/sol omft at $0.36); no tokenized equity (F-063)
```
Screenshot: evidence/G6/verifier-20261109T224955Z/feed-oneclick-panel.png (Playwright, chrome channel, /feed against the fixture feed). All servers (8798, 8799, 3100) stopped.
Criteria:
- Live dry quotes at 3 sizes verify: PASS (live test asserts 0 dropped and 3 samples; the sampler drops any set with a false signature).
- Impact from base units, no amountInUsd/amountOutUsd: PASS (only a comment mentions them; rate is from amountIn/amountOut with token decimals, worst case from minAmountOut).
- GET /api/oneclick documented shape (WO-11c §3): PASS in fixture and live modes (extra fields observed_at and per-sample correlation_id).
- /feed panel shows the pair's numbers and NVDAx status from the API: PASS (panel numbers equal the fixture body; OracleBadge.tsx has no route logic now; RouteStatusBadge in OneClickPanel.tsx renders only the status the feed reports).
- Web e2e full suite: PASS (0 failed).
- F-063 no tokenized equity in /v0/tokens: PASS.
Notes (not failures): wNEAR→USDC is deep enough that impact_bps is 0 at all three sizes ($500 to $2,000). In the live run rate(2×) was above rate(0.5×), so the result was clamped to 0. The depth signal comes mostly from worst_impact_bps, which is about 1 %, the minAmountOut slippage floor. The live feed logs `polling_disabled` because CORE_ACCOUNT_ID is unset by default; that is outside G6 scope. gates.md G6 line now names the feed commands; no secret was needed.

## G4

### G4 — OutLayer — PASS — 2026-11-09T22:10Z — commit d87eef6
Fresh clone /tmp/verify-G4-1794262025 (cloned at 552de76, then pulled to d87eef6, which adds the run logs and scripts/45; main later moved to 0e15ee9, which only adds FACTS). Logs: evidence/G4/verifier-20261109T2210Z/. No transactions sent; everything below is RPC view, HTTP GET or a local build.
$ near contract call-function as-read-only outlayer.testnet estimate_execution_cost json-args "$(cat packages/config/outlayer-limits.json)" network-config testnet now
  → "4000010000000000000000" yocto = 0.00400001 NEAR (100M instr / 128 MB / 30 s, input_len 512) (estimate.log)
$ near contract call-function as-read-only $CORE get_settlement json-args '{"position_id":"0"}' network-config testnet now
  → ERROR MethodResolveError(MethodNotFound). gates.md names a view nectar-core does not have (gates-get_settlement.log). The disc_bps criterion is checked from tx events below instead. Fix the gates.md line (orchestrator).
Quoter wasm: bash quoter/build.sh (rustc 1.95.0) → exit 0, sha256 3ce17749ae1b997971d97efa8f79110b586273e39bf9ca00c61a2bdf14ea6cc2, 92355 B
  GET outlayer.wasm_url (test.fastfs.io/.../3ce17749….wasm) → HTTP 200, 92355 B, same sha256. Matches config.yaml version_key and wasm_sha256 (quoter-sha.log)
Core wasm: cargo near build non-reproducible-wasm (SDKROOT per host notes) → base58(sha256) FQjNLgawvz9KmeLioJs6fdd5GdB5JAVeEfSSZfEGTFfB
  = view_account nectar-core.nectar.testnet code_hash (block 276979526) (core-hash.log)
Views (views.log): get_quoter_config enabled, outlayer.testnet, project nectar.testnet/nectar-quoter, version_key 3ce17749…, deposit 0.01 NEAR, 100 Tgas, limits 100M/128/30
  · get_state_version 1 · contract_version "nectar-core 0.1.0 p1" · get_quote 0 max_discount_bps 250 · get_quote 1 max_discount_bps 400 · positions 0 and 2 Closed
Run B trigger 6ywM8Qm53Ppf36T64biUPFNbMEwAREXQ3XvZYYnEztwr (EXPERIMENTAL_tx_status, signer keeper.nectar.testnet → nectar-core, SuccessValue):
  outlayer: Resolved project nectar.testnet/nectar-quoter version 3ce17749… source WasmUrl test.fastfs.io/…/3ce17749….wasm, wasm32-wasip2
  outlayer: execution_requested request_id 15114, sender keeper.nectar.testnet, predecessor nectar-core.nectar.testnet, limits 100M/128/30
  outlayer: execution_completed success true, instructions 135689; "Cost: 1090000000000000000000 yoctoNEAR, Refund: 8910000000000000000000 yoctoNEAR" (0.00109 charged of 0.01 deposit)
  nectar: quoter_result position 0, fills [q0 disc 250 (max 250), q1 disc 400 (max 400)]: both within [0, max]
  nectar: settled_near q0 250 bps repay 9400000000 seize 68864469 buyer1 · q1 400 bps repay 1850000000 seize 13764881 buyer2
Run A trigger 5TSasAEy2QedbkV7SEjzFpSdZb8eqJtjHABexAYvwShC (signer keeper.nectar.testnet, SuccessValue). The run pinned version_key = 0…0 on purpose, so
  outlayer.testnet receipt fails with "Smart contract panicked … Version not found", then nectar quoter_fallback {position 2, reason "failed"}, then
  settled_near q0 disc 250 = quote 0 max_discount_bps 250. Fallback path tested.
Fills equal max_discount_bps in Run B because no secrets_ref is configured yet (WO-10b). The quoter returns each quote's max. This is not evidence of discount pricing.
Attestation:
  WebFetch https://app.outlayer.ai/executions → Executions table headers ("Click an id to open its TEE attestation"), no rows rendered, 15114 not visible.
  WebFetch https://outlayer.fastnear.com/docs/getting-started → 301 to app.outlayer.ai/docs/getting-started (no per-request URL); /docs/tee-attestation gives no route either.
  WebFetch https://testnet-api.outlayer.ai/attestations/by-request/15114 (route from F-168/F-169; also curl, attestation-testnet-15114.json) → HTTP 200:
    request_id 15114 · caller_account_id keeper.nectar.testnet · transaction_hash 6ywM8Qm5… (= Run B) · project_id nectar.testnet/nectar-quoter
    wasm_hash = executed_wasm_sha256 = 3ce17749… (= version_key) · input_hash d1b6aa1c… (= quoter_requested input_sha256) · block 276979189
    tdx_quote present (base64, non-empty) · worker_measurement present (b1773e4d…). TDX quote NOT verified cryptographically (not attempted).
  Caution: https://api.outlayer.ai/attestations/15114 returns HTTP 200 for an unrelated MAINNET task (caller price-oracle.near, another wasm). Do not link it. by-request on api.outlayer.ai → 404.
Criteria: execution attested/visible OK (testnet-api attestation record; dashboard shows nothing) · disc_bps within [0,max] OK (from events, since the gates.md view is missing) ·
  cost recorded OK (estimate 0.00400001 NEAR; actual 0.00109 NEAR, refund 0.00891) · fallback tested OK (Run A) · wasm and core hashes reproduce OK.
Open: gates.md G4 line 2 (get_settlement) does not exist. Attestation is shown via API JSON, not the dashboard. Discount pricing is unproven until WO-10b.

#### G4 addendum — discount pricing from OutLayer secrets — PASS — 2026-11-09T22:51Z — commit fea52b7
Read-only; no transactions sent. Fresh clone /tmp/verify-G4add-20261109T2249Z/repo at main HEAD fea52b7. Logs: evidence/G4/verifier-addendum-20261109T2249Z/.
Inputs: evidence/G4/run-C-20261109T2240Z.log, run-D-20261109T2245Z.log (scripts/45-g4-run.sh steps C/D, scripts/35-quoter-secrets.mjs --quote 1:3000:2000),
  evidence/upgrades/run-20261109T2238Z.log (core upgrade 2, scripts/26: FQjNLgaw… → HqZaadxy…).
$ curl rpc.testnet.near.org EXPERIMENTAL_tx_status <hash> sender keeper.nectar.testnet   (tx-run-C.json, tx-run-D.json)
  Run C CS5KGXTBcZFY7QwxM8HDL9XBUFFnqupbPT8sQ9U23ZDd trigger_preliquidation #3, SuccessValue:
    outlayer execution_requested request_id 15145, secrets_ref {mm-demo, nectar.testnet}, input vol_bps 150, max_discount_bps 400
    outlayer execution_completed success:false error_message "Access denied by access condition. Check the access conditions configured by the secret owner."
      (charged 0.001 NEAR, refunded 0.009). Cause: the C1 store used Whitelist[nectar-core, nectar.testnet]; the signer is keeper. This is the expected denial.
    nectar quoter_fallback {position 3} → settled_near {quote 1, disc_bps 400 (= cap), repay 190000000, seize 1583334, buyer2}
  Run D BQscYSpn4qMzwD9fDehHbqc84gcpzs1vuK18yzVCvhBb trigger_preliquidation #4, SuccessValue:
    outlayer execution_requested request_id 15148, input vol_bps 150, max_discount_bps 400 · execution_completed success:true, 118394 instr, 236 ms,
      charged 0.0010236 NEAR, refunded 0.0089764
    nectar quoter_result fills [{quote_id 1, disc_bps 159}] → settled_near {quote 1, disc_bps 159, repay 170000000, seize 1542382, buyer2}
Recompute (quoter/src/lib.rs disc_bps, QG_SCALE 1e8, floor): min(400, 150 + floor(3000·2000·150/1e8)) = min(400, 150 + 9) = 159. Matches.
$ RPC call_function (final): get_vol_bps {"symbol":"NVDAx"} → 150 (block 276983848; set by run C set_vol_bps tx CUoyzijV…, vol_set event)
  get_quoter_config → enabled true, version_key 3ce17749…, secrets_ref {"profile":"mm-demo","account_id":"nectar.testnet"} (block 276983854)
$ EXPERIMENTAL_tx_status BH8aNKgudk1TocqgrpWm9irsdJhCCNuNUpV7KFdghoB8 sender nectar.testnet (run D1 store_secrets, tx-D1-store_secrets.json) → SuccessValue;
  on-chain args access = Logic And[Whitelist[keeper.nectar.testnet], Predecessor(Whitelist[nectar-core.nectar.testnet]), WasmHash 3ce17749…],
  accessor Project nectar.testnet/nectar-quoter, profile mm-demo; log "Updating secrets … Secrets stored".
$ curl + WebFetch https://testnet-api.outlayer.ai/attestations/by-request/15148 (attestation-15148.json) → HTTP 200:
  request_id 15148 · caller_account_id keeper.nectar.testnet · transaction_hash BQscYSpn… (= Run D) · project_id nectar.testnet/nectar-quoter · secrets_ref nectar.testnet/mm-demo
  wasm_hash = executed_wasm_sha256 = 3ce17749ae1b…6cc2 · input_hash c03a2bf9… (= quoter_requested input_sha256) · block 276983419
  tdx_quote present (6676 base64 chars) · worker_measurement present (b1773e4d…). TDX quote NOT verified cryptographically.
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   PATH += ~/.cargo/bin ~/.local/bin; SDKROOT=.../MacOSX26.5.sdk → EXIT=0 (core-build.log)
  sha256 fa2bb4f1…0f4e (404811 B) → base58 HqZaadxyZpywceMBKnjfagdn8NAMdAC5Ucn1K1MG4THX = view_account code_hash (block 276983860) = upgrade-2 deploy log.
Disclosures: MM_1_Q_BPS=3000 / MM_1_GAMMA_BPS=2000 are demo values, not a real market maker's book. They are stored in OutLayer under
  access And[signer keeper, predecessor nectar-core, WasmHash 3ce17749…]. The plaintext went to OutLayer's /secrets/pubkey endpoint
  in the request body (F-167) before client-side encryption, so the coordinator has seen these values.
Criteria: denial path → fallback at cap 400 OK · secrets path → disc_bps 159 < cap, recomputed OK · vol 150 and secrets_ref views OK · attestation for 15148 OK ·
  core code hash reproduces from fresh clone OK. Closes the "discount pricing unproven" item above.

## G3

### G3 — web E2E — PASS — 2026-11-09T21:15Z — commit 176914f
Fresh clone /tmp/verify-G3b-1794258954 (git clone /Volumes/T7/nectar-labs, main HEAD 176914f). Logs: evidence/G3/verifier-20261109T2115Z/ (01–07 + lh-*.json; screenshot-feed-phone-light.png). NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER unset.
$ pnpm i --frozen-lockfile                          → exit 0
$ pnpm --filter web build 2>&1 | tail -40           → exit 0 (21 routes, 02-build.log)
$ PW_CHANNEL=chrome pnpm --filter web e2e 2>&1 | tail -40   → exit 0
  112 passed, 2 skipped (53.8s). Skips = testnet.spec.ts:29 write flow, desktop + phone (no key, by design).
  shell.spec "<route> renders in <theme>, no horizontal scroll, axe clean": 13 routes × dark/light × desktop/phone, all ✓.
  "theme toggle switches data-theme" ✓ desktop + phone. testnet read-only (feed live capacity, api health) ✓ both.
$ LH_START=1 pnpm --filter web lighthouse            → exit 0 (script now exists: apps/web/scripts/lighthouse.mjs, lighthouse 13.6.0)
  | route | dark | light |
  | / | 100 | 100 |  | /feed | 100 | 100 |  | /borrow | 100 | 100 |
  | /quote/new | 100 | 100 |  | /console | 100 | 100 |  | /keepers | 100 | 100 |
  Theme check (05-lighthouse-theme-check.log, fullPageScreenshot mean brightness): dark 30.8–37.8, light 231.4–242.5 on all 6 routes.
$ node apps/web/scripts/check-no-branding.mjs       → exit 0 "no hackathon branding in UI sources"
$ pnpm demo:testnet                                  → exit 0 (07-demo-testnet.log)
  positions: #0 Open debt $11,250.00 · #1 Open debt $10.00 ltv 556 bps / pre-liq 7250 bps (borrower1, from the 20:57Z write run)
Write flow NOT repeated: running testnet.spec write would open position #2 on testnet. WO-3b changed only the skeleton's ARIA role and
added the lighthouse script; the borrow path did not change. Cited evidence from the c940dec run: evidence/G3/verifier-20261109T2057Z/06-e2e-write.log
(write spec 1 passed), 07-demo-after.log, 08-position1-rpc.json (position_id 1, borrower1.nectar.testnet, debt_usd_e6 10000000, Open). Position #1 still exists (above).
Key hygiene: no ed25519:[base58]{60,} in saved logs or the clone's test-results/playwright-report. Server on :3100 stopped by the script (lsof empty).
Explorer: none opened (no G3 criterion; nearblocks returns 403 to WebFetch, see §G2).
Criteria: e2e 0 failures OK · 12/12 Lighthouse ≥ 90 OK (all 100) · both themes OK · phone no h-scroll OK · branding clean OK · write flow OK (cited, not repeated).
Resolves both reasons from the 20:57Z FAIL (axe aria-prohibited-attr fixed with role="status"; lighthouse script now present).

### G3 — web E2E — FAIL — 2026-11-09T20:57Z — commit c940dec
Fresh clone /tmp/verify-G3-1794257832 (git clone /Volumes/T7/nectar-labs, main HEAD). Logs: evidence/G3/verifier-20261109T2057Z/ (01–14 + lh-*.json; screenshot-feed-phone-light.png)
```
$ pnpm i --frozen-lockfile                                   -> exit 0 (pnpm 10.34.9)
$ pnpm --filter web build                                    -> exit 0 (2 Turbopack "dynamic filesystem access" warnings)
$ PW_CHANNEL=chrome pnpm --filter web e2e                    -> exit 1: 84 passed, 28 failed, 2 skipped (54.0s)
  28 failed = shell.spec "<route> renders in <theme>, no horizontal scroll, axe clean" for
  /feed /borrow /quote/new /quote/0 /position/0 /console /keepers x dark,light x desktop,phone
  every one: axe serious "aria-prohibited-attr: 1" ->
  <div class="stack-sm" aria-busy="true" aria-label="Loading"> (apps/web/components/states.tsx:79, div with aria-label and no role)
  testnet read-only: feed lists NVDAx with live capacity, api health answers from the contract -> passed (desktop + phone)
  2 skipped = write spec (no key in read-only pass)
$ NEXT_PUBLIC_E2E_KEY_ADAPTER=1 pnpm --filter web build      -> exit 0
$ NECTAR_E2E_BORROWER_KEY=<from ~/.nectar/keys/borrower1.json, 0600, not printed> NEXT_PUBLIC_E2E_KEY_ADAPTER=1 \
  PW_CHANNEL=chrome pnpm --filter web exec playwright test e2e/testnet.spec.ts -g "borrow lands"
                                                             -> exit 0: 1 passed [desktop] (6.9s), 1 skipped [phone, "one write per run"]
$ pnpm demo:testnet (after)  -> positions: #0 Open debt $11,250.00 | #1 Open debt $10.00 ltv 556 bps (before: only #0)
  RPC list_positions(1): borrower1.nectar.testnet, NVDAx units 1000000, debt_usd_e6 10000000, status Open
$ pnpm --filter web build                                    -> exit 0 (final build; bundle sets no NEXT_PUBLIC_E2E_KEY_ADAPTER value)
$ pnpm --filter web start + pnpm dlx lighthouse@13.6.0 http://localhost:3100<route> --only-categories=accessibility \
  --chrome-flags="--headless=new <theme flag>" --output=json --quiet
  route       dark  light   (lighthouseVersion 13.6.0, mobile emulation 412 px)
  /           100   100
  /feed       100   100
  /borrow     100   100
  /quote/new  100   100
  /console    100   100
  /keepers    100   100
$ node apps/web/scripts/check-no-branding.mjs                -> exit 0 "no hackathon branding in UI sources"
$ curl SSR HTML: / testnet x35, "mock collateral" x14, hackathon x0; /feed testnet x17, "mock collateral" x8, hackathon x0
```
Theme method for Lighthouse: the app has no ?theme param; with no stored `nectar-theme` key, tokens.css follows prefers-color-scheme.
Dark = `--force-dark-mode`, light = `--blink-settings=preferredColorScheme=1`. Checked from each report's fullPageScreenshot:
mean RGB about (28,32,35) for all dark runs and about (242,244,243) for all light runs (12-lighthouse-theme-check.log).
Playwright themes come from localStorage `nectar-theme` (e2e/helpers.ts prime()); the data-theme assertion passed for all 13 routes in both themes.
Phone: Pixel 7 project at 400 px. The scroll assertion (scrollWidth - clientWidth ≤ 0) runs before the axe assertion, so it passed for all 26 phone route tests, including the 14 that later failed on axe. The "/" route passed in full, as did /talk, /security, /legal/*, /docs.
Key hygiene: no string matching ed25519:[base58]{60,} in any saved log or in the clone's test-results/playwright-report. Server on :3100 stopped.
Explorer: none opened (no criterion for G3).
Criteria: render 6 screens OK · Lighthouse ≥ 90 OK (all 100) · dark+light OK · phone no h-scroll OK · write flow lands OK (position #1) · disclosures/no branding OK.
FAIL reasons:
1. The gates.md G3 command `pnpm --filter web e2e` exits 1: 28 failures from the axe serious rule aria-prohibited-attr on the Loading skeleton (states.tsx:79) on 7 routes × 2 themes × 2 viewports.
2. gates.md lists `pnpm --filter web lighthouse`, but apps/web/package.json has no `lighthouse` script, so the gate command as written cannot run. I used the coordinator's `pnpm dlx lighthouse@13.6.0` command instead.
Note: Lighthouse scored 100 on the same routes. It audits after load, probably once the skeleton is gone. The axe check runs while the page is still loading, so the two results are not in conflict.

## G2

### G2 — testnet deploy — PASS — 2026-11-09T20:55Z — commit 5f27f44
Fresh clone /tmp/verify-G2-1794257515 (git clone /Volumes/T7/nectar-labs), no keys, no transactions sent. Full log: evidence/G2/verifier-20261109T2055Z.log
```
$ pnpm i --frozen-lockfile                         -> Done (pnpm 10.34.9)
$ pnpm demo:testnet                                -> EXIT=0
account nectar-core.nectar.testnet  version nectar-core 0.1.0 p0
Q_c $15,000.00  R_c $0.00  D_c $0.00  haircut 2500 bps  session closed; oracle $180.00 (age 320s, fresh); effective limit 7000 bps
pool: available $38,750.00  utilised $11,250.00  treasury $12.15
quotes: #0 remaining $10,000.00 max disc 250 bps live · #1 remaining $5,000.00 max disc 400 bps live
positions: #0 Open debt $11,250.00 ltv 6250 bps / pre-liq 7500 bps
$ near contract call-function as-read-only nectar-core.nectar.testnet get_collateral json-args '{"symbol":"NVDAx"}' network-config testnet now
  -> base_ltv 4000, max_nectar_ltv 7000, haircut 1000/2500, premium 300, session false, oracle 180000000, Q 15000000000, acc_fee_per_dollar_e18 5670000000000000
$ ... get_pool '{}'  -> available 38750000000, utilised 11250000000, treasury 12150000, lenders_fees 24300000
$ ... get_health '{"position_id":"0"}' -> value 18000000000, debt 11250000000, ltv 6250, pre_liq 7500, oracle_fresh true, triggerable false
$ ... preview_borrow '{"symbol":"NVDAx","units":"100000000","borrow_usd_e6":"11250000000"}'
  -> b_c 11250000000, static_limit 7200000000, premium 121500000, ok true, reason null
  (first attempt used arg name collateral_amount -> deserialize panic "missing field units"; verifier error, interface-p0.md says units)
$ ... get_quote 0/1 -> claimable 56700000 / 28350000 (sum 85050000) · get_position 0 -> Open, units 100000000, premium 121500000
$ (cd contracts/nectar-core && cargo near build non-reproducible-wasm)   SDKROOT=.../MacOSX26.5.sdk -> EXIT=0
$ (cd contracts/mock-ft && cargo near build non-reproducible-wasm)       -> EXIT=0
local base58(sha256) nectar_core.wasm = 8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV (324833 B)
local base58(sha256) mock_ft.wasm     = 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF (152268 B)
RPC view_account nectar-core.nectar.testnet code_hash 8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV  (match)
RPC view_account usdc-mock.nectar.testnet   code_hash 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF  (match)
RPC view_account nvdax-mock.nectar.testnet  code_hash 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF  (match)
$ git diff --stat b721641..HEAD -- contracts/ Cargo.toml Cargo.lock rust-toolchain.toml   -> empty (source = G1-verified)
$ RPC view_access_key_list keeper.nectar.testnet -> 1 key
ed25519:Gx7eX95TzYQq4c4pjg2ZfsHWdtUw9csLMfETKswnyXgQ FunctionCall receiver nectar-core.nectar.testnet methods [trigger_preliquidation, relay_settlement_result] allowance 1 NEAR
```
Model check vs contracts/nectar-core/tests/model.csv row demo_borrow: B_c 11250000000 = 11250000000 · static limit 7200000000 = 7200000000 ·
premium 121500000 = 121500000 · ltv_bps 6250 = 6250 · value 18000000000 = 18000000000 · pre-liq 7500 = 7500 · buyers fee 85050000 = quote
claimables 56700000 + 28350000 · lenders 24300000 = pool.lenders_fees · treasury 12150000 = pool.treasury · acc_increment_e18 5670000000000000 =
collateral.acc_fee_per_dollar_e18. No differences.
Keeper scope (D-012): only a FunctionCall key, receiver nectar-core, the two keeper methods; no FullAccess key.
Explorer (WebFetch, opened this run): https://testnet.nearblocks.io/address/nectar-core.nectar.testnet -> HTTP 403 Forbidden ·
https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet -> HTTP 403 · https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet -> HTTP 403 ·
https://api-testnet.nearblocks.io/v1/account/nectar-core.nectar.testnet -> HTTP 410 Gone. The pages did not load for an automated fetch, so this
run did not see their content; account existence and deployed code are shown by RPC view_account above. A human browser check is still open.
Verdict: PASS. Accounts exist, views answer, two quotes and one Open position, demo state matches model.csv demo_borrow, code hashes match the
wasm built from G1-verified source, keeper key scope correct, links recorded (load status: 403 to WebFetch).
Observations (not gate criteria): get_quote field `fee_debt_e18` returns 56700000 / 28350000, the same USD-e6 values as `claimable_fees_usd_e6`,
so the name suggests an e18 scale that the value does not have. relay_settlement_result is on the keeper key but is a P1 feature-gated method
that does not exist in the deployed default build.

## G1

### G1 (2.2.1 gas rows) — RE-CHECK after WO-45 — PASS — 2026-11-11T15:01Z–15:25Z — commit 48b5c5a
Same clone as §G14 re-run on HEAD (/tmp/verify-g1g14-20261111T145956Z, HEAD 48b5c5a, CONTRACT_VERSION "2.2.1-v7"). No secrets. SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
(host linker workaround, as §G11). The command, parser and diff scripts are the same as in the 13:53Z FAIL run, unchanged (gas.py, methods.py, diff.py). labels.py is new: it only writes
labels-max.txt from gas-rows.csv. Logs: evidence/G1/verifier-221b-20261111T145956Z/.
```
$ cargo test -p nectar-core --no-fail-fast -- --nocapture          # run.sh, 15:01:02Z → 15:21:13Z
unittests src/lib.rs 608/0 · sandbox 5/0 · sandbox_evm 20/0 · sandbox_p1 5/0 · sandbox_p2 6/0 · sandbox_reserve 2/0 · sandbox_v7 9/0 · sandbox_v7b 4/0   → 659 passed, 0 failed, EXIT=0
  new: sandbox_evm wo45_remove_extra_remote_chain_and_oracle_band_reject ... ok
$ git diff --stat 4a67bd6 HEAD -- contracts/{mock-ft,nectar-core,test-stubs}/src   → empty (4a67bd6 = last src commit, introduces "2.2.1-v7")
$ git diff --stat 45ed1f3 HEAD -- contracts   → contracts/nectar-core/tests/sandbox_evm.rs | 45 +   (test only; Cargo.toml / Cargo.lock unchanged)
nectar_core.wasm built 7× by the sandbox harness (cargo near build): 818668 B, sha256 2938ebf8…2df78d every time; own base58 of the file sha256 = 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk
  RPC view_account nectar-core-v2.nectar.testnet (fastnear, block 277233264) code_hash 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk → MATCH
$ python3 gas.py cargo-test-nectar-core.log gas-rows.csv     # 1272 GAS lines (1263 at 45ed1f3)
  label-only 212 rows / 103 labels, max 55.79 Tgas trigger_preliquidation(8 legs)
  tx-total   179 rows /  83 labels, max 78.60 Tgas confirm_remote_deposit(64 fitting quotes)
  receipt    877 rows /  83 labels, max 67.61 Tgas confirm_remote_deposit(64 fitting quotes)
  rows >= 100 Tgas (4 `attached,300T` prepaid rows excluded): 0
$ python3 labels.py gas-rows.csv labels-max.txt   → 175 labels (173 at 45ed1f3; +remove_extra_remote_chain, +update_owner_price(oracle_rejected))
$ python3 methods.py contracts/nectar-core/src ; python3 diff.py methods.txt labels-max.txt
  # methods: 78 (67 non-private incl. new, 11 #[private] callbacks)
  # non-private methods without a GAS row: 0 []
  # non-private methods with a row >= 100 Tgas: 0
  remove_extra_remote_chain  evm.rs:413   1 label  2.64 Tgas  (GAS,remove_extra_remote_chain,total,2637173202202)
  update_owner_price         lib.rs:1434  2 labels 2.74 Tgas  (in band) · update_owner_price(oracle_rejected) total 2606480552316 = 2.61 Tgas
  top: confirm_remote_deposit 78.60 · trigger_preliquidation 72.19 · request_remote_release 26.30 · self_settle 21.42 · resign_remote_settlement 19.12
```
The new test does more than print gas. A stranger's call fails "owner only". The owner's remove emits extra_remote_chain_removed, and get_remote_chains goes from 1 to []. A second
remove fails "unknown remote chain". The 100 USD update (last 180) returns false and emits oracle_rejected {price 100000000, last 180000000}, with no oracle_updated. Price and
oracle_updated_ns are unchanged.
Log edit: line 9881 of cargo-test-nectar-core.log is elided. It is the sandbox EVENT_JSON multiplier_source_set whose token is the public anvil test account #1 address. gitleaks flags it
as generic-api-key, a false positive (same as the 13:53Z run and §G11). No other change. `gitleaks dir` on both new evidence dirs: no leaks. Explorer: none (local sandbox; code hash from RPC).
Verdict: **PASS.** Every non-private change method of the deployed 2.2.1-v7 code has a GAS row < 100 Tgas. The cause in docs/process/gate-fail-g1-221.md (remove_extra_remote_chain unmeasured)
is resolved. The band-reject branch the FAIL run noted is now measured too. Contract source unchanged, so the deployed code needs no redeploy. Code not changed (verifier scope).

### G1 (2.2.1 gas rows) — FAIL (one change method without a GAS row) — 2026-11-11T13:53Z–14:16Z — commit 45ed1f3
Same clone as §G14 (/tmp/verify-g14-20261111T135216Z, HEAD 45ed1f3, CONTRACT_VERSION "2.2.1-v7"). No secrets. SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk (host linker workaround, as §G11).
Command exactly as §G11 (D-027 re-run), script run.sh: `cargo test -p nectar-core --no-fail-fast -- --nocapture`. Logs: evidence/G1/verifier-221-20261111T135216Z/.
```
unittests src/lib.rs 608/0 · sandbox 5/0 · sandbox_evm 19/0 · sandbox_p1 5/0 · sandbox_p2 6/0 · sandbox_reserve 2/0 · sandbox_v7 9/0 · sandbox_v7b 4/0   → 658 passed, 0 failed, EXIT=0
nectar_core.wasm built by the sandbox harness: 818668 B, sha256 2938ebf8…2df78d = base58 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk
  RPC view_account nectar-core-v2.nectar.testnet (fastnear, block 277226659) code_hash 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk → MATCH (rows measure the deployed 2.2.1 code)
$ python3 gas.py cargo-test-nectar-core.log gas-rows.csv     # parser from §G11; 1263 GAS lines
  label-only 212 rows / 103 labels, max 55.68 Tgas trigger_preliquidation(8 legs)
  tx-total   175 rows /  81 labels, max 78.72 Tgas confirm_remote_deposit(64 fitting quotes)
  receipt    872 rows /  81 labels, max 67.69 Tgas confirm_remote_deposit(64 fitting quotes)
  rows >= 100 Tgas (4 `attached,300T` prepaid rows excluded): 0
$ python3 methods.py contracts/nectar-core/src ; python3 diff.py methods.txt labels-max.txt     # default features = p1+p2, so every module counts
  77 `pub fn …(&mut self` in #[near] impls + #[init] new = 78; 11 #[private] callbacks (counted in caller totals) → 67 non-private
  measured 66/67, e.g. resign_remote_settlement+sign 19.12 · claim_owed_collateral 8.03 / (still unregistered) 8.39 · update_owner_price 2.74 ·
    set_extra_remote_chain 2.93 · withdraw_claimable 7.71 · set_quote_remote_recipient 3.63 · set_max_voluntary_fill 2.73 · new 2.40 ·
    ft_on_transfer via 38 ft_transfer_call/borrow labels, max 13.83 · trigger_preliquidation via 32 labels, max 72.32 tx-total
  MISSING: remove_extra_remote_chain (evm.rs:413, owner-only) — no GAS row; called only in unit tests (tests_evm.rs:346/370/420/505), never in a sandbox target
```
update_owner_price band path: the in-band branch (last > 0, checked_mul band compare, accepted) is gas-measured: sandbox.rs sets 180 → 155 → 140 and asserts `true` each time
(rows 2.73–2.74 Tgas). The out-of-band branch (emit oracle_rejected, return false, no storage write) is covered only by the unit test tests::update_owner_price_band; no gas row.
Per-method rule (G1 gas scope): the method has rows, so this is noted, not a FAIL reason.
Log edit: line 9895 of cargo-test-nectar-core.log (sandbox EVENT_JSON multiplier_source_set whose token is the public anvil test account #1 address) is elided, because gitleaks flags it
as generic-api-key (false positive, same as §G11). No other change. Explorer: none (local sandbox; code hash from RPC).
Verdict: **FAIL** — one reason: `remove_extra_remote_chain` has no GAS row. Every test is green, every measured method is < 100 Tgas, and the tested wasm equals the deployed 2.2.1 code.
Code not changed (verifier scope).

### G1 (v7 additions) — contract tests — PASS — 2026-11-10T13:34Z–14:05Z — commit 09c4316
Clone as §G10; SDKROOT=.../MacOSX26.5.sdk. All exit codes via bash -c (evidence/G1/verifier-v7-20261110T1334Z/summary.txt).
$ cargo test -p nectar-core                          → exit 0: unit 318/0 (incl. model_csv_vectors_match_contract_math), sandbox 5/0,
                                                         sandbox_p1 5/0, sandbox_p2 3/0, sandbox_v7 4/0
$ cargo test -p nectar-core --test sandbox -- --nocapture     → 5 passed; 0 failed
$ cargo test -p nectar-core --test sandbox_p1 -- --nocapture  → 5 passed; 0 failed
$ cargo test -p nectar-core --test sandbox_p2 -- --nocapture  → 3 passed; 0 failed
$ cargo test -p nectar-core --test sandbox_v7 -- --nocapture  → 4 passed; 0 failed (146.68 s)
$ cargo test -p mock-ft                              → 17 passed; 0 failed
$ python3 contracts/nectar-core/tests/model.py --check → model.csv OK (87 rows)
v7 criteria (sandbox_v7, against real mock-ft wasm):
  aggregate debt — aggregate_debt_two_borrowers_repay_settle ok (reason aggregate_limit, full refund, headroom, 1-over refused)
  weekend > 900 s — weekend_guard_calendar_stale_and_forced ok (+905 s → stale_price, haircut 2500, D=0; force false cannot reopen);
    unit price_older_than_900s_flips_to_weekend_parameters asserts exactly 900 s is still fresh
  multiplier bounds + announcement + split — multiplier_bounds_announce_and_split ok (+5.01 % and decrease refused, < 1 h announce
    refused, borrow refused while pending, 2-for-1 split leaves V and LTV unchanged)
  pay_to → claimable, referrer ≠ borrower — pay_to_claimable_and_referrers ok (pay_to_failed → get_claimable → withdraw_claimable;
    referrer_is_borrower refused with full refund)
Gas, v7.rs methods (max Tgas): set_session_calendar 8.93 · withdraw_claimable 7.13 · apply_corporate_action 2.49 · set_multiplier 2.43 ·
  announce_corporate_action 2.42 · force_session_closed 2.38 · register_referrer 2.25 · unregister_referrer 2.24 · set_origination_fee_bps 2.13
  (9/9). v2 borrow paths: LockCollateralAndBorrow(referrer) 12.34 · (pay_to failed) 12.21 · trigger_preliquidation(v2) 16.96; max overall
  trigger_preliquidation 50.56 (sandbox). remote.rs (sandbox_p2 totals): trigger+sign(remote) 17.94 · request_remote_release+sign 16.88 ·
  confirm_remote_deposit+vault_read+payout 12.96 · reserve_remote_position+derived_public_key 8.68 · keeper_attest_deposit+payout 7.88 ·
  relay_settlement_result 2.75 · relay_release_result 2.72 · expire_remote_reservation 2.38. All < 100 Tgas.
Not separately gas-labelled (G11 scope, not a G1(v7) criterion): remote.rs set_allow_keeper_deposit_attestation, set_vault_read_config;
  p1/p2 owner setters (set_max_conf_bps, set_oracle_source, set_outlayer_account, set_quoter_pin, set_quoter_secrets_ref, set_vol_bps,
  set_remote_chain, set_signer_config — default = ["p1","p2"] now, so these are in the default build). Private callbacks excepted.
  Full list: method-coverage.txt (its 0.00 rows are sandbox_p2's 4-field format; real totals in gas-sandbox_p2-totals.csv).
Explorer: none (local).
Result: PASS on every G1 v7 addition. Note for G11: 10 owner setters lack a gas row.

### G1 — contract tests — PASS — 2026-11-09T20:43Z — commit b721641
Re-run after GATE_FAIL_G1 (WO-2b merged at 0b3d9ac). Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G1b-1794256819
(HEAD b721641eb16f); PATH += ~/.cargo/bin ~/.local/bin; SDKROOT=.../MacOSX26.5.sdk (gates.md host notes). No secrets used.
$ pnpm i --frozen-lockfile                                         → Done in 3.7s, exit 0
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   → exit 0
     -                  Size: 324.8 KB (324833 bytes)
     - SHA-256 checksum hex : 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46
$ (contracts/mock-ft) cargo near build non-reproducible-wasm       → exit 0
     -                  Size: 152.3 KB (152268 bytes)
     - SHA-256 checksum hex : 28578356a6e426f8ea384051ff7519c51faa2bd7ed9f711e9e4f3a05f3f372c2
  (both identical to the 3bc0de8 run: WO-2b changed tests only)
$ cargo test -p nectar-core -p mock-ft -- --nocapture              → exit 0
     mock_ft unit 11 passed · nectar_core unit 88 passed (incl. model_csv_vectors_match_contract_math)
     tests/sandbox.rs 5 passed; 0 failed (31.65s): owner_setters_and_ft_gas · refunds_and_guards ·
       topup_exit_and_repay · demo_flow_matches_model · preliq_eight_buyers_gas
$ cargo test -p nectar-core 2>&1 | tail -40                        → exit 0 (gates.md line 1; sandbox 5 passed)
$ cargo test -p nectar-core --test sandbox 2>&1 | tail -40         → 5 passed; 0 failed, exit 0 (gates.md line 2)
$ python3 contracts/nectar-core/tests/model.py --check             → model.csv OK (54 rows), exit 0
$ git status --short (clone, after all runs)                       → empty
Gas (max per label, Tgas; 31 labels, all < 100): trigger_preliquidation(8 legs) 46.86 · (2 legs) 19.92 ·
  ft_transfer_call: LockCollateralAndBorrow 11.05 · FundPappusQuote 6.74 · TopUpQuote 6.61 · Repay(refund) 6.50 ·
  Repay(partial) 6.44 · invalid 6.37 · SupplyLendingLiquidity 6.26 · complete_quote_withdrawal 6.72 · claim_fees 6.61 ·
  upsert_collateral 2.34 · initiate_quote_withdrawal 2.30 · apply_price 2.26 · update_owner_price 2.11 · propose_price 2.07 ·
  set_reserve 2.03 · set_dex_depth 2.03 · set_session 2.03 · pause/unpause 1.84 · set_oracle_params 1.81 ·
  set_quote_params 1.81 · set_fee_split 1.81 · set_keeper 1.81 · fund_gas_reserve 1.79 · new 1.75 ·
  mock-ft: ft_transfer 1.94 · mint 1.73 · storage_deposit 1.73 · new 1.53
Coverage check (pub fn ...(&mut self in #[near] impl of the default build vs GAS labels): nectar-core 24/24 covered
  (ft_on_transfer via the 7 ft_transfer_call:* totals); mock-ft 5/5 covered (ft_transfer_call via the same totals).
  Excepted: #[private] callbacks nectar-core on_payout and mock-ft ft_resolve_transfer (gas counted inside their
  callers' totals). p1.rs/p2.rs are cfg(feature) and absent from the default build.
Key scope (PRD §6.10), inside demo_flow_matches_model (passed): keeper adds an FC key scoped to nectar-core
  [trigger_preliquidation, relay_settlement_result]; KEYSCOPE rows: usdc.ft_transfer with 1 yocto, usdc.ft_transfer
  without deposit, and core.pause all rejected-at-validation; contract still unpaused; trigger_preliquidation with the
  scoped key succeeded (19.92 Tgas, no receipt failures).
Explorer: none (G1 is local; no links opened).
Result: PASS. Every criterion met: builds exit 0 with recorded hashes, unit 99/99, sandbox 5/5, model match exact,
  every public change method has a gas row < 100 Tgas, key-scope test passed.
Notes (not fail reasons): the 3 key-scope refusals accept any client-side Err ("unable to broadcast the transaction");
  the test does not assert the specific access-key error. Full log 1528 lines.

### G1 — contract tests — FAIL — 2026-11-09T20:33Z — commit 3bc0de8
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G1-1794256025 (HEAD 3bc0de8cb4bd); PATH += ~/.cargo/bin ~/.local/bin;
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk (gates.md host notes). No secrets used.
$ pnpm i --frozen-lockfile                                   → Done in 3.4s
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   → exit 0
     -                  Size: 324.8 KB (324833 bytes)
     - SHA-256 checksum hex : 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46
$ (contracts/mock-ft) cargo near build non-reproducible-wasm       → exit 0
     -                  Size: 152.3 KB (152268 bytes)
     - SHA-256 checksum hex : 28578356a6e426f8ea384051ff7519c51faa2bd7ed9f711e9e4f3a05f3f372c2
  (both hashes identical to the committed evidence/G1/build-*.log)
$ cargo test -p nectar-core -p mock-ft                       → exit 0
     Running unittests src/lib.rs (mock_ft)     test result: ok. 11 passed; 0 failed
     Running unittests src/lib.rs (nectar_core) test result: ok. 88 passed; 0 failed
     Running tests/sandbox.rs                   test result: ok. 4 passed; 0 failed (42.64s)
       refunds_and_guards ok · demo_flow_matches_model ok · topup_exit_and_repay ok · preliq_eight_buyers_gas ok
$ cargo test -p nectar-core 2>&1 | tail -40                  → exit 0 (gates.md line 1)
$ cargo test -p nectar-core --test sandbox 2>&1 | tail -40   → 4 passed; 0 failed (gates.md line 2)
$ python3 contracts/nectar-core/tests/model.py --check       → model.csv OK (54 rows)
  model_csv_vectors_match_contract_math ok (assert_eq, i.e. exact; stricter than ±1 unit)
$ cargo test -p nectar-core --test sandbox -- --nocapture --test-threads=1   (gas capture; 4 passed)
  max Tgas per label: trigger_preliquidation(8 legs) 46.97 · trigger_preliquidation(2 legs) 19.99 ·
  ft_transfer_call:LockCollateralAndBorrow 11.09 · FundPappusQuote 6.76 · complete_quote_withdrawal 6.72 ·
  claim_fees 6.63 · TopUpQuote 6.62 · Repay(refund) 6.51 · Repay(partial) 6.44 · invalid 6.37 ·
  SupplyLendingLiquidity 6.27 · upsert_collateral 2.36 · initiate_quote_withdrawal 2.30 ·
  update_owner_price 2.12 · pause/unpause 1.84 · set_oracle_params 1.82 · set_quote_params 1.81 ·
  fund_gas_reserve 1.80 · new 1.75   (20 labels, same set as committed gas-sandbox.csv; all < 100 Tgas)
Explorer: none (G1 is local; no links opened).
Result: tests green, model match exact, wasm builds reproducible on this host.
FAIL reason (criterion "gas per method < 100 Tgas recorded"): 7 public change methods in the default
  (P0) nectar-core build have no gas measurement in the sandbox output or in evidence/G1/gas-sandbox.csv:
  set_keeper, set_fee_split, set_session, set_dex_depth, set_reserve, propose_price, apply_price.
  (on_payout is a #[private] callback counted inside trigger_preliquidation totals; on_quoter_result /
  relay_settlement_result / on_signature are feature-gated p1/p2 stubs, not in the default build.)
  mock-ft mint / storage_deposit / ft_transfer have no standalone gas row either (ft_transfer runs inside
  the ft_transfer_call totals); flagged for the orchestrator to decide whether G1 scope includes mock-ft.
Notes: clone tree clean after all runs (no files written by tests). Full log 1032 lines.

## WO-34 production

### WO-34 production (web + docs c9fd56b, WO-85/86 brand)
WO-87 A verifier: **PASS** (5/5 items; the deploy source commit is SELF-ATTESTED). The first write-up (commit 69b0784, 17:07Z) said INCOMPLETE because the coordinator stopped the run at about 17:06Z. The second pass, 17:13Z–17:16Z, adds item 4 (the Lighthouse run that finished at 17:08:28Z) and the item 5 e2e on port 3100. Items 4 and 5 below are the updated text. Run 2026-11-13T17:01:25Z–17:16Z. The clone's main HEAD was 345445a6c5f05ca70da62a06ef127a115d7e0481, checked out at c9fd56b0870197dce6e3d1af85116cda6f3ca2a8. `git diff --stat c9fd56b 345445a -- apps packages scripts` is empty. So is the same diff to ecb876e, the main HEAD at commit time. `git diff --stat 963ab62 c9fd56b -- apps packages` = docusaurus.config.ts (1 line) + packages/ui/src/Nav.tsx (2 lines) (clone.txt).
- Deployments: Vercel web dpl_F8NmBUE5PzpsdYRw94QWsRX85hgH and docs dpl_2gj8GAFNtCHUDHTtWYwmS55Yu2ks. Both orchestrator logs in 345445a show `"readyState": "READY"` and `"target": "production"`. The Production URL is https://nectarlabs.io for web and https://docs.nectarlabs.io for docs (deploy-logs.txt). DOCS / has last-modified 16:59:10Z, which fits the 16:57Z docs deploy. **SELF-ATTESTED:** the source commit c9fd56b and the tarball sha256 d5986558… come from the work order, not from the deploy logs. I verified the content directly instead (item 2): the WO-85/86 strings are live and the old ones are gone.
- Method: `git clone /Volumes/T7/nectar-labs` into /tmp/verify-wo87-20261113T170125Z/repo, then `git checkout c9fd56b` and `pnpm i --frozen-lockfile` (exit 0, 6 s). No secrets were used. I touched no wallet, faucet or host service. Every production probe was a public GET in system Google Chrome 157.0.8103.78 or curl. Scripts are in evidence/WO-87/scripts/.
- Explorer links opened: none (no tx is cited).
  ```
  $ scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
      https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
      https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
      https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io          (17:04Z, git mode 100755, no chmod)
  production smoke: failures 0          → exit=0 (45 s)
  $ curl -sL <page>  (17:04:10Z, raw served HTML)   "A Nectar Labs product" | "© 2026 Nectar Labs" | "Nectar Network product" | "2026 Nectar Network"
    https://nectarlabs.io/                  200   1 | 1 | 0 | 0
    https://testnet.nectarlabs.io/borrow    200   1 | 1 | 0 | 0
    https://testnet.nectarlabs.io/feed      200   1 | 1 | 0 | 0
    https://status.nectarlabs.io/           200   1 | 1 | 0 | 0
    https://docs.nectarlabs.io/             200   0 | 1 | 0 | 0   "…settlement.<br>© 2026 Nectar Labs · MIT License · testnet software · mock collateral"
    https://docs.nectarlabs.io/project/team 200   0 | 1 | 0 | 0   (other "Nectar Network": 1, table cell "founder, Nectar Network; product and mechanism design")
  $ (apps/web) node wo87-probe.mjs  (Chrome, networkidle + 4 s, footer innerText)
    SITE / · APP /borrow · APP /feed · STATUS /  @1440 and @400: footer "A Nectar Labs product · testnet · mock collateral" true,
      "© 2026 Nectar Labs · MIT License · Unaudited testnet software" true, old brand in body text 0 and hydrated HTML 0,
      console errors 0, page errors 0, hydration 0, failed requests 0
    DOCS / · DOCS /project/team  @1440 and @400 (data-theme dark): "© 2026 Nectar Labs · MIT License · testnet software · mock collateral" true,
      old brand 0 / 0, console 0, page 0, hydration 0, failed requests 0
  $ node scripts/check-no-branding-all.mjs  (at c9fd56b) → "no hackathon branding in landing, web app or docs site", exit=0
  $ (apps/web) pnpm build → exit=0 (8 s)
  $ (apps/web) PORT=3387 PW_CHANNEL=chrome npx playwright test e2e/test-assets.spec.ts e2e/claims.spec.ts
    Error: Timed out waiting 120000ms from config.webServer.   # exit=1, 0 tests run (harness: `start` = `next start -p 3100`)
  $ (apps/web) LH_BASE_URL=https://nectarlabs.io LH_ROUTES=/ node scripts/lighthouse.mjs                  (17:07:29Z)  | / | 100 | 100 |  exit=0
  $ (apps/web) LH_BASE_URL=https://testnet.nectarlabs.io LH_ROUTES=/borrow node scripts/lighthouse.mjs    (17:07:48Z)  | /borrow | 100 | 100 |  exit=0
  $ (apps/web) LH_BASE_URL=https://docs.nectarlabs.io LH_ROUTES=/,/?docusaurus-theme=light node scripts/lighthouse.mjs  (17:08:09Z)
    | / | 100 | 100 |   (docs renders data-theme dark under both Chrome flags: defaultMode dark, respectPrefersColorScheme false)
    | /?docusaurus-theme=light | 97 | 97 |   failing binary audit: color-contrast, 29 items, all footer links
      e.g. a.footer__link-item → https://testnet.nectarlabs.io: "insufficient color contrast of 1.17 (foreground #ebedf0, background #ffffff, 14px)"
    exit=0
  theme probe (Chrome colorScheme emulation): SITE / and APP /borrow → body bg rgb(13, 15, 18) under prefers dark, rgb(249, 250, 251) under light;
    DOCS / under prefers light → data-theme dark; DOCS /?docusaurus-theme=light under prefers dark → data-theme light
  $ (apps/web @ c9fd56b) PW_CHANNEL=chrome npx playwright test e2e/claims.spec.ts e2e/test-assets.spec.ts   (no PORT; 3100 listeners before 0)
    Google Chrome 157.0.8103.78 · 28 passed (13.8s) · exit=0 · 3100 listeners after 0
  ```
1. smoke-prod.sh with SITE APP DOCS STATUS and the 5 legacy pairs: **PASS**. It exited 0 with 0 failures (prod-smoke-20261113T170410Z.log).
2. Footer text and copyright on SITE /, APP /borrow, APP /feed, STATUS /, DOCS / and DOCS /project/team, with no old brand strings: **PASS** (served-html.txt, html/, probe/probe.log).
   - The 4 web pages show both new lines in the served HTML and in the hydrated footer at both widths.
   - The docs footer shows "© 2026 Nectar Labs · MIT License · testnet software · mock collateral". At c9fd56b the docs footer config (docusaurus.config.ts `copyright`) has no "A … product" line, so I checked the copyright line and the testnet/mock-collateral text there.
   - "Nectar Network product" and "2026 Nectar Network" appear 0 times in the served HTML, the hydrated HTML and the body text of all 6 pages.
   - Outside the criterion, flagged for the orchestrator: DOCS /project/team still says "founder, Nectar Network; product and mechanism design" in the team table. It matches neither banned string.
   - Screenshot: evidence/WO-87/probe/site-footer-hydrated.png (SITE / footer at 1440 px).
3. 0 console or hydration errors on SITE /, APP /borrow, STATUS / and DOCS / at desktop (1440) and 400 px: **PASS**. All 8 loads show 0 console errors, 0 page errors, 0 hydration messages and 0 failed requests. APP /feed and DOCS /project/team are also 0 at both widths (probe/probe.log).
4. Lighthouse a11y on production SITE /, APP /borrow and DOCS /, both themes, ≥ 90: **PASS** (lighthouse-{site,app,docs}.log, lighthouse-summary.txt, lighthouse-docs-light-contrast.txt).
   - SITE /: 100 dark, 100 light. APP /borrow: 100 dark, 100 light. 0 failing binary audits. The probe shows the web pages follow prefers-color-scheme, so the script's two Chrome flag sets render the two themes.
   - DOCS: the Chrome flags do not switch the theme (respectPrefersColorScheme false), so I took dark = `/` (100 under both flags) and light = `/?docusaurus-theme=light` (97 under both flags). The probe confirms the query sets data-theme light.
   - **Flagged (score still ≥ 90):** in the docs light theme, axe fails color-contrast on 29 footer link items: foreground #ebedf0 on a computed background of #ffffff, 1.17:1. This is the footer-contrast risk the WO names. WO-86B changed only the copyright string (`git diff 963ab62 c9fd56b`), so this deploy did not introduce it. I did not check whether real users see light text on white or whether axe misreads the footer background (no light-theme screenshot; one-screenshot limit).
5. Branding check on c9fd56b: **PASS**, exit 0 (branding.log). e2e claims.spec + test-assets.spec with system Chrome: **PASS**, 28 passed (14 tests × desktop + phone), exit 0 in 14 s. I ran it in the c9fd56b clone after the build (web-build.log, exit 0). The config's own webServer (`next start -p 3100`) served it; 3100 had 0 listeners before and after, and no PORT was set (e2e-chrome-3100.log). The first attempt at 17:05Z set PORT=3387, timed out in the webServer and ran 0 tests (e2e-chrome.log). That was a harness error and is superseded.
- Secrets: `gitleaks dir evidence/WO-87` finds no leaks, and there are 0 home paths in evidence/WO-87. evidence/WO-87/snapshot.txt records the copy time.

### WO-34 production (docs 963ab62, WO-82)
WO-83 A verifier: **PASS** (5/5 items, 1 part SELF-ATTESTED, marked below). Run 2026-11-13T15:48:46Z–15:49:54Z. Clone commit 5ce3c27b0e320cfda80ce36fee5fcbc64ce5c8d4. 963ab62 is an ancestor of the clone commit, and `git diff --stat 963ab62 HEAD -- apps/docs-site` is empty (run.txt).
- Deployment: Vercel docs dpl_AjmdN8xuNAJJEzXMb41N3uTTBb1r. evidence/WO-34/deploy-docs-cli-20261113T154455Z.log shows `"readyState": "READY"`, `"target": "production"` and "Production URL: https://docs.nectarlabs.io". DOCS / returns last-modified 15:46:00Z and age 217 s at 15:49:38Z, which fits a 15:45Z deploy. **SELF-ATTESTED:** the source commit 963ab62 and the tarball sha256 75ba6d26… come from the work order, not from the deploy log. I checked the content directly instead (items 2 and 5): the WO-82 text is live, and the old surname appears nowhere. Web is unchanged (dpl_4ExxeLH…, 1a95022; see §"WO-34 production (web 1a95022, WO-74)").
- Method: `git clone /Volumes/T7/nectar-labs` into /tmp/verify-wo83-20261113T154846Z/nectar-labs. No `pnpm i` was needed: the smoke scripts use only curl and bash. No secrets were used. I touched no wallet, faucet or host service. Every probe was a public GET or HEAD. The clone ended with no untracked files. Script: evidence/WO-83/scripts/wo83.sh.
- Explorer links opened: none (no tx is cited).
  ```
  $ scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
      https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
      https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
      https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io
  web smoke https://testnet.nectarlabs.io: routes 28, failures 0
  docs smoke https://docs.nectarlabs.io: pages 56, assets 6, failures 0
  ok   HSTS https://docs.nectarlabs.io/ · ok   CSP https://docs.nectarlabs.io/ · ok   no noindex https://docs.nectarlabs.io/
  production smoke: failures 0          → exit=0 (49 s), 43 ok lines
  $ curl -sSI https://docs.nectarlabs.io/   (15:49:38Z)
  HTTP/2 200 · content-security-policy: frame-ancestors 'none' · strict-transport-security: max-age=63072000
  last-modified: Fri, 13 Nov 2026 15:46:00 GMT · age: 217 · x-vercel-cache: HIT
  /project/team:       200, "Kunal" ×4, "drall" (case-insensitive) ×0, "hackathon" ×0, CSP + HSTS as above
    text: "Team of one, confirmed by Kunal on 2026-11-13 (handoff H10). Name Role Contact Kunal founder, Nectar Network; …"
  /project/prior-work: 200, "Kunal" ×2, "drall" ×0, "hackathon" ×0, CSP + HSTS as above
    text: "Baseline before 2026-11-09. Before the build window, Kunal researched exit-liquidity gaps for tokenized stocks …"
  /docs/project/team -> 308 https://docs.nectarlabs.io/project/team
  /docs/project/prior-work -> 308 https://docs.nectarlabs.io/project/prior-work
  /docs/quick-start -> 308 https://docs.nectarlabs.io/quick-start
  /docs/operations/monitoring -> 308 https://docs.nectarlabs.io/operations/monitoring
  DOCS/sitemap.xml: 56 pages, non-200 0, "hackathon" (case-insensitive) total 0
  ```
1. smoke-prod.sh with SITE APP DOCS STATUS and the 5 legacy pairs (full origins): **PASS**. It exited 0 with 0 failures. I ran it by path from the clone with no chmod: git mode is 100755 (evidence/WO-83/prod-smoke-20261113T154846Z.log).
2. DOCS /project/team and /project/prior-work contain "Kunal" and no surname: **PASS**. Both pages return 200. "Kunal" appears 4 times on team and 2 times on prior-work. "Drall" (the surname WO-82 removed; see the 5402df0 diff) appears 0 times on either page, case-insensitive. That includes the handle form "kunal-drall". The prior-work page uses "build window", the WO-82 wording (body_project_*.html, probe-20261113T154846Z.txt).
3. DOCS /docs/<path> 308 → /<path>: **PASS**. Four sitemap paths each return 308 to the same path without the /docs prefix, on the same host (probe-20261113T154846Z.txt).
4. CSP + HSTS on DOCS: **PASS**. DOCS /, /project/team and /project/prior-work all send `content-security-policy: frame-ancestors 'none'` and `strict-transport-security: max-age=63072000`, and smoke-docs reports ok for both (hdr_project_*.txt). Note: the CSP holds only `frame-ancestors`, the same policy the earlier smoke runs accepted.
5. Branding, no "hackathon" on DOCS pages: **PASS**. I fetched all 56 locations in DOCS/sitemap.xml: all returned 200 and none contains "hackathon", case-insensitive. I checked the server HTML only. The docs site is statically rendered and has no feature flags, so the SSR-vs-hydrated gap seen on the web app does not apply (sitemap.xml, probe-20261113T154846Z.txt).
- Secrets: `gitleaks dir evidence/WO-83` finds no leaks, and there are 0 home paths in evidence/WO-83. No screenshot was taken: every assertion is header- or text-level.

### WO-34 production (web 1a95022, WO-74)
WO-78 verifier, **PASS** (5/5 items; 2 parts are SELF-ATTESTED, marked below), 2026-11-13T14:21:42Z–14:25:09Z. Clone commit 2cd7a6e3f20d32c0058fe7bbe9e9001794cf9b47. The product is 1a95022: `git diff --stat 1a95022 HEAD -- apps packages` is empty.
- Deployments: Vercel web dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K. evidence/WO-34/deploy-web-cli-20261113T135102Z.log shows `"readyState": "READY"` and "Production URL: https://nectarlabs.io". Docs are unchanged at dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE (c95cd0c): DOCS / has last-modified 02:03:23Z and age 44408 s at 14:23Z. **SELF-ATTESTED:** the source commit 1a95022 and the tarball sha256 74626b00… appear only in STATE:70/:76 (orchestrator), not in the deploy log. The public pages show no commit or dpl id (0 `dpl_` strings in the /borrow HTML). What I verified directly: production /borrow ships the WO-74 code, and c95cd0c does not have it. `git diff --stat c95cd0c 1a95022 -- apps` lists only TestAssets.tsx (+3/−1), BorrowComposer.tsx (+1/−1) and e2e/test-assets.spec.ts (clone.txt).
- Method: `git clone /Volumes/T7/nectar-labs` into /tmp/verify-wo78-20261113T142142Z/nectar-labs (APFS), then `pnpm i --frozen-lockfile` (exit 0, 11 s). No secrets were used and no wallet was connected. I made no claim from any account, did not use demo.nectar.testnet or any wallet profile, and touched no host service. Every probe was a public read. At the end, the clone's only untracked file is the probe script. Scripts are in evidence/WO-78/scripts/.
- Explorer links opened: none (no tx is cited).
  ```
  $ scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
      https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
      https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
      https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io
  web smoke https://testnet.nectarlabs.io: routes 28, failures 0
  docs smoke https://docs.nectarlabs.io: pages 56, assets 6, failures 0
  production smoke: failures 0          → exit=0 (36 s), 43 ok lines
  $ curl -sL https://testnet.nectarlabs.io/borrow (14:23:19Z) → 200, 0 redirects, 14 chunks
    onClaimed in /_next/static/immutable/chunks/3htcm-0feao4j.js:
      function T({onClaimed:e}={}){let{config:a,views:l}=(0,b.useChain)(),{accountId:i, …
      ,blockOnPause:!0,children:[(0,t.jsx)(T,{onClaimed:eT.reload}),eR.data&&V?…
    test-assets-connect marker in the same chunk; chunks with onClaimed: 1
    x-vercel-cache HIT, age 1873 s (cached ≈ 13:52Z, after the 13:51Z deploy), etag "d3e1527c2df7e646647a43dc8a22ceeb"
  $ curl -sL https://nectarlabs-app.vercel.app/borrow (14:23:26Z) → final https://testnet.nectarlabs.io/borrow, 200, 1 redirect, 14 chunks
    same onClaimed lines; diff of chunk path + sha256 lists (app vs legacy) → identical, 14 chunks
  $ (apps/web) node wo78-probe.mjs  (Google Chrome, networkidle + 4 s, read-only)
    https://testnet.nectarlabs.io/borrow @1440: status 200, console errors 0, page errors 0, hydration 0, failed requests 0,
      test-assets: "Get test assets: connect a wallet first. Mock assets, no value"
    https://testnet.nectarlabs.io/borrow @400:  same, all 0
    https://nectarlabs.io/ @1440: status 200, all 0, h1 "Borrow against stocks without fire-sales."
    https://nectarlabs.io/ @400:  status 200, all 0
    total console+page+hydration errors: 0 → exit=0
  $ (apps/web) LH_BASE_URL=https://testnet.nectarlabs.io LH_ROUTES=/borrow node scripts/lighthouse.mjs
    | /borrow | 100 | 100 |  (dark | light) → exit=0; reports fetched 14:24:29Z / 14:24:37Z, 0 failing binary a11y audits
  ```
1. smoke-prod.sh with SITE APP DOCS STATUS and the 5 legacy pairs (full origins): **PASS**. Exit 0 with 0 failures, run by path from the clone with no chmod (evidence/WO-78/prod-smoke-20261113T142243Z.log).
2. /borrow chunk marker: **PASS** (marker.txt, chunk-sums-app.txt, chunk-sums-legacy.txt). testnet.nectarlabs.io/borrow serves 1 chunk with the TestAssets `onClaimed` prop and the composer's `onClaimed:…reload` call. That is the WO-74 change. nectarlabs-app.vercel.app/borrow 308s to testnet.nectarlabs.io/borrow, and the page it lands on references the same 14 chunks with the same sha256. Note: the legacy origin redirects every path, so its "redirect target" is the APP host itself. The check proves the redirect lands on the WO-74 build, not that a second deployment serves it.
3. Hydrated Chrome on APP /borrow and SITE /: **PASS**. 4 loads (2 widths each) show 0 console errors, 0 page errors, 0 hydration messages and 0 failed requests (probe/probe.log, probe/probe.json). /borrow renders the test-assets block in its no-wallet state ("connect a wallet first"). Screenshot: evidence/WO-78/probe/app-borrow-hydrated.png.
4. Lighthouse a11y on APP /borrow, both themes: **PASS**, 100 dark and 100 light, both ≥ 90 (lighthouse-app-borrow.log, lighthouse-summary.txt).
5. Cited, not re-run (item5-cites.txt):
   - G9 run 9 web-delta specs (§G9 run 9 item 3): evidence/G9/run9-20261113T141044Z/e2e-chrome.log ends "28 passed (21.7s)". That is test-assets.spec.ts + claims.spec.ts × desktop + phone with PW_CHANNEL=chrome, including the WO-74 case. This was a verifier run on d863f55, whose apps/ match 1a95022.
   - **SELF-ATTESTED:** the orchestrator's production QA log, evidence/WO-74/prod-qa-check-20261113T140705Z.log (49 lines). The throwaway account's /borrow balance reads "Balance 0.00 NVDAx" (line 30), then "Balance 5.00 NVDAx" (line 43) after the claim, with no reload. The key line shows only "privkey: typed into 1 text field". I did not re-run it (the WO forbids claims). Its last line still shows "••• borrow" disabled after 5 units were entered, as G9 run 9 note (b) recorded. README claims no hosted borrow, so this is not counted.
- Secrets: `gitleaks dir evidence/WO-78` finds no leaks, and there are 0 home paths in evidence/WO-78.

### WO-34 production (custom hosts) (WO-67 A): PASS (8/8 items; tooling notes in items 1, 2 and 5), 2026-11-13T02:05Z–02:40Z, deployed commit c95cd0cf9d3f56f570ba3847a9c8aed370e688e0
- Deployments (from the work order): Vercel web dpl_Bm1uwQcXjHaUHWqizUzUiyq79vWm and docs dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE. Railway Feed: code 3974b5b, deploy 8acfc7a5, env FEED_CORS_ORIGINS = SITE, APP, STATUS.
- Hosts: SITE https://nectarlabs.io · APP https://testnet.nectarlabs.io · DOCS https://docs.nectarlabs.io · STATUS https://status.nectarlabs.io · FEED https://feed-production-2f2776c9.up.railway.app.
- Fresh clone: `git clone /Volumes/T7/nectar-labs` into /tmp/verify-wo67-20261113T0205Z/repo, then checkout b7fa381. `git diff --stat c95cd0c b7fa381 -- apps packages services contracts` printed nothing (exit 0). `pnpm install --frozen-lockfile` took 10.8 s in /tmp. PW_CHANNEL=chrome. Everything was read-only: nothing was signed, and the host services on :8788–:8791 and :8545 were not touched. Probes were added in the clone and copied to the evidence folder. WebFetch was not used because no explorer link is part of this order.

1. `scripts/deploy/smoke-prod.sh SITE APP DOCS STATUS <5 legacy pairs as full origins>`: **PASS** (A/prod-smoke-20261113T020657Z.log).
   - Tooling note: in the fresh clone the exact command exits 126 with "Permission denied" (A/prod-smoke-20261113T020556Z.log). All 67 `*.sh` files are git mode 100644. /Volumes/T7 is exFAT (noowners), where every file shows +x, so the main checkout does not show the problem. smoke-prod.sh also runs smoke-web.sh and smoke-docs.sh by path, so `bash scripts/deploy/smoke-prod.sh` would fail too. This is not a product assertion.
   - Re-run from a byte-identical copy of scripts/deploy with +x in /tmp. The sha256 of the copied and the cloned files are both in the log. Result: exit 0, 43 ok, 0 FAIL ("production smoke: failures 0").
     - web smoke: routes 28, failures 0.
     - docs smoke at https://docs.nectarlabs.io: pages 56, assets 6, failures 0.
     - Host split: SITE / and /about 200. SITE /borrow 308 → APP/borrow. APP / 307 → APP/feed. APP /about 308 → SITE/about. www → apex 308.
     - Status host: STATUS / 200. SITE /status and APP /status 308 → STATUS/.
     - Docs: APP /docs 308 → DOCS/. APP /docs/start/quick-start?x=1 308 → DOCS/start/quick-start?x=1. DOCS /docs/start/quick-start 308 → DOCS/start/quick-start.
     - Legacy: all 5 legacy origins 308 /feed?y=2 → new origin /feed?y=2, path and query kept.
     - Headers: HSTS and CSP present on APP /feed, SITE /, STATUS / and DOCS /, and no noindex on any of them.
2. Deployed commit: **PASS by content**. Note: neither the web nor the docs reports a commit (A/a2-commit-20261113T020743Z.log, A/a2-docs-equivalence-prodenv-*.log).
   - Feed /health reports `"commit":"3974b5bb2df4ff98772c758621a68932db30f653"`. `git diff --stat 3974b5b c95cd0c -- services/feed` is empty, so the Feed code is c95cd0c's. The CORS env change is live (item 7).
   - Web: /api/health on APP and SITE answers ok true, deployed true, core nectar-core-v2.nectar.testnet, version 2.2.1-v7, and the pool. It has no commit or build-id field, and the HTML exposes none either. The tie to the commit is the content. The features merged last (WO-62b status host and legacy 308s, WO-64 docs at the root, WO-62c "Get test assets") all answer (items 1, 3, 4). The last product-code commit before c95cd0c is 044d340, and `git diff --stat 044d340 c95cd0c -- apps packages services contracts` lists only apps/web/scripts/crawl*.mjs.
   - Docs: I ran `DOCS_URL=https://docs.nectarlabs.io npx docusaurus build` from the clone. The default-env build uses localhost hosting and does not compare. Results:
     - main.d34b8a10.js (sha256 3c673dfd…) and styles.159040d2.css (5cd0ed9a…) are byte-identical to the served files.
     - 76 of 77 runtime chunk hashes are equal. The one other chunk (6809) differs only in minifier variable names (`f` ↔ `i`). So runtime~main differs (local afb5c6ce, served c967a54e), and every HTML page differs in that reference.
3. Hydrated Chrome on SITE / and STATUS /: **PASS** (A/probe/probe.json, probe.log, wo67-probe.mjs; screenshot A/probe/site-landing-hydrated.png).
   - 4 loads (1440 and 400 px, networkidle + 4 s), all 200: 0 console errors, 0 page errors, 0 hydration messages.
   - Landing: 3 sentences name Base, and 0 of them lack "local fork" (both widths). The #chains innerText with JS off equals the hydrated one.
   - STATUS /: h1 "Status", title "Status · Nectar Labs".
4. "Get test assets": **PASS**.
   - APP /borrow with no wallet (the connect-prompt state): 1 `data-testid="test-assets"` and 1 `test-assets-connect`. Text: "Get test assets: connect a wallet first. Mock assets, no value".
   - SITE /, /about, /security, /changelog, /talk, /legal/privacy and STATUS /: 0 test-assets elements and 0 "Mock assets, no value". SITE /changelog contains the words "Get test assets" as a changelog line; there is no button there.
5. Real wallet selector on APP: **PASS** (A/wallets/inventory-wallets.log, data-inventory.md/.json).
   - Command: `E2E_INVENTORY=1 INV_SITE=SITE INV_APP=APP E2E_BASE_URL=APP PW_CHANNEL=chrome npx playwright test --project=inventory --grep 'every wallet|zero CSP'`.
   - "every wallet the selector lists" ✓ (1.2 min). 6 wallets, each "sandboxed frame loaded": Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI. 0 CSP violations per wallet, and "CSP violations in the console: 0". Nothing was signed.
   - The companion "zero CSP violations" test failed on its first assertion, `pages.length > 0`. My --grep left out the page passes, so this is a scoping artifact of my command, not a violation.
6. Lighthouse a11y + crawl: **PASS** (A/lighthouse/*.log, A/crawl/).
   - Lighthouse: `LH_BASE_URL=… LH_ROUTES=… node scripts/lighthouse.mjs`. SITE / scores dark 100 and light 100. APP /borrow scores dark 100 and light 100. Exit 0 both.
   - Crawl: `node apps/web/scripts/crawl.mjs --site SITE --app APP --docs DOCS --status STATUS --legacy nectarlabs.vercel.app=site,nectarlabs-app.vercel.app=app,nectar-labs-web.vercel.app=app,nectarlabs-docs.vercel.app=docs,nectar-labs-docs.vercel.app=docs --polite`, 02:06:57Z–02:23:41Z.
     - **PASS on the product checks.** Summary line: "crawl: 84 internal (rendered: site 15, app 10, status 1, docs 56), 41 external, 4 failures, 0 our console errors, 0 page loads with third-party network failures". Polite mode, 4 variants, not truncated.
     - Every internal route ends at 200. The docs sitemap has 56 URLs and 0 unlinked. 29 warnings, all external-soft bot walls.
     - 13 of the 17 redirect checks pass. These include the SITE, APP and STATUS /docs/<rest> → DOCS/<rest> checks, SITE /docs?x=1 → DOCS/?x=1, SITE /status?x=1 → STATUS/?x=1, STATUS app and landing routes, and the 5 legacy hosts with path + query kept.
     - **Script exit 1, 4 failures, none a product failure:**
       - (a) APP / → 307 `location: /feed`, a relative URL. The script wants the absolute https://testnet.nectarlabs.io/feed, which is the same target. This is the same class as WO-34v and WO-34v3.
       - (b) STATUS /status → 308 `location: /`, a relative URL. The script wants https://status.nectarlabs.io/, the same target.
       - (c) www.nectarlabs.io/talk → 308 https://nectarlabs.io/talk. crawl-hosts.mjs:87 expects **301**. FACTS F-456 records 308 for this project-domain redirect, and smoke-prod.sh expects 308 and passes, so the crawler contradicts F-456.
       - (d) External https://feed-production-2f2776c9.up.railway.app/health (linked from DOCS /integrate/feed-rest) returned status 0 once. Re-probed after the crawl: 5/5 200 with the crawler's own request (same user-agent, 10 s timeout), 330–660 ms, and 3/3 200 with curl. /health also answered 200 at 02:07Z, 02:09Z and 02:15Z. I count this as a transient.
7. Feed: **PASS** (A/a7-feed-20261113T020939Z.log).
   - /health: 200, ok true, lag 0, source views, events_indexed 0, history "unavailable".
   - Allowed: SITE, APP and STATUS each get an exact-origin `access-control-allow-origin` + `vary: Origin` on GET /health, and a 204 preflight on /mcp.
   - Refused: https://evil.example.com gets no ACAO on GET and a 403 preflight. https://docs.nectarlabs.io and https://nectarlabs.vercel.app are refused the same way; neither is configured.
8. Oracle: **PASS**, plus a note (A/a8-oracle-20261113T020948Z.log).
   - `get_exit_capacity {"symbol":"NVDAx"}` (rpc.testnet.fastnear.com, final, 02:09:48Z): oracle_age_s "39508" (< 86,400), oracle_fresh true, oracle_source "Owner", price 135000000, session_open false (outside_hours).
   - Refresher as found: **not running**. nectar.testnet has 1 access key (FullAccess) and no FunctionCall key for `update_owner_price`, so there is no refresh tx to show. This matches the work order (staged, H-ORACLE WAITING).
   - At this age, oracle_age_s passes 86,400 at about 2026-11-13T15:11Z unless the price is refreshed.

### WO-34 production (release 3) (WO-34v3): PASS (4/4 items; crawl script exit 1 on 2 redirect assertions outside the criterion, disclosed), 2026-11-12T16:40Z–17:01Z, release 3 5f011bb7f2ddc1df18c11c1464cdf12f3b993dd0
- Deployments (from the dispatch line): Vercel web dpl_BJNxqxnSZQWHtiouXYeWknkScxtY and docs dpl_DQubre8taPieUo4EBshyyrRNVjcT; Railway feed built from 3974b5b (services/feed is unchanged since). Release 3 = release 2 4c2a0bb + 2 docs lines (Feed links → /health). The hosted docs serve the release-3 change: APP /docs/integrate/feed-rest and /docs/operations/monitoring each have exactly 1 Feed href, `https://feed-production-2f2776c9.up.railway.app/health`. FEED /health → 200; FEED / (control) → 404.
- URLs: SITE https://nectarlabs.vercel.app · APP https://nectarlabs-app.vercel.app · DOCS = APP/docs (origin https://nectarlabs-docs.vercel.app) · FEED https://feed-production-2f2776c9.up.railway.app.
- Fresh clone of 5f011bb at /tmp/verify-wo34v3-20261112T1640Z (`git clone /Volumes/T7/nectar-labs`, checkout 5f011bb). `pnpm install --frozen-lockfile` ran in /tmp (10.7 s). Scripts were not modified. One probe was added in the clone (copied to claims/). PW_CHANNEL=chrome (installed Chrome). Everything was read-only and nothing was signed. No host services were stopped. WebFetch was not used because no explorer link is part of this order.

1. Landing #chains, server HTML vs hydrated (the WO-34v2 FAIL): **PASS** (claims/chains.json, claims/wo34v3-chains-probe.mjs, screenshot claims/chains-hydrated.png).
   - Method: SITE / opened twice in Chrome at 1440 px. (A) JavaScript disabled, which gives the server HTML as rendered. (B) Hydrated: networkidle, then 4 s, then #chains scrolled into view. Captured 16:42Z.
   - The #chains innerText of A equals that of B after whitespace normalisation, and textContent is equal too (`equal_innerText` true, `equal_textContent` true). #chains carries data-feature "solana_remote", and the hydrated page renders the #nsol node only (no #nbase), as with config features.base false.
   - Both texts begin (identical): "NEAR holds the book. Solana holds the stock. A remote loan pays out only after an attested read proves the collateral sits in the vault under the key NEAR derives for that position. The Base leg runs on a local fork of Base Sepolia, not on Base Sepolia itself. NEAR testnet, the hub nectar-core …" (the full texts are serverText and hydratedText in chains.json).
   - Every sentence that names Base says "local fork". There are 3 in #chains and 3 in the hydrated body, and 0 lack "local fork" (the same holds in the server text):
     - heading: "NEAR holds the book. Solana holds the stock." It does not name Base, because the Base node is off, so it makes no Base claim to qualify;
     - intro: "The Base leg runs on a local fork of Base Sepolia, not on Base Sepolia itself.";
     - step 03: "…asks the MPC signer for Ed25519 (Solana) or secp256k1 (the Base Sepolia local fork).";
     - step 04: "On the Base Sepolia local fork, NectarVaultBase checks EIP-712 with ecrecover."
   - Hydrated landing: 0 console errors.
2. Crawl `node apps/web/scripts/crawl.mjs --site https://nectarlabs.vercel.app --app https://nectarlabs-app.vercel.app --docs https://nectarlabs-app.vercel.app/docs --out … --polite` (PW_CHANNEL=chrome, 16:42Z–16:59Z): **PASS on the item-2 criterion; the script exits 1** (crawl/crawl.json, crawl.md, crawl.log).
   - Summary line: "crawl: 90 internal, 41 external, 2 failures, 0 our console errors, 12 page loads with third-party network failures". Polite mode (concurrency 1, 1.5 s delay), 4 variants (dark/light × 1440/400), not truncated.
   - 0 broken internal links: all 90 internal routes (SITE, APP, APP /docs/*) end at 200.
   - 0 of our console errors.
   - Third party: 12 page loads, all on /borrow, /quote/new, /console and /feed. Each is "CORS refusal of a test.rpc.fastnear.com answer (throttled: no CORS header on the 429)", from hosts test.rpc.fastnear.com and rpc.testnet.fastnear.com. This is the known FastNEAR noise, and the SDK falls back.
   - Warnings: 29 external-soft (testnet.nearblocks.io 403, solana.com and explorer.solana.com 429). These are bot walls and count as warnings.
   - The 2 "failures" are redirect assertions, not links. Both are outside the item-2 criterion, and both appear identically in WO-34v (crawl and crawl-rerun at ca34111, classified there as script/N/A).
     - (a) APP / → 307 with `location: /feed`, a relative path. The script string-compares against the absolute `https://nectarlabs-app.vercel.app/feed`, which is the same target. curl confirms 307 loc=/feed.
     - (b) www.<site>: status 0. curl to https://www.nectarlabs.vercel.app/talk gives "SSL: no alternative certificate subject name matches target host name", because a *.vercel.app host has no www. N/A.
   - The other 3 redirect checks pass: SITE /borrow?asset=NVDAx 308 → APP, SITE /docs/security/audits 308 → APP, APP /security 308 → SITE.
3. Spot regression (curl.log, feed-health.json, wo34v3-curl.sh): **PASS**.
   - x-robots-tag: 0 header lines on SITE /, APP /feed, APP /docs, and on 4 docs pages (/docs/start/quick-start, /docs/integrate/feed-rest, /docs/integrate/feed-mcp, /docs/operations/monitoring). All answer 200. (My first guess, /docs/operate/monitoring, is not in the sitemap and answers 404; the sitemap path is the one listed.)
   - Docs origin: /docs/, /docs/start/quick-start and /docs/integrate/feed-rest answer 200 with `x-frame-options: DENY`, a CSP containing `frame-ancestors 'none'`, and HSTS with preload. `/` answers 307 → /docs/ with HSTS only (F-453).
   - Feed /health: ok true, source "views", `history` "unavailable", `chain_head_source` "view_block", chain_head 277388985 = last_indexed_block 277388985. `rpc` lists 4 endpoints (test.rpc.fastnear.com, rpc.testnet.fastnear.com, near-testnet.drpc.org, testnet-rpc.intea.rs), last_served test.rpc.fastnear.com, failovers 0, cooling [].
   - CORS: SITE and APP each get an exact-origin `access-control-allow-origin` on GET /health and a 204 preflight on /mcp. https://evil.example.com gets no ACAO on GET and a 403 preflight.
4. Lighthouse a11y on the landing (script unchanged, `LH_BASE_URL=https://nectarlabs.vercel.app LH_ROUTES=/`, Lighthouse 13.6.0): **PASS**. / scores dark 100 and light 100, exit 0 (lighthouse/landing.log).

### WO-34 production (release 3974b5b) (WO-34v2): FAIL (1 reason), 2026-11-12T15:00Z–15:18Z, release 3974b5bb2df4ff98772c758621a68932db30f653
- Deployments: Vercel web dpl_5YACVWKHkdB6RKZY788okPYRF7Uk and docs dpl_9SobCo6o34dpRvhgwpBnUqq8jjoj; Railway feed built from SRC_SHA 3974b5b.
- URLs: SITE https://nectarlabs.vercel.app · APP https://nectarlabs-app.vercel.app · DOCS https://nectarlabs-app.vercel.app/docs (origin https://nectarlabs-docs.vercel.app) · FEED https://feed-production-2f2776c9.up.railway.app.
- Fresh clone of 3974b5b at /tmp/verify-wo34v2-20261112. pnpm install ran in /tmp. Scripts were not modified. Probes were added in the clone and copied to claims/ and docs-sweep/. Everything was read-only and nothing was signed. WebFetch was not used because no explorer link is part of this order.
- The owner oracle was refreshed at about 15:12Z (orchestrator note). My claims probe ran at about 15:05Z, and none of its checks depend on price.

1. The three WO-34v FAILs, now all PASS (curl.log, docs-sweep/):
   - noindex: APP/docs/sitemap.xml has 56 locs. All 56 APP /docs pages answer 200 and 0 send `x-robots-tag`, including /docs and /docs/start/quick-start (docs-sweep/docs-noindex.txt is empty). SITE / and APP /feed send no x-robots-tag either. PASS.
   - Docs origin: https://nectarlabs-docs.vercel.app/docs/ and /docs/start/quick-start answer 200 with `x-frame-options: DENY`, a CSP containing `frame-ancestors 'none'`, and HSTS. `/` answers 307 → /docs/ with HSTS only, as F-453 allows. PASS.
   - Localhost hrefs: none of the 56 pages has an `<a>`/href to 127.0.0.1 or localhost. 17 text mentions remain, all inside `<code>` or code-block `<span>`s that give local-dev instructions (quick-start, feed-rest, feed-mcp, run-a-keeper, monitoring, oneclick-depth). feed-rest now links https://feed-production-2f2776c9.up.railway.app. PASS.
2. Regression:
   - Crawl `--polite` (SITE + APP incl. /docs/*, PW_CHANNEL=chrome): **not checked**. It started at 15:06Z and was still running when I committed at 15:18Z; crawl/crawl.log is partial.
   - Host check: PASS. inventory spec unchanged against production (E2E_INVENTORY=1, real Chrome, selector opened, no signing): 6 passed in 5.1 min, exit 0. 14 hosts measured: the 2 own hosts plus 12 third-party hosts (evm-on-near.dev, fonts.cdnfonts.com, mc.meteorwallet.app, meteorwallet.app, near-testnet.drpc.org, raw.githubusercontent.com, rpc.testnet.fastnear.com, rsms.me, storage.herewallet.app, test.rpc.fastnear.com, testnet-rpc.intea.rs, wallet.intear.tech). wo34v-privacy-check.mjs: 0 hosts missing on /legal/privacy, 12 storage keys with 0 missing on /legal/cookies, 0 CSP violations, 6 wallets opened. host-check/.
   - Headers: PASS. SITE /, SITE /legal/privacy, APP /feed and APP /borrow send XFO DENY, HSTS max-age=63072000; includeSubDomains, nosniff, strict-origin-when-cross-origin, and a CSP with `frame-ancestors 'none'` and exact connect-src hosts.
   - Redirects: SITE /borrow?asset=NVDAx → 308 APP; APP /about → 308 SITE; APP / → 307 /feed.
   - Feed: PASS. /health returns `ok` true, `history` "unavailable", `chain_head_source` "view_block", `rpc` {4 endpoints, last_served test.rpc.fastnear.com, failovers 0}, `source` "views", and chain_head 277378612 = last_indexed_block 277378612 (≥ holds). CORS: SITE and APP get an exact-origin ACAO on GET and a 204 preflight on /mcp. https://evil.example.com gets no ACAO and a 403 preflight. feed-health.json.
3. Landing claims (claims/claims.json, wo34v2-claims-probe.mjs, wo34v2-h2.mjs, installed Chrome, hydrated, 1440 px):
   - No "0123456789": PASS. It is absent from innerText, from the aria-hidden-stripped text, from the raw HTML text and from all 3 meta/og/twitter descriptions.
   - **Base "local fork": FAIL.** The hydrated landing has 0 occurrences of "local fork" in innerText and in textContent.
     - The hydrated heading reads "NEAR holds the book. Solana holds the stock." (section data-feature solana_remote). Only the #nsol node renders; the Base node is gated off (config features.base false).
     - Settle steps 03 and 04 still describe Base without the qualifier: "…Ed25519 (Solana) or secp256k1 (Base)" and "Base checks EIP-712 with ecrecover" (Landing.tsx:627–628).
     - The server HTML (curl) reads "NEAR holds the book. A Base local fork holds the stock." Feature flags resolve client-side, and the fallback branch at Landing.tsx:598 runs before they do. So crawlers and users see different headings.
     - The G3b run 6 (i) check read the static HTML only.
   - TEE: PASS. All 6 TEE lines say verifiable/verifiably, 0 say private/confidential/hidden, and "private"/"confidential" appear nowhere. No "until the Reserve ships".
   - Worked example: PASS. It reads "A static lender stops at 40%", "static 40 % → 70 % LTV", "haircut 10 % · verified DEX depth", "haircut 25 % · stale price" and "Per-position ceiling 70 % LTV (static 40 %)".
   - Event-history banner: PASS. data-testid events-not-indexed is visible on APP /feed ("…past settlements…") and APP /keepers ("…past keeper triggers…"), with 0 console errors on the landing, /feed and /keepers. Screenshot: claims/feed-banner.png.
4. Lighthouse a11y (script unchanged, LH_BASE_URL + LH_ROUTES, dark + light): PASS. Landing / is 100/100. Docs: /docs 100/100, /docs/start/quick-start 93/93, /docs/integrate/feed-rest 93/93, /docs/integrate/agent-skill-x402 93/93, /docs/integrate/feed-mcp 97/97. Both runs exit 0 (lighthouse/).
5. nectar-labs-web.vercel.app (info only): /, /feed and /docs all answer 200 with XFO DENY and no x-robots-tag, and the title is "Nectar Labs". It is still an indexable duplicate of production with no host-split redirect.

### WO-34 production acceptance (WO-34v): FAIL, 2026-11-12T13:38Z–14:45Z, deployed commit ca3411115aed1d6c127e2d82ba9f31a163221496
- Deployments: Vercel web dpl_6yqaQJPFBGYmM8e2Veofgr32BpRw and docs dpl_BtPA8juRKQKGfJbTkkYNEJzTwNNX; Railway project nectar-labs, service feed (/health reports commit fd06e11).
- URLs: SITE https://nectarlabs.vercel.app · APP https://nectarlabs-app.vercel.app · DOCS https://nectarlabs-app.vercel.app/docs (docs origin https://nectar-labs-docs-kunals-projects-35d3a237.vercel.app) · FEED https://feed-production-2f2776c9.up.railway.app.
- Scripts ran from a fresh clone of ca34111 at /tmp/verify-wo34v-20261112 and were not modified. Verifier probes were added in the clone and copied into evidence: wallet/wo34v-wallet-probe.mjs, host-check/wo34v-privacy-check.mjs, crawl/wo34v-load-probe.mjs. Everything was read-only. Nothing was signed.
- WebFetch was not used: no explorer link is part of this gate. Lighthouse JSON reports (24 MB) were not kept; the score tables are in the logs.

1. Crawl: PASS on the re-run, with 1 FAIL reason (the localhost link).
   - Run 1 (`crawl.mjs`, concurrency 4) ran alongside LH and the inventory on the same host: 119 internal routes, 43 external, exit 1. Its 4 failures: 2 page.goto load timeouts on SITE `/` at 1440 px (dark and light), APP `/` → `/feed`, and www.
   - The SITE `/` timeout did not reproduce. crawl/site-root-load-probe.json: load in 1.7 s, 0.6 s, 0.6 s at 1440 px and 0.5 s at 400 px, nothing pending. Run 1 also listed 71 page loads where FastNEAR returned a 429 without a CORS header. The script counts these as third party.
   - Run 2 (`--polite`, crawl-rerun/): 90 internal routes, all final 200, 0 of our console errors, 0 third-party failures, exit 1. The remaining 2 failures are not product failures:
     - (a) APP `/` answers 307 with the relative `Location: /feed`. The script compares against the absolute URL. The criterion "APP / → /feed" is met.
     - (b) www: N/A, because *.vercel.app has no www host. curl reaches nothing.
   - Run 2 found fewer routes than run 1 because the live /position/N and /note/p-N links were not rendered during run 2.
   - External links: testnet.nearblocks.io returns 403 and explorer.solana.com / solana.com return 429. These are bot walls, which the script treats as soft warnings.
   - **FAIL: https://nectarlabs-app.vercel.app/docs/integrate/feed-rest links to http://127.0.0.1:8788/.** That link never answers for a visitor (crawl-rerun/localhost-link.txt).
   - Redirects: SITE /borrow?asset=NVDAx → 308 APP same path ✓; SITE /docs/security/audits → 308 APP ✓; APP /security, /about, /legal/privacy → 308 SITE ✓; APP / → 307 /feed ✓.
   - APP `/docs/` → 308 `/docs` is Next's trailing-slash normalisation, and /docs renders 200. Recorded, not a failure.
   - Not checked: per-route screenshots at 1440 and 400 px. crawl.mjs takes none, and the verifier limit is one screenshot per gate. The crawl covered all 4 variants (both themes × 1440/400) for console errors.
2. Lighthouse a11y (`LH_BASE_URL` + `LH_ROUTES`, script unchanged, dark + light): PASS.
   - SITE 11 routes: 22/22 at 100.
   - APP 14 routes: 28/28 at 100.
   - DOCS, all 56 sitemap routes: 112/112 ≥ 90, min 93 (/docs/start/quick-start, /docs/integrate/feed-rest, /docs/integrate/agent-skill-x402). lighthouse/{site,app,docs}.log, each exit 0.
3. Host check: PASS. The inventory spec ran unchanged against production (E2E_INVENTORY=1, real Chrome, fresh profile per combo, 4 combos plus every wallet): 6/6 passed in 5.5 min with 0 CSP violations.
   - 6/6 wallets opened with no signing: Meteor, Intear, Ledger, Nightly, Ethereum Wallets, NEAR CLI.
   - 14 hosts were measured. 12 are third party: evm-on-near.dev, fonts.cdnfonts.com, mc.meteorwallet.app, meteorwallet.app, near-testnet.drpc.org, raw.githubusercontent.com, rpc.testnet.fastnear.com, rsms.me, storage.herewallet.app, test.rpc.fastnear.com, testnet-rpc.intea.rs (declared, not reached), wallet.intear.tech. All 12 appear in backticks on SITE /legal/privacy; 0 are missing.
   - The host set equals the committed data-inventory.json apart from the own hosts.
   - 0 cookies. All 12 storage keys appear on SITE /legal/cookies; the IndexedDB stores match the documented `hot-connector/wallets/<wallet id>:<version>` plus each listed id.
   - `nectar-theme` was not set in this run, because the spec seeds it only on localhost.
   - Files: host-check/{data-inventory.json,.md, privacy-cookies-check.json, inventory-vs-committed.txt, inventory-run.log}.
4. Headers (headers.txt, captured 13:38Z): FAIL, 2 reasons.
   - SITE `/`, SITE /legal/privacy, APP /feed and APP /borrow all send the same CSP with exact hosts. The CSP lists the 12 hosts above plus api.devnet.solana.com, with `frame-src https://wallet.intear.tech`. These pages also send `frame-ancestors 'none'`, X-Frame-Options DENY, HSTS max-age=63072000; includeSubDomains, nosniff and Referrer-Policy. No noindex on SITE `/` or APP /feed ✓.
   - **FAIL (1): production APP sends `x-robots-tag: noindex` on https://nectarlabs-app.vercel.app/docs and https://nectarlabs-app.vercel.app/docs/start/quick-start.** It is most likely passed through from the docs origin by the /docs proxy.
   - **FAIL (2): the docs origin https://nectar-labs-docs-kunals-projects-35d3a237.vercel.app/docs/ is public** (200 without auth, / → 307 /docs/). It sends HSTS and noindex but no CSP, no X-Frame-Options and no frame-ancestors.
   - Extra hosts:
     - https://nectar-labs-web.vercel.app serves the whole product: `/` is the landing page and `/feed` answers 200 with no host-split redirect. It sends the same security headers and **no noindex**, so it is an indexable duplicate of production. This is a finding for the fix list.
     - https://nectar-labs-web-kunals-projects-35d3a237.vercel.app serves the same with `x-robots-tag: noindex`.
   - Preview noindex: N/A (previews are behind Vercel login).
   - Feed: PASS.
     - /health returns 200 with `lag_blocks` 0 and `last_indexed_block` 277370086. Note: that is above `chain_head` 277297242 in the same body.
     - CORS: SITE and APP get an exact-origin ACAO on GET and on the OPTIONS /mcp preflight (204). https://evil.example.com gets no ACAO on GET, and its preflight is refused with 403.
     - MCP `tools/list` POST returns 200 with the tools (get_exit_capacity, preview_borrow, list_quotes, explain_limit, …).
     - Feed responses carry no HSTS header. Observation only.
5. Wallet connect on APP /borrow: PASS (wallet/wallet-probe.json, wallet/selector-400.png).
   - The real near-connect selector lists 6 rows at 1440 and at 400 px.
   - Each row is fully inside the viewport, and elementFromPoint at its centre is the row.
   - A Playwright trial click on the first row is actionable. Nothing was signed.
   - x402 hosted: N/A (D-031).
- Node runtime (nodejs22.x): N/A. The verifier has no Vercel log access, and no production function log was visible.
