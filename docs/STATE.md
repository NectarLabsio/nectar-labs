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
- Production still needs WO-34p + WO-34q + H-LEGAL → G3b re-run 5 (add a Vercel-preview check of the dynamic routes) → new tarball → production.
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
- **On H-LEGAL:**
  1. Orchestrator fills config.yaml `site:`.
  2. Docs agent replaces every `TODO-H-LEGAL` in legal/*.md.
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
Last activity: 2026-11-12T05:18:06Z · commit 2e7f8cb
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
