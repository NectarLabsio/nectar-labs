# EVIDENCE.md — written by the verifier agent only

| Gate | Status | UTC | Commit | Evidence |
| --- | --- | --- | --- | --- |
| G0 toolchain + facts | pending | | | |
| G1 contract tests | PASS | 2026-11-09T20:43Z | b721641 | evidence/G1/verifier-20261109T2043Z.log, evidence/G1/verifier-gas-20261109T2043Z.csv (prior FAIL 20:33Z, 3bc0de8: see §G1 history) |
| G2 testnet deploy | PASS | 2026-11-09T20:55Z | 5f27f44 | evidence/G2/verifier-20261109T2055Z.log (explorer pages returned HTTP 403 to WebFetch; see §G2) |
| G3 web E2E | PASS | 2026-11-09T21:15Z | 176914f | evidence/G3/verifier-20261109T2115Z/ (e2e 112 pass / 0 fail / 2 skip = write spec; LH 12/12 = 100; write flow cited from 20:57Z run, not repeated; prior FAIL 20:57Z c940dec: see §G3) |
| G4 OutLayer | PASS | 2026-11-09T22:10Z | d87eef6 | evidence/G4/verifier-20261109T2210Z/ (attestation via testnet-api.outlayer.ai/attestations/by-request/15114, TDX quote present, not verified; gates.md get_settlement view missing, criterion checked from events; fills = max until WO-10b) |
| G5 oracle | pending | | | |
| G6 1Click depth | FAIL | 2026-11-09T22:14Z | 578b006 | evidence/G6/verifier-20261109T221158Z/ (live dry quote verifies; NVDAx badge renders; FAIL: Feed shows no implied depth (badge is a hard-coded set, not wired to the sampler) and the sampler's gap_bps uses amountOutUsd, which C-014 says not to use; see §G6) |
| G7 Solana + signer | pending | | | |
| G8 copilot | pending | | | |
| G9 fresh-clone rehearsal | pending | | | |

Block format (one per run, newest first within a gate):

```
### G2 — testnet deploy — PASS — 2026-11-10T19:42Z — commit 3f9c1a2
$ scripts/20-deploy-testnet.sh
... (≤ 40 lines)
Explorer: https://testnet.nearblocks.io/address/nectar-core.nectar.testnet  (opened: shows contract code hash …)
Views: get_collateral → {...}
Notes: faucet rate-limited once; retried after 90 s.
```

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
