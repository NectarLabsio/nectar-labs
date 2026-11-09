---
title: Live on testnet
slug: /start/live-on-testnet
description: What is deployed, what is mock, what is a fallback.
---
# Live on testnet

<p className="verified">Verified against: F-003 (2026-11-09), F-030 (2026-11-09), F-040 (2026-11-09), F-044 (2026-11-09), F-050 (2026-11-09) · FACTS §Account ids (all TODO on 2026-11-10)</p>
<p className="status">Status on 2026-11-10: nothing is deployed. Every row reads "not deployed" until gate G2 records the account ids and explorer links in docs/EVIDENCE.md.</p>

The account ids are filled from `packages/config/config.yaml` after deploy. The planned names (`*.nectar.testnet`) are listed for orientation only. They are **not** claims that these accounts exist.

| Component | Planned id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core | `TODO-G2` (planned `nectar-core.nectar.testnet`) | contract | not deployed (G2 pending) |
| mock USDC | `TODO-G2` (planned `usdc-mock.nectar.testnet`) | **mock** NEP-141, 6 decimals | not deployed (G2 pending) |
| mock NVDAx | `TODO-G2` (planned `nvdax-mock.nectar.testnet`) | **mock** collateral, 6 decimals | not deployed (G2 pending) |
| keeper | `TODO-G2` (planned `keeper.nectar.testnet`) | function-call key only | not deployed (G2 pending) |
| oracle | owner oracle in P0 (`update_owner_price`) | **fallback**, badge shown in UI | not deployed (G2 pending); live source decided at G5 |
| OutLayer quoter | `TODO-G4` | TEE program on `outlayer.testnet` (F-040) | P1; until then **fallback**: settle at `max_discount_bps` |
| Solana `nectar_vault` | `TODO-G7` (devnet) | Anchor program | P2 |
| Chain Signatures | `v1.signer-prod.testnet` (F-030) | third-party MPC signer | P2 |
| 1Click depth | `dry: true` quotes only (F-002) | read-only, mainnet API | P1; NVDAx has no route (F-063), so `D_c` = 0 |

## What "mock", "fallback" and "PROD-only" mean here

- **Mock**: a stand-in we deployed ourselves with no value. The tokens are mocks, and so is the owner-set price.
- **Fallback**: a permanent code path used when the better source is not available. P0 settlement prices at the quote's `max_discount_bps` instead of a TEE-computed discount. The P0 oracle is owner-set instead of Pyth or OutLayer. Both are disclosed in the UI (D-004, D-005).
- **PROD-only**: designed but not built here. This covers mainnet, real xStocks, Nectar Reserve (`R_c`), keeper bonds and slashing, and a DAO owner with a timelock. See [Roadmap](/project/roadmap).

Explorers once deployed: NEAR `https://testnet.nearblocks.io/address/<id>`, OutLayer attestations `https://app.outlayer.ai/executions` (F-044), Solana `https://explorer.solana.com/?cluster=devnet`.
