# gates-v7.md — v7 gates (addendum §4; verifier, fresh clone, no secrets beyond .env.example; STOP on FAIL). Ids per D-017.
G10 v7 facts + toolchain (P1 open; in state E: now) — WO-18 output: F-328/F-329 (x402), F-336 (Rhea), F-337 (NFT crate), F-338/F-339 (derived keys
    both domains returned live, keccak256_array), NYSE calendar JSON committed with source URL and date, Solana/Anchor versions. PASS = each resolved or a recorded conflict.
G1 (v7 additions) — `cargo test -p nectar-core` + sandbox: aggregate debt, weekend rule (> 900 s), multiplier bounds + announcement + split, pay_to → claimable, referrer ≠ borrower.
G11 v7 contract (after WO-22 + WO-23 merge) — `cargo test -p nectar-core v7_`; `cargo test -p nectar-core --test sandbox_v7`; `python3 tests/model.py --check --v7`;
    every PRD §6.11 test green; gas per new method < 100 Tgas; F-327 answered or open.
G2b/G3b — G2/G3 re-run against `nectar-core-v2.nectar.testnet` (scripts/21-deploy-v2.sh + 40-seed-demo.sh --core …); v1 blocks kept in EVIDENCE.
G7 (v7 additions) — vault's stored authority == `derived_public_key` view; attested deposit (or labelled keeper fallback); signed release after repay; settle on devnet.
G14 x402 (after WO-25) — `pnpm --filter x402 demo:testnet`: borrow → GET /api/feed/export.csv → 402 → pay → 200; NEAR transfer hash + facilitator relay tx.
G12 Base toolchain + collateral (P2b open) — scripts/06-base.sh keystores, H15 funding, createB20 simulation else DeployMock, `forge test` green, scripts/26-deploy-base.sh; addresses on explorer.
G13 Base round-trip (after WO-29) — settle with ERC-8021 suffix + release confirmed on 84532; ecrecover on-chain; replayed nonce and a Solana-domain signature revert.
