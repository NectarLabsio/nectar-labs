# Nectar Labs: committed buyers, higher limits

> **Testnet software for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC). The collateral is a mock token (`nvdax-mock`) standing in for tokenized equities (xStocks / Opening Bell). No mainnet, no real funds. As of 2026-11-10 nothing is deployed yet: gate G2 (testnet deploy) is pending.**

Lenders cap LTV on tokenized stocks because DEX exit liquidity is revocable. Nectar Labs makes exit liquidity
*committed*. Market makers escrow time-locked quotes (Pappus) on NEAR. Borrowers get a higher limit
(Cramér) for a premium that pays the buyers. Pre-liquidation then sells to the committed buyer at a bounded discount instead of a DEX:
`B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))` (PRD §4.2, decision D-009).

## Live on testnet (filled at G2 from `packages/config/config.yaml`; proof in docs/EVIDENCE.md)
| Component | Account / id | Kind | Status |
| --- | --- | --- | --- |
| nectar-core | `TODO-G2` | contract | not deployed (G2 pending) |
| mock USDC | `TODO-G2` | **mock** NEP-141 | not deployed (G2 pending) |
| mock NVDAx | `TODO-G2` | **mock** collateral | not deployed (G2 pending) |
| keeper | `TODO-G2` (function-call key, 2 methods) | service | not deployed (G2 pending) |
| oracle | owner oracle in P0 | **fallback**, badge in UI | not deployed (G2 pending); live source decided at G5 |
| OutLayer quoter | `TODO-G4` | TEE pricing, P1 | not built; **fallback**: settle at `max_discount_bps` |
| Solana `nectar_vault` | `TODO-G7` (devnet) | P2 | not built |
| NEAR AI copilot | — | P2 | not built; live mode needs key H7 |
| Feed REST / MCP | — | P1 | not built |
| Mainnet, real xStocks, Reserve `R_c`, keeper bonds, DAO owner | — | **PROD-only** | not in this repo |

## Quick start (5 commands, no keys needed)
```
git clone <repo-url> nectar-labs && cd nectar-labs   # repo URL TODO-H2 (private until published)
pnpm i
pnpm demo:testnet            # read-only views against the testnet contract
pnpm --filter web dev        # http://localhost:3000
pnpm --filter docs-site start
```
What works today (2026-11-10): `pnpm i` and `pnpm --filter docs-site start` (docs on http://localhost:3000).
`pnpm demo:testnet` runs `scripts/50-verify.sh`. It needs `near` (near-cli-rs v0.31.1) and `yq`, and it fails until G2 fills the ids.
`pnpm --filter web dev` matches no project until the web app (WO-3) lands. Node ≥ 22.22.2, pnpm 10.34.9.

## 60-second architecture
![architecture](docs/img/architecture.svg)
- `nectar-core` (Rust, near-sdk 5.30.1) holds all state: quotes, positions, pool, O(1) fee index.
- Tokens enter only through `ft_transfer_call` → `ft_on_transfer(msg)`. Any token other than USDC or a configured collateral is refused.
- The limit comes from committed capacity and an oracle price, checked for freshness (120 s in session, 24 h when closed) and against a 1,500 bps band.
- The keeper holds a function-call key for `trigger_preliquidation` and `relay_settlement_result` only. It passes ids and never prices or signs.
- P1: a hash-pinned OutLayer TEE program returns the clearing discount, clamped to `[0, max_discount_bps]`.
- P2: the contract builds the settlement message itself and gets an Ed25519 signature from Chain Signatures. A Solana program verifies it before releasing collateral.

Figure note: 1Click depth feeds `D_c` (the figure's "R_c" label predates D-009). The figure is regenerated when P1 ships.

## How a settlement works
![settlement](docs/img/settlement.svg)
P0 (static): keeper trigger → the contract repays the debt from the buyer's escrow → collateral goes to the buyer at `max_discount_bps`.
P1 and P2 add the TEE discount and the Solana leg. Whether the signer payload is pre-hashed is open until G7 (see docs-site "Preimage format").

## Tracks and why
`defi`: a new credit primitive (committed exit liquidity as a limit input).
`security`: contract-built preimage, pinned TEE program, keeper with a function-call key only, oracle staleness and band checks.
`privacy`: market-maker parameters stay inside the TEE; copilot answers are TEE-signed and verified; analytics off by default and consent-gated; self-hosted fonts.
`agents` (Feed MCP) is entered only if it ships and passes G9.

## Evidence
[docs/EVIDENCE.md](docs/EVIDENCE.md) records every gate with its commands, outputs and explorer links. Status on 2026-11-10: all gates pending.
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
