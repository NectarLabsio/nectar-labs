---
title: Upgrades
slug: /operations/upgrades
description: How the contract changes, now and in production.
---
# Upgrades

<p className="verified">Verified against: F-011 (2026-11-10), F-014 / F-176 (2026-11-09), F-017 (2026-11-10), F-027 (2026-11-10) · spec docs/process/prd.md §16.5 · docs/EVIDENCE.md G4 addendum (2026-11-09T22:51Z, fea52b7) · evidence/G4/upgrade-20261109T2157Z.log, evidence/upgrades/run-20261109T2238Z.log · docs/EVIDENCE.md §G2b re-run after D-027 (2026-11-11, recorded in b8784c1)</p>
<p className="status">Status on 2026-11-10: nectar-core upgraded twice in place on testnet. Current code_hash `HqZaadxyZpywceMBKnjfagdn8NAMdAC5Ucn1K1MG4THX`. PROD governance is design only.</p>

## Upgrade history (testnet)

| # | When (UTC) | Kind | Script | code_hash after |
| --- | --- | --- | --- | --- |
| 0 | 2026-11-09 | P0 deploy | `scripts/20-deploy-testnet.sh` (G2) | `8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV` |
| 1 | 2026-11-09T21:57Z | P0 → V1, deploy and `migrate` in one transaction; a failed migrate reverts the deploy | `scripts/25-upgrade-testnet.sh` | `FQjNLgawvz9KmeLioJs6fdd5GdB5JAVeEfSSZfEGTFfB` (state_version 1) |
| 2 | 2026-11-09T22:38Z | V1 code-only, no migrate | `scripts/26-upgrade-code.sh` | `HqZaadxyZpywceMBKnjfagdn8NAMdAC5Ucn1K1MG4THX` (wasm sha256 `fa2bb4f1…0f4e`) |
| 3 | 2026-11-09T23:40Z | P2 code-only, no migrate (`contract_version` "nectar-core 0.1.0 p2", state_version 1) | `scripts/26-upgrade-code.sh` | `CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t` (`evidence/upgrades/run-20261109T2340Z.log`) |

Both upgrade paths are tested in the sandbox first (`contracts/nectar-core/tests/sandbox_p1.rs`). The G4 addendum rebuilt upgrade 2 and the G7 verifier rebuilt upgrade 3 from a fresh clone; both matched the on-chain code_hash.

## P1 runbook scripts

| Script | What it does | Signs as |
| --- | --- | --- |
| `scripts/25-upgrade-testnet.sh` | P0 → V1 deploy plus `migrate` | owner (keychain) |
| `scripts/26-upgrade-code.sh` | code-only upgrade; tops up storage from the size gap (1E19 yocto/byte, F-014, F-176) | owner |
| `scripts/30-quoter-publish.sh publish` / `pin` | upload the quoter wasm, `create_project`/`add_version` on OutLayer, then `set_quoter_pin` + `set_quoter_config` on nectar-core (D-014) | owner |
| `scripts/35-quoter-secrets.mjs --quote <id>:<q_bps>:<gamma_bps>` | store the demo market-maker secrets in OutLayer (F-167, F-180). Sends plaintext to OutLayer's pubkey endpoint first, so demo values only | owner |
| `scripts/45-g4-run.sh` | the G4 testnet run: fallback trigger and quoter trigger through the keeper key | keeper, owner (demo price moves) |

## This build (testnet)

- Build only with `cargo near build` (F-011). Plain `cargo build` for wasm lacks the `--cfg near` flag that cargo-near adds (F-027). nectar-core-v2 `2.2.1-v7` was built with `non-reproducible-wasm`: the 2.2.1-v7 wasm rebuilt from a fresh clone with `cargo near build non-reproducible-wasm` matched the deployed code hash (3mv4LRm6…) on the verifier's machine; it is not the Docker reproducible build (EVIDENCE §G2b re-run after D-027).
- Redeploy to the same account with `near contract deploy … use-file <wasm> without-init-call …` (F-017).
- Every deploy tags the git commit, bumps `contract_version()`, and is recorded on the [Evidence](/project/evidence) page.
- `Quote` and `Position` borsh layouts are versioned. A layout change ships with a sandbox migration test.

## Production (not built)

- Owner: a Sputnik DAO.
- 48 h timelock on `upsert_collateral` and on oracle-source changes. `pause` stays instant.
- Public changelog: [Changelog](/changelog).
- An audit before mainnet: see [Audits](/security/audits).
