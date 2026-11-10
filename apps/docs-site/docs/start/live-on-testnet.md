---
title: Live on testnet
slug: /start/live-on-testnet
description: What is deployed, what is mock, what is a fallback.
---
# Live on testnet

<p className="verified">Verified against: F-003 (2026-11-09), F-030 (2026-11-09), F-040 (2026-11-09), F-060 (2026-11-10), F-063 (2026-11-10), F-070, F-073, F-075, F-076, F-078 (2026-11-09), F-167, F-168, F-173, F-177, F-178, F-179, F-036, F-184 (2026-11-09), F-328, F-329, F-338, F-352, F-369 (2026-11-10), C-007 (open), C-012 (open), D-016, D-018, D-019, D-025 (2026-11-10) · docs/EVIDENCE.md G2b re-run (2026-11-10T16:52Z, 91db9ea), G7 v7 (2026-11-10T16:52Z, 91db9ea), G14 (2026-11-10T16:52Z), G11 re-run (2026-11-10T16:12Z, 53f1e63), G2 (2026-11-09T20:55Z, 5f27f44), G4 + addendum (2026-11-09T22:10Z / 22:51Z), G6 (2026-11-09T22:58Z), G8 re-run (2026-11-09T23:56Z) · evidence/v7-modules/summary.md (2026-11-10, not yet verifier-recorded)</p>
<p className="status">Status on 2026-11-10: P0 gates G1–G3 PASS. G4 (OutLayer quoter) PASS, G6 (1Click depth) PASS. G5 (oracle): FALLBACK (disclosed), the owner oracle is in use. G8 (copilot) PASS on a fixture. v7: G1 (v7) PASS, G11 PASS (open item F-352), G2b (nectar-core-v2 deploy) PASS, G7 (Solana + signer round trip) PASS, G14 (x402) PASS. G9 pending. Source: docs/EVIDENCE.md.</p>

The account ids come from `packages/config/config.yaml`. The current contract is `nectar-core-v2.nectar.testnet`, deployed beside v1 (D-018). NearBlocks returned HTTP 403 and Solana Explorer HTTP 429 to the verifier, so every chain claim was re-derived from public RPC; a human browser check of the links below is still open.

| Component | Account / id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core-v2 | [`nectar-core-v2.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core-v2.nectar.testnet) | contract `2.0.0-v7`, code_hash `3W5bifwgurTNyZwHsseLU8NmJxaW5Dt2221CfhvQ31ey` | **live (testnet), G2b PASS.** Rebuilt byte for byte from a fresh clone (wasm sha256 `252a6abe…`); every view answers. `pnpm demo:testnet` reads this account |
| keeper-v2 | [`keeper-v2.nectar.testnet`](https://testnet.nearblocks.io/address/keeper-v2.nectar.testnet) | one function-call key for 5 methods, no full-access key (D-019) | key verified (G2b); the daemon is run locally, not continuously. See [Run a keeper](/integrate/run-a-keeper) |
| mock USDC | [`usdc-mock.nectar.testnet`](https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet) | **mock** NEP-141, 6 decimals | live (testnet). Code-only upgrade for v7 (raw-key `multiplier()`); code_hash `55hvEq…` in G2b |
| mock NVDAx | [`nvdax-mock.nectar.testnet`](https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet) | **mock** collateral, 6 decimals, same code as mock USDC | live (testnet) |
| owner | [`nectar.testnet`](https://testnet.nearblocks.io/address/nectar.testnet) | deployer; sets params and the owner price | live (testnet) |
| Aggregate limit + Weekend Oracle Guard | `get_exit_capacity`, `get_session_calendar` on v2 | contract checks | **live on testnet (EVIDENCE §G2b).** Total debt, shared capacity and headroom are returned; 287 NYSE windows are loaded. The closed-window refusal is tested in the sandbox only. See [Aggregate borrowing limit](/concepts/aggregate-limit), [Weekend Oracle Guard](/concepts/weekend-oracle-guard) |
| OutLayer TEE quoter (v2) | version_key `5d90edb8…0f891fc9` pinned in nectar-core-v2 | TEE program (F-040) | **live (testnet), EVIDENCE §G7.** Trigger tx [HrpQsuMW…](https://testnet.nearblocks.io/txns/HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u): request 16453 completed, `quoter_result` filled quotes at 250, 300 and 400 bps. Demo inputs; the TDX quote is not verified on-chain. See [Quoter (TEE)](/protocol/quoter-tee) |
| OutLayer-attested deposits | same version (`vault_read` job) | TEE read of the Solana vault | **live (testnet), EVIDENCE §G7.** Confirm txs [8XXvnBVN…](https://testnet.nearblocks.io/txns/8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3), [8hNqxAdC…](https://testnet.nearblocks.io/txns/8hNqxAdC61nAwmTWeUbK5auA4CbB35ppkPcnNX7PYe5C): `remote_deposit_confirmed {source: outlayer}`. The keeper attestation path is the labelled testnet **fallback** and was not used |
| Remote collateral on Solana | [`nectar_vault` ENZaNF…pubW](https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet) (devnet) + [`v1.signer-prod.testnet`](https://testnet.nearblocks.io/address/v1.signer-prod.testnet) (F-030, F-184) | Anchor program + MPC signer; one derived Ed25519 key per position (F-338) | **live (devnet + testnet), G7 PASS.** Release [5fTihnbJ…](https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet) (position #2) and settle [3cdcQru2…](https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet) (position #3): ix0 Ed25519 verify of the NEAR-signed message, ix1 the vault instruction, both finalized with no error. See [Remote collateral on Solana](/integrate/remote-collateral-solana) |
| x402 paid Feed export | `x402-relayer.nectar.testnet`, `agent1.nectar.testnet` | delegated payment in **mock** USDC (F-328, F-329) | **live (testnet), G14 PASS.** Relay tx [5VL1P4kg…](https://testnet.nearblocks.io/txns/5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx) pays 0.01 mock USDC from agent1 to `nectar.testnet`; agent borrow tx [GcHF75nW…](https://testnet.nearblocks.io/txns/GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt) opened position #4 with a 30 bps origination fee. The HTTP 402 → 200 leg is off-chain. See [Agent skill and x402](/integrate/agent-skill-x402) |
| Position Notes | NEP-171 tokens on v2 | contract feature | **live on testnet (EVIDENCE §G2b, §G14).** See [Position Notes](/concepts/position-notes) |
| Shields, Profit-Lock, Nectar Reserve | nectar-core-v2 | contract features | **ran on testnet 2026-11-10** (evidence/v7-modules/summary.md; verifier record pending). See [Shields](/concepts/shields), [Profit-Lock](/concepts/profit-lock), [Nectar Reserve](/concepts/nectar-reserve) |
| oracle | owner oracle (`update_owner_price`) | **owner oracle (disclosed)**, badge shown in UI | in use for NVDAx. The Pyth path is built and sandbox-tested but has no NVDA price on testnet (C-007, handoff H13; C-012). **G5: FALLBACK (disclosed).** Current value: run `pnpm demo:testnet`. See [Oracle policy](/protocol/oracle-policy) |
| settlement discount fallback | quote's `max_discount_bps` | **fallback** | used when the quoter fails or is denied (request 15145, G4 addendum run C; G4 run A) |
| 1Click depth | `dry: true` quotes only (F-002, F-060) | read-only, signed quotes, mainnet API | **G6 PASS.** NVDAx has no route (F-063), so `D_c` = 0. See [1Click depth](/integrate/oneclick-depth) |
| Feed REST / MCP + agent skill tools | local only | read-only, no keys | built; runs locally, no public host. `get_note` and `build_self_settle` still return `not_available`. No gate has run the MCP server with an agent client. See [Feed MCP](/integrate/feed-mcp) |
| NEAR AI copilot | web app panel, NEAR AI Cloud `cloud-api.near.ai` (F-070) | P2; prose only, never a contract input | **built; no live NEAR AI answer has been verified yet.** Live mode needs key H7, and NEAR AI Cloud returned 500 on 2026-11-09 (F-078). The panel shows an answer only after the signature and attestation checks pass. Tests run on a fixture (Phala dcap-qvl sample TDX quote plus a chat signed by a throwaway key), not a NEAR AI recording. Intel DCAP verification runs on the server (F-073); EIP-191 recovery and report_data/nonce checks run in the browser (F-075, F-076). **G8: PASS (fixture)** |
| web app on v2 | `pnpm --filter web dev` | UI | G3 PASS was recorded against v1; no web E2E record against v2 is in EVIDENCE yet |

### Earlier deployment: v1 (kept as evidence)

| Component | Account / id | Status |
| --- | --- | --- |
| nectar-core (v1) | [`nectar-core.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core.nectar.testnet), code_hash `CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t` | on testnet; code unchanged since the P2 upgrade at 2026-11-09T23:40Z (see [Upgrades](/operations/upgrades)). G1–G3, G4, G6 and the first G7 run were recorded against it |
| keeper (v1) | [`keeper.nectar.testnet`](https://testnet.nearblocks.io/address/keeper.nectar.testnet) | one function-call key for 2 methods, no full-access key (D-012) |
| OutLayer quoter (v1) | project `nectar.testnet/nectar-quoter`, version_key `3ce17749…6cc2` | G4 PASS: request 15148 returned 159 bps against a 400 bps cap ([attestation JSON](https://testnet-api.outlayer.ai/attestations/by-request/15148), F-168, F-179) |
| Chain Signatures, NEAR side (v1) | trigger tx [FCtApD2L…MHhe](https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe), position #6 | signer side verified 2026-11-09T23:57Z (G7 v6 PARTIAL, superseded by G7 v7). Placeholder program id; position #6 stays `Settling` by design |

## Not on testnet yet

| Module | Status | Page |
| --- | --- | --- |
| Corporate-action multiplier | built and tested in the sandbox; product flag off; no testnet run; OutLayer multiplier job has no recorded testnet execution; xStocks mechanism unverified (F-352) | [Corporate-action multiplier](/concepts/corporate-actions) |
| `pay_to` and registered referrers | built and tested in the sandbox; product flags off; no testnet run (the 30 bps origination fee itself is live, G14) | [Fee stack and referrals](/concepts/fee-stack) |
| Base Sepolia spoke | not built | — |

## What "mock", "fallback" and "PROD-only" mean here

- **Mock**: a stand-in we deployed ourselves with no value. The tokens are mocks, and so is the owner-set price.
- **Fallback**: a permanent code path used when the better source is not available. If the OutLayer quoter fails or is denied, settlement prices at the quote's `max_discount_bps` (D-004). The oracle is owner-set until a live Pyth price exists (D-005, D-013). Remote deposits can be confirmed by a keeper attestation if the OutLayer read is unavailable; the Feed labels it. All are disclosed in the UI.
- **PROD-only**: designed but not built here. This covers mainnet, real xStocks, keeper bonds and slashing, and a DAO owner with a timelock. See [Roadmap](/project/roadmap).

## Demo state

Snapshot on v2 at 2026-11-10T16:52Z (EVIDENCE §G2b re-run): pool $36,500 available, $13,500 utilised; quotes #0 $5,000 at 400 bps, #1 $10,000 at 250 bps, #2 $629.56 at 300 bps; positions #0 and #1 open, #2 and #3 closed by the G7 round trip. Since then position #4 was opened by the G14 agent borrow, and the module runs (evidence/v7-modules/summary.md) self-settled position #0, added quote #3 ($5,000 at 450 bps), Shield position #5 and Reserve Note `r-NVDAx-0`. Live state (price, `Q_c`, open positions) is not hard-coded on this page; current value: run `pnpm demo:testnet`. Demo accounts: [`buyer1.nectar.testnet`](https://testnet.nearblocks.io/address/buyer1.nectar.testnet), [`buyer2.nectar.testnet`](https://testnet.nearblocks.io/address/buyer2.nectar.testnet), [`borrower1.nectar.testnet`](https://testnet.nearblocks.io/address/borrower1.nectar.testnet).

Explorers: NEAR `https://testnet.nearblocks.io/address/<id>`, OutLayer attestations `https://testnet-api.outlayer.ai/attestations/by-request/<id>` (API JSON, F-168; dashboard `https://app.outlayer.ai/executions`, F-169), Solana `https://explorer.solana.com/?cluster=devnet`.
