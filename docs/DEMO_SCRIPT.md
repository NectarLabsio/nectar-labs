# DEMO_SCRIPT.md v3 — 3 minutes, exact clicks and commands (2026-11-10)

Shows only what docs/EVIDENCE.md records (gate table, 2026-11-10T16:52Z): G1–G4, G6 PASS · G5 FALLBACK (owner oracle, disclosed) ·
G8 PASS on a fixture (no live NEAR AI answer) · v7: G2b (`nectar-core-v2.nectar.testnet`) PASS · G7 (v7) PASS: Solana devnet release +
settle round trip · G14 x402 PASS. The contract on camera is **`nectar-core-v2.nectar.testnet`** (the ids in `packages/config/config.yaml`).
v1 (`nectar-core.nectar.testnet`) is the earlier deployment, kept as evidence; it is not shown.
Every number said on camera is read from the screen at recording time, never from this file. Voice-over: H11.

## Before recording: v2 state and re-seed
State after the 2026-11-10 runs (EVIDENCE §G2b re-run, §G7, §G14; evidence/v7-modules/summary.md): positions #0 self-settled, #1 open,
#2/#3 closed by G7, #4 open (G14 agent borrow, $10), #5 Weekend Shield; quotes #0–#3; Reserve Note `r-NVDAx-0`; owner price last set to $150
(G7 demo control; the guard calls it stale after 900 s). Run the steps that apply, in order. Each script prints what it did; keep the logs in `evidence/demo/`.
1. `pnpm demo:testnet` → write down price, quotes, positions, pool, session state. If the owner account is short of testnet NEAR, that is
   H-NEAR-FAUCET (Kunal); nothing below that signs runs without it.
2. `scripts/21-deploy-v2.sh` — **only if v2 must be rebuilt from scratch** (it creates `nectar-core-v2` + `keeper-v2` and configures
   collateral, owner price, session calendar, signer, Solana vault and keeper attestation). The live v2 does not need it.
3. `scripts/30-quoter-publish.sh pin` — re-pins the quoter version (`5d90edb8…`) and, on v2, the vault-read, calendar and multiplier job
   configs to the same version. Run it only if `pnpm demo:testnet` shows the quoter disabled or a different version_key.
4. Seed: `bash scripts/40-seed-demo.sh` (pool, buyer1 $10,000 @ 250 bps, buyer2 $5,000 @ 400 bps, borrower1 100 NVDAx) then
   `bash scripts/41-seed-v2-fixup.sh` (funds buyer1's opted-in quote if missing, opens borrower1's second position; idempotent).
   New ids are higher than the existing ones; note them as `#P` (position) and `#Q` (quote).
5. Price for the session: `scripts/58-g7-v2.sh price 180000000`, moving in steps inside the 1,500 bps band (150 → 172 → 180).
6. Solana leg (one fresh remote position for the 2:05 segment), `scripts/58-g7-v2.sh`:
   `prep` → `reserve <units>` (prints `#R`) → `check #R` (stored authority == live derived key) → `deposit #R` → wait for the keeper's
   `confirm_remote_deposit` (OutLayer vault read) → `show #R`. Leave `#R` open; it is pre-liquidated on camera.
   If any step fails, use the recorded G7 run instead (positions #2/#3, links in step 9) and say "recorded run".
7. Modules (only if the Shield / Profit-Lock / Reserve screens need fresh state): `bash scripts/61-v7-modules-testnet.sh shield`,
   `… profitlock`, `… reserve` (refreshes the owner price first).
8. Terminals: `pnpm --filter web dev` (:3100) · `pnpm --filter feed start` (REST :8788) · the keeper (typed, not started; it triggers
   every triggerable position):
   `KEEPER_KEY_PATH=~/.nectar/keys/keeper-v2.function-call.json KEEPER_SOLANA_KEYPAIR=~/.nectar/solana/keeper-fee-payer.json pnpm --filter keeper start`
   (account ids come from config.yaml; NEAR RPC defaults to `https://test.rpc.fastnear.com`, D-025).
9. Browser tabs: `/feed`, `/quote/new`, `/borrow`, `/console`, `/keepers`, `/position/#R`,
   https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet (G7 settle),
   https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet (G7 release),
   https://testnet.nearblocks.io/txns/HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u (G7 trigger), README "Live on testnet" table.
   The verifier got 403/429 from these explorers; open each one before recording.
10. Wallet: near-connect with a testnet wallet holding the demo accounts (D-011). If a wallet cannot import them, the sign modal shows
    the exact `msg` JSON; send it with the `ft_transfer_call` form from scripts/40-seed-demo.sh off camera and cut.

## Script
| t | Screen / command | Say / show |
| --- | --- | --- |
| 0:00 | `/feed` | "Lenders cap tokenized-stock LTV because DEX exit is revocable. Here market makers escrowed committed exit capacity." Point to `Q_c`, the equation card `B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))`, the shared capacity and headroom (aggregate limit), and the session badge (Weekend Oracle Guard). Oracle badge: "owner oracle, disclosed". 1Click panel: NVDAx has no route, so `D_c` = 0. Nothing is deposited. |
| 0:30 | `/quote/new` (buyer2) | $10,000, 200 bps, 7-day notice. Sign `FundPappusQuote` → toast "Quote funded" → `Q_c` is higher on `/feed`; the Quote Note `q-…` is listed under `/notes`. |
| 0:50 | `/borrow` (borrower1) | 50 NVDAx. Static limit vs Nectar limit, premium, origination fee (30 bps), health preview. Borrow between the two bars (check before recording). Sign `LockCollateralAndBorrow` → position page with its Note `p-…`. |
| 1:15 | `/console` (owner) | "Testnet demo control, disclosed." Lower the owner price in band-sized steps until `#R` is triggerable (read the health on `/position/#R`). |
| 1:30 | terminal | Start the keeper (step 8). Log lines `trigger_preliquidation` for `#R`. "The keeper has a function-call key. It sends a position id, nothing else." `curl -s localhost:8787/runs`. |
| 1:45 | nearblocks (trigger tx from the keeper log) | `quoter_requested` → OutLayer `execution_completed` → `quoter_result` (fills per quote) → `settlement_signed`. "The TEE priced the fill; the contract built the message; Chain Signatures signed it with this position's own key." If the run differs, open the G7 trigger tab `HrpQsuMW…` and say "recorded run". |
| 2:05 | keeper log → Solana Explorer | The keeper relays `[Ed25519 verify, settle]` to `nectar_vault` on devnet and reports the tx back. In the Solana tx: ix0 Ed25519SigVerify (pubkey = the position's derived key, message = the NEAR preimage), ix1 "Instruction: Settle". `/position/#R` shows the Solana tx and Closed. Backup: the G7 settle and release tabs. |
| 2:35 | `/console` copilot panel → terminal | Banner "Key missing": no NEAR AI key on this server, so live answers are off. `pnpm --filter web test:copilot` → 10 pass, 1 skipped (live). "The verifier hides any answer whose attestation or signature fails. Tested on a fixture, not on a live answer." |
| 2:50 | README "Live on testnet" | "Testnet and Solana devnet. Mock collateral and mock USDC. Owner oracle. Every row links to docs/EVIDENCE.md." |

Not in the video (not verified by a gate, or not on testnet): Feed MCP with an agent client, a live NEAR AI answer, a live Pyth price,
the corporate-action multiplier, `pay_to`, referrers, a Base spoke. The x402 payment (G14) and the Shield / Profit-Lock / Reserve runs are
on testnet but are left out for time; the Shield / Profit-Lock / Reserve runs are not yet verifier-recorded.

Capture: `pnpm demo:capture` (Playwright `e2e/screens.spec.ts`) gives silent screens; the full take above is screen-recorded by Kunal (H11).
Note: no web E2E record against v2 is in EVIDENCE yet; rehearse every screen on v2 before recording.
