# FINAL_REPORT.md: final status audit, re-run on submission-rc 7f51c0b (verifier, read-only)

Order: docs/work/final-audit.md (Kunal, 2026-11-12). Audit started **2026-11-13 11:34:33Z = 17:04 IST**. Probes ran from 11:34Z to 11:41Z.
Time left to 2026-11-14 23:59 UTC: **1 d 12 h 19 min** (measured at 11:40Z).
Marks: **VERIFIED** (re-run in this audit) · **SELF-ATTESTED** (agent or orchestrator log only) · **FALLBACK** (disclosed) · **FAILED** · **OPEN** ·
**NOT RE-CHECKED** (the last recorded result is cited, but nothing was re-run in this audit).
Tooling limit: the sandbox refuses `git -C /Volumes/T7/nectar-labs`. All repo checks ran in this worktree, which shares the object store and refs.
The main checkout's working-tree status could not be read.

## Done

### 1. Repo
| Item | Mark | Evidence (this run) |
| --- | --- | --- |
| submission-rc → 7f51c0b21d86… ("chore: STATE — refresher key + first refresh, …") | **VERIFIED** | `git rev-parse submission-rc^{commit}` = `git rev-parse main` = HEAD of this worktree |
| Commits after the tag | **VERIFIED**: 0 | `git log submission-rc..main` is empty |
| Product code since release 4 (c95cd0c) | **VERIFIED**: 2 files | `git diff --stat c95cd0c submission-rc -- apps packages services contracts solana evm quoter` lists packages/config/config.yaml (the `oracle_refresher` block: tick 60→15 s, session 600→60 s, closed 43200→21600 s, allowance "1"→"5") and services/keeper/test/oracle-refresher.test.ts (WO-69). Both are keeper-only. No verifier gate covers this delta; the orchestrator's `verify:quick` 0 is **SELF-ATTESTED** (STATE) |
| Worktree clean | **VERIFIED** (own worktree) / **NOT RE-CHECKED** (main checkout, sandbox) | `git status --short` was empty before this report |
| Secret scan, full history | **VERIFIED**: no leaks | `gitleaks detect --source . --log-opts=--all --redact` (8.30.1): "525 commits scanned … no leaks found" |
| .env committed | **VERIFIED**: none | `git log --all --diff-filter=A --name-only` → only `.env.example` and `apps/web/.env.example` |
| Private-key patterns at the tag | **VERIFIED**: none | `git grep` for `ed25519:<80+ base58>`, PEM `PRIVATE KEY` and `"secret_key"` found only `Signature: ed25519:…` lines in evidence/C, G13 and G14 tx logs. Those are public tx signatures |
| ~/.nectar and home paths | **VERIFIED**: path strings, no key material | Outside *.md, `~/.nectar/<dir>` path references appear as defaults and in log lines (keys ×36, solana ×22, evm ×6, deploy ×3, feed.sqlite ×2, keeper.sqlite, base, submission-request-id). This is the layout CLAUDE.md prescribes (".env holds paths and ids only"). A real home path appears only inside 7 binary wasm fixtures (6 × contracts/nectar-core/tests/fixtures, 1 × contracts/mock-ft/tests/fixtures/mock-ft-deployed.wasm), as compiler build paths |
| Remote | **VERIFIED**: none | `git remote -v` prints nothing, so nothing has been pushed |

### 2. Gates (none re-run here; last result per docs/EVIDENCE.md:3-57)
| Gate | Last result | Commit | Run by | Mark |
| --- | --- | --- | --- | --- |
| G0 | PASS 2026-11-09T23:09Z | b3a9090 | verifier | NOT RE-CHECKED |
| G1 | PASS. v7 on 09c4316; gas rows 67/67 on 48b5c5a | 48b5c5a | verifier | NOT RE-CHECKED |
| G2 / G2b | G2 PASS 5f27f44. G2b PASS after D-027 (2.2.1-v7, rebuilt wasm = code_hash 3mv4LRm6…) | 3ab3026 | verifier | NOT RE-CHECKED |
| G3 | PASS | 176914f | verifier | NOT RE-CHECKED |
| **G3b** | re-run 8 (31809b1; every product assertion PASS) + 8b (c95cd0c; (d), (k), (p) PASS). Runs 8 + 8b cover c95cd0c | c95cd0c | verifier | NOT RE-CHECKED |
| G4 | PASS (attestation by request; TDX quote present, not verified) | d87eef6 | verifier | NOT RE-CHECKED |
| **G5** | **FALLBACK (disclosed)**: owner oracle, no live Pyth price | 706d940 | verifier | FALLBACK |
| G6 | PASS (dry quotes only) | fea52b7 | verifier | NOT RE-CHECKED |
| G7 | PASS after D-027 (read-only, both chains) | 3ab3026 | verifier | NOT RE-CHECKED |
| **G8** | **PASS (fixture)**. No live answer: H7 key absent | df4706f | verifier | FALLBACK |
| **G9** | run 6 (b7fa381, product c95cd0c): every step except 3. Run 6b (8a54b4c, product c95cd0c): step 3 PASS | b7fa381 + 8a54b4c | verifier | NOT RE-CHECKED |
| G10 | PASS with open items F-351/F-352/F-353 | 09c4316 | verifier | NOT RE-CHECKED |
| G11 | PASS (608 unit + 51 sandbox). Delta mock-ft (WO-66 n) PASS on 31809b1 | 3ab3026 / 31809b1 | verifier | NOT RE-CHECKED |
| G12 | PASS on a local fork of Base Sepolia (D-026) | 7bface5 | verifier | FALLBACK |
| **G13** | **PASS on a local fork of Base Sepolia** (disclosed fallback). ERC-8021 suffix not appended | 3ab3026 | verifier | FALLBACK |
| G14 | PASS (paid call, position #15) | 48b5c5a | verifier | NOT RE-CHECKED |
| WO-34 production (custom hosts) | PASS 8/8 | c95cd0c | verifier | NOT RE-CHECKED |

README fallback wording, **VERIFIED** by reading it in this run:
- G5: README.md:58 says "**owner oracle (disclosed)**, badge in UI | in use for NVDAx. The Pyth path is built and sandbox-tested …". README.md:164 says "oracle (G5: owner-oracle fallback, disclosed)".
- G8: README.md:62 says "**built; no live NEAR AI answer has been verified yet.** Live mode needs key H7".
- G13: README.md:55 says "on **a local fork of Base Sepolia** (anvil, chain id 84532)". Local anvil :8545 answers `eth_chainId` 0x14a34 (84532), block 0x3668664.
- EVIDENCE note: the summary table has no row for G9 run 6b. The run exists only as the § block at EVIDENCE.md:1159.

### 3. Last round's items
| Item | Mark | Evidence |
| --- | --- | --- |
| Cookie banner does not cover the wallet list | NOT RE-CHECKED | No browser run in this audit. Last: WO-34 custom hosts item (5), 6/6 wallets reach their prompt with 0 CSP violations (c95cd0c, 02:05Z–02:40Z) |
| agent1 has mock NVDAx for ≥ 6 x402 runs | **VERIFIED** | `ft_balance_of agent1.nectar.testnet` = **"8000000"** at block 277504627 (6 decimals, so 8 NVDAx). One run uses 1 NVDAx (DEMO_UNITS default), so **8 runs** |
| Does transferring a Position Note transfer the loan? | **VERIFIED** (code read; tests not executed) | `nft_transfer` (contracts/nectar-core/src/notes.rs:557) → `move_note` (notes.rs:332). Tests at tests_notes.rs:352 `v7_notes_residual_collateral_goes_to_loan_note_owner`, :365 `v7_notes_self_settle_by_new_loan_owner`, :379 `v7_notes_self_settle_old_owner_refused`, :470 `v7_notes_loan_transfer_refused_while_settling`. Answer: the borrower role and the residual collateral move with the Note. Repay is permissionless. Remote collateral does not follow the Note (SECURITY.md item 12) |
| No privacy-track framing | **VERIFIED** | Tracks `["defi","security","agents"]` (SUBMISSION.md:18). The dry-run payload has 0 "privacy" matches. README.md:142 and SUBMISSION.md:61 say `privacy` is **not entered**. X_POST.md: 0 "privacy". Production SITE, DOCS and STATUS HTML: 0 "confidential", 0 "privacy track". "never joined to IP" and "instead of being published": 0 hits in README, SUBMISSION, X_POST, apps/web, packages/ui and apps/docs-site |
| @x402/core advisory | **SELF-ATTESTED** (reachability) | GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404, **high**, CVSS 7.5, zod < 4.6.6 (SECURITY.md:123). Presence **VERIFIED**: services/x402 pins `@x402/core` 2.18.0, the lockfile holds zod@3.25.76 and zod@4.6.7, and @x402/core is imported in services/x402/src/server.ts:12 and agent.ts:6. Non-reachability from untrusted input is per SECURITY.md:123 / F-385 / F-451 and was not re-derived. `pnpm audit` printed nothing in this run |
| Which commit G9 last ran on | **VERIFIED** | Run 6 on b7fa381 and run 6b on 8a54b4c, both product c95cd0c (EVIDENCE.md:5, :1159). submission-rc adds only the keeper-only delta listed in §1 |

### 4. WO-34 deploy
| Item | Mark | Evidence (11:35:16Z unless noted) |
| --- | --- | --- |
| nectarlabs.io and its DNS | **VERIFIED** (registration, DNS) / SELF-ATTESTED (who controls it) | whois: created 2026-11-12T18:54:47Z, registrar HOSTINGER operations UAB, expires 2027-11-12. NS ns1/ns2.vercel-dns.com. A 216.198.79.1 / .65. Per STATE (2026-11-12 19:31Z), Kunal added the domain to the Vercel team. HUMAN_HANDOFF: H-DOMAIN CLOSED, H-DNS CLOSED (Vercel DNS, no records needed). FACTS F-395 ("not registered") is superseded |
| SITE https://nectarlabs.io | **VERIFIED** 200 | `/borrow` 308 → https://testnet.nectarlabs.io/borrow; www 308 → apex |
| APP https://testnet.nectarlabs.io | **VERIFIED** | `/` 307 → /feed; `/feed` 200; `/borrow` 200; `/docs` 308 → https://docs.nectarlabs.io/ |
| DOCS https://docs.nectarlabs.io | **VERIFIED** 200 | `/start/quick-start` 200 |
| STATUS https://status.nectarlabs.io | **VERIFIED** 200 | — |
| Legacy hosts | **VERIFIED** 308 | nectarlabs.vercel.app → apex; nectarlabs-app.vercel.app/feed → testnet …/feed; nectarlabs-docs.vercel.app → docs |
| Vercel projects and deployments (web dpl_Bm1uwQcX…, docs dpl_DpqAmb6…), Railway project, Feed deploy 8acfc7a5, refresher deploy 67d55980 | SELF-ATTESTED | STATE top block. No connector query in this run |
| Crawl and host check | NOT RE-CHECKED | Last: WO-34 custom hosts (c95cd0c): smoke-prod 43 ok / 0 failures; crawl 84 internal routes, all 200 (EVIDENCE.md:6) |
| Keeper and x402 hosted or local | **VERIFIED** local / SELF-ATTESTED keys | :8790 `/healthz` 200: ok true, last_tick_ok true, 6 open positions, uptime 77,278 s, rpc failovers 994. :8791 `/health` 200: ok true, facilitator in-process, feed_upstream 200. The local Feed :8788 `/healthz` 503: ok false, last poll 2026-11-11T09:45Z, error "neardata block 277108819 HTTP 429" (stale; x402 now uses the hosted Feed). Keys: README.md:30 says "OS keychain or `0600` files under `~/.nectar/`" |
| Oracle refresher (Railway) | **VERIFIED** on chain / SELF-ATTESTED (service liveness) | tx BHopF1cu… = nectar.testnet AddKey, SuccessValue. `view_access_key_list nectar.testnet`: 1 FullAccess + `ed25519:3qurjD6A…` FunctionCall, receiver nectar-core-v2, methods ["update_owner_price"], allowance left 4.99972 NEAR. tx De6aVqqN… = FunctionCall update_owner_price, SuccessValue; receipt HKym9cr1… at block 277503817 logs `oracle_updated` NVDAx. `get_exit_capacity {"symbol":"NVDAx"}` at block 277504654 (11:36:25Z): oracle_age_s 501 (= 11:28Z refresh), oracle_fresh true, session_open false, session_reason outside_hours. Only one refresh so far, which fits the 6 h closed-hours schedule. The first in-session refresh (60 s cadence) is due at 14:30Z |
| Plan costs | SELF-ATTESTED | Vercel Hobby $0 (F-402). Railway ≈ $0.64/mo on the Free $1 credit (F-444–F-451) |
| README "Hosted demo" | **VERIFIED** (hosts) / **FAILED** (Feed row) | README.md:10-30: release 4 c95cd0c, and SITE/APP/DOCS/STATUS/legacy behaviour = the probes above. The Feed row (README.md:26, repeated at :61) says the Feed is "configured to index contract events from block 277398512" and that events before 277398512 are missing. Live /health says start_block **277503800** (the 11:36Z workaround), and no nectar-core v2 event can be indexed at all (§7) |
| Timebox 2026-11-13 18:00 UTC | **VERIFIED** met | Release 4 answered on all four custom hosts at 11:35Z, 6 h 25 min before the timebox |

### 5. Claims audit (README, landing, docs, SUBMISSION, X_POST)
| Claim | Evidence | Verdict |
| --- | --- | --- |
| Core v2, mock USDC, mock NVDAx "live (testnet)" | §G2b. In this run, get_exit_capacity answered at block 277504654 | supported |
| Owner oracle (README.md:58) | §G5; refresher txs above | FALLBACK, disclosed |
| Base spoke (README.md:55) | §G12/§G13; anvil 84532 answers locally | supported, says "local fork" |
| Copilot (README.md:62) | §G8 fixture | "built; no live answer", disclosed |
| x402 paid export, Position Notes, Solana, OutLayer "live" rows | §G14, §G2b, §G7, §G4 (not re-run) | supported by EVIDENCE |
| Hosted demo hosts (README.md:10-25) | §4 probes | supported |
| **Hosted Feed "configured to index contract events" (README.md:26, :61)** | §7: Feed parser accepts version 1.0.0 only; the contract emits 2.0.0; start block is now 277503800 | **FAILED: unsupported and stale** |
| Tracks defi/security/agents | dry-run payload | supported |
| Landing (production HTML, 11:39Z) | "local fork" ×3; the 3 Base sentences all say "local fork of Base Sepolia, not on Base Sepolia"; 0 "hackathon", 0 "insurance", 0 "without liquidation", 0 "confidential"; "testnet" ×58, "mock" ×22. DOCS and STATUS: 0 of the banned terms too. Hydrated text not re-checked | supported |
| Product UI copy rules | `grep -rliE hackathon` and `insurance\|without liquidations\|never joined to IP\|instead of being published` over apps/web, packages/ui and apps/docs-site (tests excluded) → 0 files | supported |
| "live" counts | README 21, SUBMISSION 5, X_POST 0, landing 6 (incl. markup) | each README row cites an EVIDENCE §; not re-run |
| The 3 corrected privacy claims | 0 hits (§3) | still corrected |

### 6. Security (SECURITY.md, read in this run)
"What remains" (SECURITY.md:131-149) lists 12 items, all open or partial by design: (1) SR-5 remote capacity checked only at origination · (2) SR-6 gas
reserve can be worn down by keeper reads · (3) SR-7 no B20 `isAuthorized` at funding · (4) SR-4 EVM remainder pushed · (5) SR-15 no mint binding in
`vault_read` · (6) keeper relays advisory · (7) keeper residuals · (8) Base on a local fork · (9) not reviewed: callback-gas failure branches, upgrade safety,
18–24-decimal collateral, MEV · (10) single owner key · (11) C-020 · (12) remote Loan Notes do not carry the collateral release.
Dependencies (SECURITY.md:123-127): zod (above) and the docs-site build-time advisories (tinypool, serialize-javascript, …) are **SELF-ATTESTED**.
**C-020** (FACTS.md:386): "implicit account" scope (`0s`/`0u`). Kept by Kunal's decision D-029 as known limitation 11, so it is closed by decision.

### 7. Demo readiness
| Item | Mark | Evidence |
| --- | --- | --- |
| Feed lag | **VERIFIED** lag 0 / **FAILED** event indexing | 12 samples, 11:36:30Z–11:37:12Z: HTTP 200, `last_indexed_block` = `chain_head`, lag 0, poll_age 0–2 s. A probe at 11:35:22Z returned **ok false** (poll_age 4 s against the 3 × FEED_POLL_MS = 3 s freshness window, services/feed/src/api.ts:128-129). Lag 0 does not prove the Neardata cursor caught up: views polling also advances `last_block` (db.ts:205-209), and the cursor `neardata_height` is not exposed. **Event test: still FAILED at 11:40:44Z.** events_indexed 0 with start_block 277503800, although the refresh receipt's `oracle_updated` sits in block 277503817. **Root cause found in this run, beyond STATE's speed diagnosis:** the receipt log reads `"standard":"nectar","version":"2.0.0"` (contracts/nectar-core/src/events.rs:8). The Feed accepts only `NECTAR_VERSION = '1.0.0'` (services/feed/src/events.ts:7, :34), and services/feed/test/feed.test.ts:54 asserts that a `nectar` `2.0.0` event is rejected as `bad_version`. So the hosted Feed drops every nectar-core-v2 event at any indexing speed. `/api/settlements` → `items: []` |
| Stray preview server on :3217 | **VERIFIED** gone | `lsof -iTCP:3217 -sTCP:LISTEN` is empty; curl :3217 → 000 |
| Kunal's real-wallet borrow | **OPEN** | Not reported. demo.nectar.testnet holds **0** mock NVDAx (block 277504628), so DEMO_SCRIPT step 5 (test assets) is still to do |
| DEMO_SCRIPT "Before recording" | **VERIFIED** read / stale text | 8 steps (DEMO_SCRIPT.md:10-54): time window, fresh price, production, wallet import, test assets, x402, tabs, rehearse. **Step 2 is stale:** it says the refresher is "STAGED, not running, until Kunal applies it" and "re-asserts the price every 10 min". On chain it runs (above), and config is now 60 s in session. Step 2 is right that a borrow needs a price < 120 s old (`max_age_ns_session`, lib.rs:381). The state snapshot is from 2026-11-12T20:07Z |

### 8. Submission payload
`bash scripts/submit.sh --dry-run` (worktree = 7f51c0b) → **exit 0**, "payload still has TODO-H placeholders — not sendable", "(dry run — nothing sent)". **VERIFIED**.
| Field | State |
| --- | --- |
| requestId | GENERATE-ONCE at first `--send` |
| projectName | `Nectar Labs` (filled) |
| leadName, email, size | `TODO-H10` |
| tracks | `["defi","security","agents"]` (filled) |
| nearAddress | `TODO-H14` |
| projectUrl | `TODO-H2` |
| demoUrl | `TODO-H3` |
| consent | `TODO-H14` |
| idea | filled |
| website | absent (0 matches), correct |

Order: **H2 repo public → H11 video in the H3 X post → fill fields → dry run with 0 TODO-H → H1 send.** A sent submission can't be edited.

### 9. Handoffs (docs/HUMAN_HANDOFF.md headings, read in this run)
- DONE / CLOSED: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-NEAR-FAUCET (+v7), H-SOL-AIRDROP, H-DOMAIN, H-DNS, H-LEGAL, H-DEPLOY, H-NEARDATA, H-HOST, H9, H16, H17.
- N/A or superseded: H5, H6.
- OPEN, Kunal only, blocking H1: H10, H12, H2, H11, H3, H14, H1.
- OPEN, operational: H-EXPLORER (non-blocking).
- OPEN, optional (the default keeps the disclosed fallback): H13, H7, H8, H4, H15, H-KEYS, H-GUARD-V7, H18, H19, H20.
- **Out of date compared with chain and STATE:** H-ORACLE says "WAITING (staged, Kunal applies)", but the refresher key and the first refresh are on chain (§4). H-DEMO-WALLET says OPEN, but STATE says the orchestrator did it.
- Other human steps (STATE): the Feed product fix decision, sealing FEED_NEARDATA_API_KEY in the Railway dashboard, installing ffmpeg (WO-35), the Weekend Shield decision (WO-35), and the real-wallet borrow.
- Defaults if silent: as written in each entry. Not re-read line by line in this run.

## Failed or open
| What is missing | Owner | Est. time |
| --- | --- | --- |
| **Hosted Feed indexes no nectar-core-v2 event**: version filter `1.0.0` against the emitted `2.0.0` (events.ts:7; test feed.test.ts:54 locks it in). This is product code after the freeze. Fix = accept 2.0.0 (and check NECTAR_EVENTS covers the v7 events), plus concurrent block fetch, plus a Railway redeploy (approval) | Kunal decides; keeper agent (services/feed) | 30–60 min + redeploy + re-test |
| README.md:26 and :61 Feed rows: start block 277398512 → 277503800, and "configured to index contract events" while none can be indexed | docs agent (after Kunal's decision) | 10 min + G9 step-3 re-check |
| /health flaps to ok false / 503 with FEED_POLL_MS 1000 (3 s freshness window) | keeper agent / orchestrator config | 5 min |
| DEMO_SCRIPT step 2 and HUMAN_HANDOFF H-ORACLE / H-DEMO-WALLET out of date | docs agent | 10 min |
| EVIDENCE summary table lacks a G9 run 6b row | verifier | 2 min |
| Real-wallet borrow; test assets for demo.nectar.testnet (0 NVDAx) | Kunal (faucet, 1 claim/h) | 15 min |
| Payload TODO-H10/H14/H2/H3, video H11 | Kunal | see below |
| Cookie banner, crawl, host check, hydrated landing, test suites | not re-run in this audit (last verifier runs PASS) | — |

## Self-attested only
- Vercel/Railway project and deployment ids, the refresher's Railway service liveness, and who controls the registrar account (STATE).
- Plan costs (F-402, F-444–F-451). Keeper/x402 key location (README.md:30).
- zod non-reachability (SECURITY.md:123, F-385/F-451) and the docs-site advisories (build-time only).
- `verify:quick` 0 on WO-69 (the config + keeper-test delta between c95cd0c and the tag).

## Needs Kunal (ordered by deadline)
1. **Before 14:30Z today (the only NYSE session before the deadline):** decide the Feed. Option (a): approve a product fix (accept event version 2.0.0, plus concurrent fetch) and a Railway redeploy. Option (b): keep views-only, and the docs agent corrects README.md:26/:61. The UI's event-history banner already discloses views mode.
2. **Before the take (14:30–21:00Z):** claim faucet test assets for demo.nectar.testnet (APP /borrow "Get test assets"; balance now 0). At 14:30Z, check that the refresher starts its 60 s cadence (`get_exit_capacity {"symbol":"NVDAx"}` oracle_age_s < 120). Install ffmpeg, and decide on the Weekend Shield (WO-35).
3. **2026-11-13:** report the real-wallet borrow result.
4. **Before H2:** H12 (prior-work wording) and H10 (leadName, email, size; Q-015 check). Seal FEED_NEARDATA_API_KEY in the Railway dashboard (3-dot menu → Seal).
5. **2026-11-14 morning:** H2. Add the remote https://github.com/NectarLabsio/nectar-labs, push main + tags, make the repo public (never done by an agent).
6. **After H2:** H11 video, then H3 X post with the video (docs/X_POST.md).
7. **Before H1:** H14 (mainnet payout account, consent). Fill SUBMISSION.md, then run `bash scripts/submit.sh --dry-run` until it shows 0 TODO-H.
8. **By 2026-11-14 23:59Z:** H1 send (`scripts/submit.sh --send`, in your shell with HUMAN_CONFIRMED=1). It cannot be edited after sending.

## Critical path to H1 (UTC)
| When | Step |
| --- | --- |
| 2026-11-13 11:41Z (now) | Production = release 4 c95cd0c on 4 custom hosts; submission-rc = 7f51c0b; 0 commits after; refresher key + 1 refresh on chain |
| 11-13 ≤ 14:00Z | Feed decision; if fixed: feed agent → verify → redeploy → event test; README Feed rows corrected; move submission-rc and re-check G9 step 3 (≈ 30 min) |
| 11-13 14:30Z | Refresher in-session cadence observed; demo test assets claimed |
| 11-13 14:30–21:00Z | Rehearse, record (H11), real-wallet borrow; one-shot refresh < 60 s before the borrow beat if the cadence slips |
| 11-14 ≤ 12:00Z | H10, H12; H2 push + public |
| 11-14 ≤ 15:00Z | H3 X post with video; G9 rehearsal against the public repo URL |
| 11-14 ≤ 18:00Z | H14 filled; dry run with 0 TODO-H (internal package deadline) |
| 11-14 ≤ 20:00Z (target), 23:59Z (hard) | H1 send |

## Risks (top 5, each with its fallback)
1. **The Feed shows no event history** (version filter), so settlement links and event panels stay empty during the demo and judging. Fallback: views-mode snapshots plus the UI event-history banner (disclosed), and README text corrected to "no events indexed".
2. **The oracle price goes stale** if the Railway refresher stops or the 5 NEAR allowance runs out, which refuses borrows or drops limits to the closed session. Fallback: the RUNBOOK one-shot `update_owner_price` with the current price. The UI shows the closed-session reason.
3. **An open-session borrow needs a price < 120 s old.** The 60 s cadence plus RPC failovers (994 on the keeper) can miss it. Fallback: a one-shot refresh < 60 s before the borrow beat (DEMO_SCRIPT step 2).
4. **The keeper runs only on the operator's machine**, so settlement and remote relays pause when it is off. Fallback: disclosed (README.md:30), `resign_remote_settlement` and the web "Re-sign settlement" button; H-KEYS for a hosted keeper.
5. **A submission-order mistake, or a late fix that moves submission-rc off the gated commit.** Fallback: the dry-run refusal on TODO-H, the H1 guard (`HUMAN_CONFIRMED=1` only in Kunal's shell), docs-only changes with an empty product diff, plus a G9 step-3 re-check.
