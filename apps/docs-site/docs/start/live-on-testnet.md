---
title: Live on testnet
slug: /start/live-on-testnet
description: What is deployed, what is mock, what is a fallback.
---
# Live on testnet

<p className="verified">Verified against: F-003 (2026-11-09), F-030 (2026-11-09), F-040 (2026-11-09), F-060 (2026-11-10), F-063 (2026-11-10), F-167 (2026-11-09), F-168 (2026-11-09), F-173 (2026-11-09), F-177 (2026-11-09), F-178 (2026-11-09), F-179 (2026-11-09), C-007 (open), C-012 (open) · docs/EVIDENCE.md G2 (2026-11-09T20:55Z, 5f27f44), G4 + addendum (2026-11-09T22:10Z / 22:51Z, d87eef6 / fea52b7), G6 (2026-11-09T22:58Z, fea52b7) · evidence/upgrades/run-20261109T2238Z.log</p>
<p className="status">Status on 2026-11-10: P0 gates G1–G3 PASS. G4 (OutLayer quoter) PASS, G6 (1Click depth) PASS. G5 (oracle): FALLBACK (disclosed), the owner oracle is in use. G7–G9 pending. Source: docs/EVIDENCE.md.</p>

The account ids come from `packages/config/config.yaml`. Each link opens the account on testnet NearBlocks.

| Component | Account / id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core | [`nectar-core.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core.nectar.testnet) | contract, code_hash `HqZaadxyZpywceMBKnjfagdn8NAMdAC5Ucn1K1MG4THX` (wasm sha256 `fa2bb4f1…0f4e`) | live (testnet). Upgraded twice in place; see [Upgrades](/operations/upgrades). The G4 addendum reproduced the hash from a fresh clone |
| mock USDC | [`usdc-mock.nectar.testnet`](https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet) | **mock** NEP-141, 6 decimals, code_hash `3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF` | live (testnet) |
| mock NVDAx | [`nvdax-mock.nectar.testnet`](https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet) | **mock** collateral, 6 decimals, same code as mock USDC | live (testnet) |
| owner | [`nectar.testnet`](https://testnet.nearblocks.io/address/nectar.testnet) | deployer; sets params and the owner price | live (testnet) |
| keeper | [`keeper.nectar.testnet`](https://testnet.nearblocks.io/address/keeper.nectar.testnet) | one function-call key for 2 methods, no full-access key (D-012) | not running continuously (run locally) |
| OutLayer quoter | project `nectar.testnet/nectar-quoter`, version_key `3ce17749…6cc2` on `outlayer.testnet` (F-040) | TEE program, hash-pinned in nectar-core | **live (testnet), G4 PASS.** Discount computed in the TEE from encrypted market-maker inputs (demo values). Request 15148: 159 bps against a 400 bps cap ([attestation JSON](https://testnet-api.outlayer.ai/attestations/by-request/15148), F-168, F-179). See [Quoter (TEE)](/protocol/quoter-tee) |
| settlement discount fallback | quote's `max_discount_bps` | **fallback** | used when the quoter fails or is denied (request 15145, G4 addendum run C; G4 run A) |
| oracle | owner oracle on nectar-core (`update_owner_price`) | **owner oracle (disclosed)**, badge shown in UI | in use for NVDAx. The Pyth path is built and sandbox-tested but has no NVDA price on testnet (C-007, handoff H13; C-012). **G5: FALLBACK (disclosed).** Owner oracle (disclosed); current value: run `pnpm demo:testnet`. See [Oracle policy](/protocol/oracle-policy) |
| 1Click depth | `dry: true` quotes only (F-002, F-060) | read-only, signed quotes, mainnet API | **G6 PASS.** NVDAx has no route (F-063), so `D_c` = 0. The Feed shows signed dry-quote depth for wNEAR → USDC. See [1Click depth](/integrate/oneclick-depth) |
| Feed REST / MCP | local only | read-only, no keys | built; runs locally, no public host. See [Feed MCP](/integrate/feed-mcp) |
| Solana `nectar_vault` | `TODO-G7` (devnet) | Anchor program | P2 |
| Chain Signatures | `v1.signer-prod.testnet` (F-030) | third-party MPC signer | P2 |

## What "mock", "fallback" and "PROD-only" mean here

- **Mock**: a stand-in we deployed ourselves with no value. The tokens are mocks, and so is the owner-set price.
- **Fallback**: a permanent code path used when the better source is not available. If the OutLayer quoter fails or is denied, settlement prices at the quote's `max_discount_bps` (D-004). The oracle is owner-set until a live Pyth price exists (D-005, D-013). Both are disclosed in the UI.
- **PROD-only**: designed but not built here. This covers mainnet, real xStocks, Nectar Reserve (`R_c`), keeper bonds and slashing, and a DAO owner with a timelock. See [Roadmap](/project/roadmap).

## Seeded demo state

The G4 settlement runs on 2026-11-09 used up part of this seed: positions were settled and quote #0 was consumed. A re-seed is pending. `pnpm demo:testnet` prints the current state. Live state (price, `Q_c`, open positions) is not hard-coded on this page; current value: run `pnpm demo:testnet`. The table below is a snapshot of the original seed at 2026-11-09T20:49Z, read by `pnpm demo:testnet` (evidence/G2/demo-testnet-20261109T2049Z.log). Demo accounts: [`buyer1.nectar.testnet`](https://testnet.nearblocks.io/address/buyer1.nectar.testnet), [`buyer2.nectar.testnet`](https://testnet.nearblocks.io/address/buyer2.nectar.testnet), [`borrower1.nectar.testnet`](https://testnet.nearblocks.io/address/borrower1.nectar.testnet).

| Item | Value |
| --- | --- |
| Lending pool | $50,000 mock USDC ($38,750 available, $11,250 utilised) |
| Quote #0 | $10,000 remaining, max discount 250 bps, live |
| Quote #1 | $5,000 remaining, max discount 400 bps, live |
| Position #0 (borrower1) | 100 mock NVDAx, debt $11,250 |
| Limit | $11,250 Cramér limit vs $7,200 static LTV |
| Health | LTV 6,250 bps, pre-liquidation at 7,500 bps |
| Oracle (snapshot 2026-11-09T20:49Z) | owner price $180 (disclosed fallback); session closed. Since moved by the G4 demo price steps; current value: run `pnpm demo:testnet` |

Explorers: NEAR `https://testnet.nearblocks.io/address/<id>`, OutLayer attestations `https://testnet-api.outlayer.ai/attestations/by-request/15148` (API JSON, F-168; dashboard `https://app.outlayer.ai/executions`, F-169), Solana `https://explorer.solana.com/?cluster=devnet`.
