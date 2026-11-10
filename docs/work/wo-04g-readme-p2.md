# WO-4g — docs — README + docs truthful for P2 (≤ 20 tool calls). Sources: docs/EVIDENCE.md §G7, §G8; D-016; interface-p2.md.
- Chain Signatures: NEAR side LIVE on testnet — nectar-core builds the settlement preimage, v1.signer-prod.testnet signs it (Ed25519, raw
  bytes, D-016 — remove "pre-hash open until G7"), `settlement_signed` emitted; signature verifies against the vault authority
  ed25519:6QPGoVj8…, which equals the signer's `derived_public_key` for (nectar-core.nectar.testnet, solana-devnet-v1). Evidence: tx
  FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe, position #6 (Settling, no relay).
- Solana: NOT built (toolchain not installed, handoff H-TOOLCHAIN-SOLANA). The preimage names a PLACEHOLDER program id; no Solana
  transaction exists. Rewrite README:51 and any present-tense claim that a Solana program verifies anything ("will verify … once built").
  G7 = PARTIAL. Cut order (CLAUDE.md §1): if the toolchain does not arrive by 2026-11-13 12:00 UTC the Solana leg ships as described here.
- Copilot: G8 PASS (fixture) — remove "G8 re-run pending" (README:24, live-on-testnet.md:27, project/evidence.md).
- legal/privacy.md: line 15 still says the web app is "not built yet" — fix.
- Live state: point to `pnpm demo:testnet`; mention position #6 Settling and #1 open only as a dated snapshot if at all.
docs-site build green; no hackathon wording in docs-site. Commit `docs:`.
