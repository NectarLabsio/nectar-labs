# HUMAN_HANDOFF.md

Steps only Kunal can do. Agents append or update entries here the moment such a step appears, then
continue with other work. Kunal reads `docs/STATE.md`, does the OPEN items top to bottom, and replies
in Claude Code with the id (for example `H7 done`). The orchestrator then does exactly what the
entry's "What Claude Code does then" line says.

Status values: OPEN · WAITING (agent did its part, needs Kunal) · DONE · DEFAULTED (deadline passed,
default applied, disclosed in README) · SUPERSEDED (replaced by the entries it names; history kept) · CLOSED (answered or done; the answer
is recorded in the entry, history kept) · N/A (not needed unless the condition the entry names occurs).

---

## H-TOOLCHAIN — pinned P0 toolchain                status: DONE 2026-11-10   (Kunal asked; installed by Claude Code)
Installed: Rust 1.95.0, near-cli-rs 0.31.1, cargo-near 0.23.0, gitleaks 8.30.1, yq v4.54.3, pnpm 10.34.9. Log: evidence/G0/toolchain.log.

## H-TOOLCHAIN-SOLANA — Solana CLI + Anchor 0.32.1   status: DONE 2026-11-10 (Kunal asked; installed by Claude Code: anchor-cli 0.32.1 via avm, active solana-cli 2.3.0 = Anchor CI pin C-017; Anza stable 4.3.2 also present; logs evidence/G0/toolchain-*)   needed by: P2 / G7 (not P0)
Why a human: the auto-mode classifier refused `scripts/01-toolchain.sh --with-solana` (Anza installer + `cargo install avm`).
What Kunal does (≈10 min, mostly compile): `cd /Volumes/T7/nectar-labs && bash scripts/01-toolchain.sh --with-solana 2>&1 | tee evidence/G0/toolchain-solana.log`,
  or add `"Bash(bash scripts/01-toolchain.sh*)"` to `permissions.allow` in `.claude/settings.json`. Reply `H-TOOLCHAIN-SOLANA done`.
What Claude Code does then: records `solana`/`anchor` versions in FACTS, unblocks WO-14 when P2 opens.
Default if silent by 2026-11-13 12:00 UTC: Solana leg cut per CLAUDE.md cut order (signer round-trip demo on NEAR only), disclosed in README.

## H-EXPLORER — open the three testnet explorer links once   status: OPEN   needed by: G9 (non-blocking for G2/G3)
Why a human: nearblocks returns HTTP 403 to automated fetches (bot protection); the verifier could not see the pages (EVIDENCE §G2).
What Kunal does (1 min): open in a browser and confirm each shows a contract with recent transactions:
  https://testnet.nearblocks.io/address/nectar-core.nectar.testnet · https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet · https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet
  Reply `H-EXPLORER ok` (or what looked wrong).
What Claude Code does then: marks the links human-verified in EVIDENCE §G2.
Default if silent: RPC evidence (view_account code_hash = G1 wasm) stands; README links stay; G9 notes "explorer pages not machine-verified".

## H-ORACLE — keep the owner price fresh                status: DONE 2026-11-13 (schedule A running on Railway; first refresh 11:28Z)   needed by: judging 16–18 Nov
Done (2026-11-13): Kunal chose schedule A: re-assert the current price every ≥ 60 s in NYSE session windows and every ≥ 6 h outside them, through
  2026-11-18 (`ops.oracle_refresher` in packages/config/config.yaml, commit f34260a; tick 15 s). He applied the Railway service `oracle-refresher`
  in the dashboard (deploy 67d55980, 03:13Z); it generated its own key on the volume. At 11:27Z the orchestrator added that key to nectar.testnet as
  a function-call key: receiver `nectar-core-v2.nectar.testnet`, method `update_owner_price` only, allowance 5 NEAR (tx
  BHopF1cuKAMDFoCnKyNZPPKR3qVPgs5dYiKxx6jwWpao; evidence/ops/refresher-add-key-20261113T112742Z.log). First refresh 11:28:05Z, tx
  De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG (same price 135000000; docs/STATE.md).
What Claude Code does now: checks `oracle_age_s` with `pnpm demo:testnet` each session. If the refresher stops or the allowance runs out, it sends
  the RUNBOOK one-shot `update_owner_price` with the current price and records the tx in evidence/ops/. The history below is kept.
Why a human: the owner (fallback) oracle goes stale 86,400 s after each refresh (`max_age_s_closed` in packages/config/config.yaml); then borrows
  and `trigger_preliquidation` fail with `oracle stale` (RUNBOOK standing duty 1). On 2026-11-12 it was about 31 h stale (age 112,379 s) and was
  refreshed at ~15:12Z with the same price 135000000 (tx 3E92xm8KDQcVC2FZh4MRn4dkBvZ1uS3H7eCvCubXM8rH, evidence/ops/owner-price-refresh-20261112T151114Z.log).
  Next stale ≈ 2026-11-13 15:10Z; judging runs 16–18 Nov. Keeping it fresh needs a long-running host loop, and an agent may not start one
  (the permission classifier blocks it as unauthorized persistence).
What Kunal does, Option A (one command; the machine stays on through 18 Nov):
  `cd /Volumes/T7/nectar-labs && scripts/ops/refresh-owner-price.sh >> evidence/ops/owner-price-refresher.log 2>&1 &`
  It re-asserts the current on-chain price when it is older than 12 h, signs as nectar.testnet via the OS keychain and never changes the price.
  Reply `H-ORACLE A` (or `H-ORACLE B` to choose Option B).
Option B: the orchestrator runs the one-shot RUNBOOK `update_owner_price` with the same price (current `oracle_price_usd_e6`) in every session.
In-session rule (both options): during NYSE hours the session counts as open only while the owner price is under 15 min old
  (`SESSION_MAX_PRICE_AGE_NS` = 900 s, contracts/nectar-core/src/lib.rs:75, checked at lib.rs:348). Older than that, `get_exit_capacity` returns
  `session_open: false`, `session_reason: "stale_price"`, and the closed-session (weekend) parameters apply: D_c forced to 0 and the weekend
  haircut instead of the base one (math.rs:143–144). The 24 h max age still decides whether borrows work at all. Option A's 12 h refresher keeps
  borrows working but does not keep the session open in NYSE hours; Option B's session-start refresh opens it for 15 min at most.
  The choice stays A or B as written.
What Claude Code does then: A — reads evidence/ops/owner-price-refresher.log each session and checks `oracle_age_s` < 86,400 with
  `get_exit_capacity`; B — runs the one-shot refresh at session start and records the tx in evidence/ops/.
Default if silent: Option B while a session runs; with no session running the price goes stale and the app shows "oracle stale" on borrow
  (disclosed fallback).

## H13 — Pyth API key (for a live NVDA price, G5)        status: OPEN   needed by: P1 / G5 (2026-11-13 12:00 UTC)
Why a human: Hermes `/v2/updates/price/latest` returns 401 without a key (C-007, F-056); keys are tied to a personal account at app.pyth.com.
What Kunal does (5 min): 1. https://app.pyth.com → sign up (free) → create an API key (name: nectar-labs-testnet).
  2. In his shell: `mkdir -p ~/.nectar && printf '%s' '<paste key>' > ~/.nectar/pyth.key && chmod 600 ~/.nectar/pyth.key` (never in chat, never committed).
  3. Reply `H13 done`.
What Claude Code does then: keeper reads PYTH_API_KEY_PATH=~/.nectar/pyth.key, tests Hermes with Bearer auth; if it works, creates the
  updater account, pushes the NVDA update to pyth-oracle.testnet, switches NVDAx to `oracle_source = Pyth` and runs G5 live.
  If the key does not unlock Hermes (docs only promise it for Pyth Pro, F-056), records that and keeps the owner oracle.
Default if silent by 2026-11-13 12:00 UTC: owner oracle stays (D-013), README/Feed show the "owner oracle" badge, G5 records the disclosed fallback.

## H-NEAR-FAUCET — top up nectar.testnet with testnet NEAR     status: DONE 2026-11-10 (Kunal replied `H-NEAR-FAUCET done`; nectar-core-v2 deployed after, EVIDENCE §G2b PASS 2026-11-10T16:52Z)   needed by: P1 redeploy (WO-10 merge)
NOW (2026-11-10): nectar.testnet holds ~0.95 NEAR. P1 needs ~2–3 NEAR: larger nectar-core wasm storage (~+0.5–1 NEAR), OutLayer
`create_project` 0.1 NEAR, gas reserve for executions (~0.004 NEAR each, F-046), an oracle-updater sub-account.
What Kunal does (2 min): open https://near-faucet.io/ (F-154), request NEAR for `nectar.testnet` (repeat if allowed), reply `H-NEAR-FAUCET done`.
Default if silent: P1 contract upgrade waits; quoter and web work continue; if still silent at G4 time, G4 is recorded as blocked on funds.
(History below: the original parent-creation entry.)
Why a human: the faucet CLI may be rate-limited; the browser faucet needs a human.
What Kunal does (2 min):
  1. Open the NEAR testnet wallet / faucet page the script prints, create `nectar.testnet` (or the
     name the script printed if taken), choose "save key to keychain" flow or export the key.
  2. If a key file was downloaded: `mkdir -p ~/.nectar/keys && mv ~/Downloads/<file>.json ~/.nectar/keys/nectar.testnet.json && chmod 600 ~/.nectar/keys/nectar.testnet.json`
  3. Reply: `H-NEAR-FAUCET done <account id>`
What Claude Code does then: imports the key to the keychain, re-runs `scripts/00-accounts.sh --skip-parent`, records F-020/ids in FACTS, continues G2.
Default if silent: the orchestrator keeps retrying the faucet every 15 min; P0 deploy waits on this one item while web/docs/contract tests continue.

## H4 — analytics vendor                             status: OPEN   needed by: WO-4 (any time before Nov 14)
Why a human: a tracking id or domain is tied to Kunal's account; it is also a privacy policy decision.
Options: (a) GA4 — needs a measurement id `G-XXXXXXX`; consent banner required (shipped). (b) Plausible — cookieless, needs the site domain registered at plausible.io; banner only covers preference storage.
What Kunal does (3 min): create the property/site, then reply `H4 ga4 G-XXXXXXX` or `H4 plausible <domain>`.
What Claude Code does then: sets `NEXT_PUBLIC_ANALYTICS` and `docusaurus.config.ts` accordingly, updates the Cookie page's storage list, redeploys previews, records in EVIDENCE.
Default if silent: analytics off; banner shipped; both code paths present and tested with a dummy id.

## H5 — domains and hosting                          status: SUPERSEDED 2026-11-12 by H-HOST + H-DOMAIN (+ H-DNS), D-030; history below   needed by: G3 (previews fine without)
Why a human: domain DNS and Vercel account ownership.
What Kunal does (5 min): in Vercel create projects `nectar-labs-web` and `nectar-labs-docs` (or run `vercel link` in `apps/web` and `apps/docs-site`); add domains; optionally `vercel env add VERCEL_TOKEN` is NOT needed — instead run `vercel --prod` yourself, or paste a scoped token into `~/.nectar/vercel.token` (0600) and reply `H5 token`.
What Claude Code does then: with a token, deploys previews after each green gate via `vercel deploy --prebuilt`; without, prints the exact `vercel` commands in EVIDENCE.
Default if silent: no hosted preview; README links to `pnpm --filter web dev` and screenshots in evidence/.

## H-DOMAIN — a domain for the hosted demo             status: CLOSED 2026-11-12 (nectarlabs.io)
Final answer (Kunal, 2026-11-12, evening): nectarlabs.io. Hosts (`site.production_hosts` in packages/config/config.yaml): site https://nectarlabs.io
  (www 308 → apex), app https://testnet.nectarlabs.io, docs https://docs.nectarlabs.io (pages at the root), status https://status.nectarlabs.io.
  Registered 2026-11-12T18:54Z, delegated to Vercel DNS (F-458). The earlier platform hosts redirect (308) to these from the release with WO-62b
  and WO-64 (H-DEPLOY).
Earlier answer (Kunal, ~11:00Z): "go for it, i will set domain later" → production on `*.vercel.app`: SITE https://nectarlabs.vercel.app, APP https://nectarlabs-app.vercel.app,
  docs under APP `/docs`. No domain was bought.
Switching to a domain later: Kunal names the domain (one he owns or buys himself; agents never buy one) → the orchestrator adds it to
  nectar-labs-web, updates SITE_URL/APP_URL/DOCS_URL (web) and APP_URL/DOCS_ORIGIN_URL (docs), redeploys the same commit, and writes the DNS
  records Vercel returns into H-DNS. No code change.
Original request (kept for the record):
Why a human: registering a domain spends real money and binds a registrar account. Agents never buy a domain.
Facts: nectarlabs.io is **not registered** (F-395: whois.nic.io "Domain not found", NXDOMAIN at a0.nic.io, 2026-11-11T19:43Z). The orchestrator's
  pre-check (docs/work/wo-34-deploy.md) saw the Vercel registry offer it at $14.99 for the first year, $46 renewal. That contradicts the brief, which said it
  already answered HTTP (FACTS C-022).
What Kunal does (5 min), one of:
  (a) Vercel dashboard → Domains → Buy → `nectarlabs.io` (check the price shown), then reply `H-DOMAIN nectarlabs.io`.
  (b) Name a domain you already own (the team already holds nectar.monster, nectarnetwork.fun, nectarn.wtf on Vercel DNS): reply `H-DOMAIN <domain>`.
  (c) Reply `H-DOMAIN none` to keep the platform URLs.
What Claude Code does then: adds the domain to the new Vercel web project (SITE = apex, APP = `ac.<domain>`, `www` → apex 301), sets SITE_URL, APP_URL,
  DOCS_URL and DOCS_ORIGIN_URL (see RUNBOOK "Docs site under /docs"), redeploys the same commit, then writes the records Vercel returns into H-DNS.
Default if silent by 2026-11-13 06:00 UTC: `*.vercel.app` aliases for SITE and APP (docs under APP `/docs`) and `*.up.railway.app` for the Feed. A domain
  added later is an env + alias change, no code change.

## H-DNS — DNS records for the chosen domain           status: CLOSED 2026-11-12 (Vercel DNS; no records needed)   needed by: production on a custom domain
Closed: nectarlabs.io uses Vercel DNS (ns1/ns2.vercel-dns.com), and the authoritative servers answer for all five names (apex, www, testnet,
  status, docs) with no record added by Kunal (F-458, 2026-11-12T19:31Z). Original request kept below.
Why a human: only the domain's owner can edit its DNS zone (unless the domain uses Vercel DNS, where Vercel sets the records itself).
What Kunal does (5 min): after H-DOMAIN, add exactly the records listed below at the domain's DNS provider, then reply `H-DNS done`.
  Records: TODO-H-DNS (the orchestrator pastes the A/CNAME/TXT values Vercel returns when the domain is added to the project; none yet).
What Claude Code does then: waits for Vercel to show the domain as verified and the certificate as issued, then the verifier re-runs the production checks
  (wo-34v) on the custom domain and records them in EVIDENCE.
Default if silent: the platform URLs from H-DOMAIN's default stay the public URLs.

## H-LEGAL — operator, country, contact, X handle     status: CLOSED 2026-11-12
Answer (Kunal, 2026-11-12): operator "Nectar Labs" · country "United States / India" · contact "kunal@nectarnetwork.fun" · X "@xNectarNetwork".
  Contact email kept as is after the domain change (Kunal, 2026-11-12).
  Typo correction: he typed "kunal@nectarnetwork.funm"; the orchestrator corrected it to ".fun", the address the site already uses, and capitalised
  the product name. No governing-law clause (Kunal): terms §12 names operator and contact only. Filled in `packages/config/config.yaml` `site:` and
  in the legal pages (privacy, terms, disclaimers; WO-34u). Also closes H9.
Original request (kept for the record):
Why a human: the legal pages name who operates the site and where; only Kunal can state his legal identity and choose a public contact. Overlaps H9
  (entity name, TODO-H9); one answer covers both.
Where it goes: `packages/config/config.yaml` → `site:` (`operator`, `country`, `contact`, `x_handle`; all null today, marked TODO-H-LEGAL). The pages read
  them from there. A production build with operator, country or contact null fails on purpose, so no page ships a blank operator.
What Kunal does (2 min): reply `H-LEGAL operator="<person or company name>" country="<country>" contact="<email>" x="<@handle or none>"`.
What Claude Code does then: the orchestrator fills `site:`; the legal pages (privacy, cookies, terms, disclaimers; WO-34e) and the site footer show the
  values; the production guard passes; the deploy is promoted to production.
Default if silent by 2026-11-13 12:00 UTC: no production promotion (previews only, noindex). The submission continues without hosting.

## H-DEPLOY — approve production deploys                status: DONE 2026-11-13 (Kunal typed approval; release 4 = c95cd0c deployed ~02:00Z; web 1a95022 = WO-74 deployed 13:51Z, approved for that fix only)   needed by: the release with WO-62b, WO-64, WO-62c (before recording)
Done: Kunal typed his approval on 2026-11-13. Release 4 (commit c95cd0c) went to production at ~02:00Z: Vercel web dpl_Bm1uwQcX… (replaced at
  13:51Z, below), docs dpl_DpqAmb6… (still serving). The
  verifier's acceptance on the custom hosts passed 8 of 8 items (docs/EVIDENCE.md §"WO-34 production (custom hosts)", 2026-11-13T02:05Z–02:40Z).
  Web redeploy 2026-11-13 13:51Z: Kunal approved deploying the WO-74 fix only (the borrow composer refreshes its balance after "Get test
  assets"). Commit 1a95022 went to the web project as Vercel dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K with the Vercel CLI, because the claude.ai
  connectors were down (evidence/WO-34/deploy-web-cli-20261113T135102Z.log). Docs were not redeployed (dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE, c95cd0c).
  Verifier check: docs/EVIDENCE.md §"WO-34 production (web 1a95022, WO-74)" (WO-78).
  Any further production deploy needs Kunal's approval again. Original request kept below.
Why a human: the web production deploy was denied by the auto-mode classifier on 2026-11-12, so production deploys need Kunal's approval in
  this session. Merged but not deployed: status host, docs at the root of docs.nectarlabs.io, platform-host 308s (WO-62b, WO-64), "Get test
  assets" button (WO-62c).
What Kunal does (1 min): approve the Vercel deploy prompt when the orchestrator asks, or add a permission rule for the Vercel connector's
  create_deployment tool. Reply `H-DEPLOY ok`.
What Claude Code does then: deploys the G3b-passed commit to both Vercel projects (RUNBOOK "Deploy through the connectors"), sets `STATUS_URL`,
  `DOCS_URL` and `LEGACY_HOSTS` in the web env, and asks the verifier for the production check on the custom hosts (EVIDENCE §"WO-34 production").
Default if silent: production keeps the release recorded in EVIDENCE §"WO-34 production" on the custom hosts; README says what it lacks.

## H-DEMO-WALLET — import demo.nectar.testnet into a wallet   status: DONE 2026-11-13 (orchestrator, under Kunal's conditions)   needed by: the demo recording (H11)
Done (2026-11-13): under Kunal's conditions the orchestrator imported demo.nectar.testnet into the Intear web wallet in the Chrome profile
  `~/.nectar/demo-chrome-profile` (scripts/demo/intear-setup.mjs; terms boxes ticked per Kunal, no password asked). The phrase was never printed.
  The app at testnet.nectarlabs.io is connected through Intear "Web". On chain the account still has one full-access key (the Intear app key is
  off-chain). Still open: test assets; the account held 0 mock NVDAx at block 277504628 (docs/FINAL_REPORT.md; DEMO_SCRIPT step 5).
  Original request kept below.
Why a human: the account's recovery phrase must never reach an agent, a log, the screen or the repo. It is only in
  `~/.nectar/keys/demo.nectar.testnet.json` (0600; account created 2026-11-12, tx 5NbjrugATtcyoqz5sjo9vGmAQz5EmMNkdafK5Em3bTC7).
What Kunal does (3 min, off camera, in his own terminal):
  `node -e 'console.log(require(process.env.HOME + "/.nectar/keys/demo.nectar.testnet.json").seed_phrase)'`
  then imports the phrase into a testnet wallet from the near-connect selector, clears the terminal and closes the window. Reply `H-DEMO-WALLET done`.
What Claude Code does then: makes sure the account holds test assets (docs/DEMO_SCRIPT.md "Before recording" step 5, path A or B).
Default if silent: the take uses `pnpm demo:capture` (captioned silent screens), DEMO_SCRIPT fallback.

## H-KEYS — keeper testnet signing key as a Railway secret   status: OPEN (treated as not confirmed)   needed by: hosted keeper only
Why a human: storing a signing key with a third party changes where keys live (CLAUDE.md: OS keychain or `0600` files under `~/.nectar/`). Kunal's
  paste kept the line "New testnet-only function-call keys… may be stored as Railway secrets", but the template fields around it were left unfilled, so it
  is not read as a confirmation.
Scope (2026-11-12): the keeper only. The x402 relayer option is dropped: `@fastnear/x402` 2.5.0 needs a full-access relayer key and rejects
  function-call keys (FACTS F-328, C-023), so a function-call key cannot settle and no full-access key goes to Railway. x402 stays on the operator's
  machine whatever the answer here (DECISIONS D-031).
What Kunal does (1 min): reply `H-KEYS yes` (one new testnet-only function-call key for the keeper, created for this purpose with a small allowance,
  stored only as a Railway service variable) or `H-KEYS no`.
What Claude Code does then, on yes: creates the new function-call key on testnet (method-restricted, never full access, never a key in
  `~/.nectar/`), sets it as a Railway variable on the new project, deploys the keeper service, records the public key and allowance in EVIDENCE.
  On no: nothing leaves `~/.nectar/`.
Default if silent: the keeper stays local (it runs when the operator runs it). The hosted app says when settlement runs.

## H-NEARDATA — Neardata (FastNear) API key for the hosted Feed   status: DONE 2026-11-13 (Kunal supplied the key; FEED_INDEXER=neardata since 02:22Z)   needed by: event history on the hosted Feed
Done: Kunal supplied the key on 2026-11-13. It sits on Railway service feed as `FEED_NEARDATA_API_KEY`, which the Feed reads
  (services/feed/src/hosted.ts:20). The orchestrator set `FEED_INDEXER=neardata` at 02:22Z; since 11:36Z the Feed uses start block 277503800,
  `FEED_POLL_MS` 1000 and a fresh `FEED_DB_PATH` (docs/STATE.md). /health reports `source` `views+neardata`, `history` `indexed`. `events_indexed`
  stayed 0 until the H-FEED-EVENTS fix (the Feed then accepted event version 1.0.0 only); since the 12:10Z redeploy from 37dfec9 it indexes
  nectar-core-v2 events from block 277503800 on (H-FEED-EVENTS below).
  Key: not sealed today. It was pasted in a chat session, so treat it as exposed. Kunal will add a NEW key, sealed, in the Railway dashboard when he
  rotates it at dashboard.fastnear.com after judging (after 2026-11-18). Original request kept below.
Why a human: creating an account and an API key with a third party (FACTS F-448). The key goes from dashboard.fastnear.com; the exact click path is not
  verified (the dashboard answers scripts with a Cloudflare challenge, F-448). Neardata takes it as `Authorization: Bearer <key>` (F-448).
What Kunal does (5 min): create the key at dashboard.fastnear.com, then Railway → project nectar-labs → service feed → Variables → add
  `FEED_NEARDATA_API_KEY` (sealed). Reply `H-NEARDATA done`. Never paste the key in chat or in the repo.
What Claude Code does then: the orchestrator switches `FEED_INDEXER` from `views` to `neardata` and checks /health. Note: the Feed code today reads the
  key from a file named by `FEED_NEARDATA_API_KEY_PATH` (services/feed/src/main.ts:51, F-448), not from `FEED_NEARDATA_API_KEY`; the switch therefore needs
  the env-var read (keeper agent, services/feed) or a start step that writes the variable to a `0600` file, before /health can show neardata.
Default if silent: views mode; the Feed shows event history as unavailable (honest empty states).

## H-FEED-EVENTS — let the hosted Feed index nectar-core-v2 events   status: DONE 2026-11-13 (Kunal: "fix"; WO-71 merged 37dfec9, redeployed 12:10Z)   needed by: event history during judging (16–18 Nov)
Done (2026-11-13): Kunal replied `fix`. WO-71 (merge 37dfec9): the Feed accepts nectar event versions 1.0.0 and 2.0.0 (v2 adds only fields the
  Feed does not read; evidence/WO-71/fields.md), indexes `settled_reserve`, and /health adds `indexer_cursor` and `indexer_lag_blocks`. The hosted
  Feed was redeployed from 37dfec9 at 12:10Z (Railway deploy d2861e5f) with a fresh database and `FEED_START_BLOCK` 277503800. At 12:11:32Z it
  indexed blocks 277503800–277503899 with 1 event (the 11:28Z `oracle_updated`, block 277503817); indexer lag 4151 → 0 blocks by 12:27Z
  (evidence/ops/feed-v2-reindex-20261113T121107Z.log). Events before block 277503800 are not in the hosted Feed. Paid CSV export through the
  local x402 at 12:28Z: 402 → 200, 112 rows, tx 8bXCY34SVYv5b7vJ4GLfWkbJtQdqbSSBJsrzPCE75XRk (evidence/ops/x402-paid-download-20261113T122853Z.log).
  Orchestrator runs, no verifier record. README Feed rows and DEMO_SCRIPT step 3 updated (WO-72).
  Parallel block fetch (faster catch-up): after judging, unless the Feed falls behind during judging (Kunal, 2026-11-13).
Original request (kept for the record):
Why a human: it is a product code change after the freeze plus a Railway redeploy (approval). Today the Feed accepts only event version `1.0.0`
  (services/feed/src/events.ts:7, :34; services/feed/test/feed.test.ts:54 asserts that a `2.0.0` event is rejected) while nectar-core-v2 emits
  `2.0.0` (contracts/nectar-core/src/events.rs:8). The hosted Feed therefore indexes no event: `events_indexed` 0, `/api/settlements` empty
  (docs/FINAL_REPORT.md, "Failed or open").
What Kunal does (1 min): reply `H-FEED-EVENTS fix` (the keeper agent makes the Feed accept 2.0.0, checks that NECTAR_EVENTS covers the v7 events,
  updates the test; then a Railway redeploy and an event test) or `H-FEED-EVENTS views` (keep snapshots only).
What Claude Code does then: on fix, work order to the keeper agent (services/feed), verify, redeploy with approval, re-run the event test, and the
  docs agent updates the README Feed rows. On views, nothing; the README and DEMO_SCRIPT already say there is no event history.
Default if silent: snapshots only, no event history (disclosed in the README Feed rows).

## H-HOST — approve the Vercel connector's team access   status: CLOSED 2026-11-12
Closed (2026-11-12): the deploy went through the Vercel and Railway connectors instead of CLI logins. Kunal approved the Vercel connector's team
  access (~05:20Z, docs/STATE.md); the Railway connector already had access. Production was deployed from ca34111 at ~13:35Z (docs/STATE.md).
Original request (kept for the record):
Decision (Kunal, 2026-11-12: "use mcp for vercel and railway"): deploy through the Vercel and Railway connectors, not the CLIs. **No CLI login is
  needed.** Path: docs/work/wo-34m-mcp-deploy.md; operations: RUNBOOK "Deploy through the connectors (no CLI login)".
Why a human: the Vercel connector has no write access to the team "kunal's projects" (create refused with 403). Only Kunal can grant it. Agents never
  approve access for him and never upgrade a plan.
What Kunal does (1 min): open the single-use authorize link the orchestrator sends (valid 10 min; ask for a new one if it expires) and approve the
  connector's access to the team. Reply `H-HOST done`.
What Claude Code does then: creates the new Vercel projects nectar-labs-web and nectar-labs-docs (the pre-repo projects nectar-landing,
  nectar-frontend and docs-site-nectar stay untouched) and deploys previews of the G3b-passed commit; the verifier records deployment ids, URLs and
  headers in EVIDENCE (wo-34v). Production still waits for H-LEGAL, then the G3b re-run, then a tarball of that commit.
Railway (no step for Kunal): the plan is still not readable through the connector. The bucket, the artifacts function and the Feed already run on the
  workspace (project nectar-labs; Feed health ok on 2026-11-12 per docs/STATE.md, verifier record pending). Agents never upgrade; a create refused for
  plan reasons is recorded here. Plan facts (FACTS F-404, F-405, F-412, F-417, read 2026-11-12): Free $0 a month ("$1 of free credit per month"),
  Hobby $5, Pro $20. Free allows 1 volume per project (0.5 GB) and 1 replica with 0.5 GB RAM per service, so Free is enough for the Feed (x402 is not
  hosted, D-031); a hosted keeper (H-KEYS yes) would need its own check. Free buckets: "up to 10 GB-month", counted against the $1 credit, access
  suspended when it is used up (files kept). Log retention: Free 3 days, Hobby 7, Pro 30 (the privacy page states this).
Default if silent by 2026-11-13 06:00 UTC: no Vercel deploy. The Feed alone stays up on Railway, and the submission continues without the hosted app
  (WO-34 limits). README keeps the local quick start.
History: until 2026-11-12 this entry asked for two CLI logins (`vercel login`, `railway login`, versions F-394) and the Railway plan name. The
  connector decision replaced both; the CLI scripts stay as the fallback (RUNBOOK).

## H7 — NEAR AI Cloud API key                         status: OPEN   needed by: P2 / G8 (live test only)
Why a human: paid credential tied to Kunal's account ($10 credit).
What Kunal does (3 min):
  1. https://cloud.near.ai → sign in → API keys → Create key (name `nectar-labs-hackathon`).
  2. `echo 'NEAR_AI_API_KEY=<paste>' >> apps/web/.env.local` (never commit).
  3. Reply: `H7 done`
What Claude Code does then: runs `pnpm --filter web test:copilot --live`, updates EVIDENCE G8, flips the copilot badge from "key missing" to live.
Default if silent (2026-11-14 15:00 UTC): copilot ships with the recorded-fixture verifier and a visible "key missing" state; README says so.

UPDATE 2026-11-10T00:15Z (C-019, daily verify): the NEAR Builders $10 credit is now a SEPARATE API key claimed at
https://nearbuilders.org/dashboard (not applied to a cloud.near.ai account). Either route works: claim it there, or create a key at
cloud.near.ai. Store it outside the repo: `printf '%s' '<key>' > ~/.nectar/nearai.key && chmod 600 ~/.nectar/nearai.key`, then reply `H7 done`.
Note: NEAR AI Cloud /v1/models has returned HTTP 500 since 2026-11-09T23:05Z; the live G8 run happens once it answers.

## H8 — 1Click API key (optional)                     status: OPEN   needed by: WO-11 (optional)
Why a human: key issued per partner; lowers displayed fee from 25 to 20 bps.
What Kunal does: request a key per https://docs.near-intents.org/ ; `echo 'ONE_CLICK_API_KEY=<paste>' >> services/keeper/.env.local`; reply `H8 done`.
Default if silent: unauthenticated dry quotes; Feed shows the fee the quote returns.

## H9 — legal identity and contact                    status: CLOSED 2026-11-12
Closed by the H-LEGAL answer (Kunal, 2026-11-12): entity name "Nectar Labs", contact "kunal@nectarnetwork.fun" (mailto links). No `TODO-H9`
  marker remains in the legal pages (WO-34u).
Original request (kept for the record):
Why a human: entity name, controller address, contact email, form provider are legal statements.
What Kunal does (2 min): reply `H9 <entity name> | <contact email> | <form provider or mailto>`.
What Claude Code does then: replaces `TODO-H9` in `apps/docs-site/docs/legal/*.md` and the web footer; rebuilds docs.
Default if silent: "Nectar Labs (unincorporated project)", `kunal@nectarnetwork.fun`, mailto form.

## H10 — team and second-project check               status: DONE 2026-11-13   needed by: SUBMISSION.md
Done: Kunal replied `team: Kunal | projects: 1 | lead: Kunal | email: kunal@nectarnetwork.fun | size: 1` and "Use "Kunal" with no surname
  everywhere: SUBMISSION leadName, README Team, the docs team page and Prior work." WO-82 filled SUBMISSION `leadName` `Kunal`, `email`, `size` `1`,
  README Team, the docs team page and both Prior work texts. `projects: 1` is recorded as written in SUBMISSION.md; Q-015 asks each README to
  name the other project, and the reply does not name it.
What Kunal does: reply `H10 team: <names/handles> | projects: <0 or 1 other> | lead: <name> | email: <address> | size: <1 or "2 - 4" …>` (SUBMISSION.md `leadName`, `email`, `size`).
Default if silent: Kunal only; Q-015 noted as unconfirmed in SUBMISSION.md (blocks H1).

## H11 — demo video voice-over                         status: OPEN   needed by: Nov 14
Why a human: voice. Agents produce `evidence/demo.webm` (captioned, silent) with `pnpm demo:capture`.
What Kunal does (15 min): record voice over `docs/DEMO_SCRIPT.md`, or accept the captioned version; upload to the host the submission form expects; reply `H11 <url>`.
Default if silent: captioned silent video path given in SUBMISSION.md; URL field `TODO-H11`.

## H12 — prior-work disclosure wording               status: DONE 2026-11-13 (Kunal's edited text)   needed by: README before H2
Done: Kunal sent an edited text (2026-11-13), used verbatim in README "Prior work", README.template.md and SUBMISSION.md (WO-82). The docs
  site page uses the same sentences with "the hackathon" / "the hackathon window" written as "the build window" (no hackathon wording on the docs site).
What Kunal does: read README "Prior work", edit if needed, reply `H12 approved`.
Default if silent: drafted text stands with the note "draft — approve" removed only after H12.

## H2 — repo public, push, final tag                 status: PUSH DONE, tags pending   needed by: Nov 14   NEVER by an agent
Done 2026-11-13: Kunal pushed main to https://github.com/NectarLabsio/nectar-labs (public; `git ls-remote origin` main = b6d6f41). Tags follow after the final
  `submission-rc` move. README quick start and SUBMISSION `projectUrl` filled (WO-75).
Tag: `submission-rc` already exists, so `git tag submission-rc` fails. The orchestrator moves it (`git tag -f submission-rc <commit>`) after
  G9 run 4; Kunal does not tag.
What Kunal does (after the tag has moved): `git remote add origin <url> && git push -u origin main --tags`, then make the repo public in GitHub
  settings; reply `H2 done <url>`.
Order (HACKATHON.md): repo public (H2) → demo post (H3) → send (H1).
What Claude Code does then: fills repo URL in SUBMISSION.md and X_POST.md; re-runs G9 against the public URL.

## H1 — send the submission                            status: OPEN   needed by: Nov 14 23:59 UTC   NEVER by an agent
Pre-conditions: G9 PASS, H2 done, H3 done (its URL is `demoUrl`), H10 done, H12 approved, H14 done.
What Kunal does: review `docs/SUBMISSION.md`; `HUMAN_CONFIRMED=1 scripts/submit.sh --send` (without `--send` it is a dry run; interactive `yes`); reply `H1 done`.

## H3 — X post                                         status: OPEN   needed by: before H1   NEVER by an agent
HACKATHON.md: send the submission only once the repo is public and the demo post is up; the post URL is the `demoUrl` field.
What Kunal does: after H2 and H11, post from `docs/X_POST.md` himself (video on post 1); reply `H3 <post url>`.
What Claude Code does then: puts the URL in SUBMISSION.md `demoUrl`.

## H14 — payout account, contact consent                status: DONE 2026-11-13   needed by: H1   NEVER by an agent
Done: Kunal replied `kunal-drall.near | consent yes`. SUBMISSION `nearAddress` = `kunal-drall.near` (matches the HACKATHON.md regex),
  `consent` = `true` (WO-82).
Why a human: the mainnet payout account is Kunal's own wallet; consent must be his agreement to the verbatim notice.
What Kunal does: create or pick a mainnet NEAR account in his wallet; read "I agree that the organizers may use these details to
review our submission and contact us about this hackathon."; reply `H14 <account.near> | consent yes`.
Default if silent: `nearAddress`/`consent` stay `TODO-H14`; the payload is not sendable (submit script exits 2 on `TODO-H`).

## H6 — mainnet (post-hackathon)                       status: not in scope
Nothing mainnet is created, funded or deployed during the hackathon.

---
# v7 handoffs (2026-11-10, D-017). Addendum ids: H13 → **H19**, H14 → **H20** here (H13/H14 were already used); H15–H18 unchanged.

## H-GUARD-V7 — install the v7 guard rules + evm agent        status: OPEN (Kunal-only; no product claim depends on it: Base runs on the local fork, D-026)   needed by: P2b (Base) only
Why a human: the auto-mode classifier refuses to let an agent edit its own guard and settings (self-modification), which is correct.
What Kunal does (1 min, repo root): `python3 scripts/v7-install-claude-config.py && bash scripts/test-guard-v7.sh` (every line should say `ok`).
That blocks Base mainnet (8453), any `--private-key`, and POSTs to market.near.ai. It allows forge/cast/anvil/avm and installs `.claude/agents/evm.md`, which loads next session.
What Claude Code does then: records it in EVIDENCE G12 prep and uses the `evm` agent for WO-27/29c.
Default if silent: P2b does not start (Base is cut first anyway). Superseded: P2b ran on the local fork without it (D-026, EVIDENCE §G12, §G13); if silent, the guard rules stay uninstalled.

## H15 — Base Sepolia ETH for the deployer          status: OPEN (optional since D-026)   needed by: real-Base-Sepolia G12/G13 only
Deployer (Foundry keystore, scripts/06-base.sh): **0x4CAd440076321Da4ef05d35113aC6A58F3aDBFBd** — send ≥ 0.05 Base Sepolia ETH (CDP portal faucet ~1 min) and reply
`H15 done <tx>`; then `BASE_RPC_URL=https://sepolia.base.org bash scripts/26-deploy-base.sh` re-runs G12/G13 on the real chain. Until then the spoke runs
on a disclosed local fork of Base Sepolia (D-026).
1. After `scripts/06-base.sh` runs (P2b), read the deployer address printed here. 2. Sign in to a Base Sepolia faucet from the FACTS list (WO-18 item 11).
3. Send ≥ 0.05 Sepolia ETH to the deployer. 4. Reply `H15 done <tx hash>`.
Then: funds keeper + borrower from the deployer, runs G12. Default if silent: P2b skipped and disclosed.

## H16 — final track list                            status: CLOSED 2026-11-12 (`nfts` NOT added; tracks stay `defi`, `security`, `agents`)   needed by: submission
2026-11-11 (D-028): Kunal: "H16 defi security agents (I'll decide nfts after item 3)"; `privacy` dropped (overrides CLAUDE.md §1 "privacy always").
2026-11-12: `nfts` not added. Kunal's condition for `nfts` (a `move_note` test asserting the new owner can repay and close and the old owner cannot) does not hold by design: repay is permissionless (contracts/nectar-core/src/tests_notes.rs `v7_notes_residual_collateral_goes_to_loan_note_owner`: a stranger repays, the residual collateral goes to the new owner); self-settle follows the Note (`v7_notes_self_settle_by_new_loan_owner`) and the old owner is refused (`v7_notes_self_settle_old_owner_refused`).
Applied (WO-35d): docs/SUBMISSION.md `tracks` unchanged `["defi","security","agents"]`; README "Tracks and why" says `nfts` is not submitted, with the reason.

## H17 — consumer line                               status: CLOSED 2026-11-12 ("fire-sales")   needed by: landing copy
Kunal chose "fire-sales". The landing already reads "Borrow against stocks without fire-sales"; nothing to change ("without liquidations" stays banned).

## H18 — thesis notebook                             status: OPEN
Reply `H18 yes` or `H18 no`. Yes → WO-32 after P2a. Default: not attempted.

## H19 — Base builder code (addendum H13)            status: OPEN   needed by: G13 (optional)
1. Register the project on Base Dashboard. 2. Settings → Project Settings → Builder Code. 3. `echo 'BASE_BUILDER_CODE=<code>' >> services/keeper/.env.local`
4. Reply `H19 done`. Then: the keeper appends the ERC-8021 suffix; G13 checks the last bytes of calldata. Default: no suffix; README says so. Agents never register it.

## H20 — market.near.ai task (addendum H14, optional) status: OPEN
Post the task text from docs/MARKET_TASK.md (written by WO-30) from your own account; reply `H20 <url>`. Then it is linked from /agents and the README.
Default: not posted. Agents never post there.

## H-NEAR-FAUCET — v7 update (2026-11-10 11:30Z)     status: DONE 2026-11-10 (see the entry above; v2 deployed)
nectar.testnet holds **0.064 NEAR**. The v7 deploy (D-018) needs about **11 NEAR** (updated 20:00Z: v2 wasm is 628 KB after WO-23a, more with Notes/Reserve): the `nectar-core-v2` account + wasm storage (~9), `keeper-v2` (0.5),
`x402-relayer` (3, only if x402 survives F-329), `agent1` (0.5), and the demo reseed. Same steps as above (https://near-faucet.io/ → `nectar.testnet`, repeat if allowed).
Until then: v7 is built and sandbox-tested, but nothing new deploys; v1 stays the live demo.

## H-SOL-AIRDROP — devnet SOL for the vault deploy          status: DONE 2026-11-10 ~18:10Z (deployer showed 5 SOL at the end of the CLI retry loop; source not recorded) → vault deployed (9fb7cfb)   needed by: G7 (Solana leg)
Why: `solana airdrop` is rate-limited per IP (2026-11-10 17:55Z, every try failed). The vault deploy needs ≥ 4.5 SOL (program rent 2.02 + same-size buffer).
What Kunal does (2 min): open https://faucet.solana.com (GitHub sign-in raises the limit), choose devnet, request SOL to
`3pF3vKewQdsKd4TEZvWYZrHZfRRJnzW3EsgtU3x8bZgS` (deployer, 5 SOL if allowed) and 1 SOL to `82hq1LTc9cuYsdkKxYQVQ6p4qxvYM9hdrQ6V8zW7HVa7` (keeper fee payer); reply `H-SOL-AIRDROP done`.
What Claude Code does then: `scripts/05-solana.sh` (mint), the vault deploy per solana/deploy.md, `init_vault`, config update, G7 run.
Meanwhile: retries the CLI airdrop with backoff. Default if silent at 2026-11-13 12:00 UTC: the Solana leg stays local-validator only (25/25 anchor tests) + the NEAR-side signer round trip, disclosed (cut order).
