---
title: Live on testnet
slug: /start/live-on-testnet
description: What is deployed, what is mock, what is a fallback.
---
# Live on testnet

<p className="verified">Verified against: F-003 (2026-11-09), F-030 (2026-11-09), F-040 (2026-11-09), F-060 (2026-11-10), F-063 (2026-11-10), F-070, F-073, F-075, F-076, F-078 (2026-11-09), F-167 (2026-11-09), F-168 (2026-11-09), F-173 (2026-11-09), F-177 (2026-11-09), F-178 (2026-11-09), F-179 (2026-11-09), F-036 (2026-11-09), F-184 (2026-11-09), C-007 (open), C-012 (open), D-016 (2026-11-10) · docs/EVIDENCE.md G2 (2026-11-09T20:55Z, 5f27f44), G4 + addendum (2026-11-09T22:10Z / 22:51Z, d87eef6 / fea52b7), G6 (2026-11-09T22:58Z, fea52b7), G7 (2026-11-09T23:57Z, 97382fd), G8 re-run (2026-11-09T23:56Z, df4706f) · evidence/upgrades/run-20261109T2340Z.log</p>
<p className="status">Status on 2026-11-10: P0 gates G1–G3 PASS. G4 (OutLayer quoter) PASS, G6 (1Click depth) PASS. G5 (oracle): FALLBACK (disclosed), the owner oracle is in use. G7 PARTIAL (Chain Signatures signer side verified on NEAR; the EVIDENCE run of 2026-11-09 found the Solana leg not built. The vault has since been deployed on devnet; the round trip is pending G7). G8 (copilot) PASS on a fixture. G9 pending. Source: docs/EVIDENCE.md.</p>

The account ids come from `packages/config/config.yaml`. Each link opens the account on testnet NearBlocks.

| Component | Account / id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core | [`nectar-core.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core.nectar.testnet) | contract, code_hash `CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t` | live (testnet). Upgraded three times in place, last for P2 at 2026-11-09T23:40Z; see [Upgrades](/operations/upgrades). The G7 verifier rebuilt this hash from a fresh clone |
| mock USDC | [`usdc-mock.nectar.testnet`](https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet) | **mock** NEP-141, 6 decimals, code_hash `3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF` | live (testnet) |
| mock NVDAx | [`nvdax-mock.nectar.testnet`](https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet) | **mock** collateral, 6 decimals, same code as mock USDC | live (testnet) |
| owner | [`nectar.testnet`](https://testnet.nearblocks.io/address/nectar.testnet) | deployer; sets params and the owner price | live (testnet) |
| keeper | [`keeper.nectar.testnet`](https://testnet.nearblocks.io/address/keeper.nectar.testnet) | one function-call key for 2 methods, no full-access key (D-012) | not running continuously (run locally) |
| OutLayer quoter | project `nectar.testnet/nectar-quoter`, version_key `3ce17749…6cc2` on `outlayer.testnet` (F-040) | TEE program, hash-pinned in nectar-core | **live (testnet), G4 PASS.** Discount computed in the TEE from encrypted market-maker inputs (demo values). Request 15148: 159 bps against a 400 bps cap ([attestation JSON](https://testnet-api.outlayer.ai/attestations/by-request/15148), F-168, F-179). See [Quoter (TEE)](/protocol/quoter-tee) |
| settlement discount fallback | quote's `max_discount_bps` | **fallback** | used when the quoter fails or is denied (request 15145, G4 addendum run C; G4 run A) |
| oracle | owner oracle on nectar-core (`update_owner_price`) | **owner oracle (disclosed)**, badge shown in UI | in use for NVDAx. The Pyth path is built and sandbox-tested but has no NVDA price on testnet (C-007, handoff H13; C-012). **G5: FALLBACK (disclosed).** Owner oracle (disclosed); current value: run `pnpm demo:testnet`. See [Oracle policy](/protocol/oracle-policy) |
| 1Click depth | `dry: true` quotes only (F-002, F-060) | read-only, signed quotes, mainnet API | **G6 PASS.** NVDAx has no route (F-063), so `D_c` = 0. The Feed shows signed dry-quote depth for wNEAR → USDC. See [1Click depth](/integrate/oneclick-depth) |
| Feed REST / MCP | local only | read-only, no keys | built; runs locally, no public host. See [Feed MCP](/integrate/feed-mcp) |
| Chain Signatures signer | [`v1.signer-prod.testnet`](https://testnet.nearblocks.io/address/v1.signer-prod.testnet) (F-030, F-184) | third-party MPC signer; path `solana-devnet-v1`, domain 1 = Ed25519 | **live (testnet); NEAR side of G7 verified (2026-11-09T23:57Z).** nectar-core builds the settlement preimage from its own state, the signer signs the raw bytes (no pre-hash, D-016) and nectar-core emits `settlement_signed`. The signature verifies against the vault authority `ed25519:6QPGoVj8…S1tV`, which equals the signer's `derived_public_key` for (nectar-core.nectar.testnet, solana-devnet-v1) (F-036). See [Chain Signatures](/protocol/chain-signatures). Evidence: trigger tx [FCtApD2L…MHhe](https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe), position #6. The preimage names a **placeholder** Solana program id and a throwaway recipient; nothing was relayed to Solana |
| Solana `nectar_vault` | [`ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW`](https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet) (devnet) | P2, Anchor program | **deployed; round trip pending G7.** Deployed with `init_vault(NVDAx)` on 2026-11-10 (evidence/solana/deploy-20261110T124326Z.log; not yet in docs/EVIDENCE.md). No settle or release transaction exists yet, so nothing on Solana has verified a NEAR signature. **G7: PARTIAL.** See [Solana vault](/protocol/solana-vault) |
| NEAR AI copilot | web app panel, NEAR AI Cloud `cloud-api.near.ai` (F-070) | P2; prose only, never a contract input | **built; no live NEAR AI answer has been verified yet.** Live mode needs key H7, and NEAR AI Cloud returned 500 on 2026-11-09 (F-078). The panel shows an answer only after the signature and attestation checks pass; otherwise it shows "unverified — hidden". Tests (`pnpm --filter web test:copilot`, `e2e/copilot.spec.ts`) run on a fixture built from a real Intel-signed sample TDX quote (Phala dcap-qvl sample, MIT) plus a chat signed by a throwaway key, not a NEAR AI recording; it correctly ends "unverified — hidden". Intel DCAP quote verification runs on the server (F-073); EIP-191 signer recovery and report_data/nonce checks run in the browser (F-075, F-076). **G8: PASS (fixture), 2026-11-09T23:56Z** |

## v7 in progress

These modules are in the repo and tested, but not on testnet. The contract parts ship together in one new contract, `nectar-core-v2.nectar.testnet`, which has not been created yet: it needs about 6–8 testnet NEAR (D-018, handoff H-NEAR-FAUCET). The v1 rows above do not change.

| Module | Status | Page |
| --- | --- | --- |
| Aggregate borrowing limit (two-sided check) | built and tested in the sandbox; testnet deployment pending (gate G1 v7, then G2b) | [Aggregate borrowing limit](/concepts/aggregate-limit) |
| Weekend Oracle Guard (fails closed, NYSE windows, 900 s) | built and tested in the sandbox; testnet deployment pending | [Weekend Oracle Guard](/concepts/weekend-oracle-guard) |
| Corporate-action multiplier | built and tested in the sandbox; testnet deployment pending; OutLayer multiplier job built, publish pending | [Corporate-action multiplier](/concepts/corporate-actions) |
| Origination fee, referrers, `pay_to` | built and tested in the sandbox; testnet deployment pending | [Fee stack and referrals](/concepts/fee-stack) |
| Remote collateral lifecycle (Solana) | NEAR side built and tested in the sandbox; testnet deployment pending. Solana vault deployed on devnet; round trip pending G7 | [Remote collateral on Solana](/integrate/remote-collateral-solana) |
| Shields (weekend-safe limit, committed buyers behind it) | built and tested in the sandbox; testnet deployment pending | [Shields](/concepts/shields) |
| Profit-Lock (self-settlement) | built and tested in the sandbox; testnet deployment pending | [Profit-Lock](/concepts/profit-lock) |
| Position Notes (NEP-171; authority follows the Note) | built and tested in the sandbox; testnet deployment pending | [Position Notes](/concepts/position-notes) |
| Nectar Reserve (`R_c`; fills after every quote; 7-day exit notice) | built and tested in the sandbox; testnet deployment pending | [Nectar Reserve](/concepts/nectar-reserve) |
| OutLayer jobs (calendar, multiplier, vault read) | built; publish pending (no testnet `version_key` yet) | [Weekend Oracle Guard](/concepts/weekend-oracle-guard) |
| Agent skill (MCP tools) | built and unit-tested on view fixtures; runs locally with the Feed | [Agent skill and x402](/integrate/agent-skill-x402) |
| x402 paid Feed export | built and tested against mocks; testnet settle pending G14 (accounts not created, H-NEAR-FAUCET) | [Agent skill and x402](/integrate/agent-skill-x402) |

## What "mock", "fallback" and "PROD-only" mean here

- **Mock**: a stand-in we deployed ourselves with no value. The tokens are mocks, and so is the owner-set price.
- **Fallback**: a permanent code path used when the better source is not available. If the OutLayer quoter fails or is denied, settlement prices at the quote's `max_discount_bps` (D-004). The oracle is owner-set until a live Pyth price exists (D-005, D-013). Both are disclosed in the UI.
- **PROD-only**: designed but not built here. This covers mainnet, real xStocks, keeper bonds and slashing, and a DAO owner with a timelock. See [Roadmap](/project/roadmap).

## Seeded demo state

The G4 settlement runs on 2026-11-09 used up part of this seed: positions were settled and quote #0 was consumed. A re-seed is pending. Snapshot at 2026-11-09T23:57Z (EVIDENCE §G7): position #6 is `Settling` because its signature was never relayed to Solana. `pnpm demo:testnet` prints the current state. Live state (price, `Q_c`, open positions) is not hard-coded on this page; current value: run `pnpm demo:testnet`. The table below is a snapshot of the original seed at 2026-11-09T20:49Z, read by `pnpm demo:testnet` (evidence/G2/demo-testnet-20261109T2049Z.log). Demo accounts: [`buyer1.nectar.testnet`](https://testnet.nearblocks.io/address/buyer1.nectar.testnet), [`buyer2.nectar.testnet`](https://testnet.nearblocks.io/address/buyer2.nectar.testnet), [`borrower1.nectar.testnet`](https://testnet.nearblocks.io/address/borrower1.nectar.testnet).

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
