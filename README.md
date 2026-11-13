# Nectar Labs: committed buyers, higher limits

Nectar Labs lets holders of tokenized stocks borrow USDC against a limit backed by market makers who have already escrowed USDC to buy the collateral. NEAR testnet, mock collateral.
<!-- screen-3 -->

Lenders cap loans against tokenized stocks because the DEX liquidity they would sell into can disappear, most of all when the stock market is closed. Without a buyer they can count on, they set a low limit or sell early. Nectar Labs makes the buyer commit first: market makers escrow time-locked USDC buy quotes in a NEAR contract, borrowers get a limit backed by those quotes and pay a premium that goes to the buyers, and an unhealthy loan's collateral goes to the committed buyer at a capped discount instead of a DEX.

> Testnet only: NEAR testnet, plus Solana devnet for remote collateral. The collateral is mock NVDAx (`nvdax-mock.nectar.testnet`), standing in for tokenized equities such as xStocks, and the USDC is a mock too. Neither has any value. No mainnet, no token, not audited.

## 60-second path
On https://testnet.nectarlabs.io with a NEAR testnet wallet:
| Do this | You should see |
| --- | --- |
| Open https://testnet.nectarlabs.io/feed/NVDAx <!-- screen-2 --> | Exit capacity for mock NVDAx and the committed buyers behind it. On 2026-11-13 ~18:40Z the contract reported $16,119.22 in escrowed quotes, $14,516.30 of capacity and $5,277.30 of headroom (current values change) |
| Open /borrow, connect a wallet, click "Get test assets" | Two `faucet_mint` transactions: 5 mock NVDAx and 500 mock USDC (cap: 1 claim per hour, 3 per account) |
| Enter an amount and turn on Weekend Shield | The limit, the fee stack and the loan's health before you sign; with a Shield you pay a Shield fee instead of the limit premium |
| Sign | Your wallet asks you to approve `ft_transfer_call` on `nvdax-mock`, sending mock NVDAx to `nectar-core-v2`; once it confirms, the notification carries the explorer link |
| Open the position page, e.g. https://testnet.nectarlabs.io/position/15 <!-- screen-4 --> | Loan #15: $10 against 1 mock NVDAx, Open; a health gauge and a price simulator |
| Agent: `AGENT1_KEY_PATH=<agent key file> pnpm --filter x402 demo:testnet`, with the Feed and the x402 server running ([services/x402/README.md](services/x402/README.md)) <!-- screen-6 --> | The unpaid request gets HTTP 402; the agent pays 0.01 mock USDC; the retry gets HTTP 200 with the Feed CSV (112 rows in the run of 2026-11-13T12:28Z). It needs the agent's testnet key, so it runs on the operator's machine; https://testnet.nectarlabs.io/agents describes it |

## How NEAR is used, concretely
Every NEAR transaction below returned final status `SuccessValue` on testnet archival RPC (`EXPERIMENTAL_tx_status`, 2026-11-13 ~18:30Z). NearBlocks answers scripts with HTTP 403, so open the links in a browser.
1. **`nectar-core-v2.nectar.testnet` escrows the quotes and enforces each loan's limit** (Rust, near-sdk 5.30.1, version `2.2.1-v7`). `get_exit_capacity` returns the escrowed quotes, the haircut, the shared capacity and the headroom; a loan that does not fit is refused: [9ykovXkm…](https://testnet.nearblocks.io/txns/9ykovXkmV1MqUBsUkRDkMtfv3LS8ALqqn9f3dB5cxgn1) emits `remote_loan_refused {reason: aggregate_limit}`, refunds the borrower's reservation deposit, and the collateral is released.
2. **NEP-141 `ft_transfer_call` deposits.** Collateral and USDC enter only this way. agent1 sends 1 mock NVDAx to `nvdax-mock` with `ft_transfer_call`, and the contract opens position #15 for $10: [E2suM2LC…](https://testnet.nearblocks.io/txns/E2suM2LC4ac2AE9TZ66AGY72ZDrBdu1Yz8pEnwAs65hz).
3. **NEP-171 Position Notes.** Every quote and loan is an NFT: [GcHF75nW…](https://testnet.nearblocks.io/txns/GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt) opens position #4 and emits `nft_mint` of Note `p-4`. Moving the Note with `nft_transfer` moves the loan's rights: tests `v7_notes_self_settle_by_new_loan_owner`, `v7_notes_self_settle_old_owner_refused` and `v7_notes_residual_collateral_goes_to_loan_note_owner` (contracts/nectar-core/src/tests_notes.rs). For Solana and Base collateral the release still goes to the original depositor ([SECURITY.md](SECURITY.md)).
4. **NEP-297 events read by the Feed.** The contract logs `EVENT_JSON` with standard `nectar`, version `2.0.0`, e.g. `oracle_updated` in [De6aVqqN…](https://testnet.nearblocks.io/txns/De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG). The Feed ingests real testnet log lines in test `real nectar-core-v2 (2.0.0) log lines` (services/feed/test/v2-events.test.ts).
5. **x402 with a NEP-366 `SignedDelegate`.** agent1 signs a delegate action paying 0.01 mock USDC; `x402-relayer.nectar.testnet` submits it: [8bXCY34S…](https://testnet.nearblocks.io/txns/8bXCY34SVYv5b7vJ4GLfWkbJtQdqbSSBJsrzPCE75XRk) (2026-11-13T12:28Z). The same flow run by the verifier: [4vW2tPF5…](https://testnet.nearblocks.io/txns/4vW2tPF5Gqemkm5uoafQE6eaXidSMSCuqLcDVMTTB77b).
6. **A price-bot key limited to `update_owner_price`.** [BHopF1cu…](https://testnet.nearblocks.io/txns/BHopF1cuKAMDFoCnKyNZPPKR3qVPgs5dYiKxx6jwWpao) adds a function-call key to `nectar.testnet` whose only allowed method is `update_owner_price` on `nectar-core-v2` (re-read with `view_access_key_list` on 2026-11-13). Its first refresh: [De6aVqqN…](https://testnet.nearblocks.io/txns/De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG).
7. **OutLayer TEE quoter.** The keeper (function-call key only) calls `trigger_preliquidation`; the contract asks a hash-pinned OutLayer program for the discount, clamps it to the quote's cap and emits `settlement_signed`: [HrpQsuMW…](https://testnet.nearblocks.io/txns/HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u) (OutLayer request 16453). Attestation of an earlier request: [request 15148](https://testnet-api.outlayer.ai/attestations/by-request/15148). The TDX quote is not verified on chain.
8. **1Click quotes as read-only reference.** The Feed fetches `dry: true` quotes and never deposits, because NEAR Intents has no testnet. NVDAx has no 1Click route, so its DEX depth term is 0 (`d_usd_e6` `0` in `get_exit_capacity`).
9. **Chain Signatures for remote collateral.** The contract builds each release or settlement message and `v1.signer-prod.testnet` signs it with a key derived per position. On Solana devnet the vault checks the Ed25519 signature before it pays the buyer: [3cdcQru2…](https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet). The Base leg (secp256k1 key, EIP-712) ran only on a local fork of Base Sepolia, which has no public explorer; its round trip is recorded in [docs/EVIDENCE.md](docs/EVIDENCE.md).

## What is real, what is mock
| Part | Status |
| --- | --- |
| Credit contract `nectar-core-v2.nectar.testnet` | real, NEAR testnet |
| Wallet connection | real NEAR testnet wallets (NEAR Connect selector) |
| Faucet ("Get test assets") | real `faucet_mint` on the mock tokens; capped, no value |
| Collateral | **mock** NVDAx (`nvdax-mock.nectar.testnet`), standing in for tokenized equities |
| USDC | **mock** (`usdc-mock.nectar.testnet`) |
| Market makers | our demo accounts (e.g. `buyer1`, `buyer2`) with demo quoter inputs we set, not independent market makers |
| Oracle | **owner oracle**: a price we set, re-asserted by a bot whose key can call only `update_owner_price`. A Pyth path is built and tested in the sandbox, not live |
| OutLayer quoter | real TEE execution on testnet; if the call fails, the contract settles at the quote's cap |
| Solana leg | real, Solana devnet + NEAR testnet signer |
| Base leg | **local fork** of Base Sepolia (chain id 84532), not Base Sepolia |
| Keeper and x402 server | real testnet accounts; run on the operator's machine, not hosted, not continuous |
| Feed | REST hosted at https://feed-production-2f2776c9.up.railway.app (`/health`), read-only; holds contract events from block 277503800 on |
| Copilot | built; tested on a fixture only, no live NEAR AI answer verified |
| Site, app, docs, status | hosted on Vercel: https://nectarlabs.io, https://testnet.nectarlabs.io, https://docs.nectarlabs.io, https://status.nectarlabs.io; up until at least 2026-11-25 |

## What this does not prove
- Mainnet or real money: everything runs on NEAR testnet and Solana devnet.
- Real tokenized-equity liquidity: the collateral and USDC are mocks, and the quotes come from our own demo accounts.
- Safety: the code is not audited. Two pre-submission reviews and what is still open are in [SECURITY.md](SECURITY.md).
- A market price: the owner oracle is a price we set; the price drops in the demo are ours.
- Base Sepolia: the EVM leg ran only on a local fork.
- On-chain TEE verification: the TDX quote is not checked on chain, and keeper reports of remote transactions are advisory.
- A borrow on an actual weekend: the closed-market rule (DEX depth ignored, larger haircut) is tested in the sandbox only.
- A live copilot answer, or an LLM agent using the Feed's MCP tools (only a scripted client has used them).
- The source commit of each production deploy and some orchestrator checks are self-attested; [docs/EVIDENCE.md](docs/EVIDENCE.md) marks which.

## What we set out to prove, and the result
| Claim | Result | Evidence |
| --- | --- | --- |
| Escrowed quotes raise the borrow limit | at the 10% haircut, the $10 Reserve alone would give $9 of capacity; with $16,119.22 of escrowed quotes added, capacity is $14,516.30 | `get_exit_capacity {"symbol":"NVDAx"}` at block 277547845, 2026-11-13 ~18:40Z |
| The limit holds across all loans | a loan beyond the shared capacity is refused; the reservation deposit is refunded and the collateral released | [9ykovXkm…](https://testnet.nearblocks.io/txns/9ykovXkmV1MqUBsUkRDkMtfv3LS8ALqqn9f3dB5cxgn1) |
| The committed buyer takes the collateral, not a DEX | position #10: the buyer's escrow repaid $370.44 and the buyer received 2.386856 mock NVDAx from the Solana devnet vault | [6TKH53Xp…](https://testnet.nearblocks.io/txns/6TKH53XpeanuU1G2ekWAF1PFpxEKs3ZvXYFu3MVyZboP) (trigger), [9s8HDeaq…](https://testnet.nearblocks.io/txns/9s8HDeaqRhP13ZPYvB3jn6uRLpTppjfdXVE8n6CRmU1a) (settlement reported) |
| The discount is computed verifiably and stays under the cap | 159 bps against a 400 bps cap, attested by OutLayer | [request 15148](https://testnet-api.outlayer.ai/attestations/by-request/15148) |
| Remote collateral moves only with a NEAR signature | the Solana vault verified the NEAR-signed message (Ed25519 instruction first) before it paid the buyer | [3cdcQru2…](https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet) |
| An agent can borrow and pay for data on its own | $10 loan with a $0.03 fee, then 0.01 mock USDC paid: HTTP 402, then 200 with 123 CSV rows | [E2suM2LC…](https://testnet.nearblocks.io/txns/E2suM2LC4ac2AE9TZ66AGY72ZDrBdu1Yz8pEnwAs65hz), [4vW2tPF5…](https://testnet.nearblocks.io/txns/4vW2tPF5Gqemkm5uoafQE6eaXidSMSCuqLcDVMTTB77b) |
| The price bot can do one thing only | its key may call `update_owner_price` on `nectar-core-v2` and nothing else | [BHopF1cu…](https://testnet.nearblocks.io/txns/BHopF1cuKAMDFoCnKyNZPPKR3qVPgs5dYiKxx6jwWpao) |

Every gate run, with commands, outputs and links: [docs/EVIDENCE.md](docs/EVIDENCE.md).

## Next
- Real market makers quoting on testnet, in place of our demo accounts.
- Replace the owner oracle with Pyth once an API key and an NVDA feed are available.
- An audit before any mainnet, with a DAO owner and a timelock.

Main stays frozen until 2026-11-18T23:59Z; the hosted demo stays up until at least 2026-11-25.

## Commands
From a fresh clone, no keys needed. Timings from the fresh-clone rehearsal from the public GitHub URL on 2026-11-13.
| Command | What it does | Time |
| --- | --- | --- |
| `git clone https://github.com/NectarLabsio/nectar-labs.git && cd nectar-labs` | clone | — |
| `pnpm i` | install | 12 s |
| `pnpm demo:testnet` | read-only `nectar-core-v2` views over public testnet RPC | 4 s |
| `pnpm verify` | lint, typecheck and unit tests, then the testnet views again | 36 s |
| `pnpm --filter web dev` | web app on http://localhost:3100 | ready in 4 s |
| `pnpm --filter docs-site build` | static docs build (broken links fail it) | 24 s |
| `pnpm --filter docs-site start` | docs on http://localhost:3000/ | — |
| `pnpm --filter feed start` | Feed REST on :8788, MCP over HTTP at http://127.0.0.1:8789/mcp | — |
| `pnpm -s --filter feed mcp` | Feed MCP over stdio (read-only tools) | — |

## Run locally
- Node ≥ 22.22.2, pnpm 10.34.9. `pnpm demo:testnet` runs scripts/demo-testnet.mjs: it reads the ids from packages/config/config.yaml and calls the contract over public RPC (default `https://test.rpc.fastnear.com`; override with `NEAR_RPC_URL`). No keys, no near CLI.
- Web pages: `/`, `/borrow`, `/feed`, `/feed/NVDAx`, `/quote/new`, `/console`, `/notes`, `/reserve`, `/shield`, `/agents`, `/keepers`, `/security`, `/talk`, `/docs`, `/legal/privacy` (also `cookies`, `terms`, `disclaimers`), and `/position/<id>`, `/quote/<id>`, `/note/<token id>` (e.g. `/note/q-0`).
- The Feed needs no env: it reads `accounts.core` from config.yaml (`CORE_ACCOUNT_ID` overrides it). Optional: `FEED_PORT` (8788), `FEED_MCP_PORT` (8789; `off` disables it), `FEED_DB_PATH` (default `~/.nectar/feed.sqlite`). All variables: [services/feed/README.md](services/feed/README.md).
- MCP tools: `get_exit_capacity`, `preview_borrow`, `list_quotes`, `explain_limit`, `quote_capacity`, `open_protected_stock_loan` (returns an unsigned call); `get_note` and `build_self_settle` return `not_available`. Arguments take `symbol`, e.g. `get_exit_capacity {"symbol":"NVDAx"}`. Client registration: [services/feed/README.md, "Register the MCP server"](services/feed/README.md#register-the-mcp-server). A raw HTTP client must send `accept: application/json, text/event-stream`.
- The keeper and the x402 server need testnet keys, which live in the OS keychain or `0600` files under `~/.nectar/`; see [services/keeper/README.md](services/keeper/README.md) and [services/x402/README.md](services/x402/README.md).
- How this was built (process notes): [docs/process/](docs/process/).

## Architecture
![architecture](docs/img/architecture.svg)
- `nectar-core` (Rust, near-sdk 5.30.1) holds all state: quotes, positions, the pool and an O(1) fee index. The deployment is `nectar-core-v2.nectar.testnet`.
- Tokens enter only through `ft_transfer_call` → `ft_on_transfer(msg)`. Any token other than USDC or a configured collateral is refused.
- The limit is `B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))`: committed quotes `Q_c`, Reserve `R_c`, DEX depth `D_c`, haircut `h_c`, and an oracle price checked for freshness and against a 1,500 bps band. Each loan must fit its LTV, and total debt must fit the asset's shared capacity. When the market is closed, `D_c` is 0 and a larger haircut applies.
- The keeper holds a function-call key only. It passes ids and never prices or signs.
- On pre-liquidation the contract asks the hash-pinned OutLayer program for the discount and clamps it to `[0, max_discount_bps]`; if the call fails, it settles at the cap. The same program reads the Solana vault to confirm remote deposits.
- For remote collateral the contract builds the release or settlement message itself and gets a signature over the raw bytes from Chain Signatures, one derived key per position. The Solana program `nectar_vault` verifies that signature before it releases or settles collateral.

![settlement](docs/img/settlement.svg)

## Prior work (disclosure)
Before the hackathon, Kunal researched exit-liquidity gaps for tokenized stocks under Nectar Network (an October 2026 product brief and
Stellar Community Fund #42 material). That research and the Nectar brand assets (logo, colour tokens) are the baseline. Nectar Network's separate Stellar testnet
product shares no code with this repository. All code, contracts, programs, services and sites here were written during the hackathon window, starting 2026-11-09.

## Libraries and services
Contracts and programs: near-sdk 5.30.1, near-workspaces 0.24.0 (sandbox tests), anchor-lang 0.32.1 (Solana vault), Foundry (EVM vault).
TypeScript: near-api-js 7.4.0, @solana/kit 8.6.0, viem 2.57.17, @hot-labs/near-connect 0.12.0, Next.js 16.4.5, React 19.3.1, Docusaurus 3.10.2, @modelcontextprotocol/sdk 1.32.2,
@x402/core and @x402/near 2.18.0, @fastnear/x402 2.5.0, @defuse-protocol/one-click-sdk-typescript 0.1.26, @phala/dcap-qvl 0.7.1, @noble/curves and @noble/hashes 2.2.0, zod 4.6.7, three 0.160.0.
Services used: NEAR testnet RPC (FastNear), OutLayer, the NEAR Chain Signatures signer `v1.signer-prod.testnet`, the 1Click API (dry quotes only), Solana devnet RPC, Vercel, Railway.

## Team
Kunal (Nectar Network).

## License
MIT © 2026 Nectar Network
