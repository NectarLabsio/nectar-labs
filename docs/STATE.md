# STATE.md — one screen for a returning human

Phase: **P1 open** (p0-green a68b4f6). Round 1: WO-9 quoter ∥ WO-10a contract ∥ WO-11a feed ∥ WO-12 web
Gates: G0 PASS · G1 PASS (b721641) · G2 PASS (5f27f44) · G3 PASS (176914f; write flow from c940dec run) · G4–G9 pending
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
Last activity: 2026-11-09T21:27:26Z · commit a68b4f6
