# STATE.md — one screen for a returning human

Phase: **P0 — build round 1 dispatched** (G0 PASS except Solana/Anchor, which are P2)
Gates: G0 PASS (P0 tools) · G1 · G2 · G3 pending · G4–G9 pending
Open handoffs: H-TOOLCHAIN-SOLANA (P2), H4, H5, H7, H8, H9, H10, H11, H12 — see docs/HUMAN_HANDOFF.md
Blocking right now: nothing for P0.

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
TODO at WO-6: export keeper FC key to ~/.nectar/keys (0600), delete keeper full-access key, record view_access_key_list in EVIDENCE.

Verified on: 2026-11-10
Last activity: (written by .claude/hooks/state.sh)
