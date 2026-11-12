## NOW (2026-11-12 ~19:40Z) — Kunal's pre-recording round (A domains · B claim fixes · C test assets · D demo · E freeze by 2026-11-13 13:30Z)
Decisions typed this session: hosts nectarlabs.io (site) · docs. · status. · testnet. (app) · www → apex, replacing ac.nectarlabs.io; H-ORACLE option A
on Railway, FC key limited to update_owner_price, every 10 min in NYSE windows / 12 h outside, through 2026-11-18; mock-ft code-only upgrade for a
capped public `faucet_mint` APPROVED (account ids unchanged); contact email kept. Repo URL for H2: https://github.com/NectarLabsio/nectar-labs.
- A1 done 19:31Z: nectarlabs.io is in the Vercel team (Vercel DNS zone, Kunal added it); attached testnet./status./www.(308 → apex) to web
  prj_LDWS…, docs. to docs prj_3HZc…. dig @ns1.vercel-dns.com answers all five; no records needed from Kunal (H-DNS). Hosts still serve release 3.
- Deployed params (evidence/claims/deployed-params-20261112T192755Z.json): LTV 40/70, haircut 10/25, Reserve $10 live, D 0, oracle Owner $135.
- Feed (hosted) views mode: events_indexed 0 (B5 → WO-63/WO-62a reports).
- nectar.testnet 1.80 NEAR; token accounts ~0.10 NEAR free storage each (mock-ft growth > ~8 KB needs a top-up).
- ~19:50Z Kunal: apex didn't load, status wrong, testnet showed the landing. Cause: the deployed release had SITE_URL/APP_URL = vercel.app hosts.
  Fix (no code): Vercel production env SITE_URL https://nectarlabs.io, APP_URL https://testnet.nectarlabs.io, DOCS_URL https://testnet.nectarlabs.io/docs
  (interim), then release 3 (5f011bb) rebuilt as dpl_22L1aJ6GZdBxL2pirew2jBLM8Qm2 (production, READY 19:59Z). Now: apex 200 landing, /borrow 308 →
  testnet, testnet / 307 → /feed, landing paths on testnet 308 → apex. Still open until WO-62b/WO-64: status. serves the landing; vercel.app hosts
  serve as-is (no 308 yet; F-457 → LEGACY_HOSTS env in code); docs. still under /docs/. Apex/www failures on this Mac = cached NXDOMAIN (public DNS ok).
- WO-60 FACTS F-455–F-464 (4c337cd). WO-63 merged 1d7961b (keeper 327 tests; refresher generates its key on the Railway volume, logs only the public
  key; FC key added by the orchestrator after `key_generated`). B5: hosted Feed records no events (views mode); /api/settlements empty; demo steps
  need no events except the position page's settlements link. x402 :8791 has no FEED_URL → stale local Feed :8788 (since 11-11); planned restart
  with FEED_URL = hosted Feed before the recording. Refresher allowance → 1 NEAR.
- ~20:00Z H-ORACLE: Kunal chose "Deploy on Railway" (AskUserQuestion), but the accept-deploy tool approval was declined twice → NOT running.
  Staged in Railway nectar-labs/production (patch 1d6ac914…): service oracle-refresher (796516c0…), volume oracle-data /data 1 GB, start cmd
  scripts/deploy/railway-oracle-start.cmd, ON_FAILURE ×10, vars SRC_SHA 525697c…, SRC_SHA256 661d74f5…, SRC_URL (24 h, until ~2026-11-13 19:55Z),
  ORACLE_REFRESHER_KEY_PATH /data/keys/oracle-refresher.json, ORACLE_REFRESHER_GENERATE 1. Kunal action: apply the staged changes in the Railway
  dashboard (or approve the tool prompt). Then orchestrator: read `key_generated` public key from logs → near account add-key nectar.testnet
  grant-function-call-access --allowance '1 NEAR' --contract-account-id nectar-core-v2.nectar.testnet --function-names update_owner_price
  use-manually-provided-public-key <pk> network-config testnet sign-with-keychain send → watch first refresh tx. Price stale ≈ 2026-11-13 15:10Z.
- WO-62a merged c165332 (claims.spec 10/10, v7 28/28, LH landing 100/100). WO-62b, WO-64, WO-61, WO-62c running.
- ~20:05Z WO-62b merged 787549d, WO-64 merged c66458f (verify:quick 0 each). Local prod build with the five host env vars exit 0, check-trace 0,
  hosts.spec hosted 10/11 (the 1 = browser check, headless shell not installed here; G3b runs it) — evidence/WO-62b/.
  Vercel env now set for the NEXT build: web DOCS_URL https://docs.nectarlabs.io, STATUS_URL, LEGACY_HOSTS (4 vercel.app hosts); docs DOCS_URL,
  SITE_URL, STATUS_URL, APP_URL https://testnet.nectarlabs.io. Tarball c66458f uploaded (sha256 663dd8fe…).
  **BLOCKED: the web production create_deployment was DENIED by the auto-mode classifier [Production Deploy]**; the docs one started and was CANCELLED
  by me (dpl_7S1Rzo…) so docs and web stay consistent (the old APP /docs proxy would hit the new relative 308s). Production unchanged =
  dpl_22L1aJ6… (release 3 code, custom-host env). Needs Kunal: explicit approval (or a permission rule) for Vercel production deploys; same for Railway.
- D1: demo.nectar.testnet created (0.5 NEAR from nectar.testnet, tx 5NbjrugATtcyoqz5sjo9vGmAQz5EmMNkdafK5Em3bTC7); key + phrase in
  ~/.nectar/keys/demo.nectar.testnet.json (0600), never printed. WO-65 docs dispatched (hosts everywhere, DEMO_SCRIPT ≤ 2 min, snapshot, handoffs).
- Planned before recording: restart local x402 (:8791) with FEED_URL = hosted Feed (B5 (d)); Kunal told.
- ~20:10Z C: WO-61 merged 7cddf2a (mock-ft 38 unit + sandbox upgrade test; wasm 171,771 B sha256 e3d4ded5…, rebuilt identical on main).
  scripts/63 ran: top-ups 0.071/0.072 NEAR, code-only deploy to usdc-mock + nvdax-mock, state before == after, set_faucet from config
  (NVDAx 5/15, USDC 500/1500, cooldown 3600 s) → evidence/rollout/mockft-faucet-20261112T200937Z.log. WO-62c merged 27c8b95 (conflict in
  apps/web/package.json test script resolved: hosts + test-assets tests; web unit 43/44 + 1 skip; verify:quick 0). C4 real call: borrower1
  faucet_mint on nvdax-mock tx 2A4jN155i6AEbZv35qj8c7XZLV7TjWZejr3mnJmneQrW, ft_mint 5 NVDAx (evidence/C/). C is green before the 12:00Z timebox
  except deploy of the button (blocked with the rest of the production deploy).
- ~20:20Z WO-65 merged 044d340 (hosts in README/X_POST/RUNBOOK/HUMAN_HANDOFF; DEMO_SCRIPT v5 2:00; snapshot 20:07Z; H-DEPLOY, H-DEMO-WALLET new;
  docs vercel.json host-scoped 308s for the 2 docs vercel.app hosts). Smoke scripts updated 31809b1. RELEASE CANDIDATE = 31809b1.
  WO-66 verifier dispatched: G3b run 8 (local) + G11 mock-ft delta + claims (m) + grep (o) on 31809b1. Deploy only after G3b PASS.
- ~21:40Z G3b run 8 on 31809b1 merged ba90508: FAIL on 2 non-product items — (d) crawl.mjs:83 stale /docs expectation + crawler ignores DOCS/STATUS
  hosts → WO-62d web dispatched; (k) home path in evidence/WO-62b/hosts-spec-…log → redacted de17c86. Everything else PASS (e2e 510/0/116, hosts
  11/11 incl. browser, inventory 6/6, LH 40/40 = 100, claims + test-assets 26/26, live-claim hand check 20/20). G11 mock-ft delta PASS (38 unit +
  sandbox, deployed code = rebuild e3d4ded5… on both tokens, faucet_config = config, tx 2A4jN155… final, workspace 710/0).
  Also removed macOS AppleDouble `._pack-*` files from .git/objects/pack (git "non-monotonic index" noise; magic 00051607, not packs).
  Next: merge WO-62d → verifier G3b run 8b = (d) + (k) only → deploy (Kunal approval) → WO-67 production acceptance + G9 → submission-rc → audit.
- Next (old line kept): WO-65 (resumed) → merge → production deploy web+docs (needs Kunal approval) + Feed CORS (custom origins) → verifier WO-66 (production
  acceptance on custom hosts, G3b, G11 delta mock-ft, G9) → submission-rc → FINAL_REPORT audit. Refresher waits on Kunal (Railway staged).
Round 1 dispatched: WO-60 researcher · WO-61 contract (mock-ft faucet) · WO-62a web (B1–B4) · WO-63 keeper (refresher + B5/x402 answers).
Round 2 (after facts): WO-62b web hosts/redirects/status host · WO-64 docs-site baseUrl "/" · WO-62c web Get-test-assets button.
Orchestrator: mock-ft upgrade deploy + set_faucet; FC key + Railway refresher; demo account (~/.nectar, 0600); Feed CORS; vercel.app → 308 after release.
Round 3: WO-65 docs (URLs everywhere, DEMO_SCRIPT ≤ 2 min, snapshot, HUMAN_HANDOFF). Then deploy → production check, G3b, G9 → submission-rc → audit.

**v7 adoption: state E at 3f002c4 (2026-11-10) — D-017/D-018.** PRD v7 + addendum in docs/; P0 delta + Solana lifecycle first, one nectar-core-v2 deploy (needs H-NEAR-FAUCET).

## In flight (2026-11-12 ~01:55Z) — WO-34m: deploy through the connectors (Kunal: "use mcp for vercel and railway")
- No CLI login is needed any more. Work order docs/work/wo-34m-mcp-deploy.md. Facts F-414–F-427, C-024/C-025 (WO-34r4, merged 06abab9). Scripts 2ed1edf.
- Path: a pinned tarball of a G3b-passed commit → private Railway bucket via presigned URLs from the `artifacts` function → Vercel build / Railway Feed.
  The bytes never pass through a tool argument.
- **Railway** project `nectar-labs` (76a8bcaf…, env production 1d58afe0…):
  - bucket `artifacts-bucket` (iad);
  - function `artifacts`: https://artifacts-production-bf757206.up.railway.app, /health + token-gated /presign;
  - **Feed up** at https://feed-production-2f2776c9.up.railway.app from fd06e11: health ok, lag 0; volume feed-data /data; image node:22.22.2-bookworm.
- Tarball src-fd06e11….tar.gz, sha256 edae5d5a…44d8e3, 4.74 MB. A local no-git build of web and docs from it passed
  (evidence/WO-34/artifact-buildtest-20261112T014418Z.log). Upload + verify round-trip ok.
- Token: ~/.nectar/deploy/artifact-token (0600). Railway stores only its sha256. No token at Vercel; each deployment gets a 1 h presigned GET.
- **Vercel BLOCKED:** the connector has no write access to team kunals-projects-35d3a237 (403). Kunal must approve the authorize_team_access link
  (single-use, 10 min; regenerate on request). Then:
  - create nectar-labs-web and nectar-labs-docs;
  - preview deploys of fd06e11 (inline stubs + .nectar-artifact);
  - smoke test;
  - set FEED_CORS_ORIGINS on the Feed (currently "legacy").
- 05:17Z: **the Feed was degraded 01:50–05:17Z.** testnet.neardata.xyz answered HTTP 429 to the Railway egress on every poll; the Feed advanced about
  29 blocks per 5 min and health said ok:false. Switched to the documented fallback `FEED_INDEXER=views` (README §Event source). Health is now
  ok, poll age 1 s.
  - Loss: no NEP-297 event history on the hosted Feed (events_indexed 0). Snapshots and health still work.
  - Restore needs a FastNear/neardata API key → H-NEARDATA, optional. The code reads FEED_NEARDATA_API_KEY_PATH, a file, so it needs a start-command tweak.
  - Follow-up for the keeper agent: in views mode, /health `chain_head` stays at the old neardata value (277297242) while last_indexed_block is current.
  - The Vercel connector still has no team grant: list_teams is empty and even reads return 403. The approval never happened; a new link was sent 05:16Z.
- 05:20Z: Kunal approved Vercel team access. Projects:
  - nectar-labs-web prj_LDWShDagwIbzBzBaRmBIvj8Aw7oa (FEED_URL env set);
  - nectar-labs-docs prj_3HZc8bIECi9htd1g6NwgSykhP9Gu.
- First deployments are always production. Web dpl_4jAWW… ERROR at install, nothing served; docs dpl_FadAW… cancelled at once.
  Previews from fd06e11 (projectSettings in each request; stubs pin engines 22.x):
  - web dpl_E1CJ9onhpkBYwKaMA3mTYjMJeDd9 READY. Static pages 200; headers (HSTS, XFO, CSP, noindex) ok; /api/indexer/* ok.
    **6 dynamic routes 500** (config.yaml not traced into the function) and the runtime is nodejs26.x → WO-34p (web, dispatched).
  - docs dpl_BdCQyTjeFVjzmd1ph4VCEkj412A9 READY. **Pages 404 without .html** (no clean URLs) → WO-34q (docs, after WO-34r5 facts). Sitemap says
    localhost: set DOCS_ORIGIN_URL on the docs project before production.
- 05:50Z: WO-34p (web: config.yaml traced, engines `>=22.22.2 <23`, check-trace.mjs) and WO-34q (docs: vercel.json cleanUrls) MERGED.
  Facts F-428–F-432. verify:quick 0 after each merge.
  Previews from **46c35ea** (tarball sha256 1b0293aa…1d24c1c):
  - web dpl_31rptco1tfm4aPXyKomUaRhqgsZe: 28/28 routes 200/307 incl. the 6 that 500'd; /api/health ok:true with live pool data.
  - docs dpl_5pYWUsABpAs4RUGZ5cHGa2dNeEM6: 55/55 pages 200 at clean URLs; `.html` → 308.
    **But it does not render** (Kunal ~07:15Z: "Your Docusaurus site did not load properly … baseUrl = /docs/"). Pages reference `/docs/assets/…`; the flat build
    serves `/assets/…` (F-393), so every asset 404s when the docs deployment is opened directly. The smoke test checked status codes only.
    Fix: WO-34r6 facts F-433–F-436 → WO-34s docs, both MERGED (4f7702b, verify:quick 0): vercel.json rewrites `/docs/` → `/` and `/docs/:path*` → `/:path*`.
    **Docs preview of 4f7702b: dpl_rCb371fxU9G4fVWhKoHRA126BwQE PASS** (tarball sha256 e1d70b94…de70ae0):
    smoke-docs.sh 56 pages + 6 referenced assets, 0 failures (F-435 confirmed live: rewrite destinations resolve through cleanUrls);
    system Chrome: no baseUrl banner, hydrated, client navigation works, 0 failed requests, 0 console errors; app links → web preview.
    Logs: evidence/WO-34/preview-{smoke,browser}-docs-20261112T07*.{log,png}.
  - ~10:25Z: WO-34u (legal fill), WO-34t (+ e325d6a tests), WO-34r7 (F-437–F-439), WO-34w (root redirect) MERGED; verify:quick 0 after each.
    Docs preview of 5807d01 dpl_FCugSX4pWVhN1dEYDCmMtXp9FVar PASS: `/` → 307 `/docs/` → 200, 1 redirect, **no loop** (F-438 settled live);
    56 pages + 6 assets 0 failures; Chrome: bare root lands on the docs home, hydrated, 0 failed requests, 0 console errors;
    legal pages show Nectar Labs / United States / India / contact, 0 TODO-H, no governing-law text. Logs evidence/WO-34/preview-*-docs-20261112T102*.
  - scripts/deploy/smoke-web.sh (route list of the 46c35ea check) added. Next: previews of the code-final commit → G3b re-run 5 (verifier).
  - ~10:45Z: previews of **ca34111** (code-final) PASS: web dpl_5H5zajgbxqNk9w4ykj2swc3y5NUB 28/28 + operator fields on /about /talk /security;
    docs dpl_ChooYyB6JkGq4YYZ8WKsaRXomSk4 56 pages + assets, `/` → 307 `/docs/` no loop, Chrome clean. Node runtime not observable (note log).
    G3b re-run 5 (verifier) running on ca34111. WO-34r8 facts F-440–F-443 + C-026 merged.
  - **H-DOMAIN answered (Kunal ~11:00Z): "go for it, i will set domain later"** → production on vercel.app now (WO-34x).
    Done (11:05Z): project domains nectarlabs.vercel.app + nectarlabs-app.vercel.app on nectar-labs-web (verified; F-443 settled live);
    production env web SITE_URL/APP_URL/DOCS_URL/DOCS_ORIGIN, docs APP_URL/DOCS_ORIGIN_URL; ssoProtection `preview` on both projects
    (no production deployment had ever served, so nothing old became public). Waiting: G3b run 5 PASS → production deploy of ca34111.
  - G3b re-run 5 (ca34111): **PASS with one deviation** (nodejs22.x not observable; engines pin) — (a)–(g) PASS, (h) reviewed (cd45374, 7932947).
    Final status audit merged (2b15ddb, docs/FINAL_REPORT.md).
  - **PRODUCTION LIVE 2026-11-12 ~13:35Z from ca34111** (tarball sha256 689b93c6…8ccaaba):
    web dpl_6yqaQJPFBGYmM8e2Veofgr32BpRw → https://nectarlabs.vercel.app (SITE), https://nectarlabs-app.vercel.app (APP), DOCS = APP/docs;
    docs dpl_BtPA8juRKQKGfJbTkkYNEJzTwNNX → https://nectar-labs-docs-kunals-projects-35d3a237.vercel.app (proxy target; `/` → 307 `/docs/`).
    Feed FEED_CORS_ORIGINS = SITE,APP (redeployed, health ok, views mode). Production guard passed at build.
    Orchestrator public smoke PASS (evidence/WO-34/prod-smoke-20261112T13*.log): 28 routes, 56 docs pages + assets via APP, host split 308s, HSTS/CSP,
    no noindex; Chrome on APP /docs 0 failed requests, 0 console errors. APP `/docs/` → 308 `/docs` (Next trailing slash; renders fine).
    Extra auto hosts nectar-labs-web.vercel.app + the project domain serve the app in single-host mode (duplicate host; low; note for WO-34v).
    **Timebox 2026-11-13 18:00 UTC met** (pending the independent WO-34v acceptance). Next: WO-34v (verifier) ‖ WO-34y (docs) → G9 run 4 → submission-rc.
  - WO-34y MERGED (1fda54d): README "Hosted demo" (vercel.app URLs), H-HOST/H-DOMAIN CLOSED, H-DNS N/A, H2 command fixed, DEMO_SCRIPT APP URL.
- **Kunal ~13:40Z (two messages, pre-freeze):** H17 = fire-sales. H16 nfts only if the move_note tests assert new owner repays+closes and old owner cannot
  → **not met** (repay is permissionless by design; tests assert residual collateral + self_settle follow the Note, old owner self_settle refused) →
  tracks stay defi/security/agents. Domain: nectarlabs.io unregistered (F-395) → vercel.app URLs in README and X_POST; URLs fixed before the X post.
  Footer email unchanged until Kunal confirms. Keep ~/.nectar paths; remove absolute home-directory paths paths. **Freeze target 2026-11-13 12:00 UTC**:
  fixes → redeploy production + Feed → freeze → G3b + G9 on the frozen commit → submission-rc → FINAL_REPORT re-audit.
  In flight: WO-34v (prod acceptance of ca34111), WO-35r (costs, neardata key, Docusaurus/zod, FACTS /Users), WO-35w (web claims: Reserve IS deployed so
  Formula "0 until the Reserve ships" is the wrong line; Base local fork; example params; TEE wording; counters; event empty states; shell.spec allowlist),
  WO-35k (RPC fallback keeper+Feed; views-mode chain_head). Next: WO-35d docs (X_POST URLs, docs claims, H16/H17/H-NEARDATA, SECURITY.md) after WO-35r;
  evidence-log /Users redaction (verifier). Wasm fixtures keep embedded build paths (byte-identical to deployed code; on-chain anyway) — told Kunal.
  Costs: Vercel Hobby $0 (F-402, non-commercial). Railway plan tier not readable via connector; usage 24 h tiny; $ estimate after WO-35r rates.
  - ~14:40Z MERGED (verify:quick 0 after each): WO-35r facts F-444–F-451 (Railway ≈ $0.64/mo: Free $0 within $1 credit, Hobby $5 flat; max-RAM risk
    $2.32 > Free credit; neardata key at dashboard.fastnear.com, Bearer), WO-35w web (Reserve line, Base local fork heading, example aligned to config
    40/70/10/25 with quotes $80k, TEE verifiable, counters CSS reel + aria-hidden, event-history banner on views mode, shell.spec allowlist),
    WO-35k keeper+feed (4-endpoint RPC fallback; Feed /health `chain_head_source`, `history`, `rpc`; settlements empty in views mode) + Feed
    FEED_NEARDATA_API_KEY (dff819a), WO-35d docs (X_POST URLs, TEE/Base/illustrative wording, H16 nfts not added, H17 fire-sales, H-NEARDATA,
    SECURITY.md: 7 Docusaurus advisories build-time only — 0 matches in build output; zod not reachable via the x402 decoders).
    Orchestrator checks: web build + check-trace 6/6; rendered landing: no "0123456789", "local fork" present, TEE "verifiable", no "until the Reserve ships".
    Host keeper restarted on the merged code (healthy; rpc endpoints ×4). Feed start command now removes stale /data/src trees.
    **Disk incident:** two worktree `pnpm install`s filled /Volumes/T7 (26–62 GB each); now ~67 GB free. Agents symlink node_modules from main instead.
  - **FROZEN 2026-11-12 ~14:10Z at 3126773** (tarball sha256 7eadb5d7…605e05). Previews: web dpl_5etJbR4bLKM94YzBbo5HkYKZE4MG 28/28 + claims checks;
    docs dpl_DT8r3LWtBbf1o3mA1YezwdwYZpeA 56 pages + assets, root 307 no loop, Chrome + theme clean (evidence/WO-34/preview-*-3126773-*). G3b run 6 running.
    WO-35e merged (evidence paths redacted; only *.wasm fixtures keep a home path). WO-34v (ca34111 production) FAIL on 3 → post-freeze fixes:
    (1) docs noindex via the proxy: team-suffixed *.vercel.app sends x-robots-tag noindex → docs project domain nectarlabs-docs.vercel.app added (200,
    no noindex) and web production DOCS_ORIGIN → it (config only); (2) docs origin lacks XFO/frame-ancestors → WO-35f facts → WO-35g vercel.json headers;
    (3) localhost link in docs integrate/feed-rest → WO-35g. Not a gate item: nectar-labs-web.vercel.app serves the app (canonical → SITE/APP, no noindex).
    G3b run 6 on 3126773 covers apps/web (unchanged by WO-35g); the docs delta is re-checked by G9 (fresh clone) + WO-34v re-run on production.
  - WO-35f facts F-452–F-454 + WO-35g docs fixes MERGED (10d19d4): docs vercel.json headers (XFO DENY, frame-ancestors 'none', nosniff,
    Referrer-Policy), feed-rest/feed-mcp/monitoring no localhost links + monitoring Feed status. Product delta since the freeze = 5 apps/docs-site files
    only (`git diff --stat 3126773 HEAD -- apps packages services contracts`). **Release commit = this STATE commit** (docs-only descendant).
    Next on G3b run 6 PASS: tarball → production docs + web (DOCS_ORIGIN = nectarlabs-docs.vercel.app) + Feed (SRC_* + new start command) →
    WO-34v re-run on production ‖ G9 run 4 on the release commit → submission-rc → FINAL_REPORT re-audit.
  - G3b re-run 6 on frozen 3126773: **PASS** (one deviation: nodejs22.x not observable) — e2e 476/0/108, LH 40/40 at 100, (a)–(k) PASS (aafd4f4).
  - **PRODUCTION = RELEASE 3974b5b (2026-11-12 ~15:00Z)** (tarball sha256 ed743dbc…2219af): web dpl_5YACVWKHkdB6RKZY788okPYRF7Uk, docs
    dpl_9SobCo6o34dpRvhgwpBnUqq8jjoj (docs alias nectarlabs-docs.vercel.app; web DOCS_ORIGIN → it), Feed redeployed from SRC_SHA 3974b5b with the new
    start command (health: history "unavailable", chain_head = last block, rpc ×4). Public smoke PASS (evidence/WO-34/prod-smoke-release-*.log): 28 routes,
    56 docs pages + assets, no noindex on APP /docs, docs origin XFO + frame-ancestors, 0 localhost hrefs, Chrome 0 failed requests / 0 console errors.
    Next: WO-34v2 (production re-run) ‖ G9 run 4 → `git tag -f submission-rc` → FINAL_REPORT re-audit.
  - G9 run 4 (1f28a2f): **FAIL on step 3 only** — README lines 3/11 say hosted from ca34111 (now release 3974b5b) and lines 25–26/139 say WO-34v
    "not in EVIDENCE yet". All other steps PASS (quick start 4.3 min, verify, dry run tracks defi/security/agents, handoffs, headers, wallet, SECURITY).
    Fix after WO-34v2 reports (docs WO-35h), then a G9 step-3 re-check.
  - **Owner oracle was stale (age 112,379 s → borrows refused).** Refreshed same price 135000000 at ~15:12Z, tx 3E92xm8KDQcVC2FZh4MRn4dkBvZ1uS3H7eCvCubXM8rH
    (evidence/ops/owner-price-refresh-*.log); fresh, session "open". Goes stale 24 h later (~2026-11-13 15:10Z) and again before judging (16–18 Nov).
    scripts/ops/refresh-owner-price.sh (re-asserts the current price when > 12 h old) — starting it as a background host loop was DENIED by the
    permission classifier (unauthorized persistence) → Kunal decides: run it himself, or the orchestrator runs the one-shot refresh each session (H-ORACLE).
  - Feed NECTAR_GIT_SHA → 3974b5b (was fd06e11; /health `commit`).
  - WO-34v2 (release 3974b5b) merged: the 3 ca34111 FAILs now PASS (no noindex on 56 APP /docs pages; docs origin XFO + frame-ancestors; 0 localhost hrefs);
    host check, headers, Feed/CORS, Lighthouse PASS. **New FAIL:** hydrated landing never says "local fork" (client flags swap the heading to "Solana
    holds the stock"; steps 03/04 name Base unqualified) — G3b (i) checked only server HTML. Crawl not checked (still running at commit).
    In flight: WO-35i (web: server/client-consistent chains copy, "local fork" everywhere Base is named) ‖ WO-35h (docs: README points to EVIDENCE for
    the deployed commit/acceptance; H-ORACLE; RUNBOOK). Then: release 2 → G3b run 7 → production → WO-34v3 (landing hydrated + crawl) ‖ G9 run 5 →
    submission-rc → FINAL_REPORT re-audit. Info for Kunal: nectar-labs-web.vercel.app serves a duplicate (canonical → SITE/APP, no noindex).
  - ~16:05Z MERGED: WO-35h docs (README hosted + gate-run refs → EVIDENCE; H-ORACLE; RUNBOOK) and WO-35i web (Landing.tsx:341-353 + LandingNav read the
    server's config.yaml flags so server HTML = hydrated text; every Base sentence says "local fork"; v7.spec.ts:189-243 hydrated tests 16/16).
    verify:quick 0; web build + check-trace 6/6. **RELEASE 2 = this STATE commit.** Next: tarball → previews + (h) incl. hydrated landing →
    G3b run 7 (order block "Run 7") → production → WO-34v3 (hydrated landing + crawl) ‖ G9 run 5 → submission-rc → FINAL_REPORT re-audit.
  - Release 2 (4c2a0bb) previews PASS incl. hydrated landing (server = hydrated; 3 Base sentences "local fork"). G3b re-run 7: PASS except (d) — the
    docs Feed link went to the bare origin (404). WO-35j: links → /health (merged). Delta release 2 → now = 2 docs lines (feed-rest.md, monitoring.md).
    **RELEASE 3 = this STATE commit.** Plan: G3b (d) crawl re-check on release 3 + docs preview smoke → production docs + web from release 3 (Feed
    stays on 3974b5b: services/feed unchanged since) → WO-34v3 ‖ G9 run 5 → submission-rc → FINAL_REPORT re-audit.
    Console noise (third-party): FastNEAR replies without CORS headers when rate-limiting browser RPC calls (SDK falls back); previews also log
    vercel.live feedback.js blocked by our CSP.
  - G3b re-run 7b (d) on release 3: PASS (crawl 0 failures; Feed links /health 200) — runs 7 + 7b cover release 3 (49d0b5a).
    Release 3 docs preview dpl_BjAPZQm4rEwhGovwPtcFo9ygEmKu: 56 pages + assets, Feed links 200. ~16:35Z production deploy of release 3 started:
    docs dpl_DQubre8taPieUo4EBshyyrRNVjcT, web dpl_BJNxqxnSZQWHtiouXYeWknkScxtY (tarball sha256 c1c17da2…ffaa9). Feed stays on 3974b5b (no feed change).
    **PRODUCTION = RELEASE 3 (~16:40Z).** Public smoke PASS (evidence/WO-34/prod-smoke-release3-*.log): 28 routes, 56 docs pages + assets, hydrated
    landing server = hydrated text with 3/3 Base sentences "local fork", Feed link /health. Next: WO-34v3 ‖ G9 run 5 → submission-rc → FINAL_REPORT re-audit.
  - **~17:10Z ALL GATES GREEN ON RELEASE 3 (5f011bb):** G3b re-runs 7 + 7b PASS (one deviation: nodejs22.x not observable, engines pin);
    WO-34 production (release 3) PASS on all 4 items (hydrated landing, crawl 90/90, headers/Feed/CORS, LH 100/100); G9 runs 5 + 5b PASS.
    Docs-only after release 3: WO-35k2 (README G9 pointer, H-ORACLE session window, DEMO_SCRIPT prep), SUBMISSION G9 citation. Product code since
    5f011bb: none. (submission-rc first moved to 4b20f05.) Final audit re-run (9fea230, docs/FINAL_REPORT.md): ready; 1 copy FAIL — README:153
    "live oracle" (G5 is a fallback) → fixed (6d3e72f) with the SUBMISSION header; G9 run 5c step 3 on c194c8f PASS. Product code since 5f011bb: none.
    **submission-rc → this STATE commit** (local annotated tag; nothing pushed). Local services: keeper /healthz 200; x402 has no health route
    (paid route proven at G14); the local Feed :8788 is stale since 2026-11-11 09:45Z (neardata 429) — production uses the Railway Feed.
    Open for Kunal: kill 14369; testnet account id for the real-wallet borrow (mint mock NVDAx first); H-ORACLE A/B (price stale ≈ 2026-11-13 15:10Z;
    NYSE-hours session needs < 15 min); optional H-NEARDATA key; H2 push + public, H3 X post, H10, H11 video, H12, H14, H1 send.
  - (superseded) Still before freeze: WO-35e (evidence /Users redaction, verifier) and WO-34v findings. Then freeze = tarball → production redeploy (web+docs) +
    Feed redeploy (SRC_* to the frozen commit) → G3b + G9 on the frozen commit → submission-rc → FINAL_REPORT re-audit. Target 2026-11-13 12:00 UTC.
    New scripts/deploy/smoke-docs.sh checks every page AND every asset it references; G3b (h) gained the asset check.
    Docs project env: APP_URL (preview only) = the 46c35ea web preview, so navbar/footer app links stop pointing at localhost:3100.
    Share links: fetching a deployment through the connector can replace its share link; the earlier docs link stopped working. Hand out fresh ones.
  - Logs: evidence/WO-34/preview-smoke-{web,docs}-2026111205*.log. The Node 22 runtime is not observable without an error log → G3b item (h).
  - Follow-up (not blocking): Turbopack traces all of apps/web into each function because of packages/sdk/src/config-node.ts. Fix in packages/sdk.
- G3b order docs/work/g9-g3b-final-4.md gained (g) check-trace and (h) Vercel preview checks.
- Production still needs H-LEGAL → G3b re-run 5 on the code-final commit → tarball → production deploy. Also at production:
  - ssoProtection → previews only;
  - web env SITE_URL, APP_URL, DOCS_URL, DOCS_ORIGIN, REPO_URL="", NEXT_PUBLIC_EXPLORER_TX;
  - docs env DOCS_ORIGIN_URL;
  - Feed FEED_CORS_ORIGINS.
  H-DOMAIN default (vercel.app) at 2026-11-13 06:00 UTC. The production *.vercel.app URL is behind Vercel Authentication
  ("all_except_custom_domains") until ssoProtection is changed.
- Dispatched: WO-34n docs (HUMAN_HANDOFF H-HOST + RUNBOOK connector section); researcher follow-up (live notes on F-415/418/423/427, C-024).

## Earlier in flight (2026-11-11 ~19:50Z) — WO-34 hosting + rest of the second request (no push / post / send)
- Kunal confirmed in session: deploy to production on Vercel (frontend, docs) and Railway (backend). Master WO: docs/work/wo-34-deploy.md.
- **Pre-check:**
  - nectarlabs.io is UNREGISTERED (NXDOMAIN; Vercel shows it available, $14.99 / $46 renewal) → H-DOMAIN.
  - Vercel plan Hobby. Railway plan not readable → H-HOST.
  - No CLI logged in → H-HOST.
  - Key line treated as unconfirmed (template fields left blank) → H-KEYS.
  - Operator fields null in config.yaml `site:` → H-LEGAL.
  - No deploy has happened.
- WO-51 MERGED (banner under the wallet selector; verify:quick 0). Orders committed 518dc6e.
- Round 1 MERGED (verify:quick 0 after each):
  - WO-34r/r2 FACTS F-386–F-403 (Next proxy, Docusaurus /docs/ with the prefix stripped at the APP rewrite, Vercel CLI 65.14.0, Hobby non-commercial, 1 h
    logs). C-022: domain unregistered.
  - WO-34d: docs-site baseUrl /docs/; H-DOMAIN, H-DNS, H-LEGAL, H-KEYS, H-HOST; D-030.
  - WO-34a: proxy.ts host routing, /docs rewrite, env, noindex previews, per-host sitemap/robots, production guard. CSP hosts not measured yet → WO-34c.
  - WO-34k: Feed single-port, /health, head start, CORS, Dockerfiles. Docker is not installed locally, so the images were never built.
- **x402 is not hosted:** @fastnear/x402 needs a full-access relayer key (F-328), and the key line forbids full-access keys → C-023 / D-031. Railway =
  Feed only, plus the keeper if H-KEYS = yes; Base stays local.
- Round 2 MERGED (verify:quick 0 after each):
  - WO-34r3 FACTS F-404–F-412 (Railway Free $1 credit and 1 volume per project, Hobby $5; `railway up` honours .railwayignore, not .dockerignore;
    RAILWAY_DOCKERFILE_PATH; logs kept 3/7/30 days). C-023.
  - .railwayignore + root .dockerignore allowlists.
  - WO-34e1: terms/disclaimers (TODO-H-LEGAL markers), D-031.
  - WO-34b: about/status/changelog/brand/talk/security pages, LH 100, content guard. CONTACT_EMAIL constant removed; contact comes from site.contact.
  - WO-34c: data inventory, exact-host CSP (Meteor only), crawl.mjs (96 URLs 200, redirects pass); SITE /docs/* → APP 308; local /docs/* explainer.
- Round 3 MERGED (verify:quick 0):
  - WO-34f: 6/6 selector wallets under the enforced CSP (0 violations, never signed); HostLink (no cross-host prefetch); SDK view coalescing (8 s
    TTL, shared 429 backoff); polite crawl 89 URLs, 0 failures, 0 of our console errors; local e2e 142 pass.
  - WO-34e2: privacy + cookies from the inventory (10 third-party hosts, all listed; per-wallet table; unpinned-manifest caveat); H-KEYS keeper-only.
- **G3b re-run 3 on d4218d4: FAIL** (fdd2cee). Live e2e: 1 failure per run, both FastNEAR -429 (/api/health, list_quotes). Every WO-34 addition
  passed: hosts 6/6, inventory 0 CSP violations 6/6 wallets, crawl 0/0, LH 20×2 = 100, guard refuses null fields. → docs/GATE_FAIL_G3B_R3.md.
- MERGED:
  - WO-34g: SDK order FastNEAR ×2 → dRPC → Intear; health ≤ 60 s stale snapshot; live-spec retries. The agent's e2e: 476/0 twice with host services
    running.
  - Privacy lists the fallbacks (14 hosts, 12 third-party). F-413 (providers page re-read + probe).
- **G3b re-run 4 on fd06e11: PASS**. GATE_FAIL_G3B_R3 RESOLVED.
  - e2e 476/0/106 twice with no retries; site-pages 38/38; screens 46/46 ×2; hosts 6/6.
  - Inventory: 14 hosts = privacy, 0 CSP violations, 6/6 wallets. Polite crawl 0/0. LH 40/40 = 100. Guard OK. `pnpm verify` 0.
  - Waiting on Kunal: H-HOST (logins + Railway plan), H-LEGAL, H-DOMAIN, H-KEYS.
  - WO-34h MERGED (4d113a1): DEMO_SCRIPT "Real-wallet borrow on the hosted app". The owner (nectar.testnet) must storage_deposit usdc-mock + nvdax-mock
    and mint 2 NVDAx for Kunal's account first.
- **H-LEGAL ANSWERED (Kunal, 2026-11-12 ~08:00Z):** operator "Nectar Labs", country "United States / India", contact kunal@nectarnetwork.fun (typo
  ".funm" corrected), X @xNectarNetwork (confirmed as typed), **no governing-law clause** (his choice; Terms needs one jurisdiction).
  1. DONE 05b8c63: config.yaml `site:` filled; verify:quick 0.
  2. In flight: WO-34u docs (legal pages + HUMAN_HANDOFF H-LEGAL/H9 closed), WO-34t web (APP proxies /docs WITH the prefix; serve-docs.mjs mirrors),
     WO-34r7 researcher (vercel.json redirects) → then a docs WO: docs deployment `/` → `/docs/` (Kunal opened the bare root twice; it shows
     "Page Not Found" on the fixed preview). The redirect needs WO-34t first, else APP `/docs` → origin `/` → redirect loops.
  - Share links: creating a new share link (get_access_to_vercel_url / web_fetch_vercel_url) invalidates the previous one, across projects, despite
    the stated 23 h expiry. Kunal is a team member: give him plain deployment URLs; use share links only for scripted checks.
  3. G3b re-run 5 on that commit. Operator text changes rendered pages, so fd06e11 alone is not deployable because the production guard refuses null
     fields.
  4. Deploy that commit.
- Deploy env, non-secret: SITE_URL, APP_URL, DOCS_URL, DOCS_ORIGIN (web) / DOCS_ORIGIN_URL (docs build, = APP origin), FEED_URL, REPO_URL="",
  NEXT_PUBLIC_EXPLORER_TX (explorer tx link). NEAR_AI_API_KEY only if Kunal adds it himself.
- Deploy scripts ready: scripts/deploy/deploy-{vercel,railway}.sh (598a4a3). They need H-HOST logins.
- Then:
  - Deploy the G3b-passed commit, after H-HOST + H-LEGAL (+ H-DOMAIN or the vercel.app default).
  - WO-34v production acceptance.
  - README "Hosted demo".
  - G9 run 4.
  - submission-rc. One G3b + G9 covers both requests (Kunal).

## Earlier in flight (2026-11-11 ~18:10Z) — Kunal's second request (no push / post / send)
- Kunal decided: **H16 tracks = defi, security, agents** (nfts after the Position Note answer); **C-020 kept** → SECURITY.md known limitation.
- Running: WO-51 web (consent banner under the wallet selector), WO-52 docs (tracks field, privacy-track framing out of SUBMISSION/README/X_POST, C-020 +
  remote Loan Note release-to-depositor limitation, HUMAN_HANDOFF H16, DECISIONS, DEMO_SCRIPT agent1 = 8), WO-53r researcher (zod GHSA-mrhx-c7xc-m3w5,
  high, via @x402/core — reachability; FACTS C-020 decided). Done: agent1 +6 mock NVDAx → 8 (tx 36SNzV2B…, af3c767).
- Answer (item 3): Position Note transfer moves the loan — move_note sets position.borrower (notes.rs:332-349); repay is permissionless (on_repay lib.rs:824);
  NEAR-collateral release on full repay → current Note owner (lib.rs:852-858). Tests: unit v7_notes_residual_collateral_goes_to_loan_note_owner,
  v7_notes_self_settle_by_new_loan_owner / _old_owner_refused; sandbox notes_residual_collateral_to_loan_note_owner. REMOTE positions: request_remote_release
  (remote.rs:957) signs to the depositor recorded at deposit, not the Note owner; no test of a transferred remote loan being released.
- Next: merge → G3b + G9 on the final commit (fresh clones, parallel) → move submission-rc. A fix from Kunal's real-wallet test would need another G3b/G9.

## Now (2026-11-11 ~17:50Z) — read this block first
- **SUBMISSION-READY on the agent side; `submission-rc` moved to the commit that records this block** (local tag; no remote; nothing pushed/posted/sent).
- **Gates, verifier-run today (fresh clones):** G14 402→200 PASS (2e16f9b) and again on HEAD with the guarded demo agent (a677689: E2suM2LC… #15, relay
  4vW2tPF5…); G1 2.2.1 gas rows PASS 67/67, max 78.60 Tgas, wasm = deployed (a677689; GATE_FAIL_G1_221 RESOLVED); G9 run 3 PASS (837cd12, clone 3107a1a);
  G3b re-run 2 PASS (5770fa7, clone fd6592d: e2e 404/0, screens 76/76, LH 28/28 = 100, verify green; GATE_FAIL_G3B_R2 RESOLVED). All other gates as before.
- **Security review 2** (docs/work/review-2-findings.md; SECURITY.md "Review 2"): 0 H / 5 M / 7 L, fixed in WO-42a/42b/42c/43/43b/44/49; disclosed residuals:
  on-chain fee bound (contract), full script-src CSP + near-connect manifest pin, real-wallet signing under new headers (selector verified, signing not),
  Solana genesis-hash check (not in FACTS), MM-owned quoter secrets (PROD), zod advisory via @x402/core, docs-site build-time criticals, elliptic (low).
  Privacy claims that did not hold (landing TEE line, "never joined to IPs", privacy.md third-party table) are corrected. FACTS C-020 OPEN (implicit-account
  definitions differ; SDK takes the safe side) — surface to Kunal.
- apps/web is NOT deployed anywhere (H5 OPEN). WO-33a/b/c merged earlier.
- **Before recording:** agent1 holds 2 mock NVDAx (topped up ~15:26Z; each x402 demo run uses 1); connect a real testnet wallet once; dismiss the cookie
  banner first (it covers the bottom of the wallet list); Feed :8788 may still be catching up (neardata 429s) — DEMO_SCRIPT "Before recording".
- **Kunal:** `kill 14369` (verifier's leftover `next start` on :3217 — its kill was refused, so the orchestrator did not run it). OPEN: H-GUARD-V7, H15, H16
  tracks, H17–H20, H11 video, H10/H14 team + payout, H2/H3 publish, H1 send, H5 Vercel.
- Background: keeper-v2 daemon, Feed :8788/:8789, x402 :8791, anvil :8545 (Base local fork).

## Log of Kunal's 6-item request (2026-11-11 ~09:55Z → ~17:50Z, done)
- WO-39 verifier (worktree): G14 402→200 re-run from a fresh clone (own x402 on :8891) + G1 gas rows on 2.2.1; step 0 marks G14 402→200 SELF-ATTESTED.
  agent1 re-funded 2 mock NVDAx via scripts/60-x402-accounts.sh (evidence/G14/rerun/accounts-topup-*.log).
- WO-40 security review 2 DONE → docs/work/review-2-findings.md: 0 high, 5 med (R2-01…05), 7 low; privacy claims C2/C8/C10 do not hold, C1/C3/C4/C5/C13/C14
  partial. Fixes: WO-42a web (copilot binding, /api hardening, headers) + WO-43 docs (privacy claims) running; WO-42b web (amounts, intent, note transfer,
  network guards, privacy copy) after WO-41 merges; WO-44 keeper (demo agent verifies MCP call, zod) when a slot frees; WO-43b docs (SECURITY.md review 2
  section + copilot binding wording) after all merge. Out of scope, disclose: on-chain fee bound (contract), MM-owned quoter secrets (PROD).
- WO-41 MERGED (b2a9641): `--accent-text` token; `/` light a11y 97 → 100, 28/28 route×theme = 100. WO-43 MERGED (fb3f05c): privacy claims corrected.
- WO-39 MERGED (94cc421): **G14 402→200 PASS, verifier-run** (fresh clone 45ed1f3, own x402 :8891; borrow 7UFpexpd… #14, relay EskZKj9s…, 200 + 110 CSV
  rows). **G1 2.2.1 gas rows FAIL**: remove_extra_remote_chain has no GAS row (66/67 measured, max 78.72 Tgas) → docs/GATE_FAIL_G1_221.md, WO-45 contract
  (test-only) running → verifier re-check. Docs still say "HTTP leg not re-run" (agent-skill-x402.md:49 etc.) → fix in WO-43b.
- MERGED since: WO-44 keeper (b1931ea; borrow-guard, feed zod 4.6.7 — x402 still pulls zod 3 via @x402/core, disclosed), WO-42b web (313f660),
  WO-46r FACTS F-380…382 + C-020 (bde7269; implicit-account definitions differ, SDK safe side — surface in gate report), WO-42c (0bd0cb3), WO-42a web
  (2111b71; CSP frame-ancestors/object-src/base-uri/form-action, XFO, HSTS; full script-src CSP + manifest pin NOT done), WO-45 contract tests (98a0691;
  remove_extra_remote_chain 2.65 Tgas, oracle reject 2.61; src unchanged, wasm = deployed).
- MERGED: WO-43b docs (1cb5479; SECURITY.md "Review 2" table + residuals), WO-47 verifier (dd5657c; **G1 2.2.1 gas rows PASS** 67/67 max 78.60 Tgas,
  **G14 PASS on HEAD** with borrow_verified: E2suM2LC… #15, relay 4vW2tPF5…) → GATE_FAIL_G1_221 RESOLVED (7f5bd68); WO-43c docs (9fe4c2e). agent1 topped
  up again ~15:26Z (2 mock NVDAx).
- **G9 run 3 PASS** (1a46931; clone 3107a1a: quick start 2.3 min, 0 unbacked claims, review 2 fixes in code, headers, wallet selector opens in Chrome with 0
  CSP errors). **G3b re-run FAIL** (9f05b73; 40 screens.spec networkidle timeouts: /api/health RSC prefetch never settles; everything else green, LH 28/28 = 100)
  → docs/GATE_FAIL_G3B_R2.md, WO-49 web running → WO-50 verifier G3b re-run (full e2e ~1.5 h) → docs tweak (SECURITY.md verifier-coverage line, README MCP
  `symbol` arg, G9/G3b results) → move submission-rc → STATE. Verifier's `next start` pid 14369 on :3217 left running (its kill was refused → Kunal).
- Then: G9 re-run from a fresh clone → move `submission-rc` → STATE. Findings so far: WO-33a/b/c merged (e18ba08, 6727643, e17f17e); apps/web NOT
  deployed anywhere (no deploy config in repo; Vercel team has nectar-landing / nectar-frontend / docs-site-nectar, all created before this repo
  (2026-10-31 and earlier), 0 deployments since 2026-11-09; Railway nectar-network* also pre-date it). H5 (Vercel) still OPEN. Five stale WO-33c
  `next start` servers (:3174–3178) stopped.

## Earlier (2026-11-11 ~09:10Z) — superseded by the top block
- **SUBMISSION-READY on the agent side.** G9 PASS on the re-run (EVIDENCE 89f83ee, fresh clone of 0af5cdd: quick start < 2 min, verify 15 s, gitleaks 272
  commits clean, Feed MCP from README → `agents` claimable). First run FAIL (docs-site hackathon sentence) → GATE_FAIL_G9 RESOLVED; repo-wide branding check
  now first in `verify:quick`. Tag **`submission-rc`** (local only). Only Kunal's items remain (below). Submission payload: `node scripts/build-submission.mjs`
  (dry run); open fields H10 lead/email/size, H14 nearAddress/consent, H2 projectUrl, H3 demoUrl; tracks = defi/security/privacy until H16.
- Demo Feed on :8788 is replaying ~1 day of neardata blocks (429s without an API key; health 503 until caught up). Before recording: if still behind,
  restart it with a fresh FEED_DB_PATH (loses event history) — DEMO_SCRIPT "Before recording".
- **Gates:** every gate PASS (G5 fallback, G8 fixture, Base on a local fork — disclosed). After the D-027 security rollout the chain gates were re-verified from a fresh clone (EVIDENCE b8784c1):
  G2b (2.2.1-v7 wasm byte-identical on this Mac's non-reproducible build), G7 (positions 8/9/10), G13 local fork (11/12, replays revert), G14
  (chain claims; HTTP 402→200 from the orchestrator log only). Test gates re-verified (EVIDENCE 5083d30): G11 PASS (608 unit + 50 sandbox, every
  SR-1…33 has a named test), Solana/EVM suites PASS (forge 105, Solana 10 + 55), G3b PASS on design v2 (e2e 392, a11y ≥ 90 on 22 pairs; home light 97
  from `.nx-delta.up` contrast — optional polish). G1 per-method gas-row check NOT RUN on 2.2.1. Tags p0-green, p1-green, p2-green (local only).
- **Live on testnet:** nectar-core-v2 **2.2.1-v7** (code_hash 3mv4LRm6…, code-only upgrades 2.1→2.2.0→2.2.1, no migrate) + keeper-v2 + quoter
  version_key 5f9bb287…; Solana vault v2 ENZa…pubW (devnet, pull payouts + withdraw/claim); x402-relayer + agent1. Base spoke: vault 0xC64b…1226 +
  MockB20 0x634F…f81d on the LOCAL FORK of Base Sepolia (127.0.0.1:8545, chain 84532, anvil; D-026, disclosed). Real Base Sepolia needs H15.
- **Security:** review = 33 findings (5 H / 8 M / 20 L), fix wave D-027 merged and deployed; SECURITY.md + README/docs status merged (25713a4).
  Disclosed partials: SR-5, SR-6, SR-7, SR-15, SR-4 (EVM remainder push), keeper residuals, Base local fork. Not covered by the review: web/SDK,
  copilot prompt injection, privacy claims.
- **Design v2** (WO-33a/b/c) merged: landing + testnet app.
- **Merged 2026-11-11:** WO-37a (EVIDENCE refs; 8 "pending" survive = G14 402→200 verifier re-run + G1 gas-row check on 2.2.1), WO-37b (DEMO_SCRIPT
  re-seed list + SUBMISSION prose for 2.2.1), WO-37c (mocked remote/Notes E2E did pass in G3b), WO-38 (G9 fix), WO-38b (G9 PASS in docs).
  Scripts: price walk in 58/62, `42-mint-usdc.sh`, `check-no-branding-all.mjs`. Nothing in flight. Nothing is sent, pushed or posted without Kunal.
- RPC default test.rpc.fastnear.com (D-025). Background: keeper-v2 daemon (Solana + Base relays), Feed :8788/:8789, x402 :8791, anvil :8545.
  Plain `cargo near build` on this Mac needs SDKROOT=…/MacOSX26.5.sdk.
- Commits: no Co-Authored-By trailer (Kunal, 2026-11-10); kunal-drall sole author.
- **Human (OPEN, docs/HUMAN_HANDOFF.md; H-NEAR-FAUCET now DONE):** H-GUARD-V7 (Kunal runs `python3 scripts/v7-install-claude-config.py && bash scripts/test-guard-v7.sh`),
  H15 (optional real Base Sepolia ETH), H16 tracks, H17, H18 thesis, H19 builder code, H20 market.near.ai, H11 video, H10/H14 team + payout, H1–H3 publish.

## History (pre-2026-11-11, superseded by the block above)

# STATE.md — one screen for a returning human

Phase: **P2 / submission prep — everything an agent can do without Kunal is done.** p0-green, p1-green tagged; p2-green held (G7 PARTIAL).
Gates: G0–G4 PASS · G5 FALLBACK (disclosed, owner oracle) · G6 PASS · G7 PARTIAL (NEAR side verified; Solana leg not built) · G8 PASS (fixture) · G9 pending (dry rehearsal: quick start 154 s, no unbacked claims)
Blocking right now (Kunal, in order — details in docs/HUMAN_HANDOFF.md):
  1. H-NEAR-FAUCET — owner nectar.testnet ~0.04 NEAR; demo state must be re-seeded before recording (DEMO_SCRIPT re-seed list).
  2. H-TOOLCHAIN-SOLANA — `bash scripts/01-toolchain.sh --with-solana`; unlocks WO-14 (vault) + WO-16 (relay) → full G7. Cut deadline 2026-11-13 12:00 UTC.
  3. H7 NEAR AI key (now a separate key at nearbuilders.org/dashboard, C-019) → live G8.   4. H13 Pyth key → live G5.
  5. H10 lead/email/size · H14 mainnet payout account + consent · H11 video · H2 repo public · H3 X post · H1 send (all Kunal-only).
  6. H-EXPLORER (1 min) · defaults apply at deadline for H4, H5, H8, H9, H12.

Done (2026-11-10):
- Toolchain: Rust 1.95.0, near-cli-rs 0.31.1, cargo-near 0.23.0, gitleaks 8.30.1, yq, pnpm 10.34.9 (evidence/G0/)
- F-020 confirmed by `--help` (flags `--contract-account-id`, `--function-names`, `--signature-scheme`)
- WO-0: `pnpm i` ok, gitleaks pre-commit live, guard test 10/10; `verify:quick` red only on docs-site tsconfig (WO-4 fixes)
- D-009 (PRD §4.2 formula), D-010 (keeper key = 2 methods); docs/work/interface-p0.md = P0 ABI for all agents
- Testnet accounts: nectar.testnet (faucet, 10 NEAR), keeper/buyer1/buyer2/borrower1 .nectar.testnet (0.5 NEAR each),
  keeper function-call key (2 methods). Contract accounts (nectar-core, usdc-mock, nvdax-mock) created at WO-6
  sized from wasm; parent has ~7.9 NEAR left → may need a faucet top-up (H-NEAR-FAUCET) if wasm is large.

In flight: researcher (WO-1 rest: wallet-selector, Next.js, 1Click/Hermes probes, indexer method) ·
WO-2 contract · WO-3 web · WO-4 docs · WO-5 keeper (worktrees).
Next: merge one by one with `pnpm verify:quick`; G1 via verifier; WO-6 deploy; G2; G3.
D-011: wallets = near-connect + near-api-js 7.4.0 on Next 16 (C-008); web agent told mid-flight.
P1 risk (C-007): Hermes `/v2/updates/price/latest` returns 401 unauthenticated on all hosts → G5 likely needs a
  Pyth API key (new handoff when P1 opens) or falls to price-oracle.testnet / owner oracle (D-005). NVDA feed id found (F-053).
Clock note: host UTC is 2026-11-09 ~20:00; "2026-11-10" dates in docs are local (IST). Deadline math uses UTC.
Merged: WO-5 keeper+feed (cdd2fbe), WO-4 docs+README (b436f93). main `pnpm verify:quick` GREEN, docs-site build GREEN.
`pnpm demo:testnet` rewritten in Node (public RPC, no keys/CLI); exits 2 "not deployed" until G2.
Process slip (recorded): after the WO-2 merge (f9d1b30) the orchestrator ran cargo tests but not `pnpm verify:quick`; keeper tests
  began reading the real model.csv and have been red on main since. Found at the WO-3b merge; fixed by WO-5b (e53d2a0), verify:quick green. p0-green waits for G3 PASS
  AND verify:quick green. Merged since: WO-4d (ab529b1), WO-3b (3d5af4a), WO-2c (wasm unchanged).
P1 plan: interface-p1.md; D-013 (Pyth read in contract, separate updater, price-oracle.testnet dropped), D-014 (quoter schema/formula,
  publish via scripts/30 without `outlayer login`). Round 2: WO-10b Pyth source, WO-11b updater + Neardata, scripts/30 publish, testnet upgrade+migrate.
Queued after G3 (small orders): WO-4d docs — README/docs "G2 PASS" wording, run-a-keeper page (keeper exists), storage-and-gas
  gas values from evidence/G1 CSV, web/docs dev port clash (3100 vs 3000), RUNBOOK: refresh owner price within 24 h (closed-session
  max age) and keeper re-creation if its 1 NEAR allowance runs out; WO-2c contract — migrate deprecated
  `testing_env_with_promise_results` (F-131), document/rename `fee_debt_e18` (holds e6-scale values per G2 note).
Open follow-ups: (a) P2/WO-13: PRD §6.5 says sha256(preimage) before sign, §9 says Ed25519 signs raw bytes — researcher records
  CONFLICT, settlement.svg follows the verified answer; (b) docs/img/architecture.svg labels 1Click depth R_c (should be D_c) — docs
  agent, next docs pass; (c) landing/index.html + PRD §20 glossary still show the old uplift formula — WO-3 port uses D-009, PRD is
  read-only; (d) FACTS entries for gtag/Plausible script URLs — next researcher batch; (e) Feed OpenAPI docs page now possible
  (services/feed/openapi.yaml merged). Lesson: 60-turn cap too small for WO-3/WO-4 size → future work orders split smaller.
All P0 build WOs merged: WO-2 contract (f9d1b30), WO-3 web (1324045), WO-4 docs (b436f93), WO-4b (db0606a), WO-5 (cdd2fbe).
WO-6 DONE (5f27f44): nectar-core / usdc-mock / nvdax-mock live; seeded = model.csv demo rows; `pnpm demo:testnet` shows them.
Keeper: single FC key, full-access deleted (D-012). Key files (0600): ~/.nectar/keys/keeper.function-call.json, borrower1.json (G3 write flow).
Parent nectar.testnet has <1 NEAR left: any extra deploy needs a faucet top-up (H-NEAR-FAUCET).

Verified on: 2026-11-10T00:15Z UTC (daily verify)
Last activity: 2026-11-12T21:05:07Z · commit edf3214
Quoter (WO-9, daa91e5): 34 vectors, wasm 92,355 B, version_key sha256 3ce17749ae1b997971d97efa8f79110b586273e39bf9ca00c61a2bdf14ea6cc2
  (reproducible across checkout paths via quoter/build.sh). Web (WO-12, 2b21cbc): Feed oracle/settlement/1Click badges, console owner forms, keepers triggers; e2e 122 pass; lighthouse 100 (console 98).
  Proposed feed fields (oracle_conf_bps, quoter, outlayer_execution_url, keeper) must land in services/feed/openapi.yaml (WO-11b/next).
Fixed: evidence/g3 vs G3 case collision had kept the G3 verifier logs out of git (5bdd66b).
Quoter PUBLISHED (568e344): OutLayer project nectar.testnet/nectar-quoter, version_key 3ce17749…, FastFS URL in config.yaml;
  pin waits for WO-10a. .gitleaks.toml allowlists public content-hash lines only.
WO-11b merged (d7b2e91): Pyth updater (off until H13; synthetic Hermes fixture), Neardata indexer default (fixture from G2 seed block).
P1 live (2026-11-09 UTC): nectar-core V1 code_hash FQjNLgaw… (wasm d617e192…), state_version 1; quoter pinned
  nectar.testnet/nectar-quoter @3ce17749…; NVDAx vol 420 bps; gas reserve funded. G4 run (d87eef6): pos #2 fallback, pos #0 quoter_result
  via OutLayer request 15114 (0.00109 NEAR). Fills = max_discount until secrets_ref exists (WO-10b + OutLayer secrets research).
  DEMO STATE CONSUMED: quote #0 used up, Q_c $3,150, positions #0/#2 closed → re-seed before the demo (needs USDC/NVDAx mints + quotes).
  Owner nectar.testnet ~0.28 NEAR → H-NEAR-FAUCET now matters (next upgrade + re-seed).
Upgrade 2 (2026-11-09T22:38Z, scripts/26, code-only): nectar-core code_hash HqZaadxy… (wasm fa2bb4f1…, WO-10b + WO-10c), state_version 1,
  all views unchanged except get_quoter_config gaining `secrets_ref: null`. No top-up needed (core held 4.24 NEAR).
G4 addendum (2026-11-09T22:45Z): discount pricing PROVEN live — demo MM secrets stored in OutLayer (access And[signer keeper,
  predecessor nectar-core, WasmHash 3ce17749…]); run D: OutLayer request success, quoter_result disc_bps 159 (= 150 + ⌊3000·2000·150/1e8⌋)
  < cap 400, settled at 159. Run C (Whitelist[core, owner]) denied → access condition enforced. vol_bps now 150.
  Positions left: #1 open ($10). Quote #1 remaining ~$2,790. Re-seed needed before demo.
P2 (2026-11-09 UTC): D-016 raw-preimage Ed25519 signing via v1.signer-prod.testnet (sign gas 15 Tgas, response {"scheme":"Ed25519",...}),
  single vault path solana-devnet-v1; interface-p2.md. WO-14 Solana program + WO-16 keeper relay wait for H-TOOLCHAIN-SOLANA (no solana/anchor);
  NEAR AI Cloud returned 500/503 at 23:05Z (G8 live later; fixture path now). Cut-order fallback if no Solana toolchain by 2026-11-13 12:00 UTC:
  demo the signed settlement message on NEAR (G7 partial, disclosed).
WO-17 merged (681beac): copilot verifier (EIP-191 signer recovery, report_data/nonce, dcap-qvl 0.7.1 on a real Phala sample quote). No
  real NEAR AI recording exists (API 500, no key): fixture = Phala sample quote + throwaway-key chat → correctly ends "unverified — hidden".
  G8 must judge that honestly; field names being checked by researcher (attestation JSON).
G7 NEAR side (2026-11-09T23:5xZ): position #6 remote leg (quote #3, 100 bps, recipient DbrceqSn… throwaway) → settlement_signed by
  v1.signer-prod.testnet; scripts/verify-ed25519.mjs: signature_valid true vs authority 6QPGoVj8…; vault program in the preimage is a
  PLACEHOLDER (EgfPYZfK…) — Solana vault not deployed; #6 stays Settling until a relay. Owner ~0.04 NEAR — faucet needed for anything more.
Submission: docs/SUBMISSION.md payload table → scripts/build-submission.mjs; open fields TODO-H10 (lead/email/size), TODO-H14 (mainnet
  nearAddress + consent), TODO-H2 (repo URL), TODO-H3 (X demo post URL; video H11). Tracks defi/security/privacy (agents only if G9 shows MCP).
  Post-P2 NEAR settlement confirmed by G7 run 1 (position #5 settled_near after the p2 upgrade).
Next after G5 + WO-4e: tag p1-green if G5 is PASS or a disclosed fallback (CLAUDE.md §8 P1 acceptance allows "README says exactly which
  fallback is active"); refresh .claude/agents/quoter.md at the boundary; open P2 (WO-13 researcher) — Solana leg needs H-TOOLCHAIN-SOLANA,
  copilot needs H7 (fixture verifier otherwise). Re-seed demo state (needs H-NEAR-FAUCET).
Phase-boundary TODO: refresh .claude/agents/quoter.md (still describes the
  pre-D-014 schema); scripts/30 must call set_quoter_pin(project_id, version_key) per interface-p1.
Feed (WO-11a, f525710): 1Click sampler (dry-only, signature-verified, NVDAx no_route), MCP server stdio + HTTP :8789/mcp. For the next
  researcher batch: C-014 candidate — live dry quote has amountOutUsd == amountInUsd (F-064 gap always 0; real out in amountOutFormatted);
  `claude mcp add` flags + Claude Desktop config shape (TODO-FACTS in services/feed/README) before G9; dry recipient default nectar-feed-dry.near.

Latest (2026-11-10 ~00:40Z UTC): G9 pre-check fixes merged — feed/keeper default ids from config.yaml (no env needed), MCP stdio banner-free
  (`pnpm -s --filter feed mcp`), README quick start complete. Feed MCP works from a fresh clone → `agents` track claimable once final G9 records it
  (SUBMISSION.md rule). Submission payload: scripts/build-submission.mjs (dry-run prints; send needs --send + HUMAN_CONFIRMED=1 + typed yes).
  Live testnet state: positions #1 Open ($10), #6 Settling (signed, no relay); quotes #1 $2,555 @400, #2 $1,000 @300 (remote), #3 $295 @100 (remote);
  owner price $89; vol 150; quoter pinned + secrets (mm-demo); signer config + remote_chain (placeholder vault EgfPYZfK…) set.
When Kunal returns: do the OPEN handoffs top to bottom and reply with ids; then the orchestrator re-seeds the demo, runs WO-14/16 if the Solana
  toolchain exists, re-runs G5/G8 live if keys exist, then final G9 and the submission dry-run for Kunal to send.
