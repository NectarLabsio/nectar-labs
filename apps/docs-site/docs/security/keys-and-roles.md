---
title: Keys and roles
slug: /security/keys-and-roles
description: Every role, every key, where it lives.
---
# Keys and roles

<p className="verified">Verified against: F-015 (2026-11-09), F-016 (2026-11-10), F-019 (2026-11-10), F-020 (2026-11-10), F-030 (2026-11-09), F-040 (2026-11-09) · spec docs/PRD.md §6.1, §16.1 · D-007, D-010</p>
<p className="status">Status: accounts created on testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). Ids from packages/config/config.yaml.</p>

## Roles in `nectar-core`

| Role | Account | May call |
| --- | --- | --- |
| owner | `nectar.testnet` (deployer key) | collateral and risk params, oracle params and owner price, fee split, keeper, pause, gas reserve |
| keeper | `keeper.nectar.testnet` (no full-access key, D-012) | `trigger_preliquidation`, `relay_settlement_result`, 0 deposit, through a function-call key (D-010) |
| token contracts | mock USDC, mock NVDAx | `ft_on_transfer` (predecessor check) |
| quoter (P1) | `outlayer.testnet` (F-040) | only the `#[private]` callback `on_quoter_result` |
| MPC signer (P2) | `v1.signer-prod.testnet` (F-030) | only the `#[private]` callback `on_signature` |
| anyone | — | views; own quotes: withdraw, claim; own positions: repay |

## Where keys live

| Key | Created by | Stored |
| --- | --- | --- |
| parent testnet account | `near account create-account sponsor-by-faucet-service … save-to-keychain` (F-016) | OS keychain |
| sub-accounts | `near account create-account fund-myself … save-to-keychain` (F-020) | OS keychain |
| keeper function-call key | `near account add-key … grant-function-call-access` (F-020) | OS keychain or a `0600` file under `~/.nectar/` |
| Solana devnet deployer (P2) | `solana-keygen` | `~/.config/solana/`, never in the repo |

No key is ever pasted, committed or printed. `.env` holds paths and ids only. A pre-commit hook runs gitleaks. Signing a mainnet transaction, publishing, or anything irreversible needs the human owner (D-007).

## Rotation

- Keeper: owner calls `set_keeper(new)`, then `near account delete-keys` removes the old key (F-019).
- Owner: on testnet, redeploy. PROD: DAO proposal.
