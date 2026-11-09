# Nectar Labs: committed buyers, higher limits

> **Testnet software for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC). The collateral is a mock token (`nvdax-mock`) standing in for tokenized equities (xStocks / Opening Bell). No mainnet, no real funds. Gates (docs/EVIDENCE.md, 2026-11-10): G1, G2, G3 PASS (P0) · G4 OutLayer PASS (2026-11-09T22:10Z, addendum 22:51Z) · G6 1Click depth PASS (22:58Z) · G5 oracle FALLBACK (disclosed): owner oracle in use · G7–G9 pending.**

Lenders cap LTV on tokenized stocks because DEX exit liquidity is revocable. Nectar Labs makes exit liquidity
*committed*. Market makers escrow time-locked quotes (Pappus) on NEAR. Borrowers get a higher limit
(Cramér) for a premium that pays the buyers. Pre-liquidation then sells to the committed buyer at a bounded discount instead of a DEX:
`B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))` (PRD §4.2, decision D-009).

## Live on testnet (ids from `packages/config/config.yaml`; evidence in `evidence/G2/`, `evidence/G4/`, `evidence/G6/`, `evidence/upgrades/`)
| Component | Account / id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core | [`nectar-core.nectar.testnet`](https://testnet.nearblocks.io/address/nectar-core.nectar.testnet) | contract, code_hash `HqZaadxyZpywceMBKnjfagdn8NAMdAC5Ucn1K1MG4THX` | live (testnet). Upgraded twice in place: P0 → V1 with state migration, then a V1 code-only upgrade (2026-11-09T22:38Z). The G4 addendum reproduced this hash from a fresh clone |
| mock USDC | [`usdc-mock.nectar.testnet`](https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet) | **mock** NEP-141 | live (testnet) |
| mock NVDAx | [`nvdax-mock.nectar.testnet`](https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet) | **mock** collateral | live (testnet) |
| owner | [`nectar.testnet`](https://testnet.nearblocks.io/address/nectar.testnet) | deployer; sets params and the owner price | live (testnet) |
| keeper | [`keeper.nectar.testnet`](https://testnet.nearblocks.io/address/keeper.nectar.testnet) (one function-call key, 2 methods, no full-access key; D-012) | service | not running continuously (run locally) |
| OutLayer quoter | project `nectar.testnet/nectar-quoter`, version_key `3ce17749…6cc2` on `outlayer.testnet` | TEE program (F-040), hash-pinned in nectar-core | **live (testnet), G4 PASS.** The settlement discount is computed in the TEE from encrypted market-maker inputs. Request 15148 returned 159 bps against a 400 bps cap ([attestation JSON](https://testnet-api.outlayer.ai/attestations/by-request/15148); F-168, F-179). The inputs are **demo values**, and their plaintext passed through OutLayer's `/secrets/pubkey` endpoint before encryption (F-167). The secrets open only for And[signer keeper, caller nectar-core, wasm hash] (F-177, F-178). The TDX quote is not verified on-chain |
| settlement discount fallback | quote's `max_discount_bps` | **fallback** | used when the quoter fails or is denied. Request 15145 was denied and settled at the 400 bps cap with `quoter_fallback` (G4 addendum, run C). G4 run A shows the same path |
| oracle | owner oracle on nectar-core (`update_owner_price`) | **owner oracle (disclosed)**, badge in UI | in use for NVDAx. The Pyth path is built and sandbox-tested (`get_price_no_older_than` with staleness, confidence and band checks; F-173, D-015) but is not live. Hermes returns 401 without an API key (C-007, handoff H13), so `pyth-oracle.testnet` has no NVDA price. `price-oracle.testnet` does not serve NVDA (C-012). **G5: FALLBACK (disclosed).** Owner oracle (disclosed); current value: run `pnpm demo:testnet` |
| 1Click depth | `dry: true` quotes on the 1Click API (F-060) | read-only, signed quotes | **G6 PASS.** NVDAx has no 1Click route (F-063), so `D_c` = 0. The Feed shows signed dry-quote depth for a reference pair (wNEAR → USDC), with impact computed from base units at $500, $1,000 and $2,000. Nothing is ever deposited (Q-007) |
| Feed REST / MCP | local (`pnpm --filter feed start`) | read-only, no keys | built and runs locally; no public host. MCP tools: `get_exit_capacity`, `preview_borrow`, `list_quotes`, `explain_limit` |
| Solana `nectar_vault` | `TODO-G7` (devnet) | P2 | not built |
| NEAR AI copilot | web app panel (`apps/web/lib/copilot/`) | P2; NEAR AI Cloud (F-070) | **built; no live NEAR AI answer has been verified yet.** Live mode needs key H7, and NEAR AI Cloud returned 500 on 2026-11-09 (F-078). The panel shows an answer only after the signature and attestation checks pass; otherwise it shows "unverified — hidden". Tests (`pnpm --filter web test:copilot`, `e2e/copilot.spec.ts`) run on a fixture built from a real Intel-signed sample TDX quote (Phala dcap-qvl sample, MIT) plus a chat signed by a throwaway key, not a NEAR AI recording; it correctly ends "unverified — hidden". Intel DCAP quote verification runs on the server (F-073); EIP-191 signer recovery and report_data/nonce checks run in the browser (F-075, F-076). G8 re-run pending |
| Mainnet, real xStocks, Reserve `R_c`, keeper bonds, DAO owner | — | **PROD-only** | not in this repo |

Demo state: snapshot at 2026-11-09T20:49Z (evidence/G2/demo-testnet-20261109T2049Z.log); the seed had a $50,000 pool, quote #0 for $10,000 at 250 bps,
quote #1 for $5,000 at 400 bps, and position #0 with 100 mock NVDAx and $11,250 debt (Cramér limit $11,250 vs $7,200 static LTV). The
**G4 settlement runs used up part of it**: positions were settled and quote #0 was consumed. A re-seed is pending. Live state (price, `Q_c`, open positions) is not hard-coded here; current value: run `pnpm demo:testnet`. All tokens are mocks with no value.

## Quick start (5 commands, no keys needed)
```
git clone <repo-url> nectar-labs && cd nectar-labs   # repo URL TODO-H2 (private until published)
pnpm i
pnpm demo:testnet            # read-only views against the testnet contract
pnpm --filter web dev        # web app on http://localhost:3100
pnpm --filter docs-site start  # docs on http://localhost:3000
```
What works today (2026-11-10): all five commands (the repo URL in the first one is TODO-H2).
`pnpm demo:testnet` works now: `scripts/50-verify.sh` runs `scripts/demo-testnet.mjs`, which reads the ids from `config.yaml`
and calls nectar-core views over public testnet RPC (no keys, no near CLI; override the RPC with `NEAR_RPC_URL`).
`pnpm --filter web dev` starts the web app on port 3100 (G3 PASS). Optional: `pnpm --filter feed start` runs the Feed (REST on :8788, MCP on :8789); see the docs-site page "Feed MCP". Node ≥ 22.22.2, pnpm 10.34.9.

## 60-second architecture
![architecture](docs/img/architecture.svg)
- `nectar-core` (Rust, near-sdk 5.30.1) holds all state: quotes, positions, pool, O(1) fee index.
- Tokens enter only through `ft_transfer_call` → `ft_on_transfer(msg)`. Any token other than USDC or a configured collateral is refused.
- The limit comes from committed capacity and an oracle price, checked for freshness (120 s in session, 24 h when closed) and against a 1,500 bps band.
- The keeper holds a function-call key for `trigger_preliquidation` and `relay_settlement_result` only. It passes ids and never prices or signs.
- P1 (live on testnet): a hash-pinned OutLayer TEE program returns the clearing discount, clamped to `[0, max_discount_bps]`. If it fails, the contract settles at the cap.
- P2: the contract builds the settlement message itself and gets an Ed25519 signature from Chain Signatures. A Solana program verifies it before releasing collateral.

## How a settlement works
![settlement](docs/img/settlement.svg)
P0 (static): keeper trigger → the contract repays the debt from the buyer's escrow → collateral goes to the buyer at `max_discount_bps`.
P1 (live on testnet): the keeper's trigger asks OutLayer for the discount, and the contract clamps it and settles, or falls back to the cap. P2 adds the Solana leg. Whether the signer payload is pre-hashed is open until G7 (see docs-site "Preimage format").

## Tracks and why
`defi`: a new credit primitive (committed exit liquidity as a limit input).
`security`: contract-built preimage, pinned TEE program, keeper with a function-call key only, oracle staleness and band checks.
`privacy`: market-maker parameters stay inside the TEE; the copilot shows an answer only after signature and attestation checks pass (no live NEAR AI answer verified yet: key H7 absent, NEAR AI Cloud 500 on 2026-11-09); analytics off by default and consent-gated; self-hosted fonts.
`agents` (Feed MCP: built, read-only) is entered only if it passes G9.

## Evidence
[docs/EVIDENCE.md](docs/EVIDENCE.md) records every gate with its commands, outputs and explorer links. Status on 2026-11-10: G1–G4 and G6 PASS, G5 FALLBACK (disclosed; live Pyth waits on H13), G0 and G7–G9 pending.
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
