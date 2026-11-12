# DEMO_SCRIPT.md v4 — 3 minutes, exact clicks and commands (2026-11-11)

Shows only what docs/EVIDENCE.md records (gate table as of commit a677689): G1–G4, G6 PASS · G5 FALLBACK (owner oracle, disclosed) ·
G8 PASS on a fixture (no live NEAR AI answer) · re-runs after the D-027 security rollout, 2026-11-11T08:02Z–08:25Z, on `2.2.1-v7`:
G11 PASS (every SR-1…SR-33 has a named test), G2b PASS, G3b PASS (design port; mocked remote and Notes E2E passed), G7 PASS (Solana devnet, vault v2), G13 PASS **on a local fork of
Base Sepolia, not Base Sepolia** (D-026), G14 PASS for the chain claims, its HTTP 402 → 200 leg in a later verifier run (recorded in 2e16f9b), and again on HEAD with the guarded demo agent (2026-11-11T15:02Z, recorded in a677689) · G1 gas-row check on 2.2.1 PASS on re-check (67 of 67, recorded in a677689) · G9 PASS (fresh-clone re-run on 0af5cdd, recorded in 89f83ee; supersedes the first run's FAIL on c5f6349).
The contract on camera is **`nectar-core-v2.nectar.testnet`** at `2.2.1-v7` (ids in `packages/config/config.yaml`; review findings and what
remains open in SECURITY.md). v1 (`nectar-core.nectar.testnet`) is the earlier deployment, kept as evidence; it is not shown.
Every number said on camera is read from the screen at recording time, never from this file. Voice-over: H11.

## Before recording: v2 state and re-seed
Run the steps that apply, in order. Each script prints what it did; keep every log in `evidence/demo/`. Testnet, devnet and the local fork only.

### 1. Live state snapshot (2026-11-11T08:25Z)
Public read-only views on `nectar-core-v2.nectar.testnet` through `https://test.rpc.fastnear.com` (D-025), blocks 277190229–277190233:
`contract_version`, `list_quotes {"symbol":"NVDAx"}`, `list_positions`, `get_pool`; `get_exit_capacity {"symbol":"NVDAx"}` and `ft_balance_of` at 08:28Z.
| What | State |
| --- | --- |
| contract | `2.2.1-v7` |
| local quotes | #1 buyer1 $5,477.50 @ 250 bps (opted into voluntary fills) · #0 buyer2 $5,000 @ 400 · #3 buyer2 $5,000 @ 450 |
| remote quotes | #2 buyer1, Solana recipient `FtWQ…MU2q`, $259.12 @ 300 · #4 buyer1, Base recipient `0xcA61…1fa1`, $382.60 @ 300. Both are under $1,000, so step 4 funds fresh ones |
| open positions | #1 borrower1, 100 NVDAx, debt $9,000 · #5 borrower1 Weekend Shield, 2 NVDAx, $189 · #4 and #13 agent1, $10 each (G14 runs) |
| closed positions | #0 (Profit-Lock self-settle) · #2, #3 (G7, 2026-11-10) · #6, #7 (G13, 2026-11-10) · #8–#10 (G7 re-run) · #11, #12 (G13 re-run) |
| pool | $40,791 available, $9,209 utilised |
| oracle and limits | owner price $135 (last set in the G13 re-run) · session closed (`outside_hours`, weekend haircut 2,500 bps) · aggregate headroom $2,887.9 |
| balances | buyer1 and buyer2: 0 mock USDC · borrower1: 29,431.10 mock USDC, 91.16 NVDAx |

Repeat the read with `pnpm demo:testnet` (pool, first 16 quotes, first 16 positions, same RPC). If the owner account is short of testnet NEAR,
that is H-NEAR-FAUCET (Kunal); nothing below that signs runs without it.

### 2. Background services (start before anything that signs)
Env var names only. Every key file is a `0600` file under `~/.nectar/`; never paste key contents into a terminal on camera.
- **Local fork of Base Sepolia** (anvil, chain id 84532, :8545): `bash scripts/27-base-fork.sh start`, then `bash scripts/27-base-fork.sh fund`
  (balances on the fork only). If `start` printed `fork up` instead of `fork already running`, the fork is new: do step 3 before step 4.
- **keeper-v2 daemon**, in the terminal shown at 1:30: `pnpm --filter keeper start` with `KEEPER_KEY_PATH` (keeper-v2 function-call key),
  `KEEPER_SOLANA_KEYPAIR` (devnet fee payer), `BASE_RPC_URL` (`http://127.0.0.1:8545`), `BASE_KEYSTORE_DIR` + `BASE_ACCOUNT` + `BASE_PASSWORD_FILE`
  (Foundry keystore), `BASE_KEEPER_ATTEST=1` (labelled keeper attestation, because OutLayer cannot read a local fork) and `KEEPER_HEALTH_PORT=8790`
  (as in the 2026-11-11 rollout run, evidence/rollout/keeper-20261111T070745Z.log; default 8787). Account ids, vault program, mint and Base vault
  default to config.yaml; `NEAR_RPC_URL` defaults to `https://test.rpc.fastnear.com`. The keeper refuses to start if any `*PRIVATE_KEY*`,
  `*SECRET_KEY*` or `MNEMONIC` variable is set (services/keeper/README.md). Startup logs `solana_relay_enabled` and `base_relay_enabled`.
  Check: `curl -s localhost:8790/healthz`. It triggers every triggerable position, so move the price down only in the 1:15 segment.
- **Feed**: `pnpm --filter feed start` (REST :8788, MCP :8789).
- **x402** (not on camera; for questions only): `X402_PORT=8791` and `X402_RELAYER_KEY_PATH`, then `pnpm --filter x402 start`. Its default port
  8790 collides with the keeper health port above (the G14 re-run used :8791, evidence/G14/rerun/summary.md).
- **Web**: `pnpm --filter web dev` (:3100).

### 3. Only if the fork was restarted: redeploy the Base vault
The fork lives in anvil's memory. After a restart, vault `0xC64b…1226` and MockB20 `0x634F…af81d` are gone, and the Base remote chain on
nectar-core-v2 points at an address with no code.
1. `bash scripts/29-security-upgrade.sh 6`. Step 6 runs `scripts/26-deploy-base.sh` (registry, MockB20 and vault on the fork; it writes the new
   addresses into config.yaml `base.*`) and swaps the extra remote chain (`remove_extra_remote_chain`, then `set_extra_remote_chain`). The script
   continues into step 7 (clears a latched `forced_closed`, SR-13), which changes nothing when none is set.
2. `bash scripts/62-g13-base.sh setup`.
3. Restart the keeper: it reads `base.vault` at startup. The new vault address differs from README and SECURITY.md. Write it into
   `evidence/demo/` and say "redeployed on the local fork" on camera.
The G13 re-run record on the fork (positions 11 and 12) is gone with the old fork; their NEAR side still answers.

### 4. Price walk and remote quotes
- Owner price (the owner oracle, a disclosed testnet demo control): one update may move it at most 1,500 bps (config.yaml `oracle.band_bps`).
  `reserve` and `price` in `58-g7-v2.sh` and `62-g13-base.sh` walk to the target in ≤ 14% steps, print each step and exit non-zero if a step
  is rejected, so no manual walk is needed. `58 … reserve` targets $180 and `62 … reserve` $150. Run any Base leg before the Solana reservation:
  a Base reserve after `#R` is open walks the price down to $150 and can trigger `#R` early (the G7 re-run triggered at $160).
- `bash scripts/58-g7-v2.sh prep` (Solana) and `bash scripts/62-g13-base.sh setup` (Base) each fund a fresh $1,000 quote for buyer1, after an
  owner mint, when the matching remote quote has less than $1,000 left. With the snapshot above both fund one. Note the new quote ids.

### 5. Remote lifecycle on 2.2.1 (one fresh Solana position `#R` for the 1:15–2:30 segments)
Subcommands of `bash scripts/58-g7-v2.sh` (Solana devnet). `scripts/62-g13-base.sh` has the same `reserve`, `check`, `deposit`, `show`, `repay`,
`release` and `price` for the local fork.
1. `reserve 3000000` (3 NVDAx, as in the G7 re-run): borrower1 calls `reserve_remote_position` with a `depositor` (its devnet wallet) and a
   0.05 NEAR deposit; the borrow is 98% of `preview_borrow`. It prints `remote_reserved`; note the id as `#R`. Deposit before the reservation
   expires (1,800 s, config.yaml `v7.reservation_expiry_s`).
2. `check #R` → `AUTHORITY MATCH` (stored authority == live `derived_public_key(solana-devnet/pos/#R)`, domain 1).
3. `deposit #R`: borrower1 opens the vault slot with the stored authority. Only the committed depositor's deposit can confirm the reservation (SR-8).
4. Keeper: `remote_deposit_confirm_requested` → `confirm_remote_deposit` (OutLayer `vault_read`, `remote_deposit_confirmed {source: "outlayer"}`)
   → the loan is funded, or refused with the reservation deposit refunded (`remote_loan_refused` → `reservation_deposit_refunded`). On Base the
   keeper sends `keeper_attest_deposit` instead (labelled). Then `show #R`.
5. The leg ends one of two ways:
   - repay: `repay #R` → `release #R` → the keeper relays `[Ed25519 verify, release]` and calls `relay_release_result` → `withdraw #R`;
   - price drop (the camera path): `price <usd_e6>`, walked in ≤ 14% steps (G7 re-run: 180 → 160) → keeper `preliq_triggered` → `quoter_result` →
     `settlement_signed` → the keeper relays `[Ed25519 verify, settle]` and calls `relay_settlement_result` → `withdraw #R`. The depositor pulls the
     remainder; if the settle took every unit, `withdraw` closes the slot and returns its rent.
   Vault v2 pays by pull: nothing reaches the depositor until `withdraw`. On Base, `settle` and `release` still push the tokens (SR-4 is open for
   the EVM vault, SECURITY.md), so `62` has no `withdraw`.
6. `resign #R` only when a signed leg expired without a relay (keeper down past `expires`): `resign_remote_settlement` re-signs the same leg with a
   fresh nonce. Anyone may call it, and the keeper relays the new signature. It only calls NEAR, so it also works for a Base position id.
Before recording, run 1–4 only and leave `#R` Open and deposited. If any step fails, use the G7 re-run (positions 9 and 10, tabs in step 7) and say
"recorded run".
Base for the 2:30 segment: if the fork kept its state, `bash scripts/62-g13-base.sh show 12` (G13 re-run settle) is enough. Otherwise run a release
leg with `62` before the Solana reservation: `reserve 3000000` → `check` → `deposit` → keeper attestation → `repay` → `release` → `show`.

### 6. Other state, only when needed
- Local quotes only if drained: `bash scripts/40-seed-demo.sh` (registers accounts, supplies $50,000 to the pool, buyer1 $10,000 @ 250 bps, buyer2
  $5,000 @ 400 bps, a borrower1 position on 100 NVDAx), then `bash scripts/41-seed-v2-fixup.sh` (skips buyer1's quote when a 250 bps one exists, and
  always opens one more borrower1 position). Both add state on top of what is there; skip them while the local quotes above remain.
- **buyer2 needs mock USDC for the 0:30 segment** (0 in the snapshot): `bash scripts/42-mint-usdc.sh buyer2 <amount_usd_e6>`, for example
  `5000000000` = $5,000. It mints mock USDC to that one account (owner key) and prints the new balance; nothing else is seeded.
- Modules: `bash scripts/61-v7-modules-testnet.sh shield` or `… reserve` only if those screens need fresh state. `profitlock <id>` needs an open
  position (its default #0 is closed).
- Quoter: `bash scripts/30-quoter-publish.sh pin` only if `get_quoter_config` shows the quoter disabled or a version_key other than config.yaml
  `outlayer.version_key` (`5f9bb287…`).

### 7. Browser tabs and wallet
Tabs: `/feed`, `/quote/new`, `/borrow`, `/console`, `/keepers`, `/position/#R`, the README "Live on testnet" table, and the G7 re-run backups
(EVIDENCE §G7 re-run after D-027):
- trigger, position 10: https://testnet.nearblocks.io/txns/6TKH53XpeanuU1G2ekWAF1PFpxEKs3ZvXYFu3MVyZboP
- settle, position 10: https://explorer.solana.com/tx/3Qm6H4sWiBkrrHYyZKJaWfcn8ak1E9NBD3Cnum412E1u2VFrNRD9ccowMTD6EFaDGZdatvQ79h5XQEfw6QRvizA4?cluster=devnet
- release, position 9: https://explorer.solana.com/tx/5vF6HxQTSPK19KyZYpqs9kGtFkNqxxCvbErTQs9ZVLYGz29eGHsf4yupyrfZCgcs4aMenF25LhSCNs2GTQTaN51d?cluster=devnet
The verifier got 403 (NearBlocks) and 429 (Solana Explorer) from these explorers; open each one before recording.
Wallet: near-connect with a testnet wallet holding the demo accounts (D-011). If a wallet cannot import them, the sign modal shows the exact `msg`
JSON; send it with the `ft_transfer_call` form from scripts/40-seed-demo.sh off camera and cut.

### 8. Two checks the E2E suite does not make
- **(a) Real wallet, once.** Since review 2 the web app sends new security headers (CSP `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri` / `form-action 'self'`, X-Frame-Options DENY, HSTS; R2-08), and the E2E suite signs with mock wallets only. On the build you will
  record: "Connect wallet" → pick the testnet wallet in the selector → sign one small testnet action (for example a small quote as buyer2)
  → the toast and the explorer link appear. If the selector or the wallet sandbox does not load, stop and report it; do not record around it.
- **(b) x402 top-up.** Each `pnpm --filter x402 demo:testnet` run locks 1 mock NVDAx from agent1. After the 15:26Z top-up
  (evidence/G14/rerun/accounts-topup-20261111T152615Z.log) agent1 held 2; the owner minted it 6 more at about 18:10Z (tx
  `36SNzV2Bzj3qJtRzmXiscHmtbpakcEMhtYy2wzKo8PdB`, evidence/G14/rerun/agent1-mint-20261111T181022Z.log), so agent1 now holds 8 mock NVDAx:
  enough for 8 x402 demo runs at 1 each. Only after 8 runs (takes or Q&A answers that show x402), before the next x402 segment, re-run
  `bash scripts/60-x402-accounts.sh`: it keeps the existing keys and accounts (skips what exists) and mints agent1 2 more mock NVDAx (signed by
  the owner from the keychain). Then start x402 as in step 2.

## Script
No hackathon name, badge or banner in any segment. Captions say "testnet", "mock collateral" and, for Base, "local fork of Base Sepolia".
| t | Screen / command | Say / show |
| --- | --- | --- |
| 0:00 | `/feed` | "Lenders cap tokenized-stock LTV because DEX exit is revocable. Here market makers escrowed committed exit capacity." Point to `Q_c`, the equation card `B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))`, the shared capacity and headroom (aggregate limit), and the session badge (Weekend Oracle Guard). Oracle badge: "owner oracle, disclosed". 1Click panel: NVDAx has no route, so `D_c` = 0. Nothing is deposited. |
| 0:30 | `/quote/new` (buyer2) | An amount buyer2 holds (step 6), 200 bps, 7-day notice. Sign `FundPappusQuote` → toast "Quote funded" → `Q_c` is higher on `/feed`; the Quote Note `q-…` is listed under `/notes`. |
| 0:50 | `/borrow` (borrower1) | 50 NVDAx. Static limit vs Nectar limit, premium, origination fee (30 bps), health preview. Borrow between the two bars and inside the aggregate headroom shown on `/feed` (check before recording). Sign `LockCollateralAndBorrow` → position page with its Note `p-…`. |
| 1:15 | `/console` (owner) | "Testnet demo control, disclosed." Say: "`#R` was reserved before recording. The borrower named its Solana wallet as the depositor and paid a 0.05 NEAR reservation deposit; OutLayer read the vault deposit before the loan was funded." Lower the owner price in band-sized steps until `#R` is triggerable (read the health on `/position/#R`; off camera, `bash scripts/58-g7-v2.sh price <usd_e6>` walks there in ≤ 14% steps). |
| 1:30 | keeper terminal (running since step 2) | Log line `preliq_triggered` for `#R`. "The keeper has a function-call key. It sends a position id, nothing else." `curl -s localhost:8790/runs`. |
| 1:45 | nearblocks (trigger tx from the keeper log) | `quoter_requested` → OutLayer `execution_completed` → `quoter_result` (fills per quote) → `settlement_signed`. "The TEE priced the fill; the contract built the message; Chain Signatures signed it with this position's own key." If the run differs, open the trigger tab `6TKH53Xp…` and say "recorded run". |
| 2:05 | keeper log → Solana Explorer → terminal | Keeper `solana_tx_sending` → `solana_tx_confirmed` → `solana_leg_relayed`: `[Ed25519 verify, settle]` to `nectar_vault` on devnet. In the Solana tx: ix0 Ed25519SigVerify (pubkey = the position's derived key, message = the NEAR preimage), ix1 the vault's settle. Then `bash scripts/58-g7-v2.sh withdraw #R`: "The buyer was paid in the settle. The vault pays the depositor by pull, so the borrower withdraws the remainder." `/position/#R` shows the Solana tx and Closed. Backup: the settle tab `3Qm6H4sW…` (position 10, then withdraw 0.613144 NVDAx). |
| 2:30 | terminal, caption "Local fork of Base Sepolia (chain id 84532), not Base Sepolia" | `bash scripts/62-g13-base.sh show 12` (or the Base id from step 5). "The same flow on an EVM vault. NEAR derives a secp256k1 key per position and the MPC signer signs the EIP-712 message on NEAR testnet. The vault runs on a local fork because no Base Sepolia faucet works without a login." |
| 2:40 | `/console` copilot panel → terminal | Banner "Key missing": no NEAR AI key on this server, so live answers are off. `pnpm --filter web test:copilot` output (run just before) → 12 pass, 1 skipped (live). "Answers are hidden unless the signature, the attestation and the signed question all check out. Provenance, not advice. Tested on a fixture, not on a live answer." |
| 2:50 | README "Live on testnet" | "Testnet, Solana devnet and a local fork of Base Sepolia. Mock collateral and mock USDC. Owner oracle. Not audited: SECURITY.md lists what was fixed and what remains. Every row links to docs/EVIDENCE.md." |

Not in the video (not verified by a gate, or not on testnet): Feed MCP with an agent client, a live NEAR AI answer, a live Pyth price, the
corporate-action multiplier, `pay_to`, referrers, real Base Sepolia (H15), the Base web screens (`features.base: false`). On testnet but left out
for time: the x402 payment (G14 PASS, its 402 → 200 leg verifier-run 2026-11-11), the Shield / Profit-Lock / Reserve runs (chain-checked by the verifier, EVIDENCE
§v7 module runs; the Profit-Lock event is not chain-confirmed), and the web withdraw / claim / Re-sign screens (mocked E2E passed in the G3b re-run; the real-chain flow is in the G7/G13 re-runs).

Capture: `pnpm demo:capture` (Playwright `e2e/screens.spec.ts`) gives silent screens; the full take above is screen-recorded by Kunal (H11).
Note: the mocked E2E for the remote screens (withdraw, claim, Re-sign, owed collateral) and the Notes screens passed in the G3b re-run
(2026-11-11T08:24Z, 5083d30; desktop and phone). Screenshot capture was not run (`REMOTE_SCREENS`, `NOTES_SCREENS` unset), and the real-chain
flow is only in the G7/G13 re-runs, so rehearse every screen before recording.

## Real-wallet borrow on the hosted app
Kunal runs this once after the deploy (WO-34 acceptance). The hosted app is https://nectarlabs-app.vercel.app (production from ca34111, 2026-11-12).
Nothing here is in docs/EVIDENCE.md yet, and no wallet has signed a borrow on the hosted app: this run is the first. NEAR testnet only,
mock collateral, mock USDC. Tick each box.

### Prerequisites
- [ ] **A testnet wallet from the near-connect selector.** The selector (near-connect 0.12.0) shows near-connect's wallet manifest, fetched
  unpinned at runtime, so the list can change. The data-inventory run (apps/web/content/data-inventory.md, "Wallets in the selector";
  frames opened, nothing signed) saw: Meteor Wallet (frame loaded), Intear Wallet (connection-method screen), Ledger (needs the NEAR app on
  the device), Nightly Wallet (download screen only), Ethereum Wallets (opens evm-on-near.dev; not a NEAR testnet account) and NEAR CLI
  ("Enter your NEAR account ID"). Use one that holds a NEAR testnet account `<you>.testnet`.
- [ ] **Testnet NEAR for gas.** The borrow attaches at most 200 TGas (unused gas is refunded; `GAS_TGAS.borrow` in packages/sdk/src/msg.ts)
  and a 1 yoctoNEAR deposit. Faucet: https://near-faucet.io/ (F-154); a new funded account: `near account create-account
  sponsor-by-faucet-service <id> autogenerate-new-keypair save-to-keychain network-config testnet create` (F-016).
- [ ] **Mock NVDAx.** Only the owner `nectar.testnet` can mint (`mint` is owner-only in contracts/mock-ft/src/lib.rs); there is no public
  faucet. Kunal runs this on the machine whose keychain holds the owner key (same call shape as scripts/60-x402-accounts.sh). Registering on
  mock USDC matters: free registration on first receipt stops after 64 accounts (`MAX_FREE_REGISTRATIONS`), and then a transfer to an
  unregistered account fails with `receiver not registered`. The owner registers accounts for free.
```bash
ACCT=<you>.testnet
for T in usdc-mock.nectar.testnet nvdax-mock.nectar.testnet; do
  near contract call-function as-transaction "$T" storage_deposit json-args "{\"account_id\":\"$ACCT\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as nectar.testnet network-config testnet sign-with-keychain send
done
# 2 mock NVDAx (6 decimals)
near contract call-function as-transaction nvdax-mock.nectar.testnet mint json-args "{\"account_id\":\"$ACCT\",\"amount\":\"2000000\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as nectar.testnet network-config testnet sign-with-keychain send
# check: "2000000"
near contract call-function as-read-only nvdax-mock.nectar.testnet ft_balance_of json-args "{\"account_id\":\"$ACCT\"}" network-config testnet now
```

### Path
1. [ ] Open `https://nectarlabs-app.vercel.app/borrow` in a fresh browser profile.
2. [ ] Banner "Cookies and storage": press **Decline** or **Accept analytics**. Either works; analytics load only after Accept and only when a
   GA id is configured (apps/web/components/SiteChrome.tsx). The choice is stored as `localStorage nectar-consent`.
3. [ ] Press **Connect wallet** (top bar) or **Connect a wallet to borrow** (composer button).
4. [ ] Pick the wallet in the selector and approve the connection. The composer now offers 25% / 50% / Max chips from your NVDAx balance.
5. [ ] Values: **You lock** `1` NVDAx, **You borrow** `10` USDC (contract minimum $5, `MIN_BORROW_USD_E6` in contracts/nectar-core/src/lib.rs),
   Protection **Standard**, flag line at its default, "Pay a merchant directly" off. Read the **Limit** next to You borrow: $10 must be under
   it. The Outcome panel lists the fees, "You receive" and health after, with no red "The contract would refuse this" banner.
6. [ ] **Review borrow** opens the drawer "Review borrow": Collateral locked `1 NVDAx`, Protection `Standard`, Fees, You receive, Health
   after. Press **Show what your wallet signs** and tick each row:

   | Row | Expected |
   | --- | --- |
   | Network | NEAR testnet |
   | Signer | `<you>.testnet` |
   | Receiver | `nvdax-mock.nectar.testnet` (the token; `args.receiver_id` is `nectar-core-v2.nectar.testnet`) |
   | Method | `ft_transfer_call` |
   | Amount | `1 NVDAx` |
   | Gas (max, unused is refunded) | `200 TGas` |
   | Deposit | `1 yoctoNEAR` |
   | msg | `{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"10000000","pre_liq_ltv_bps":<flag line>}}` |

7. [ ] **Confirm in wallet** opens the sign modal "Review: Lock collateral and borrow" with the same rows. Press **Open wallet to sign**.
8. [ ] In the wallet, check receiver, method and deposit against step 6, then approve.
9. [ ] Wait. The modal button reads "Waiting for wallet"; on success the drawer title turns to "Loan opened" and the toast "Position opened" appears.
10. [ ] **View loan #`<id>`** opens `/position/<id>`: breadcrumb "Loan #`<id>`", the collateral and debt, and the Note link `p-<id>`. The Note page
    `/note/p-<id>` says "History not indexed yet": expected, because the Feed API has no Note route (`ROUTES` in services/feed/src/api.ts).

### What success looks like
- [ ] **Explorer.** The toast shows "View transaction `<hash>`…" as a link only if the deploy sets `NEXT_PUBLIC_EXPLORER_TX`
  (apps/web/.env.example leaves it unset); otherwise it prints `tx <hash>`, so open `https://testnet.nearblocks.io/txns/<hash>`. Look for
  `ft_transfer_call` on `nvdax-mock.nectar.testnet`, then a `position_opened` event in the nectar-core receipt logs. Note the block height.
- [ ] **`https://nectarlabs-app.vercel.app/status`.** "Contract (NEAR testnet RPC)" reads Answering. "Feed indexer" reads Indexing, with Last indexed block,
  Chain head, Lag (blocks) and Last poll.
- [ ] **Feed lag.** On an empty database the hosted Feed starts at the chain head (`FEED_START_BLOCK` default `head`,
  services/feed/src/hosted.ts). With the defaults it polls every 10 s (`FEED_POLL_MS`) and reads up to 100 final blocks per poll
  (`FEED_NEARDATA_MAX_BLOCKS`, services/feed/README.md). So with Lag under 100 blocks, the borrow is indexed by the first poll after its block
  is final. A larger Lag shrinks by up to 100 blocks per poll. Done when Last indexed block ≥ the tx's block height. The borrow form and the
  position page read the contract over RPC, so they do not wait for the Feed.

### If something fails
- Capture: the tx hash (the error toast "Lock collateral and borrow failed" stays until closed and carries the failure text; the drawer shows
  "The transaction failed"), screenshots of the drawer and the wallet screen, the browser console (DevTools → Console → Save as…), a
  screenshot of `/status`, the wallet name and version, the browser, and the time in UTC. Send them to the orchestrator.
- If the wallet never opened, nothing was signed and nothing was sent.
- Any code fix means a new build, then G3b and G9 re-run by the verifier before the README or this file says the flow works. Do not work
  around a failure on the hosted app.

### Settlement needs the operator's keeper
Opening a loan needs no keeper. Flagging (pre-liquidation trigger) and settlement run only while the operator's keeper runs on the operator's
machine (`pnpm --filter keeper start`, step 2 of "Before recording"). The keeper key is not hosted: H-KEYS is OPEN, and its default is that the
keeper stays local. A loan that becomes flaggable while the keeper is off waits until the keeper runs again.
