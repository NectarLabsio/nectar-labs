# DEMO_SCRIPT.md v2 — 3 minutes, exact clicks and commands (2026-11-10)

Shows only what is live today (docs/EVIDENCE.md gate table): G1–G4, G6 PASS · G5 FALLBACK (owner oracle, disclosed) ·
G7 PARTIAL (NEAR signer side only; **the Solana leg is not built**) · G8 PASS on a fixture (no live NEAR AI answer).
Every number said on camera is read from the screen at recording time, never from this file. Voice-over: H11.

## Before recording: re-seed (the G4/G7 runs consumed the seeded state)
State on 2026-11-09 (EVIDENCE G4, G5, G7): quote #0 consumed, positions #0/#2/#3/#4 settled, position #6 `Settling`
(signature never relayed, by design), owner price on chain $112 (G5 note). Steps, in order:
1. **H-NEAR-FAUCET (Kunal):** top up `nectar.testnet` with testnet NEAR at https://near-faucet.io/. The owner pays every
   seed transaction. Nothing below runs until this is done.
2. `pnpm demo:testnet` → write down current price, quotes, positions, pool.
3. Owner price back to $180: `/console` (owner wallet) → card "Owner actions · quoter and oracle" → "Owner price" → "Update owner price".
   Move in steps of ≤ 15 % (scripts/45-g4-run.sh keeps every move inside the 1,500 bps band): 112 → 128 → 147 → 169 → 180.
4. `bash scripts/40-seed-demo.sh` (owner + demo keys in the keychain) → pool +$50,000, a $10,000 @ 250 bps quote (buyer1),
   a $5,000 @ 400 bps quote (buyer2), borrower1 locks 100 NVDAx and borrows $11,250. New ids are higher than #0/#1/#0.
5. Funds for the on-camera steps (same call form as the seed script):
   `near contract call-function as-transaction usdc-mock.nectar.testnet mint json-args '{"account_id":"buyer2.nectar.testnet","amount":"10000000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as nectar.testnet network-config testnet sign-with-keychain send`
   `near contract call-function as-transaction nvdax-mock.nectar.testnet mint json-args '{"account_id":"borrower1.nectar.testnet","amount":"50000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as nectar.testnet network-config testnet sign-with-keychain send`
6. `pnpm demo:testnet` → note the new position id (call it `#P`), `Q_c`, the limit and the quoter config (enabled, version_key `3ce17749…`, secrets_ref `mm-demo`).
7. Open terminals: `pnpm --filter web dev` (:3100) · `pnpm --filter feed start` (REST :8788, feeds the 1Click panel) · a third
   terminal with the keeper command from 1:30 typed in but not started (the keeper triggers every triggerable position).
8. Browser tabs pre-opened: `/feed`, `/quote/new`, `/borrow`, `/console`, `/keepers`, `/position/6`,
   https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe (G7 trigger),
   https://testnet-api.outlayer.ai/attestations/by-request/15148 (G4 backup), README "Live on testnet" table.
9. Wallet: near-connect with a testnet wallet holding the demo accounts (D-011). If a wallet cannot import them, the sign modal
   shows the exact `msg` JSON; send that with the `ft_transfer_call` form from scripts/40-seed-demo.sh off camera and cut.

## Script
| t | Screen / command | Say / show |
| --- | --- | --- |
| 0:00 | `/feed` | "Lenders cap tokenized-stock LTV because DEX exit is revocable. Here market makers escrowed committed exit capacity." Point to `Q_c`, the equation card `B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))`, and the two limits: static vs Nectar. Oracle badge: "owner oracle, disclosed". 1Click panel: signed dry quotes for wNEAR → USDC at $500/$1,000/$2,000; NVDAx shows "no 1Click route", so `D_c` = 0. Nothing is deposited. |
| 0:30 | `/quote/new` (buyer2) | $10,000, 200 bps, 7-day notice. The sign modal shows the `FundPappusQuote` msg. Sign → toast "Quote funded" → back on `/feed`, `Q_c` is higher. |
| 0:50 | `/borrow` (borrower1) | 50 NVDAx. Two bars: static limit vs Nectar limit, premium, health preview. Borrow an amount between the two bars (check before recording), pre-liq 7,500 bps. Sign `LockCollateralAndBorrow` → position page. |
| 1:15 | `/console` (owner) | "Testnet demo control, disclosed." Update owner price 180 → 155 → 140. Seeded position `#P` (100 NVDAx, $11,250 debt) crosses pre-liq at $140 (8,036 > 7,500 bps; scripts/45 header). |
| 1:30 | terminal | `CORE_ACCOUNT_ID=nectar-core.nectar.testnet KEEPER_ACCOUNT_ID=keeper.nectar.testnet KEEPER_KEY_PATH=~/.nectar/keys/keeper.function-call.json pnpm --filter keeper start` → log line `trigger_preliquidation` for `#P`. "The keeper has a function-call key for two methods. It sends a position id, nothing else." Then `curl -s localhost:8787/runs`. |
| 1:45 | nearblocks (trigger tx from the keeper log) → OutLayer attestation | In the tx: `quoter_requested` → OutLayer `execution_completed` → `quoter_result` → `settled_near`. Open `https://testnet-api.outlayer.ai/attestations/by-request/<request_id>`: wasm hash `3ce17749…` = pinned version, input hash = `quoter_requested.input_sha256`, TDX quote present (not verified on chain). If the run differs, show request 15148 (159 bps vs 400 bps cap) and say "recorded run". `/keepers` shows `#P` closed. |
| 2:05 | nearblocks G7 tx → terminal → `/position/6` | "Cross-chain leg, NEAR side." Trigger tx `FCtApD2L…`: nectar-core builds the preimage, `v1.signer-prod.testnet` signs the raw bytes (Ed25519, D-016), `settlement_signed`. Terminal: `near contract call-function as-read-only nectar-core.nectar.testnet get_pending_settlement json-args '{"position_id":"6"}' network-config testnet now`, then `node scripts/verify-ed25519.mjs ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV '<that json>'` → `"signature_valid":true`. `/position/6` shows Settling. Say: "The Solana program that would verify this and release collateral is not built. Nothing was relayed." |
| 2:35 | `/console` copilot panel → terminal | Banner "Key missing": no NEAR AI key on this server, so live answers are off. `pnpm --filter web test:copilot` → 10 pass, 1 skipped (live). "The verifier hides any answer whose attestation or signature fails. Tested on a fixture, not on a live answer." |
| 2:50 | README "Live on testnet" | "Testnet. Mock collateral and mock USDC. Owner oracle. Solana leg not built. Everything else is in docs/EVIDENCE.md." |

Not in the video (not verified by a gate): Feed MCP with an agent client, a Solana devnet tx, a live NEAR AI answer, a live Pyth price.

Capture: `pnpm demo:capture` (Playwright `e2e/screens.spec.ts`) gives silent screens; the full take above is screen-recorded by Kunal (H11).
