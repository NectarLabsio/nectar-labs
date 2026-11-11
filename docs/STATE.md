**v7 adoption: state E at 3f002c4 (2026-11-10) — D-017/D-018.** PRD v7 + addendum in docs/; P0 delta + Solana lifecycle first, one nectar-core-v2 deploy (needs H-NEAR-FAUCET).

## Now (2026-11-11 ~09:10Z) — read this block; everything below "History" is superseded
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
Last activity: 2026-11-11T09:06:25Z · tag submission-rc
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
