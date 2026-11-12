# FINAL_REPORT.md: final status audit, re-run on submission-rc (verifier, read-only)

Order: docs/work/final-audit.md (Kunal, 2026-11-12). Audit started **2026-11-12 17:08:04Z = 22:38 IST**; probes ran 17:08Z to 17:12Z.
Time left to 2026-11-14 23:59 UTC: **2 d 6 h 51 min**.
Labels: VERIFIED (re-run in this audit) · SELF-ATTESTED (agent or orchestrator log only) · FALLBACK (disclosed) · FAILED · OPEN · NOT RE-CHECKED
(the last recorded result is cited, but nothing was re-run in this audit).
Tooling limit: this verifier's sandbox blocks git commands aimed at the main checkout. Repo checks ran in the worktree, which shares the object store and
refs. The main checkout's working-tree status could not be read.

## Done

### 1. Repo
| Item | Status | Evidence (this run) | Commit |
| --- | --- | --- | --- |
| submission-rc → 4b20f05 ("chore: STATE — all gates green on release 3") | VERIFIED | `git rev-parse submission-rc^{commit}` = `git rev-parse main` = 4b20f0578bd6… | 4b20f05 |
| Commits after the tag | VERIFIED: 0 | `git log submission-rc..main` is empty | 4b20f05 |
| Product code since release 3 | VERIFIED: none | `git diff --stat 5f011bb submission-rc -- apps packages services contracts solana evm quoter` prints 0 lines | 5f011bb..4b20f05 |
| Secret scan, full history | VERIFIED: no leaks | `gitleaks detect --source . --log-opts=--all --redact` (8.30.1): "476 commits scanned … no leaks found". The repo `.gitleaks.toml` uses the default rules plus one allowlist that matches only 64-hex content hashes (`version_key`, `code_hash`, `sha256` …) | all refs |
| .env committed | VERIFIED: none | `git log --all --diff-filter=A --name-only` → only `.env.example` and `apps/web/.env.example` | all refs |
| Private-key patterns at the tag | VERIFIED: none | `git grep` for `ed25519:<80+ base58>`, PEM `PRIVATE KEY` and `"secret_key"` turned up only `Signature: ed25519:…` lines in evidence/G13 and evidence/G14 tx logs. Those are public transaction signatures | 4b20f05 |
| Remote | VERIFIED: no remote | `git remote -v` prints nothing, so nothing has been pushed | — |
| Worktree clean | VERIFIED (own worktree) / NOT RE-CHECKED (main checkout, blocked) | `git status --short` empty before this report | — |
| ~/.nectar or home paths in tracked files | NOT RE-CHECKED | Last result: G3b run 7 (k) found only the 6 `contracts/nectar-core/tests/fixtures/*.wasm` files with a home path | 4c2a0bb |

### 2. Gates (none re-run in this audit; last verifier result from docs/EVIDENCE.md:3-51)
| Gate | Last result | Commit | Run by |
| --- | --- | --- | --- |
| G0 toolchain | PASS 2026-11-09T23:09Z | b3a9090 | verifier |
| G1 contract tests | PASS (v7 09c4316). The gas-rows re-check (67/67 methods, max receipt 67.61 Tgas) ran on 48b5c5a | 48b5c5a | verifier |
| G2 / G2b deploy | G2 PASS 5f27f44. G2b PASS after D-027 (2.2.1-v7; rebuilt wasm byte-identical to code_hash 3mv4LRm6…) | 3ab3026 | verifier |
| G3 web | PASS 2026-11-09 | 176914f | verifier |
| **G3b** | re-run 7 PASS except (d) on 4c2a0bb, plus 7b (d) PASS on 5f011bb, so runs 7 + 7b cover release 3. One deviation: nodejs22.x is not observable; Node is pinned by engines `>=22.22.2 <23`. Item (h) was run by the orchestrator and reviewed by the verifier | 4c2a0bb + 5f011bb | verifier |
| G4 OutLayer | PASS (attestation by request; TDX quote present, not verified) | d87eef6 | verifier |
| **G5 oracle** | **FALLBACK (disclosed)** | 706d940 | verifier |
| G6 1Click | PASS (dry quotes only) | fea52b7 | verifier |
| G7 Solana + signer | PASS on re-run after D-027 (read-only, both chains) | 3ab3026 | verifier |
| **G8 copilot** | **PASS (fixture)**: no live answer; H7 key absent | df4706f | verifier |
| **G9** | run 5 (every step except 3) on 5dd2a50 + run 5b (step 3) on 88b99b3 | 5dd2a50 + 88b99b3 | verifier |
| G10 | PASS with open items F-351/F-352/F-353 | 09c4316 | verifier |
| G11 | PASS (608 unit + 50 sandbox) | 3ab3026 | verifier |
| G12 | PASS on a local fork of Base Sepolia (D-026), not Base Sepolia | 7bface5 | verifier |
| **G13** | **PASS on a local fork of Base Sepolia**, which is a disclosed fallback. ERC-8021 suffix not appended | 3ab3026 | verifier |
| G14 x402 | PASS (paid call, position #15) | 48b5c5a | verifier |
| WO-34 production (release 3) | PASS on all 4 items | 5f011bb | verifier |

README fallback wording, verified by reading it in this run:
- G5: README.md:47 says "**owner oracle (disclosed)**, badge in UI … The Pyth path is built and sandbox-tested … but is not live … **G5: FALLBACK (disclosed).**"
- G8: README.md:51 says "**built; no live NEAR AI answer has been verified yet.** Live mode needs key H7".
- G13: README.md:44 says "on **a local fork of Base Sepolia** (anvil, chain id 84532)". README.md:114 says "built; runs only on a local fork … a real Base Sepolia deploy waits on deployer funds (H15)".
- README.md:139 states the same statuses.

### 3. Last round's items
| Item | Status | Evidence |
| --- | --- | --- |
| Cookie banner does not cover the wallet list | NOT RE-CHECKED (no browser run in this audit) | Last checks: G3b run 7 found the real selector 6/6 in the viewport (4c2a0bb), and G9 run 5 saw 6 wallets in the Chrome selector with 0 CSP messages (5dd2a50). apps/packages have not changed since 5f011bb |
| agent1 has mock NVDAx for ≥ 6 x402 runs | VERIFIED | `ft_balance_of agent1.nectar.testnet` on nvdax-mock = **"8000000"** at block 277391943; decimals 6, so 8 NVDAx. Each run uses DEMO_UNITS, default `'1000000'` = 1 NVDAx (services/x402/src/borrow-guard.ts:84). That is **8 runs** |
| Does transferring a Position Note transfer the loan? | VERIFIED (code read; tests not executed) | `nft_transfer` (contracts/nectar-core/src/notes.rs:557) → `move_note` (notes.rs:332-349) sets `position.borrower = to`. Tests: tests_notes.rs:352 `v7_notes_residual_collateral_goes_to_loan_note_owner`, :365 `v7_notes_self_settle_by_new_loan_owner`, :379 `v7_notes_self_settle_old_owner_refused`, :470 `v7_notes_loan_transfer_refused_while_settling`. Limits: repay is permissionless, and for remote positions the release goes to the original depositor (SECURITY.md:149, item 12). **Answer: the borrower role and the residual collateral move with the Note. The debt can be repaid by anyone. Remote collateral does not follow the Note** |
| No privacy-track framing | VERIFIED | Tracks are `["defi","security","agents"]` (SUBMISSION.md:18). The dry-run payload has 0 "privacy" matches. README.md:131 and SUBMISSION.md:61 say `privacy` is **not entered**. X_POST.md has 0 hits for "privacy". The production landing has 0 "confidential". The 3 corrected claims ("never joined to IPs", "instead of being published", private/confidential TEE wording) have 0 hits in README, SUBMISSION, X_POST, apps/web, packages/ui and apps/docs-site/docs |
| @x402/core advisory | SELF-ATTESTED (reachability not re-derived) | GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404: **high**, CVSS 7.5, zod < 4.6.6, memory exhaustion. It is present through `@x402/core` 2.18.0 → zod 3.25.76. Per SECURITY.md:123, F-385 and F-451 it is **not reachable from untrusted input**: the payment header is regex-checked and `JSON.parse`d, and zod runs only on facilitator responses. Residual risk: a hostile operator-set facilitator |
| Which commit G9 last ran on | VERIFIED | Run 5 on 5dd2a50 (all steps except 3) and run 5b on 88b99b3 (step 3), per EVIDENCE.md:5,7. `git diff --stat 88b99b3 submission-rc` covers 8 files, including docs/SUBMISSION.md and 4 evidence/G9/run5b-* files. The product-path diff is empty |

### 4. WO-34 deploy
| Item | Status | Evidence |
| --- | --- | --- |
| nectarlabs.io and its DNS | VERIFIED: does not resolve | `curl https://nectarlabs.io/` → 000 (no answer). Unregistered per F-395. Nobody controls it. H-DOMAIN CLOSED ("go for it, i will set domain later"); H-DNS N/A (HUMAN_HANDOFF.md:92,112) |
| SITE https://nectarlabs.vercel.app | VERIFIED 200 (17:09:35Z) | `/borrow` → 308 to APP/borrow |
| APP https://nectarlabs-app.vercel.app | VERIFIED | `/` → 307 to /feed; `/feed` 200; `/borrow` 200 |
| DOCS = APP/docs | VERIFIED 200 | `/docs` 200, `/docs/start/quick-start` 200, 0 `x-robots-tag` headers on /docs |
| Docs origin https://nectarlabs-docs.vercel.app/docs/ | VERIFIED 200 | — |
| Feed https://feed-production-2f2776c9.up.railway.app/health | VERIFIED 200 | ok true, commit 3974b5b, chain_head_source view_block, history "unavailable", events_indexed 0 |
| Vercel projects nectar-labs-web / nectar-labs-docs; Railway project nectar-labs; deployment ids web dpl_BJNxqx…, docs dpl_DQubre… | SELF-ATTESTED | STATE.md:27-29,133-135. Not queried through a connector in this run |
| Crawl and host check | NOT RE-CHECKED | Last: WO-34 production (release 3), verifier, 16:40Z–17:01Z. Crawl: 90 internal routes all 200, 0 of our console errors. LH 100/100. Host check: release 3974b5b, 14 hosts, 0 missing on /legal/privacy (EVIDENCE.md:6,10) |
| Keeper and x402 hosted or local | VERIFIED local (ports) / SELF-ATTESTED (keys) | :8790, :8791, :8788, :8789 and :8545 each answer HTTP on 127.0.0.1, but `GET /health` → **404** on all five, so service health is not confirmed in this run. README.md:21-23: "the keeper and the x402 facilitator run on the operator's machine, with keys in the OS keychain or `0600` files under `~/.nectar/`" |
| Plan costs | SELF-ATTESTED | Vercel Hobby $0 (F-402). Railway ≈ $0.64/mo: Free is $0 within the $1 credit, Hobby is $5 flat, and the max-RAM case ($2.32) exceeds the Free credit (F-444–F-451, STATE.md:81) |
| README "Hosted demo" | VERIFIED | README.md:10-23: SITE/APP/DOCS/Feed URLs = those probed above. It names no deployed commit and points to EVIDENCE §"WO-34 production". Hosted until ≥ 2026-11-25 |
| Timebox 2026-11-13 18:00 UTC | VERIFIED met | Production answered 200 on 2026-11-12 17:09Z, 24 h 50 min before the timebox. Release 3 is the deployed release per EVIDENCE.md:6. The Feed reports commit 3974b5b; services/feed is unchanged since then |

### 5. Claims audit (README, landing, docs, SUBMISSION, X_POST)
| Claim | Evidence | Verdict |
| --- | --- | --- |
| Core v2 contract, mock USDC, mock NVDAx, owner: "live (testnet)" (README.md:29-38) | EVIDENCE §G2b (3ab3026); `get_exit_capacity` answered at block 277392077 in this run | supported |
| Aggregate limit + Weekend Oracle Guard live (README.md:39) | §G2b; this run: capacity 12,096.915 USD, headroom 2,867.915 USD, session_reason stale_price | supported |
| OutLayer TEE quoter + attested remote deposits live (README.md:40-41) | §G4, §G7 | supported |
| Solana round trip (README.md:42) | §G7 (3ab3026) | supported |
| Base spoke (README.md:44, 114) | §G12/§G13, local fork | supported, says "local fork" |
| x402 paid Feed export live (README.md:43) | §G14 (48b5c5a, #15) | supported |
| Position Notes live (README.md:45) | §G2b `nft_tokens`, §G14 `nft_mint p-4` | supported |
| Oracle (README.md:47) | §G5 | FALLBACK, disclosed |
| Copilot (README.md:51) | §G8 fixture | "built; no live answer", disclosed |
| P1/P2 "live on testnet" (README.md:122-128) | §G4, §G7 | supported |
| **README.md:153 "P1 TEE pricing, live oracle, 1Click depth, Feed MCP (G4–G6)"** | G5 is FALLBACK | **unsupported wording.** This is a phase-plan line, but "live oracle" contradicts G5 |
| Hosted demo URLs (README.md:10-23, X_POST) | probes in §4 | supported |
| Tracks defi/security/agents (README.md:131, SUBMISSION.md:18) | dry-run payload | supported |
| SUBMISSION.md:3 "Status: DRAFT, 2026-11-11 … as of commit a677689" | the header predates release 3; the body cites runs 5 + 5b (SUBMISSION.md:88) | stale header (cosmetic) |
| Landing (production server HTML, 17:1xZ) | "local fork" ×3, 0 Base sentences without it, 0 "hackathon", 0 "insurance", 0 "without liquidation", 0 "0123456789", 0 "until the Reserve ships", "testnet" ×29, "mock" ×11 | supported. The hydrated text was not re-checked (last: EVIDENCE.md:6 PASS) |
| Docs site and product UI copy rules | `grep -rliE hackathon` and `insurance\|without liquidations` over apps/web, packages/ui and apps/docs-site (excluding tests) → 0 files | supported |
| "live" counts | README 22, SUBMISSION 6, X_POST 0. Every README "live" row cites an EVIDENCE section, except line 153 above | see above |
| Base wording in README/SUBMISSION | README.md:45 and :144 say "Solana and Base positions" without "local fork" on the same line. These describe the mechanism, and the deployment claim at README.md:44 says local fork. SUBMISSION.md:34 says "Base-fork" | acceptable; a docs agent may add "(local fork)" |

### 6. Security (SECURITY.md, read in this run)
"What remains" (SECURITY.md:131-149) lists 12 items, all open or partial by design:
1. SR-5 remote capacity is checked only at origination.
2. SR-6 gas reserve can be worn down by keeper reads.
3. SR-7 no B20 `isAuthorized` at funding, so a Base leg can be stranded.
4. SR-4 EVM remainder is pushed.
5. SR-15 no mint binding in `vault_read`.
6. Keeper relays are advisory (not verified on chain).
7. Keeper residuals.
8. Base runs on a local fork.
9. Not reviewed: callback-gas failure branches, upgrade safety, 18–24-decimal collateral, MEV.
10. Single owner key.
11. C-020.
12. Remote Loan Notes do not carry the collateral release.

The dependency advisories (SECURITY.md:123-127) are zod (above) and docs-site tinypool, serialize-javascript, uuid and deepmerge, all build-time or dev-server
only (SELF-ATTESTED). **C-020** (FACTS.md:367): "implicit account" scope. The web/SDK treat only 64-hex and `0x` ids as implicit, so `0s`/`0u` take
the `view_account` path. **Decided by Kunal 2026-11-11 (D-029): keep; known limitation 11.** Status: closed by decision.

### 7. Demo readiness
| Item | Status | Evidence |
| --- | --- | --- |
| Feed lag | VERIFIED | 17:09:40Z: Feed `last_indexed_block` 277391891, RPC `block final` 277391900, so **9 blocks (≈ 9 s)**. The Feed's own `lag_blocks` is 0 against its view_block chain_head; poll_age 3 s. No event history (views mode, H-NEARDATA) |
| Stray preview server on :3217 | **OPEN** | `lsof` shows `node 14369 *:3217` = `next-server (v16.4.5)`, up 1 d 01:37:45. Not stopped (host services are off limits to me) |
| Kunal's real-wallet borrow | **OPEN** | Not reported. Needs his testnet account id; mint mock NVDAx to it first (STATE.md:141) |
| Owner price for recording | VERIFIED | `get_exit_capacity NVDAx` at block 277392077: price 135000000, `oracle_age_s` 7207, `oracle_fresh` true, `session_open` false, `session_reason` "stale_price". The NYSE-hours open session needs a price < 15 min old (DEMO_SCRIPT.md:3-9). It goes stale ≈ 2026-11-13 15:10Z (H-ORACLE) |
| DEMO_SCRIPT "Before recording" steps | VERIFIED read | Steps 1-8 (DEMO_SCRIPT.md:21-119): state snapshot, background services, Base vault redeploy if the fork restarted, price walk + remote quotes, remote lifecycle, other state, browser tabs + wallet, two manual checks. **The step-1 snapshot is dated 2026-11-11T08:25Z** and predates positions #14/#15 and the 15:12Z price refresh. Re-snapshot before recording |

### 8. Submission payload
`bash scripts/submit.sh --dry-run` (worktree = 4b20f05) → **exit 0**, "payload still has TODO-H placeholders — not sendable", "(dry run — nothing sent)".
Keys: requestId, projectName, leadName, email, size, tracks, nearAddress, projectUrl, demoUrl, consent, plus `idea`. **`website` absent.**
| Field | State |
| --- | --- |
| requestId | GENERATE-ONCE at first `--send` |
| projectName | `Nectar Labs` (filled) |
| leadName, email, size | `TODO-H10` |
| tracks | `["defi","security","agents"]` (filled; dry run shows defi/security/agents once each) |
| nearAddress | `TODO-H14` (mainnet payout account, Kunal only) |
| projectUrl | `TODO-H2` |
| demoUrl | `TODO-H3` |
| idea | filled (block) |
| consent | `TODO-H14` |

Order (SUBMISSION.md:21, HACKATHON rule): **H2 repo public → H11 video in the H3 X post → fill fields → dry run with 0 TODO-H → H1 send.** A sent submission cannot be edited.

### 9. Handoffs (HUMAN_HANDOFF.md, statuses read in this run)
- DONE / CLOSED: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-NEAR-FAUCET (+v7), H-SOL-AIRDROP, H-DOMAIN, H-LEGAL, H-HOST, H9, H16 (nfts not added), H17 ("fire-sales").
- N/A or out of scope: H-DNS (no domain), H5 (superseded), H6 (mainnet).
- OPEN, Kunal only, blocking H1: H10, H12, H14, H2, H11, H3, H1.
- OPEN, operational: H-ORACLE (stale ≈ 2026-11-13 15:10Z), H-EXPLORER (G9, non-blocking).
- OPEN, optional (defaults keep the disclosed fallbacks): H-NEARDATA, H-KEYS, H13 (Pyth, G5 stays FALLBACK), H7 (G8 stays fixture), H8, H4, H15, H-GUARD-V7, H18, H19, H20.
- Other human steps: kill PID 14369; real-wallet borrow account id.
- Defaults if silent: as written in each entry. Not re-read line by line in this run.

## Failed or open
| What is missing | Owner | Est. time |
| --- | --- | --- |
| README.md:153 says "live oracle" in the phase line while G5 is FALLBACK (copy rule) | docs agent (README only, no product code) | 5 min + G9 step-3 re-check |
| SUBMISSION.md:3 header still says "DRAFT, 2026-11-11 … a677689" | docs agent | 2 min |
| DEMO_SCRIPT step-1 snapshot is from 2026-11-11 | orchestrator (read-only views) | 10 min |
| Local services answer 404 on `/health` (:8790 :8791 :8788 :8789), so health is unconfirmed | orchestrator: confirm the right health path | 5 min |
| Stray next-server PID 14369 on :3217 | Kunal | 1 min |
| Real-wallet borrow | Kunal (agent mints NVDAx first) | 15 min |
| Payload TODO-H10/H14/H2/H3, video H11 | Kunal | see below |
| Cookie banner, crawl, host check, hydrated landing, home-path grep, test suites | not re-run in this audit (last verifier runs PASS) | — |

## Self-attested only
- Vercel and Railway project ids and deployment ids (STATE.md, orchestrator smoke logs evidence/WO-34/prod-smoke-release3-*).
- Plan costs (FACTS F-402, F-444–F-451).
- Keys location for the keeper/x402 (README.md:21-23).
- G3b item (h), orchestrator-run and verifier-reviewed.
- @x402/core / zod non-reachability (SECURITY.md:123, F-385/F-451).
- Docs-site advisories build-time only.

## Needs Kunal (ordered by deadline)
1. **Now:** stop the stray preview server with `kill 14369` (it serves :3217).
2. **Before 2026-11-13 15:10Z, and ≤ 15 min before any NYSE-hours recording (14:30–21:00 UTC):** H-ORACLE. Either run `scripts/ops/refresh-owner-price.sh`
   yourself, or tell the orchestrator to run the one-shot refresh each session (RUNBOOK). Repeat before judging, 16–18 Nov.
3. **2026-11-13:** send the testnet account id for the real-wallet borrow. The agent mints mock NVDAx, then you borrow at APP /borrow.
4. **Before H2:** H12 (prior-work wording in README) and H10 (leadName, email, size; second-project check, Q-015).
5. **2026-11-14 morning:** H2. Add a public remote, push main + tags, make the repo public (HUMAN_HANDOFF.md:224). Never done by an agent.
6. **After H2:** H11 video, then H3 X post with the video (docs/X_POST.md, URLs = vercel.app).
7. **Before H1:** H14. Mainnet payout account from your own wallet, and consent text agreed. Fill SUBMISSION.md, then `bash scripts/submit.sh --dry-run` until it shows 0 TODO-H.
8. **By 2026-11-14 23:59 UTC:** H1 send (`scripts/submit.sh --send`, per HUMAN_HANDOFF.md:232). It cannot be edited after sending.
- Optional: H-NEARDATA key (dashboard.fastnear.com) for Feed event history; H-EXPLORER; H13; H7.

## Critical path to H1 (UTC)
| When | Step |
| --- | --- |
| 2026-11-12 17:12Z (now) | Production on release 3, all gates green, submission-rc = 4b20f05, 0 commits after |
| Nov 12–13 | Docs fixes (README:153, SUBMISSION:3); if merged, move submission-rc and re-check G9 step 3 (≈ 30 min) |
| Nov 13 before 15:10Z | H-ORACLE refresh |
| Nov 13 14:30–21:00Z | Re-snapshot, price refresh ≤ 15 min before, record the video (H11); real-wallet borrow |
| Nov 14 ≤ 12:00Z | H10, H12 done; H2 push + public |
| Nov 14 ≤ 15:00Z | H3 X post with video; G9 rehearsal against the public URL (SUBMISSION.md:88) |
| Nov 14 ≤ 18:00Z | H14 filled; dry run with 0 TODO-H (internal package deadline 18:00Z) |
| Nov 14 ≤ 20:00Z (target), 23:59Z (hard) | H1 send |

## Risks (top 5, each with its fallback)
1. **Owner price goes stale during judging (16–18 Nov), so borrows are refused or limits drop to the closed session.** Fallback: a daily one-shot refresh (H-ORACLE). The UI shows the closed-session limit and the reason, which is disclosed.
2. **Public RPC rate limits (FastNEAR 429, no CORS on 429).** Fallback: the 4-endpoint RPC fallback in the SDK, keeper and Feed (WO-35k). The Feed runs in views mode.
3. **The keeper runs only on the operator's machine, so settlement and remote relays pause when it is off.** Fallback: disclosed in README.md:21-23. `resign_remote_settlement` plus the web "Re-sign settlement" button; H-KEYS for a hosted keeper.
4. **Submission-order mistake (send before the repo is public or the post is up; a sent payload can't be edited).** Fallback: the dry-run refusal on TODO-H, the SUBMISSION.md:88 checklist, and the H1 guard (`HUMAN_CONFIRMED=1` only in Kunal's shell).
5. **A late copy fix after the freeze moves submission-rc away from the gated commit.** Fallback: docs-only changes, `git diff --stat 5f011bb <new> -- apps packages services contracts` empty, plus a G9 step-3 re-check, as done for run 5b.
