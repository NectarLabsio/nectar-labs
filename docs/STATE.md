# STATE.md — one screen for a returning human

Phase: **P2** — WO-15 live (code CFTfzY4…); G7 NEAR side done (MPC signature valid, pos #6 Settling); G8 FAIL→wording fix (WO-4f merged, WO-17c running); Solana leg waits H-TOOLCHAIN-SOLANA
Gates: G0–G4 PASS · G5 FALLBACK (disclosed) · G6 PASS · G7 verifying (NEAR side done; Solana leg needs H-TOOLCHAIN-SOLANA) · G8 PASS (fixture; live needs H7) · G9 pending
Open handoffs: H13, H-NEAR-FAUCET, H-EXPLORER, H-TOOLCHAIN-SOLANA (P2), H4, H5, H7, H8, H9, H10, H11, H12 — see docs/HUMAN_HANDOFF.md
Blocking right now: H13 Pyth key (G5 live price) · H-NEAR-FAUCET top-up (P1 contract redeploy). Neither blocks round 1.

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

Verified on: 2026-11-10
Last activity: 2026-11-09T23:54:41Z · commit df4706f
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
Next after G5 + WO-4e: tag p1-green if G5 is PASS or a disclosed fallback (CLAUDE.md §8 P1 acceptance allows "README says exactly which
  fallback is active"); refresh .claude/agents/quoter.md at the boundary; open P2 (WO-13 researcher) — Solana leg needs H-TOOLCHAIN-SOLANA,
  copilot needs H7 (fixture verifier otherwise). Re-seed demo state (needs H-NEAR-FAUCET).
Phase-boundary TODO: refresh .claude/agents/quoter.md (still describes the
  pre-D-014 schema); scripts/30 must call set_quoter_pin(project_id, version_key) per interface-p1.
Feed (WO-11a, f525710): 1Click sampler (dry-only, signature-verified, NVDAx no_route), MCP server stdio + HTTP :8789/mcp. For the next
  researcher batch: C-014 candidate — live dry quote has amountOutUsd == amountInUsd (F-064 gap always 0; real out in amountOutFormatted);
  `claude mcp add` flags + Claude Desktop config shape (TODO-FACTS in services/feed/README) before G9; dry recipient default nectar-feed-dry.near.
