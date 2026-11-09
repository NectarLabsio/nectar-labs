---
title: Live on testnet
slug: /start/live-on-testnet
description: What is deployed, what is mock, what is a fallback.
---
# Live on testnet

<p className="verified">Verified against: F-003 (2026-11-09), F-030 (2026-11-09), F-040 (2026-11-09), F-044 (2026-11-09), F-050 (2026-11-09) · ids from packages/config/config.yaml and evidence/G2/deploy-20261109T2045Z.log, demo-testnet-20261109T2049Z.log, verifier-20261109T2055Z.log (2026-11-09, commit 5f27f44)</p>
<p className="status">Status on 2026-11-10: deployed to NEAR testnet on 2026-11-09. G2 PASS 2026-11-09T20:55Z (commit 5f27f44): views answer, on-chain code_hash = G1-verified wasm, keeper key scope correct; explorer pages pending a human click (H-EXPLORER). Web gate G3: in progress. Source: docs/EVIDENCE.md, evidence/G2/verifier-20261109T2055Z.log.</p>

The account ids come from `packages/config/config.yaml`. Each link opens the account on testnet NearBlocks.

| Component | Account / id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core | [`nectar-core.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core.nectar.testnet) | contract, code_hash `8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV` (wasm sha256 `6bd1ec51…15e2a46`) | live (testnet) |
| mock USDC | [`usdc-mock.nectar.testnet`](https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet) | **mock** NEP-141, 6 decimals, code_hash `3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF` | live (testnet) |
| mock NVDAx | [`nvdax-mock.nectar.testnet`](https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet) | **mock** collateral, 6 decimals, same code as mock USDC | live (testnet) |
| owner | [`nectar.testnet`](https://testnet.nearblocks.io/address/nectar.testnet) | deployer; sets params and the P0 price | live (testnet) |
| keeper | [`keeper.nectar.testnet`](https://testnet.nearblocks.io/address/keeper.nectar.testnet) | one function-call key for 2 methods, no full-access key (D-012) | not running continuously (run locally) |
| oracle | owner oracle on nectar-core (`update_owner_price`), $180 | **fallback**, badge shown in UI | owner oracle (P0, disclosed); live source decided at G5 |
| settlement discount | quote's `max_discount_bps` | **fallback** | static discount (P0) |
| OutLayer quoter | `TODO-G4` | TEE program on `outlayer.testnet` (F-040) | P1; until then **fallback**: settle at `max_discount_bps` |
| Solana `nectar_vault` | `TODO-G7` (devnet) | Anchor program | P2 |
| Chain Signatures | `v1.signer-prod.testnet` (F-030) | third-party MPC signer | P2 |
| 1Click depth | `dry: true` quotes only (F-002) | read-only, mainnet API | P1; NVDAx has no route (F-063), so `D_c` = 0 |

## What "mock", "fallback" and "PROD-only" mean here

- **Mock**: a stand-in we deployed ourselves with no value. The tokens are mocks, and so is the owner-set price.
- **Fallback**: a permanent code path used when the better source is not available. P0 settlement prices at the quote's `max_discount_bps` instead of a TEE-computed discount. The P0 oracle is owner-set instead of Pyth or OutLayer. Both are disclosed in the UI (D-004, D-005).
- **PROD-only**: designed but not built here. This covers mainnet, real xStocks, Nectar Reserve (`R_c`), keeper bonds and slashing, and a DAO owner with a timelock. See [Roadmap](/project/roadmap).

## Seeded demo state

Read by `pnpm demo:testnet` on 2026-11-09 (evidence/G2/demo-testnet-20261109T2049Z.log). Demo accounts: [`buyer1.nectar.testnet`](https://testnet.nearblocks.io/address/buyer1.nectar.testnet), [`buyer2.nectar.testnet`](https://testnet.nearblocks.io/address/buyer2.nectar.testnet), [`borrower1.nectar.testnet`](https://testnet.nearblocks.io/address/borrower1.nectar.testnet).

| Item | Value |
| --- | --- |
| Lending pool | $50,000 mock USDC ($38,750 available, $11,250 utilised) |
| Quote #0 | $10,000 remaining, max discount 250 bps, live |
| Quote #1 | $5,000 remaining, max discount 400 bps, live |
| Position #0 (borrower1) | 100 mock NVDAx, debt $11,250 |
| Limit | $11,250 Cramér limit vs $7,200 static LTV |
| Health | LTV 6,250 bps, pre-liquidation at 7,500 bps |
| Oracle | owner price $180 (disclosed fallback); session closed |

Explorers: NEAR `https://testnet.nearblocks.io/address/<id>`, OutLayer attestations `https://app.outlayer.ai/executions` (F-044), Solana `https://explorer.solana.com/?cluster=devnet`.
