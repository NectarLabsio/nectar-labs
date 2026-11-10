# Nectar Labs: committed buyers, higher limits

> **Testnet software for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC). The collateral is a mock token (`nvdax-mock`) standing in for tokenized equities (xStocks / Opening Bell). No mainnet, no real funds. Gates (docs/EVIDENCE.md, 2026-11-10): G1, G2, G3 PASS (P0) · G4 OutLayer PASS · G6 1Click depth PASS · G5 oracle FALLBACK (disclosed): owner oracle in use · G8 copilot PASS (fixture) · v7: G1 (v7) PASS, G10 PASS (open items), G11 PASS (open item F-352), **G2b nectar-core-v2 deploy PASS (16:52Z)**, **G7 Solana + signer round trip PASS (16:52Z)**, **G14 x402 paid call PASS (16:52Z)** · G9 pending.**

Lenders cap LTV on tokenized stocks because DEX exit liquidity is revocable. Nectar Labs makes exit liquidity
*committed*. Market makers escrow time-locked quotes (Pappus) on NEAR. Borrowers get a higher limit
(Cramér) for a premium that pays the buyers. Pre-liquidation then sells to the committed buyer at a bounded discount instead of a DEX:
`B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))` (PRD §4.2, decision D-009).

## Live on testnet (ids from `packages/config/config.yaml`; evidence in docs/EVIDENCE.md §G2b, §G7, §G14 and `evidence/`)
The current contract is `nectar-core-v2.nectar.testnet` (v7, deployed beside v1, D-018). Explorer pages returned HTTP 403 (NearBlocks) and 429
(Solana Explorer) to the verifier, so every chain claim below was re-derived from public RPC; a human browser check of the links is still open.
| Component | Account / id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core-v2 | [`nectar-core-v2.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core-v2.nectar.testnet) | contract `2.0.0-v7`, code_hash `3W5bifwgurTNyZwHsseLU8NmJxaW5Dt2221CfhvQ31ey` | **live (testnet), G2b PASS (2026-11-10T16:52Z).** The verifier rebuilt the wasm byte for byte (sha256 `252a6abe…`) and read every view from a fresh clone; `pnpm demo:testnet` reads this account |
| keeper-v2 | [`keeper-v2.nectar.testnet`](https://testnet.nearblocks.io/address/keeper-v2.nectar.testnet) | one function-call key, 5 methods (trigger, two relays, deposit confirm, keeper attestation), no full-access key (D-019) | key verified (EVIDENCE §G2b); the daemon is run locally, not continuously |
| mock USDC | [`usdc-mock.nectar.testnet`](https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet) | **mock** NEP-141 | live (testnet) |
| mock NVDAx | [`nvdax-mock.nectar.testnet`](https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet) | **mock** collateral | live (testnet) |
| owner | [`nectar.testnet`](https://testnet.nearblocks.io/address/nectar.testnet) | deployer; sets params and the owner price | live (testnet) |
| Aggregate borrowing limit + Weekend Oracle Guard | views `get_exit_capacity`, `get_session_calendar` on v2 | contract checks | **live on testnet (EVIDENCE §G2b).** `get_exit_capacity` returns total debt, shared capacity and headroom; 287 NYSE session windows are loaded and the session check answers. A closed-window refusal is tested in the sandbox only (`weekend_guard_calendar_stale_and_forced`). The OutLayer calendar job has no recorded testnet execution |
| OutLayer TEE quoter (v2) | version_key `5d90edb8…0f891fc9` pinned in nectar-core-v2 | TEE program (F-040) | **live (testnet), EVIDENCE §G7.** Trigger tx [HrpQsuMW…dy4u](https://testnet.nearblocks.io/txns/HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u): OutLayer request 16453 `execution_completed` → `quoter_result` (fills quote 1 at 250, quote 2 at 300, quote 0 at 400 bps) → `settlement_signed`. Market-maker inputs are **demo values**. The TDX quote is not verified on-chain |
| OutLayer-attested remote deposits | same pinned version (`vault_read` job) | TEE read of the Solana vault | **live (testnet), EVIDENCE §G7.** Confirm txs [8XXvnBVN…](https://testnet.nearblocks.io/txns/8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3) and [8hNqxAdC…](https://testnet.nearblocks.io/txns/8hNqxAdC61nAwmTWeUbK5auA4CbB35ppkPcnNX7PYe5C): OutLayer requests 16443 / 16449 completed, `remote_deposit_confirmed {source: outlayer}`. A keeper attestation path exists as the labelled testnet **fallback**; neither verified position used it |
| Remote collateral on Solana (round trip) | [`nectar_vault` ENZaNF…pubW](https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet) (devnet) + [`v1.signer-prod.testnet`](https://testnet.nearblocks.io/address/v1.signer-prod.testnet) (F-030, F-184) | Anchor program + third-party MPC signer, one derived Ed25519 key per position (path `solana-devnet/pos/<id>`) | **live (devnet + testnet), G7 PASS (2026-11-10T16:52Z).** Release: [5fTihnbJ…](https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet) (position #2 repaid, collateral back to the depositor). Settle: [3cdcQru2…](https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet) (position #3, 2.54598 NVDAx to the buyer). In both, ix0 is the Ed25519 verify of the NEAR-signed message against the position's derived key, ix1 the vault instruction; both finalized with no error. The price drop that triggered #3 is an owner-oracle demo control |
| x402 paid Feed export | `x402-relayer.nectar.testnet`, `agent1.nectar.testnet` | delegated (meta-transaction) payment in **mock** USDC (F-328, F-329) | **live (testnet), G14 PASS (2026-11-10T16:52Z).** Relay tx [5VL1P4kg…](https://testnet.nearblocks.io/txns/5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx) carries agent1's signed delegate paying 0.01 mock USDC to `nectar.testnet`. Agent borrow tx [GcHF75nW…](https://testnet.nearblocks.io/txns/GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt) opened position #4 for $10 with a $0.03 origination fee (30 bps). The HTTP 402 → 200 leg is off-chain and was not re-run by the verifier |
| Position Notes | NEP-171 tokens on nectar-core-v2 (`q-`, `p-`, `r-`) | contract feature | **live on testnet (EVIDENCE §G2b `nft_tokens`, `nft_token_svg`; §G14 `nft_mint p-4`).** Every quote, position and Reserve deposit mints a Note |
| Shields, Profit-Lock, Nectar Reserve | nectar-core-v2 | contract features | **ran on testnet 2026-11-10 (`scripts/61-v7-modules-testnet.sh`, evidence/v7-modules/summary.md); verifier record in docs/EVIDENCE.md pending.** Profit-Lock: `self_settle` on position #0 repaid $4,500 from an opted-in quote (fee 50 bps). Reserve: a $10 deposit minted `r-NVDAx-0` (600 bps discount, 7-day notice; `get_reserve` also answers in EVIDENCE §G2b). Shield: position #5 (2 NVDAx, $189, 15 bps fee instead of the premium); the first attempt was correctly refused by the aggregate check |
| oracle | owner oracle on nectar-core-v2 (`update_owner_price`) | **owner oracle (disclosed)**, badge in UI | in use for NVDAx. The Pyth path is built and sandbox-tested (staleness, confidence and band checks; F-173, D-015) but is not live: Hermes returns 401 without an API key (C-007, handoff H13) and `price-oracle.testnet` does not serve NVDA (C-012). **G5: FALLBACK (disclosed).** Current value: run `pnpm demo:testnet` |
| settlement discount fallback | quote's `max_discount_bps` | **fallback** | used when the quoter fails or is denied (G4 addendum run C, request 15145; G4 run A) |
| 1Click depth | `dry: true` quotes on the 1Click API (F-060) | read-only, signed quotes | **G6 PASS.** NVDAx has no 1Click route (F-063), so `D_c` = 0. The Feed shows signed dry-quote depth for a reference pair (wNEAR → USDC) at $500, $1,000 and $2,000. Nothing is ever deposited (Q-007) |
| Feed REST / MCP + agent skill tools | local (`pnpm --filter feed start`) | read-only, no keys | built and runs locally; no public host. Tools: `get_exit_capacity`, `preview_borrow`, `list_quotes`, `explain_limit`, `open_protected_stock_loan` (returns an unsigned call), `quote_capacity`; `get_note` and `build_self_settle` still return `not_available`. No gate has run the MCP server with an agent client |
| NEAR AI copilot | web app panel (`apps/web/lib/copilot/`) | P2; NEAR AI Cloud (F-070) | **built; no live NEAR AI answer has been verified yet.** Live mode needs key H7, and NEAR AI Cloud returned 500 on 2026-11-09 (F-078). The panel shows an answer only after the signature and attestation checks pass; otherwise it shows "unverified — hidden". Tests (`pnpm --filter web test:copilot`, `e2e/copilot.spec.ts`) run on a fixture built from a real Intel-signed sample TDX quote (Phala dcap-qvl sample, MIT) plus a chat signed by a throwaway key, not a NEAR AI recording. Intel DCAP quote verification runs on the server (F-073); EIP-191 signer recovery and report_data/nonce checks run in the browser (F-075, F-076). **G8: PASS (fixture), 2026-11-09T23:56Z** |
| Web app on v2 | `pnpm --filter web dev` | UI | G3 PASS was recorded against v1 (2026-11-09T21:15Z). No web E2E record against nectar-core-v2 is in EVIDENCE yet |
| Mainnet, real xStocks, keeper bonds, DAO owner | — | **PROD-only** | not in this repo |

### Earlier deployment: v1 (kept as evidence, not the current contract)
| Component | Account / id | Status |
| --- | --- | --- |
| nectar-core (v1) | [`nectar-core.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core.nectar.testnet), code_hash `CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t` | on testnet, code unchanged since the P2 upgrade at 2026-11-09T23:40Z (`evidence/upgrades/run-20261109T2340Z.log`); G1–G3 (P0), G4, G6 and the first G7 run were recorded against it |
| keeper (v1) | [`keeper.nectar.testnet`](https://testnet.nearblocks.io/address/keeper.nectar.testnet) | one function-call key, 2 methods, no full-access key (D-012) |
| OutLayer quoter (v1) | project `nectar.testnet/nectar-quoter`, version_key `3ce17749…6cc2` | G4 PASS: request 15148 returned 159 bps against a 400 bps cap ([attestation JSON](https://testnet-api.outlayer.ai/attestations/by-request/15148); F-168, F-179). Inputs were demo values whose plaintext passed through OutLayer's `/secrets/pubkey` endpoint (F-167); secrets open only for And[signer keeper, caller nectar-core, wasm hash] (F-177, F-178) |
| Chain Signatures, NEAR side (v1) | trigger tx [FCtApD2L…MHhe](https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe), position #6 | signer side verified 2026-11-09T23:57Z (G7 v6, PARTIAL, superseded by G7 v7). The preimage named a placeholder program id; position #6 stays `Settling` by design |

Demo state on v2 (EVIDENCE §G2b re-run, 2026-11-10T16:52Z): pool $36,500 available / $13,500 utilised; quotes #0 $5,000 @ 400 bps, #1 $10,000 @ 250 bps,
#2 $629.56 @ 300 bps; positions #0 and #1 Open, #2 and #3 Closed (the G7 round trip). Since then: position #4 (G14 agent borrow), and the module runs (evidence/v7-modules/summary.md) self-settled
position #0 and added quote #3 ($5,000 @ 450 bps), Shield position #5 and Reserve Note `r-NVDAx-0`. Live state is not hard-coded here;
current value: run `pnpm demo:testnet`. All tokens are mocks with no value.

## Quick start (5 commands, no keys needed)
```
git clone <repo-url> nectar-labs && cd nectar-labs   # repo URL TODO-H2 (private until published)
pnpm i                       # warm store: 9 s in the rehearsal; a cold machine takes longer
pnpm demo:testnet            # read-only nectar-core views over public testnet RPC
pnpm verify                  # lint + typecheck + unit tests, then the testnet views again
pnpm --filter web dev        # web app on http://localhost:3100
```
Optional:
```
pnpm --filter docs-site build   # static docs build (broken links fail the build)
pnpm --filter docs-site start   # docs dev server on http://localhost:3000
pnpm --filter feed start        # Feed REST on :8788, MCP over HTTP at http://127.0.0.1:8789/mcp; no env needed
pnpm -s --filter feed mcp          # Feed MCP over stdio (read-only tools; see services/feed/README.md)
```
What works today (2026-11-10): all five commands (the repo URL in the first one is TODO-H2). Rehearsal timings are in
[docs/EVIDENCE.md](docs/EVIDENCE.md): `pnpm i` 9 s on a warm pnpm store (a cold machine is slower), `pnpm verify` 39 s.
`pnpm demo:testnet` runs `scripts/50-verify.sh`, which runs `scripts/demo-testnet.mjs`: it reads the ids from `config.yaml`
and calls nectar-core views over public testnet RPC (default `https://test.rpc.fastnear.com`, D-025; no keys, no near CLI; override the RPC with `NEAR_RPC_URL`).
`pnpm --filter web dev` starts the web app on port 3100 (G3 PASS). Without `CORE_ACCOUNT_ID` the Feed does not poll the
contract and its MCP tools read the local Feed SQLite store; registering the MCP server with a client is described in
services/feed/README.md and the docs-site page "Feed MCP". Node ≥ 22.22.2, pnpm 10.34.9.


## v7 in progress (not on testnet)
Only these parts of v7 are not live. Everything else from v7 is in the live table above. Test names are on each docs page.
| Module | Status | Docs page |
| --- | --- | --- |
| Corporate-action multiplier (raw units × M; no double M for feeds that include it, D-021) | built + sandbox-tested (`multiplier_bounds_announce_and_split`); the code is in the nectar-core-v2 wasm, the product flag `features.multiplier` is off; no testnet run. The OutLayer multiplier job has no recorded testnet execution, and the xStocks mechanism is still unverified (F-352) | Concepts › Corporate-action multiplier |
| `pay_to` + claimable USDC | built + sandbox-tested (`pay_to_claimable_and_referrers`); switched off (`features.pay_to: false`); no testnet run | Concepts › Fee stack and referrals |
| Registered referrers (50% of the origination fee) | built + sandbox-tested (same test); switched off (`features.referrals: false`); no testnet run. The 30 bps origination fee itself is live (G14 borrow tx) | Concepts › Fee stack and referrals |
| Base Sepolia spoke | not built (`features.base: false`) | — |

## 60-second architecture
![architecture](docs/img/architecture.svg)
- `nectar-core` (Rust, near-sdk 5.30.1) holds all state: quotes, positions, pool, O(1) fee index. The current deployment is `nectar-core-v2` (v7).
- Tokens enter only through `ft_transfer_call` → `ft_on_transfer(msg)`. Any token other than USDC or a configured collateral is refused.
- The limit comes from committed capacity and an oracle price, checked for freshness and against a 1,500 bps band. On v2 each loan must fit its LTV *and* total debt must fit the asset's shared capacity, and the Weekend Oracle Guard fails closed outside NYSE session windows.
- The keeper holds a function-call key only (2 methods on v1, 5 on v2). It passes ids and never prices or signs.
- P1 (live on testnet): a hash-pinned OutLayer TEE program returns the clearing discount, clamped to `[0, max_discount_bps]`. If it fails, the contract settles at the cap. On v2 the same pinned program also reads the Solana vault to confirm remote deposits.
- P2 (live on testnet + devnet, G7 PASS): the contract builds the settlement or release message itself and gets an Ed25519 signature over the raw bytes from Chain Signatures, with one derived key per position (D-016, F-338). The Solana program `nectar_vault` verifies that signature before it releases or settles collateral.

## How a settlement works
![settlement](docs/img/settlement.svg)
P0 (static): keeper trigger → the contract repays the debt from the buyer's escrow → collateral goes to the buyer at `max_discount_bps`.
P1 (live on testnet): the keeper's trigger asks OutLayer for the discount, and the contract clamps it and settles, or falls back to the cap. P2 (live, G7 PASS): for collateral held on Solana the contract asks `v1.signer-prod.testnet` to sign the raw preimage (no pre-hash, D-016) and emits `settlement_signed`; the keeper relays it to `nectar_vault`, which checks the Ed25519 instruction and pays the buyer, and the keeper reports the Solana tx back with `relay_settlement_result` (devnet tx `3cdcQru2…`, see docs-site "Preimage format").

## Tracks and why
Proposed track list for the submission (Kunal decides, handoff H16): `defi`, `security`, `privacy`, `agents`, `nfts`.
`defi`: a new credit primitive (committed exit liquidity as a limit input).
`security`: contract-built preimage, pinned TEE program, keeper with a function-call key only, oracle staleness and band checks, weekend guard that can only close.
`privacy`: market-maker parameters stay inside the TEE; the copilot shows an answer only after signature and attestation checks pass (G8 PASS on a fixture; no live NEAR AI answer verified yet: key H7 absent, NEAR AI Cloud 500 on 2026-11-09); analytics off by default and consent-gated; self-hosted fonts.
`agents`: an agent account borrowed and paid for a Feed export with x402 on testnet (G14 PASS). The Feed MCP server is built and read-only, but no gate has run it with an agent client.
`nfts`: Position Notes (NEP-171) are minted on testnet for every quote, position and Reserve deposit (EVIDENCE §G2b, §G14).
`realworld` is not proposed: `pay_to` has no testnet run.

## Evidence
[docs/EVIDENCE.md](docs/EVIDENCE.md) records every gate with its commands, outputs and explorer links. Status on 2026-11-10: G0–G4 and G6 PASS, G8 PASS (fixture), G5 FALLBACK (disclosed; live Pyth waits on H13), G1 (v7) PASS, G10 PASS with open items, G11 PASS with open item F-352, G2b PASS, G7 (v7) PASS, G14 PASS, G9 pending. The Shields / Profit-Lock / Reserve runs are in evidence/v7-modules/summary.md and are not yet verifier-recorded.
The docs site (`apps/docs-site`) carries the spec, and every protocol page has a "Verified against" line citing FACTS ids.

## Prior work (disclosure, Q-002 / Q-005): draft, approve TODO-H12
Nectar Network (Kunal Drall) published research on exit-liquidity gaps for tokenized stocks before the
hackathon (Oct 2026 product brief; SCF #42 material). That research is the baseline. All code,
contracts, programs, services and sites in this repository were written during the hackathon window (from 2026-11-09).

## Roadmap
P0 core credit (G0–G3) → P1 TEE pricing, live oracle, 1Click depth, Feed MCP (G4–G6) → P2 Solana leg via Chain Signatures, copilot (G7–G8) → G9 fresh-clone rehearsal.
PROD (not here): mainnet with a DAO owner and timelock, audit, real tokenized-equity collateral.
Deliberately not built: other chains, a token, governance UI, mobile.

## Team
Kunal Drall (Nectar Network). Team list pending confirmation (TODO-H10).

## License
MIT © 2026 Nectar Network
