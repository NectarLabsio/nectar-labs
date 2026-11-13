# DEMO_SCRIPT.md v5 — 2 minutes on the hosted testnet app (2026-11-12)

One take, at most 2:00, on https://testnet.nectarlabs.io with the demo account `demo.nectar.testnet` (created 2026-11-12, tx
[5NbjrugA…](https://testnet.nearblocks.io/txns/5NbjrugATtcyoqz5sjo9vGmAQz5EmMNkdafK5Em3bTC7), evidence/ops/demo-account-20261112T200317Z.log).
NEAR testnet only, mock NVDAx and mock USDC, owner oracle (disclosed, G5 FALLBACK). The contract on camera is `nectar-core-v2.nectar.testnet`
at `2.2.1-v7`. Gate results: docs/EVIDENCE.md. Every number said on camera is read from the screen at recording time, never from this file.
No hackathon name, badge or banner in any beat; captions say "testnet" and "mock collateral". Voice-over: H11.
The 3-minute v4 script (Solana and Base remote lifecycle, keeper, copilot) is this file at commit fae7e36; use it for Q&A, not for this take.

## Before recording
1. **Time.** Record in NYSE hours, 14:30–21:00 UTC on a session day. Outside them the session is closed (`outside_hours`) whatever the price.
2. **Fresh oracle price.** The session counts as open only while the owner price is under 15 min old (`SESSION_MAX_PRICE_AGE_NS` = 900 s,
   contracts/nectar-core/src/lib.rs:75). The Railway refresher (H-ORACLE option A) re-asserts the price every 10 min in session, but it is
   STAGED, not running, until Kunal applies it. If it is not running, send the RUNBOOK one-shot `update_owner_price` with the CURRENT price
   (`oracle_price_usd_e6` from `get_exit_capacity`, never the RUNBOOK example value) within 15 min before the take. Check with
   `pnpm demo:testnet`: "session open" and an oracle age under 900 s. Otherwise the screen shows the closed-session limit (disclosed, correct).
   A borrow in an open session needs more: the price under 120 s old (`max_age_ns_session` in `get_config`; default 120 s at
   contracts/nectar-core/src/lib.rs:133, applied at :381; docs/work/wo-35-demo-video.md C6). Send the one-shot refresh less than 60 s before the
   borrow beat; a 10-min refresher leaves borrows failing "oracle stale" most of each NYSE hour.
3. **What production serves.** Release 4 (commit c95cd0c, deployed 2026-11-13 ~02:00Z) runs on the custom hosts; the verifier's acceptance there
   passed (docs/EVIDENCE.md §"WO-34 production (custom hosts)"). https://status.nectarlabs.io is the status page (nectarlabs.io/status redirects
   there), the docs answer at the root of https://docs.nectarlabs.io, and "Get test assets" is on testnet.nectarlabs.io/borrow. The hosted Feed
   indexes events again since 2026-11-13 02:22Z (neardata with a FastNear key, start block 277398512; HUMAN_HANDOFF H-NEARDATA); events before
   block 277398512 are not in it.
4. **Wallet import of demo.nectar.testnet (off camera).** The recovery phrase exists only in `~/.nectar/keys/demo.nectar.testnet.json` (0600).
   Kunal shows it in his own terminal, never on screen and never in a file in the repo:
   `node -e 'console.log(require(process.env.HOME + "/.nectar/keys/demo.nectar.testnet.json").seed_phrase)'`
   He imports it into a testnet wallet from the near-connect selector (import by phrase is not tested in this repo; rehearse it), then clears the
   terminal (`clear`, and close the window). Agents never print, copy or log the phrase or the key.
5. **Test assets for the demo account**, one of:
   - **A. Button** (deployed in release 4; the verifier checked it only without a wallet, so rehearse the signed claim): on
     testnet.nectarlabs.io connect the wallet and use "Get test assets" (label "Mock assets, no value") on camera. It signs one wallet request
     with `faucet_mint` on nvdax-mock and usdc-mock. The faucet itself is deployed on both mocks (code-only upgrade 2026-11-12 ~20:10Z, state
     unchanged; evidence/rollout/mockft-faucet-20261112T200937Z.log): 5 NVDAx and 500 USDC per claim, one claim per hour, 3 claims per account
     (`faucet` in packages/config/config.yaml). One real call is recorded: borrower1, tx
     [2A4jN155…](https://testnet.nearblocks.io/txns/2A4jN155i6AEbZv35qj8c7XZLV7TjWZejr3mnJmneQrW) (`ft_mint` 5 NVDAx).
   - **B. Orchestrator mint** (if the button fails in rehearsal): before the take the orchestrator registers the account on both mocks and mints
     5 mock NVDAx, signed by the owner from the keychain. On camera, the borrow form's "Balance 5 NVDAx" stands in for the button; caption
     "Test assets minted before recording (mock, no value)".
     ```bash
     for T in usdc-mock.nectar.testnet nvdax-mock.nectar.testnet; do
       near contract call-function as-transaction "$T" storage_deposit json-args '{"account_id":"demo.nectar.testnet"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as nectar.testnet network-config testnet sign-with-keychain send
     done
     near contract call-function as-transaction nvdax-mock.nectar.testnet mint json-args '{"account_id":"demo.nectar.testnet","amount":"5000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as nectar.testnet network-config testnet sign-with-keychain send
     ```
6. **x402 (terminal beat).** Start the local x402 on :8791 against the hosted Feed (x402 is never hosted, D-031):
   `X402_PORT=8791 FEED_URL=https://feed-production-2f2776c9.up.railway.app X402_RELAYER_KEY_PATH=~/.nectar/keys/x402-relayer.json pnpm --filter x402 start`.
   The camera command (pays for the CSV only; no borrow, so no Feed MCP is needed):
   `DEMO_SKIP_BORROW=1 X402_URL=http://127.0.0.1:8791/api/feed/export.csv AGENT1_KEY_PATH=~/.nectar/keys/agent1.json pnpm --filter x402 demo:testnet`.
   It logs `challenge` (402: near:testnet, usdc-mock, 10000, pay to `nectar.testnet`) and `paid_fetch` (200, rows, transaction). Run it once
   off camera first. The 402 → 200 path is G14 (EVIDENCE §G14).
7. **Tabs:** testnet.nectarlabs.io/borrow (wallet connected), https://testnet.nearblocks.io/address/demo.nectar.testnet, the terminal, and an end
   card. Weekend Shield: if the option is disabled, the composer shows why (session calendar); record Standard and say so.
8. **Rehearse** the whole take once. If a step fails on the hosted app, stop and report it; do not record around it.

### State snapshot (2026-11-12T20:07Z, `pnpm demo:testnet`, read-only)
| What | State |
| --- | --- |
| contract | `nectar-core-v2.nectar.testnet` `2.2.1-v7` |
| exit capacity NVDAx | Q_c $16,119.22 · R_c $10.00 · D_c $0.00 · haircut 2,500 bps · session closed (`session_reason: "stale_price"`, `get_exit_capacity` at 20:09Z) · aggregate headroom $2,867.92 |
| oracle | owner price $135.00, age 17,779 s (fresh for borrows, older than the 15 min session rule) · effective limit 7,000 bps |
| pool | $40,771.00 available · $9,229.00 utilised · treasury $80.66 |
| quotes | #0 $5,000 @ 400 bps · #1 $5,477.50 @ 250 · #2 $259.12 @ 300 · #3 $5,000 @ 450 · #4 $382.60 @ 300 |
| open positions | #1 $9,000 · #4, #13, #14, #15 $10 each (x402 agent runs) · #5 $189 (Weekend Shield) |
| demo.nectar.testnet | 0.5 NEAR, 0 mock NVDAx, 0 mock USDC (`ft_balance_of`, 20:08Z, before step 5) |
| agent1.nectar.testnet | 8 mock NVDAx, 39.84 mock USDC (20:09Z) |

## Script (≤ 2:00)
| Time | Screen | Action | Caption |
| --- | --- | --- | --- |
| 0:00–0:06 | intro card | [INTRO — Kunal supplies] | [INTRO — Kunal supplies] |
| 0:06–0:22 | testnet.nectarlabs.io/borrow, wallet connected as `demo.nectar.testnet` | Path A: press "Get test assets", approve the one wallet request, read the amounts and the two tx links. Path B: point at "Balance 5 NVDAx" in the form. | "Testnet. Mock assets, no value." |
| 0:22–0:52 | /borrow composer | You lock 5 NVDAx; read the static limit vs the Nectar limit; pick **Weekend Shield** (limit fixed until the window end, flat fee); You borrow a round amount under the limit (e.g. 100 USDC); **Review borrow** → **Show what your wallet signs** (receiver `nvdax-mock.nectar.testnet`, `ft_transfer_call`, 1 yoctoNEAR) → **Confirm in wallet** → approve. | "Committed buyers raise the limit. Weekend Shield: the limit cannot be cut halfway through the weekend." |
| 0:52–1:12 | /position/`<id>` → nearblocks | "View loan #`<id>`": collateral, debt, Note `p-<id>`. Open the tx: the toast's "View transaction" link when the deploy sets `NEXT_PUBLIC_EXPLORER_TX`, otherwise the hash from the toast in the nearblocks tab: `ft_transfer_call` on nvdax-mock, `position_opened` in the nectar-core receipt. | "On-chain on NEAR testnet." |
| 1:12–1:40 | terminal | Run the x402 camera command (step 6): `challenge` 402 → signed delegate → `paid_fetch` 200 with the CSV rows and the relay tx. | "An agent pays 0.01 mock USDC per call with x402 on NEAR testnet." |
| 1:40–2:00 | end card | Four URLs: https://nectarlabs.io · https://testnet.nectarlabs.io · https://docs.nectarlabs.io · https://status.nectarlabs.io. | "Testnet, mock collateral, owner oracle. Not audited." |

Not in this take (on testnet, see EVIDENCE): quotes and the Feed screens, the Solana and Base remote lifecycle (G7, G13 on a local fork), Profit-Lock
and Reserve, the copilot (fixture only, G8). Never in any take: a live NEAR AI answer, a live Pyth price, real Base Sepolia.

**Fallback:** `pnpm demo:capture` (Playwright `e2e/screens.spec.ts`) gives captioned silent screens if the hosted take cannot be recorded.

## Real-wallet borrow on the hosted app
The 0:22–1:12 beats are the first wallet-signed borrow on the hosted app: docs/EVIDENCE.md records none yet. Check the wallet screen against
the review drawer: Network NEAR testnet · Signer `demo.nectar.testnet` · Receiver `nvdax-mock.nectar.testnet` (`args.receiver_id`
`nectar-core-v2.nectar.testnet`) · Method `ft_transfer_call` · Gas at most 200 TGas (unused is refunded) · Deposit 1 yoctoNEAR · msg
`LockCollateralAndBorrow` with the Shield, byte for byte as the drawer shows it. Contract minimum borrow $5 (`MIN_BORROW_USD_E6`); a Shield allows a
limited number of opens per account per day (the composer shows how many are left).

### If something fails
- Capture the tx hash (the error toast stays until closed), screenshots of the drawer and the wallet screen, the browser console, the status page,
  the wallet name and version, the browser and the time in UTC. Send them to the orchestrator.
- If the wallet never opened, nothing was signed and nothing was sent.
- A code fix means a new build, then G3b and G9 re-run by the verifier before README or this file says the flow works.

### Settlement needs the operator's keeper
Opening a loan needs no keeper. Flagging (pre-liquidation trigger) and settlement run only while the operator's keeper runs on the operator's
machine (`pnpm --filter keeper start`); H-KEYS is OPEN and its default keeps the keeper local.
