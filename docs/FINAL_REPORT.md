# FINAL_REPORT.md: final status audit (verifier, read-only)

Order: docs/work/final-audit.md (12d1c15). Run: 2026-11-12T11:19Z–11:25Z (16:49–16:55 IST). Stopped early on the coordinator's turn limit.
**Time left to 2026-11-14 23:59 UTC: 2 d 12 h 39 min** (system clock 2026-11-12 11:19:08 UTC = 16:49:08 IST).
Repo state audited: main = `12d1c15`. My own fresh clone: `/tmp/verify-final-20261112T1125Z` (a `git clone` of my worktree at 12d1c15).
Where this was written: the harness removed my worktree during the run, so this file is committed in that clone on branch `final-audit`. It is not in the main repo.
Labels: VERIFIED = re-run in this run, with the output cited · SELF-ATTESTED = taken from a log or doc only · FALLBACK = disclosed fallback · FAILED · OPEN · **not re-checked** = I did not check it in this run.
Limits on this run: the harness refused `git -C /Volumes/T7/nectar-labs`, so I could not check whether the main checkout's working tree is clean. Vercel previews sit behind Vercel login and I had no share link, so I could not check them. I made no x402 paid call, signed nothing, stopped no service and started no server.

## Done (re-checked in this run)
| Item | Status | Evidence (this run) | Commit |
| --- | --- | --- | --- |
| Gitleaks over the full history | VERIFIED | `gitleaks detect --source . --log-opts=--all --redact` → "412 commits scanned … no leaks found" (11:20Z) | refs as of 12d1c15 |
| No key or .env value committed | VERIFIED | Tracked env files are only `.env.example` and `apps/web/.env.example`. Both hold ids, URLs and `~/.nectar/...` paths with every secret field empty (`NEAR_AI_API_KEY=`, `ONE_CLICK_API_KEY=`). The `ed25519:` strings of key length in HEAD are tx **signatures** in evidence logs (public), not keys | 12d1c15 |
| `~/.nectar` paths in the repo | VERIFIED (for Kunal to rule on) | `git grep '\.nectar/'` finds path *references* (e.g. `.env.example` 8, `scripts/05-solana.sh` 9, HUMAN_HANDOFF 8). No file contents from `~/.nectar` were found. If "no ~/.nectar path committed" means no references at all, this check FAILS | 12d1c15 |
| Fresh clone of HEAD is clean | VERIFIED | `/tmp/verify-final-20261112T1125Z`: `git status --short` was empty before this report | 12d1c15 |
| Remote status | VERIFIED | `git remote -v` prints nothing: no remote, nothing pushed | 12d1c15 |
| `submission-rc` target | VERIFIED | `submission-rc` → `54d6054` (2026-11-11T17:48Z, "review 2 done, G3b/G9/G14/G1 PASS, submission-rc moved"). **136 commits** follow it on main (`git rev-list --count submission-rc..main`) | 54d6054 |
| agent1 mock collateral, ≥ 6 x402 runs | VERIFIED | Intear RPC, final, 11:21:40Z: `nvdax-mock` `ft_balance_of agent1.nectar.testnet` = `"8000000"` (decimals 6 → 8 NVDAx at 1 per run → 8 runs), block 277356025. usdc-mock = 39840000 (39.84) | chain |
| Contract version | VERIFIED | `nectar-core-v2.nectar.testnet contract_version` = `"2.2.1-v7"` (block 277356033) | chain |
| Position Note transfer moves the loan | VERIFIED (code locations) | `fn move_note` contracts/nectar-core/src/notes.rs:332. Tests: unit `v7_notes_residual_collateral_goes_to_loan_note_owner` (src/tests_notes.rs:352), `v7_notes_self_settle_by_new_loan_owner` (src/tests_notes.rs:365); sandbox `notes_residual_collateral_to_loan_note_owner` (tests/v7/notes.rs:106). Remote positions: `request_remote_release` (src/remote.rs:957) releases to the depositor, not the Note owner; disclosed as SECURITY.md "What remains" item 12. STATE also cites a separate `…_old_owner_refused` function; my grep found no function with that name (the check may sit inside :365). I did not run the tests | 12d1c15 |
| No privacy-track framing left | VERIFIED (grep) | Searched README, SUBMISSION, X_POST, landing, app and docs-site for "privacy track", "privacy-preserving", "confidential", "keeps … private", "hidden from", "nobody can see": 0 hits. SUBMISSION `tracks` = `["defi","security","agents"]`; README:112 and SUBMISSION:61 say `privacy` is "not entered" | 12d1c15 |
| The three corrected privacy claims stay corrected | VERIFIED (grep), table part not re-checked | "never joined to IPs" and "instead of being published" now appear only in negative e2e assertions (e2e/shell.spec.ts:38, e2e/v7.spec.ts:60). The landing TEE lines (Landing.tsx:485, :598) say the TEE prices "with operator-set" inputs. Whether privacy.md lists every third-party host: **not re-checked** (last verified in the G3b re-run 4 inventory, fd06e11) | 12d1c15 |
| Copy rules | VERIFIED | "insurance" and "without liquidations" appear only in code comments, tests, DESIGN_SYSTEM and HUMAN_HANDOFF rule text. `node scripts/check-no-branding-all.mjs` exit 0 ("no hackathon branding in landing, web app or docs site"). "live" in the UI: BorrowComposer.tsx:288 "Solana devnet: live on testnet" (backed by G7 PASS); :289/:316 "Base: local fork, not live". Everything else is data-freshness wording | 12d1c15 |
| Base says "local fork" | VERIFIED | README:3, :25 ("**local fork, not Base Sepolia (D-026)**"), :95; SUBMISSION idea ("local fork of Base Sepolia, not Base Sepolia"); UI badge "local fork, not live" | 12d1c15 |
| @x402/core advisory | VERIFIED (ID, severity) / SELF-ATTESTED (reachability) | `pnpm audit --json` (fresh clone) lists `GHSA-mrhx-c7xc-m3w5`, **high**, zod <4.6.6, path `services__x402>@x402/core>zod`. FACTS F-383: CVE-2023-54404, CVSS 7.5. Reachability: FACTS F-385 says it is **not reachable from untrusted input** (paid route decodes the header without zod; zod runs only on facilitator responses). I did not re-trace that code | 12d1c15 |
| Other audit findings | VERIFIED | Same audit: critical 2 (tinypool, via @docusaurus/core), high 1 more (serialize-javascript, via docusaurus), moderate 2, low 3 (elliptic via @phala/dcap-qvl, others under docusaurus). SECURITY.md discloses "docs-site build-time criticals" and elliptic | 12d1c15 |
| nectarlabs.io ownership | VERIFIED | `whois nectarlabs.io` → "Domain not found." (11:20Z); `curl` returns 000. Unregistered: nobody controls it or its DNS. H-DNS stays blocked (OPEN) | — |
| Hosted URLs | VERIFIED (11:20:44Z) | SITE https://nectarlabs.vercel.app/ **404** `x-vercel-error: DEPLOYMENT_NOT_FOUND`; APP https://nectarlabs-app.vercel.app/ **404** same; DOCS https://nectarlabs-app.vercel.app/docs **404** same; docs origin https://nectar-labs-docs-kunals-projects-35d3a237.vercel.app/ **404** same. Railway Feed https://feed-production-2f2776c9.up.railway.app/health **200** | — |
| Railway Feed health and lag | VERIFIED (11:20:55Z) | `ok:true, source:"views", last_indexed_block 277355934, lag_blocks 0, poll_age_s 3, events_indexed 0, commit fd06e11`. Chain head (FastNEAR, final) 277355941 → **real lag 7 blocks**. The Feed's own `chain_head` field is stale (277297242, the known views-mode bug in STATE) | fd06e11 (deployed) |
| Local services (read only) | VERIFIED (11:21Z) | Listeners: keeper 127.0.0.1:8790 (pid 17339), x402 127.0.0.1:8791 (pid 30827), Feed 8788/8789 (pid 56878), anvil 8545 (pid 57193, `eth_chainId` 0x14a34 = 84532), :3533 (pid 37042). **Keeper `/healthz` ok:false**: `consecutive_errors 4`, FastNEAR -429, open_positions 6. **Local Feed `/healthz` 503 ok:false**: `last_poll_at 2026-11-11T09:45:25Z` (≈ 25.6 h old), neardata HTTP 429 | — |
| Stray preview server on :3217 | VERIFIED: **still running** | `lsof -iTCP:3217 -sTCP:LISTEN` → node **pid 14369** | — |
| Fallback wording in README (G5, G8, G13) | VERIFIED | G5 README:28 "**owner oracle (disclosed)**, badge in UI … **G5: FALLBACK (disclosed).**" (also :3 "G5 oracle FALLBACK (disclosed): owner oracle in use"). G8 README:32 "**built; no live NEAR AI answer has been verified yet.** … **G8: PASS (fixture), 2026-11-09T23:56Z**". G13 README:25 "**local fork, not Base Sepolia (D-026).**" | 12d1c15 |

### Gates G0–G14 and G3b (all **not re-checked** in this run; the status and commit come from docs/EVIDENCE.md; every row there was run by the verifier)
| Gate | Status (EVIDENCE) | Last-run commit | Who |
| --- | --- | --- | --- |
| G0 | PASS | b3a9090 | verifier |
| G1 | PASS (2.2.1 gas-row re-check, 67/67) | 48b5c5a | verifier |
| G2 | PASS | 5f27f44 | verifier |
| G2b | PASS (2.2.1-v7, after D-027) | 3ab3026 | verifier |
| G3 | PASS | 176914f | verifier |
| G3b | re-run 4 PASS | fd06e11 | verifier. **Run 5 on ca34111 in flight** (another verifier): no commit or result seen on any ref as of 11:20Z (`git log --all --since 10:30Z` shows only f1d74d9/a6269cf preview checks) |
| G4 | PASS | d87eef6 | verifier |
| G5 | **FALLBACK (disclosed)**: owner oracle | 706d940 | verifier |
| G6 | PASS | fea52b7 | verifier |
| G7 | PASS (vault v2, read-only, both chains) | 3ab3026 | verifier |
| G8 | **PASS (fixture)**: no live NEAR AI answer (H7) | df4706f | verifier |
| G9 | run 3 PASS | **3107a1a** (recorded in 837cd12) | verifier. No G9 run since: not on fd06e11, ca34111 or HEAD |
| G10 | PASS with open items (F-351/352/353) | 09c4316 | verifier |
| G11 | PASS | 3ab3026 | verifier |
| G12 | PASS on the local fork | 7bface5 | verifier |
| G13 | **PASS on the local fork, not Base Sepolia** (FALLBACK, D-026) | 3ab3026 | verifier |
| G14 | PASS (guarded demo agent, 402 → 200) | 48b5c5a | verifier |

## Failed or open
| # | What is missing | Owner | Est. time |
| --- | --- | --- | --- |
| 1 | **Production not deployed**: SITE, APP and DOCS all 404 DEPLOYMENT_NOT_FOUND (11:20Z). Needs G3b run 5 PASS → deploy ca34111 → WO-34v production acceptance (crawl + host check on the real URLs) | orchestrator + verifier | 2–3 h after run 5 |
| 2 | **2026-11-13 18:00 UTC timebox**: not met yet (30.6 h left at 11:21Z). OPEN | orchestrator | — |
| 3 | **README has no "Hosted demo" section.** README:31 says the Feed has "no public host", but the Railway Feed answers 200. README's latest G3b is re-run 2 (fd6592d); EVIDENCE has re-run 4 PASS (fd06e11). Stale, not an overclaim | docs | 30 min |
| 4 | **G9 last ran on 3107a1a**, 136+ commits behind; `submission-rc` (54d6054) predates all WO-34 work. G9 run 4 on the deploy commit, then move the tag | verifier → orchestrator | 30 min |
| 5 | **HUMAN_HANDOFF stale**: H-HOST and H-DOMAIN still say "OPEN", but STATE records Kunal approving Vercel access (05:20Z) and answering H-DOMAIN (~11:00Z) | docs | 10 min |
| 6 | **The H2 command in HUMAN_HANDOFF:183 fails as written**: `git tag submission-rc && …` stops at once because the tag already exists. It needs the moved tag (orchestrator), then only `git remote add … && git push -u origin main --tags` | docs / orchestrator | 5 min |
| 7 | **Keeper unhealthy now**: `/healthz` ok:false with 4 consecutive FastNEAR -429 (11:21Z). Settlement triggers stall while this lasts | keeper agent / orchestrator | 30 min (RPC fallback or restart) |
| 8 | **Local Feed :8788 stale**: 503, last poll 2026-11-11T09:45Z. DEMO_SCRIPT "Before recording" (per STATE) says restart it with a fresh FEED_DB_PATH, or use the Railway Feed | orchestrator (Kunal must not be the one to stop host services) | 10 min |
| 9 | Hosted Feed has no event history (`events_indexed 0`, views mode, neardata 429). Restoring it needs a key (H-NEARDATA, optional) | Kunal (optional) | 5 min |
| 10 | `nfts` track undecided (H16 partial) | Kunal | 1 min |
| 11 | Main checkout working-tree cleanliness | **not re-checked** (harness refused git outside my worktree) | orchestrator: `git status` |
| 12 | Kunal's real-wallet borrow on the hosted app | **OPEN** (not reported; the hosted app is not deployed yet) | Kunal, 10 min after deploy |
| 13 | Explorer pages (nearblocks / Solana Explorer) never opened by a human (H-EXPLORER) | Kunal | 3 min |

## Self-attested only (not re-checked by me)
- Vercel previews of ca34111 (web dpl_5H5zajgb… 28/28; docs dpl_ChooYyB6… 56 pages + assets, `/` → 307 `/docs/`, no loop, Chrome clean): orchestrator logs evidence/WO-34/preview-*-ca34111-*.log (STATE ~10:45Z). Behind Vercel login; not re-checkable by me.
- Vercel production setup (project domains nectarlabs.vercel.app + nectarlabs-app.vercel.app, production env, ssoProtection `preview`): STATE ~11:05Z.
- Vercel projects nectar-labs-web `prj_LDWShDagwIbzBzBaRmBIvj8Aw7oa`, nectar-labs-docs `prj_3HZc8bIECi9htd1g6NwgSykhP9Gu`; Railway project `nectar-labs` (bucket, `artifacts` function, Feed): STATE.
- Crawl and host check: last verifier results are G3b re-run 4 on fd06e11 (crawl --polite 89 internal + 44 external, 0 failures; hosts.spec 6/6, local hosted build). **Not re-checked**, and never run against the real production URLs.
- zod advisory not reachable: FACTS F-385 (researcher).
- Plan costs (from HUMAN_HANDOFF H-HOST and FACTS F-403/F-404/F-405/F-412): Vercel Hobby (free, non-commercial); Railway Free $0/month with $1 credit, 1 volume per project, Hobby $5, Pro $20; domain not bought (Vercel offered $14.99 first year, $46 renewal). **Not re-checked.**
- Where keys live: H-KEYS default (keeper key stays local under `~/.nectar/`); x402 relayer key is full-access, so it is never hosted (D-031, C-023). I confirmed only that keeper and x402 listen locally (127.0.0.1:8790/8791); file locations and permissions: **not re-checked**.
- DEMO_SCRIPT "Before recording" steps: **not re-checked** (file not opened in this run; STATE lists: agent1 balance, connect a real wallet once, dismiss the cookie banner first, Feed caught up).
- Cookie banner no longer covers the wallet list: G3b re-run 4 (verifier, fd06e11) says 6/6 rows in viewport, centre hit inside, no overlap. **Not re-checked.**
- SECURITY.md open items (read, not tested): SR-5, SR-6, SR-7, SR-15 partial; SR-4 EVM remainder push open; keeper relays advisory; keeper residuals; Base on a local fork; not-reviewed areas; owner trust; item 11 **C-020** (no Note transfer from the web app to a `0s`/`0u` account that does not exist yet; kept by decision D-029); item 12 remote Loan Notes. Review 2 residuals: R2-07 (no on-chain fee bound), R2-08 (partial CSP, unpinned wallet manifest).
- Claims audit, scope: I grepped the copy rules and Base/privacy wording (above). The README live table, SUBMISSION `idea` and X_POST numbers (159 vs 400 bps = G4; function-call keeper key = G2b; positions #13–#15 = G14; G7 txs) map to EVIDENCE rows, as SUBMISSION's own claim table states. **I did not re-trace each docs-site and landing claim to evidence in this run.** README:3 "Testnet software for the NEAR Hackathon" is allowed (README is a judge-facing file).

## Needs Kunal (ordered by deadline)
1. **Now:** `kill 14369` (stray preview server on :3217; still running at 11:21Z).
2. **Before recording (2026-11-13):** after production is up, do the real-wallet borrow on https://nectarlabs-app.vercel.app (DEMO_SCRIPT "Real-wallet borrow on the hosted app"; the owner first storage_deposits and mints 2 NVDAx for your account), then report the result. Open the README explorer links once (H-EXPLORER).
3. **Any time before H1, defaults exist:** reply `H10 team: … | projects: … | lead: … | email: … | size: …`; `H12 approved`; `H16 nfts yes|no`; `H17 fire-sales|liquidations`; optional `H18`, H13 Pyth key, H7 NEAR AI key, H-NEARDATA key; optionally `H-KEYS yes|no`.
4. **2026-11-14, morning UTC:** H11: record a voice-over on DEMO_SCRIPT.md, or accept the captioned `pnpm demo:capture` video.
5. **2026-11-14, after the orchestrator moves `submission-rc` to the G9-run-4 commit (do not run `git tag submission-rc`: the tag exists):** H2: create the GitHub repo, then `git remote add origin <url> && git push -u origin main --tags`, make it public in GitHub Settings → General → Danger Zone → Change visibility; reply `H2 done <url>`. Then the verifier re-runs G9 from the public URL.
6. **After H2 + H11:** H3: post the thread from docs/X_POST.md yourself (delete the bracketed sources, video on post 1); reply `H3 <post url>`.
7. **H14:** pick a mainnet payout account in your wallet; reply `H14 <account.near> | consent yes`.
8. **By 2026-11-14 23:59 UTC (aim for 18:00 UTC):** H1: re-read https://nearhackathon.com/HACKATHON.md, run `scripts/submit.sh` (dry run; it must show no `TODO-H` and no `website` key), then `HUMAN_CONFIRMED=1 scripts/submit.sh --send` and type `yes`. A sent submission cannot be edited. Order: repo public → demo post up → send.

## Critical path to H1 (UTC)
| When | Step | Owner |
| --- | --- | --- |
| 2026-11-12 ~12:00–14:00 | G3b run 5 PASS on ca34111 (in flight) | verifier |
| 2026-11-12 ~14:00–16:00 | Production deploy of ca34111 → WO-34v acceptance (SITE/APP/DOCS 200, crawl, host check on real URLs); Feed `FEED_CORS_ORIGINS`; README "Hosted demo"; HUMAN_HANDOFF H-HOST/H-DOMAIN/H2 fixes | orchestrator, verifier, docs |
| 2026-11-12/13 | Keeper RPC health back to ok; local Feed restarted or demo pointed at Railway Feed | orchestrator |
| 2026-11-13 by 12:00 | Kunal real-wallet borrow on the hosted app; any fix → another G3b | Kunal |
| 2026-11-13 by 18:00 | **Timebox**: hosted demo accepted. G9 run 4 on the final commit → move `submission-rc` | verifier, orchestrator |
| 2026-11-13 evening – 11-14 morning | H11 video (DEMO_SCRIPT "Before recording" first) | Kunal |
| 2026-11-14 ~10:00 | H2 repo public + push → G9 from the public URL; fill `projectUrl` | Kunal, verifier, docs |
| 2026-11-14 ~12:00 | H3 X post → fill `demoUrl`; H10/H14 filled; dry run shows no TODO-H | Kunal, docs |
| 2026-11-14 18:00 (internal package) → 23:59 hard | H1 send | Kunal |

## Risks (top 5, each with a fallback)
1. **Public RPC rate limits** (keeper -429 now; local Feed stale; earlier G3b R3 failed on -429). Fallback: the SDK's cross-provider order (FastNEAR ×2 → dRPC → Intear, G3b re-run 4); point the keeper at a fallback RPC; record with the Railway Feed; optional H-NEARDATA key.
2. **Hosted demo misses the 2026-11-13 18:00 timebox.** Fallback (H-HOST/H-DOMAIN default): no hosted app. The README local quick start (G9 PASS) plus the public Railway Feed; README says so.
3. **The late public-repo push changes what judges clone** (G9 on 3107a1a; 136 commits since `submission-rc`). Fallback: G9 run 4 on the final commit before H2, then G9 again from the public URL; hold H1 if it fails.
4. **Docs drift** (README Hosted demo missing, stale G3b/Feed lines, HUMAN_HANDOFF statuses, broken H2 command). Fallback: one docs work order plus G9's "no README claim stronger than EVIDENCE" check before the tag moves.
5. **Real-wallet signing never verified under the new headers or CSP** (SECURITY.md R2-08 residual; Kunal's borrow is OPEN). Fallback: demo the borrow through the CLI/agent path (G14 evidence) and show the selector only; disclose "signing not verified on hosted app".
