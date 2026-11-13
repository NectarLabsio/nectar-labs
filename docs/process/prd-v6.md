# Nectar Labs PRD v6 — Production Specification (NEAR + Solana)

Nov 9, 2026 · @Kunal Drall

Nectar Labs turns time-committed, escrowed buyer quotes into higher borrowing limits for tokenized stocks and other thin-exit collateral. This document is the production specification and the single input for the hackathon build; every integration fact in it was read from its source on 2026-11-09 or is marked for a gate.

## 0. How to read this document

This is v6, the first version where every contract, TEE and signer claim was checked against source and where the scope is cut to what five days can ship. Three companion artifacts carry the rest: the Build Prompt (Claude Code orchestration), the support-file bundle (CLAUDE.md, agents, FACTS.md, docs-site skeleton) and the landing-page reference build.

**Status tags used throughout**

| Tag | Meaning |
| --- | --- |
| VERIFIED | Read from the primary source on 2026-11-09; the URL is in section 21 and the value is in `docs/FACTS.md` |
| GATE Gn | Known shape, exact value or behaviour confirmed by a numbered pre-flight gate in the Build Prompt before any code depends on it |
| HUMAN | Needs Kunal: a key, a payment, a signature, a public post. Build continues around a placeholder until he is available |
| P0 / P1 / P2 | Must ship by 2026-11-14 / ships if P0 is green by Nov 12 night / only with time left |
| PROD | Production design that is specified here but not built in the hackathon window |

**What changed from v5**

- The `v1.signer` request is `{ path, payload_v2: { Ecdsa: <64 hex> } | { Eddsa: <hex> }, domain_id }` with a 1-yoctoNEAR deposit (VERIFIED from `near/mpc` source at commit b5bafa3, 2026-11-09). v5 had this right in the diagram; v4 did not.
- Pyth's own docs say Pyth Core no longer supports NEAR, while NEAR's docs still list `pyth-oracle.near` and now list an OutLayer-run `price-oracle.near` with Pyth-compatible views. Oracle choice moves to a gate (section 8).
- OutLayer limits are hard: stdout at most 900 bytes, 60 s, outbound HTTP only on `wasm32-wasip2`. The quoter's output schema is cut to fit (section 7).
- The pinned-WASM check moves from the WASM's own stdout (meaningless) to `source.version_key` / `WasmUrl.hash` on the request (section 7).
- Chains are fixed at NEAR + Solana. Robinhood Chain, Base, Arc, Arbitrum and Stellar are roadmap only (section 18).
- Tracks: `defi`, `security`, `privacy`; `agents` only if the Feed MCP server ships. `thesis` is dropped: it is judged on reproducible NEAR data, and our figures are projections.
- Pre-hackathon research and the Nectar Network design system are disclosed as baseline under HACKATHON.md Q-002 and Q-005.

**Naming.** Brand: Nectar Labs. Protocol modules keep the studio's mathematician names: **Pappus** (escrow and settlement), **Cramér** (borrowing limits), **Macaulay** (pricing for collateral that redeems later; PROD). Products: **Nectar Feed**, **Nectar Keepers**, **Nectar Reserve** (PROD), **Nectar Route** (PROD).

## 1. Product on one page

**Consumer line:** Borrow against stocks without liquidations. **B2B line:** Guaranteed buyers for loan collateral.

**The problem.** Lending protocols cap LTV on tokenized stocks, principal tokens and RWAs because the exit is revocable: DEX and prop-AMM depth disappears on weekends and in crashes. Every loan assumes a buyer, and on a calm day nobody checks.

**The mechanism.** Buyers (market makers, prop AMMs, funds) post *funded* quotes: USDC escrowed in the Pappus contract with a notice period. A lending market may then set each asset's borrowing limit at the lower of the oracle limit and the *recoverable value*: committed quotes plus Nectar Reserve plus verified DEX depth, minus a haircut. Borrowers pay a rate premium on the extra limit; the premium pays buyers a commitment fee. When a position goes bad and the DEX is too thin, Pappus settles against the committed quotes in one transaction.

**Why NEAR.** The escrow, limits and settlement rules live in one NEAR contract. Chain Signatures let that contract authorize collateral release on Solana without a bridge or a custodian. OutLayer runs the buyer's private pricing model in a TEE so the inventory curve never leaves the enclave. NEAR Intents supplies verifiable public depth (`dry: true` quotes) and the USDC rail.

**What ships for NEAR HACKATHON (by 2026-11-14 23:59 UTC)**

| Tier | Scope |
| --- | --- |
| P0 | `nectar-core` on NEAR testnet with real NEP-141 custody (mock USDC, mock NVDAx): fund quotes, two-step notice withdrawal, O(1) fee accumulator, lending pool, borrow up to the Cramér limit, keeper-triggered pre-liquidation that moves real tokens, function-call-key keeper, owner-only risk params. Web app (Nectar Network design): landing, Feed, Post a quote, Curator console, Keepers, Talk to us. Docs site. `pnpm demo:testnet` under 2 minutes. |
| P1 | OutLayer quoter (hash-pinned `wasm32-wasip2`) returning `clearing_discount_bps` from secret inventory; `price-oracle.near` read with sanity band; 1Click dry-quote depth; Nectar Feed MCP server; CSV/JSON export. |
| P2 | Solana leg: `v1.signer` Ed25519 signature over a contract-built preimage, Solana devnet program releasing mock xStock collateral after Ed25519-precompile verification; NEAR AI Cloud copilot with `provider_tee` signature check. |
| PROD | Mainnet, real xStocks, Reserve quoting engine, Macaulay, Morpho/Euler/Aave modules, Robinhood Chain and Base legs, audits, bonded keeper slashing, Launch Cover. |

**The demo moment.** Friday evening, markets closed. NVDAx drops 9% on a thin pool. A keeper flags the position. The DEX would fill at a 14% discount; the committed buyer's escrowed USDC repays the loan at 1.5%, the collateral moves to the buyer, and Nectar Feed shows the remaining committed capacity. Then a keeper with a stolen key tries to sign an arbitrary payload and the contract refuses: it only signs what it built itself.

**Non-goals for the hackathon.** Fiat, cash-out, non-USDC quotes, more than two chains, a governance token, a mobile app, real-money mainnet positions.

## 2. Users, jobs and journeys

Five actors touch the system; two of them (buyer and curator) are the paying customers, and the agent is the distribution channel.

| Actor | Job to be done | Enters through | Pays / earns |
| --- | --- | --- | --- |
| Buyer (market maker, prop AMM, fund) | Get paid to stand behind loans without selling into a crash | Post a quote page or API | Earns commitment fees in USDC; receives collateral at a known discount on settlement |
| Curator / lender / protocol | Raise caps on thin-exit collateral safely | Curator console; later a Morpho/Euler/Aave module | Earns the limit premium on the extra borrowing |
| Borrower (via an app, broker or agent) | Borrow more against tokenized stock without a liquidation cliff | Partner app or the demo borrow page | Pays the base rate plus a premium on the extra limit |
| Keeper operator | Earn by flagging at-risk positions and triggering routes | Keepers page, `keeper` binary | Earns a keeper fee per executed pre-liquidation; bonds USDC (PROD) |
| Agent / risk manager | Read committed exit capacity before sizing a loan | Nectar Feed views, REST, MCP server | Free reads; premium feeds PROD |

**Journeys that must work end to end in the demo**

1. **Buyer funds a quote.** Connect wallet → pick collateral (NVDAx) → size 50,000 USDC, max discount 250 bps, notice 7 days, Solana recipient → `ft_transfer_call` of USDC to `nectar-core` with `FundPappusQuote` → quote appears on Feed; Q\_c rises; limit rises.
2. **Borrower opens a position.** Connect → lock 10,000 NVDAx by `ft_transfer_call` with `LockCollateralAndBorrow` → receives USDC up to B\_c, minus the limit premium → position on the console.
3. **Keeper pre-liquidates.** Oracle price falls (demo: owner moves the mock oracle) → keeper sees LTV above `pre_liq_ltv_bps` → calls `trigger_preliquidation(position_id)` with its function-call key → contract requests the OutLayer quote (P1) or uses `max_discount_bps` (P0) → debt repaid from the buyer's escrow, collateral delivered, events emitted, Feed updates.
4. **Buyer exits.** `initiate_quote_withdrawal` → Q\_c drops at once so new loans shrink first → after the notice period `complete_quote_withdrawal` returns principal plus accrued fees.
5. **Curator sizes capacity.** Console shows per-asset Q\_c, R\_c, D\_c, haircut, session state and the resulting B\_c, with the formula expanded.
6. **Agent reads the Feed.** `get_exit_capacity("NVDAx")` over RPC or the MCP tool returns committed, reserve, depth, haircut and limit in one call.

**Journeys specified for production only.** Keeper bonding and slashing, Reserve quoting, Macaulay pricing for PTs, Morpho/Euler/Aave module integration, multi-chain collateral on Robinhood Chain and Base, KYB for buyers above a size threshold.

## 3. Market facts registry

None of the market figures below were re-opened by me; they come from your FACTS file dated 2026-11-09 and are carried here as **claimed**. The README may only use a figure after the build agent opens the cited page and records the exact value and retrieval time in `docs/FACTS.md` (gate G-F). A figure that cannot be re-found is removed, not softened.

| Claim | Value as filed | Cited source | Status | Where it is used |
| --- | --- | --- | --- | --- |
| NEAR Intents cumulative volume / TVL | $37.006B cumulative; $189.13M TVL | defillama.com/protocol/near-intents | Claimed, re-verify | Landing hero stat, README |
| NEAR Intents fees Q3 2026 | $14.43M swap fees; $3.07M gross profit | DefiLlama income statement | Claimed, re-verify | Investor appendix only |
| Rhea Finance TVL | $235.99M, #1 on NEAR | defillama.com/chain/near | Claimed, re-verify | Why-NEAR section |
| RWA on-chain AUM vs DeFi use | $33.6B AUM, $4.09B active in DeFi (13.5%) | defillama.com/rwa | Claimed, re-verify | Problem section |
| xStocks on Solana | \~$196M supply, >$182M on Solana (\~93%) | solana.com/news/case-study-xstocks | Claimed, re-verify | Why-Solana section |
| Robinhood Chain stock loans and Rialto weekend depth | $1.70M loans / $3.91M collateral; $8.31M weekday vs $136K weekend (Oct 24–25) | Nectar product brief (Oct 26) citing Steakhouse, Aavescan, ChainCatcher | Baseline research, disclose under Q-002 | Problem section, labelled as pre-hackathon research |
| cirBTC on Morpho vs DEX depth | $274.0M collateral vs ≈$23.9M DEX (Oct 25, 2026, Morpho API) | Nectar Network site copy | Baseline research | Landing exit-gap card |
| Rhea Finance oracle exploit | \~$7.6M lost, April 2026, fake-token oracle manipulation | halborn.com explainer | VERIFIED (opened 2026-11-09) | Security section: why only whitelisted collateral and no DEX-derived valuation |

**Rules for figures in anything judges read**

- Every number carries its date and source inline, in the Nectar Network house style ("Oct 25, 2026 · Morpho API").
- Projections (the revenue chart in v5) are labelled "illustrative" and never appear in the README or the submission text.
- The `thesis` track is not entered, so no figure needs to be reproducible from the NEAR BigQuery dataset.

**Competitive position, stated plainly.** Nobody sells committed, escrowed exit liquidity as a borrowing-limit input today. The adjacent players are liquidation engines (Morpho pre-liquidations, Aave Umbrella), prop AMMs quoting tokenized stocks during market hours, and risk curators (Steakhouse, Gauntlet, LlamaRisk) who set caps by hand. Nectar is an input to all three, not a replacement; the risk is that a large curator builds the same escrow internally. The defence is being the neutral venue where many buyers compete on discount.

## 4. Mechanism design

All amounts are USDC with 6 decimals (`_e6`), basis points use a 10,000 denominator, and every formula below is integer arithmetic in the contract, rounding against the borrower.

### 4.1 Pappus: funded quotes

A quote is a buyer's promise to buy up to `committed_usd_e6` of one collateral at no worse than `max_discount_bps` below the oracle price, backed by USDC held in the contract. Funding is the NEP-141 `ft_transfer_call` of USDC with `msg = FundPappusQuote{...}`; the contract credits the quote only when `predecessor_account_id == usdc_token`. One dollar backs one live quote: escrow is never rehypothecated.

Exit is two-step. `initiate_quote_withdrawal` starts `notice_period_ns` (minimum 7 days) and immediately subtracts the quote from the asset's `active_committed_q_usd_e6`, so new borrowing shrinks first while existing positions stay backed. `complete_quote_withdrawal` runs after the unlock time, zeroes the quote, then transfers principal plus fees. A quote can be consumed by a settlement during its notice period; what is consumed is replaced by collateral delivered to the buyer's recipient.

### 4.2 Cramér: the borrowing limit

```latex
B_c = \min\big(\mathrm{LTV}_c \cdot V_c,\; (1-h_c)\,(Q_c + R_c + D_c)\big)
```

| Term | Source | Update |
| --- | --- | --- |
| V\_c | collateral units × oracle price | per read (section 8) |
| LTV\_c | `max_nectar_ltv_bps`, owner-set | governance |
| Q\_c | `active_committed_q_usd_e6` | O(1) on fund / initiate-withdraw / settle |
| R\_c | `nectar_reserve_usd_e6` | owner-set; PROD: Reserve engine |
| D\_c | `verified_dex_depth_usd_e6` | quoter (P1) or owner (P0); forced to 0 when `market_session_open == false` |
| h\_c | `base_haircut_bps` in session, `weekend_haircut_bps` otherwise | owner-set |

A borrower may draw `borrow_usd_e6 ≤ B_c` and `≤ available_lending_usdc_e6`. The static limit `base_ltv_bps × V_c` is what the market would lend without Nectar; the amount above it carries `limit_premium_bps`, charged up front from proceeds in the hackathon build (PROD: accrued per block).

### 4.3 Fee distribution in O(1)

MasterChef-style accumulator per collateral: on each premium payment, `acc_fee_per_dollar_e18 += premium_buyer_share_e6 × 1e18 / active_committed_q_usd_e6`. Each quote stores `fee_debt_e18`; claimable fees are `committed × acc / 1e18 − fee_debt`. Split of the premium: 70% buyers (pro rata by committed size), 20% lenders, 10% protocol treasury; the split is owner-set and shown in the console. No loop over quotes anywhere.

### 4.4 Pre-liquidation waterfall

1. Keeper flags: `debt / V_c > pre_liq_ltv_bps` (position-level, set at open, bounded by owner min/max).
2. Route check: if `D_c` at the current session can absorb the seize amount at a better discount than the best quote, the DEX path is used (PROD; hackathon records the comparison and takes Pappus).
3. Pappus: quotes for the asset are consumed in ascending `max_discount_bps` (P0) or at the OutLayer `clearing_discount_bps ≤ max_discount_bps` (P1). Seize amount: `repay_usd_e6 × (1 + keeper_fee_bps) / (price × (1 − discount))`.
4. Debt is repaid from the buyer's escrow; collateral units move to the buyer (on NEAR by `ft_transfer`; on Solana by the signed settlement message, section 9); the borrower keeps the remainder.
5. Nectar Reserve fills last (PROD).

### 4.5 Avellaneda–Stoikov clearing discount (P1, inside OutLayer)

```latex
\delta_{clear} = \min\Big(\mathrm{max\_discount\_bps},\; \mathrm{regime\_vol\_bps} + \frac{q_i \cdot \gamma_i \cdot \sigma_{bps}}{10^{6}}\Big)
```

`q_i` (inventory utilisation, bps) and `γ_i` (risk aversion, bps) are the buyer's secrets in OutLayer; `σ_bps` and `regime_vol_bps` come from the price history the quoter fetches. A light inventory clears cheaper than the public ceiling; the buyer's curve never leaves the enclave. The contract clamps whatever comes back to `[0, max_discount_bps]`, so a faulty quoter can only make the buyer pay more, never the borrower.

## 5. System architecture

One NEAR contract holds every rule and every dollar of escrow; everything else either feeds it (quoter, oracle, keeper) or reads it (web, Feed, MCP, agents), and the only thing that leaves NEAR is a signature.

&#91;embedded content: system architecture · actors, web app, NEAR testnet, off-chain services, Solana devnet\]

Every write reaches nectar-core through a token's `ft_transfer_call`; the contract alone decides prices (through the quoter and the oracle), builds the settlement message and asks the MPC signer for an Ed25519 signature. The keeper only passes position ids and relays what the chain already signed to Solana.

| Component | Runtime | Language / versions (VERIFIED 2026-11-09) | Trust it holds |
| --- | --- | --- | --- |
| `nectar-core` | NEAR testnet (`.testnet`), mainnet later | Rust, `near-sdk` 5.30.1, built with `cargo-near` 0.23.0, Rust 1.95+ | Escrow, lending pool, limits, settlement, event log |
| `usdc-mock`, `nvdax-mock` | NEAR testnet only | NEP-141 reference, 6 decimals | None; replaced by real tokens on mainnet |
| OutLayer quoter | `outlayer.testnet` / `outlayer.near`, Intel TDX | Rust → `wasm32-wasip2`, `wasi-http-client` for HTTP | Buyer secrets; returns a clamped discount and depth |
| Price source | `price-oracle.testnet` (OutLayer, Pyth-compatible) or `pyth-oracle.testnet` | view `get_price(price_identifier)` | Spot price; contract applies a sanity band (G5) |
| `v1.signer-prod.testnet` / `v1.signer` | NEAR MPC network | `sign({path, payload_v2, domain_id})`, 1 yoctoNEAR | Produces the Ed25519 signature the Solana program trusts |
| `nectar_vault` | Solana devnet, mainnet later | Anchor 0.32.1, `@solana/kit` 8.6.0 off-chain | Holds collateral SPL tokens; releases only on a valid NEAR-derived signature |
| Keeper | Any host; demo runs locally | Node 22+, `near-api-js` 7.4.0 | One function-call key; cannot move funds |
| Web app | Vercel or static host | Next.js 15, React 19, Nectar design tokens | No keys; wallet-selector in browser |
| Feed MCP server | Local / Railway | Node, `@modelcontextprotocol/sdk` (version at G9) | Read-only views |
| Docs site | Static host | Docusaurus 3.10.2, Node 20+ | None |
| NEAR Intents | mainnet only, `https://1click.chaindefuser.com` | `dry: true` quotes, `X-API-Key` optional | Public depth figure D\_c |
| NEAR AI Cloud | `https://cloud-api.near.ai/v1` | OpenAI-compatible; `provider_tee` signatures | Copilot text only; never a number the contract uses |

**Call graph (who calls whom)**

- Buyer / borrower / lender wallets → `usdc-mock.ft_transfer_call` → `nectar-core.ft_on_transfer`.
- Owner → `nectar-core.upsert_collateral`, `set_oracle`, `set_reserve`, `set_fee_split`, `pause`.
- Keeper (function-call key) → `nectar-core.trigger_preliquidation` → (P1) `outlayer.request_execution` → callback `on_quoter_result` → `usdc-mock.ft_transfer` (repay) + `nvdax-mock.ft_transfer` (deliver) or (P2) `v1.signer.sign` → callback `on_signature` → event with signature for the keeper to relay to Solana.
- Web, Feed, MCP, agents → view methods only.
- Quoter (inside TDX) → Hermes or `price-oracle` RPC, 1Click `dry: true`, Jupiter quote (Solana depth fallback, G6).

**Data placement.** On-chain: collateral configs, quotes, positions, pool balances, accumulators, events. Off-chain (SQLite in the keeper and web API): event index, quote history for charts, dry-quote snapshots, OutLayer execution IDs for attestation links. Nothing personal is stored anywhere; the "Talk to us" form posts to a hosted form provider (HUMAN: which one) or to email.

**Environments.** `local` (near-sandbox + solana-test-validator), `testnet` (demo, judges), `mainnet` (PROD; nothing deployed in the hackathon). `NEAR_NETWORK` and `SOLANA_CLUSTER` select everything; no environment-specific code paths.

## 6. `nectar-core` contract specification

One contract, `near-sdk` 5.30.1, no loops over user data in any public method, and nothing the keeper sends is ever signed or priced without the contract rebuilding it from its own state. Collection type names (`near_sdk::store::LookupMap`, `IterableMap`) are confirmed against the 5.30.1 docs at G1 before coding.

### 6.1 Roles

| Role | Account | May call |
| --- | --- | --- |
| `owner` | multisig later; deployer key in the hackathon | `upsert_collateral`, `set_oracle_source`, `set_reserve`, `set_dex_depth` (P0 only), `set_session`, `set_fee_split`, `set_keeper`, `set_quoter_pin`, `pause` / `unpause`, `fund_gas_reserve` |
| `keeper` | `keeper.nectar.testnet`, one function-call key scoped to `trigger_preliquidation`, `relay_settlement_result` | those two methods, with 0 deposit |
| `usdc_token`, collateral tokens | NEP-141 contracts | `ft_on_transfer` (predecessor check) |
| `quoter_account` | `outlayer.testnet` | only through the promise callback `on_quoter_result` (`#[private]`) |
| `mpc_signer` | `v1.signer-prod.testnet` | only through `on_signature` (`#[private]`) |
| anyone |  | views, `initiate_quote_withdrawal` / `complete_quote_withdrawal` on their own quotes, `repay`, `claim_fees` |

### 6.2 State (spec; types confirmed at G1)

```rust
pub struct Nectar {
  owner: AccountId, paused: bool,
  usdc_token: AccountId, mpc_signer: AccountId, quoter_account: AccountId,
  quoter_project_id: String, quoter_version_key: String, // sha256 of the pinned wasm
  oracle: AccountId, oracle_max_age_ns: u64, oracle_band_bps: u16,
  keeper: AccountId, keeper_fee_bps: u16,
  fee_split: FeeSplit { buyers_bps: u16, lenders_bps: u16, treasury_bps: u16 },
  available_lending_usdc_e6: u128, treasury_usdc_e6: u128, gas_reserve_yocto: u128,
  next_quote_id: u64, next_position_id: u64,
  collaterals: IterableMap<String, CollateralConfig>,
  quotes: LookupMap<u64, Quote>, quotes_by_collateral: LookupMap<String, Vec<u64>> /* bounded, see 6.6 */,
  positions: LookupMap<u64, Position>,
  pending_settlements: LookupMap<u64, PendingSettlement>, used_nonces: LookupSet<u64>,
}
pub struct CollateralConfig { symbol, token: AccountId, decimals: u8, price_feed_id: String,
  base_ltv_bps, max_nectar_ltv_bps, base_haircut_bps, weekend_haircut_bps, limit_premium_bps: u16,
  pre_liq_min_bps, pre_liq_max_bps: u16, market_session_open: bool,
  oracle_price_usd_e6: u128, oracle_updated_ns: u64,
  verified_dex_depth_usd_e6: u128, nectar_reserve_usd_e6: u128,
  active_committed_q_usd_e6: u128, acc_fee_per_dollar_e18: u128,
  remote_chain: Option<RemoteChain { chain_id: String /* "solana-devnet" */, vault_program: String, mpc_domain_id: u32 /* 1 */ }> }
pub struct Quote { id, buyer: AccountId, collateral: String, committed_usd_e6, remaining_usd_e6: u128,
  max_discount_bps: u16, notice_period_ns: u64, unlock_ns: Option<u64>, buyer_remote_recipient: Option<String>,
  secrets_profile: Option<String>, fee_debt_e18: u128, claimable_fees_usd_e6: u128 }
pub struct Position { id, borrower: AccountId, collateral: String, units: u128, debt_usd_e6: u128,
  pre_liq_ltv_bps: u16, opened_ns: u64, remote_path: Option<String>, nonce: u64, state: Open|Settling|Closed }
```

### 6.3 `ft_on_transfer(sender_id, amount, msg) -> PromiseOrValue<U128>`

Panics unless the predecessor is `usdc_token` or a configured collateral token. `msg` is JSON, one of:

| Variant | Predecessor must be | Effect | Returns |
| --- | --- | --- | --- |
| `SupplyLendingLiquidity` | `usdc_token` | `available_lending_usdc_e6 += amount`; lender share recorded | `0` |
| `FundPappusQuote{collateral, max_discount_bps, notice_period_ns, buyer_remote_recipient?, secrets_profile?}` | `usdc_token` | creates `Quote`, `fee_debt = committed × acc / 1e18`, `Q_c += amount`; emits `quote_funded` | `0` |
| `TopUpQuote{quote_id}` | `usdc_token` | settles fees to claimable, then adds to committed and Q\_c | `0` |
| `LockCollateralAndBorrow{collateral, borrow_usd_e6, pre_liq_ltv_bps, remote_path?}` | `collaterals[c].token` | computes B\_c (fresh oracle required, section 8), requires `borrow ≤ B_c` and `≤ pool`; premium = `max(0, borrow − base_ltv×V) × limit_premium_bps / 10000`; distributes premium; `ft_transfer(borrower, borrow − premium)` with 1 yocto; records `Position` | `0`, or full amount back on any failure before state changes |
| `Repay{position_id}` | `usdc_token` | reduces debt; excess returned via `PromiseOrValue` value | unused amount |
| anything else |  | returns the full amount (refund) | `amount` |

All state changes happen before any cross-contract call; the transfer callbacks only roll back on failure (checks-effects-interactions).

### 6.4 Quote lifecycle

- `initiate_quote_withdrawal(quote_id)`: buyer only; `unlock_ns = now + notice_period_ns`; settles fees; `Q_c −= remaining`; emits `quote_exiting`.
- `complete_quote_withdrawal(quote_id)`: buyer only; `now ≥ unlock_ns`; zero the quote, then `ft_transfer(buyer, remaining + claimable)`; callback restores on failure.
- `claim_fees(quote_id)`: any time; pays `claimable_fees_usd_e6`.

### 6.5 Settlement

- `trigger_preliquidation(position_id)`: keeper only, `attached_deposit == 0`, not paused. Requires fresh oracle, `debt × 10000 > V_c × pre_liq_ltv_bps`. Sets `state = Settling`, picks the quote set (ascending `max_discount_bps`, bounded by `MAX_QUOTES_PER_SETTLEMENT = 8`). **P0:** settles at each quote's `max_discount_bps`. **P1:** calls `outlayer.request_execution` with `source: {Project:{project_id, version_key: quoter_version_key}}`, `input_data` = JSON of symbol, oracle price, feed id, session, quote ids and their secret profiles, `resource_limits: {max_instructions, max_execution_seconds}`, deposit from `gas_reserve_yocto` sized by a prior `estimate_execution_cost` view (G4), then `.then(on_quoter_result)`.
- `on_quoter_result(position_id)` `#[private]`: parses stdout JSON (≤ 900 bytes), clamps `clearing_discount_bps` to `[0, max_discount_bps]`, applies the oracle band, then: NEAR collateral → `usdc` stays in contract as repayment (escrow debited, pool credited), `collateral_token.ft_transfer(buyer, seized_units)`; Solana collateral → builds the preimage (section 9), `sha256`, calls `mpc_signer.sign({path: position.remote_path, payload_v2: {Eddsa: hex(preimage_bytes)}, domain_id: 1})` with `SIGN_DEPOSIT_YOCTONEAR` (1) from the gas reserve and gas from `config.sign_call_gas_attachment_requirement_tera_gas` read at G3, `.then(on_signature)`.
- `on_signature(position_id)` `#[private]`: stores `PendingSettlement{preimage_hex, signature_hex, derived_pubkey, expires_ns}` and emits `settlement_signed`; `used_nonces.insert(nonce)`.
- `relay_settlement_result(position_id, solana_tx_sig)`: keeper records the Solana transaction; closes the position. (Trust note: the keeper's claim is advisory; finality on Solana is verified off-chain by the Feed indexer, PROD: light-client or oracle attestation.)
- A quoter failure or timeout falls back to P0 behaviour (`max_discount_bps`) and emits `quoter_fallback`, so a down TEE never blocks a rescue.

### 6.6 Bounded iteration

`quotes_by_collateral[c]` is capped at 64 live quotes per asset; funding beyond the cap is refunded. Settlement touches at most 8 quotes. Fee maths is O(1). `IterableMap` over collaterals is only used in views with `from_index, limit`.

### 6.7 Views (what the Feed and MCP read)

`get_collateral(symbol)`, `list_collaterals(from, limit)`, `get_exit_capacity(symbol) -> {q, r, d, haircut_bps, session_open, oracle_price, oracle_age_s, limit_bps_effective}`, `get_quote(id)`, `list_quotes(symbol, from, limit)`, `get_position(id)`, `list_positions(from, limit)`, `get_pool() -> {available, utilised, treasury}`, `get_pending_settlement(position_id)`, `preview_borrow(symbol, units, borrow) -> {b_c, premium, ok, reason}`.

### 6.8 Events (NEP-297)

`EVENT_JSON:{"standard":"nectar","version":"1.0.0","event":...}` for `quote_funded`, `quote_topped_up`, `quote_exiting`, `quote_withdrawn`, `position_opened`, `repaid`, `preliq_triggered`, `quoter_result`, `quoter_fallback`, `settled_near`, `settlement_signed`, `settlement_relayed`, `fees_claimed`, `collateral_upserted`, `paused`.

### 6.9 Storage and gas

Storage is 1E19 yoctoNEAR per byte (VERIFIED). Quotes and positions are \~300 bytes each; the contract pays storage for them from the deployer balance in the hackathon (PROD: storage deposit per account, NEP-145 style). Every cross-contract call carries a static gas budget measured in the sandbox and recorded in `FACTS.md` (G2).

### 6.10 Tests (must be green before any service code)

Unit: every panic path in 6.3–6.5, fee accumulator maths against a reference loop, haircut switch, nonce reuse, cap behaviour. Sandbox integration (near-sandbox, chosen at G1): fund → borrow at limit → price drop → keeper pre-liq → balances match a spreadsheet model in `tests/model.csv`; buyer exit through notice; keeper with a full-access key is refused; keeper calling `ft_transfer` directly fails; paused contract refuses money paths.

## 7. OutLayer quoter (P1)

The quoter is a hash-pinned Rust binary that runs inside Intel TDX on OutLayer, reads the buyer's private inventory parameters from OutLayer secrets, and returns one small JSON object the contract clamps before use. Facts below are VERIFIED from OutLayer's docs on 2026-11-09.

**Platform facts that shape the design**

| Fact | Value | Consequence |
| --- | --- | --- |
| Entry | `outlayer.testnet` / `outlayer.near` `request_execution` | Contract calls it in a promise, callback gets stdout |
| Source pinning | `source: {Project:{project_id, version_key: <wasm sha256>}}` or `{WasmUrl:{url, hash, build_target}}`; worker refuses bytes that don't match | Pin by `version_key` in contract state; no self-reported hash |
| `resource_limits` | required, even `{}`; `max_instructions` default 1e9 (max 5e11), `max_memory_mb` default 128, `max_execution_seconds` default 60 (max 180) | Set explicitly; record in FACTS |
| Output | stdout, **≤ 900 bytes**, JSON, UTF-8, `stdout().flush()` | Compact schema below |
| Input | `input_data` JSON on stdin; `NEAR_SENDER_ID`, `NEAR_BLOCK_HEIGHT` env | Contract passes everything the WASM needs |
| Secrets | `secrets_ref: {profile, account_id}`; injected as env vars; CKD for keys nobody holds | One profile per buyer, owned by the buyer's account |
| HTTP | `wasm32-wasip2` only, via `wasi-http-client`; no sockets, no files | Target wasip2; HTTP for Hermes / Jupiter / 1Click |
| Cost | dynamic; `estimate_execution_cost(resource_limits, input_len)` view; unused deposit refunded to `payer_account_id` | Contract reads the estimate at G4 and funds from `gas_reserve_yocto` |
| Attestation | TDX quote per execution, viewable at app.outlayer.ai/executions | README says "verifiable off-chain"; the callback itself carries stdout only |
| Publish | `cargo build --target wasm32-wasip2 --release`, `outlayer upload`, `outlayer deploy <project> <FastFS URL>`; testnet FastFS `test.fastfs.io` | CI step `pnpm quoter:publish` prints the sha256 that goes into `set_quoter_pin` |

**Input (stdin JSON)**

```json
{"v":1,"symbol":"NVDAx","feed_id":"<hex>","oracle_price_usd_e6":"182340000","oracle_updated_ns":"...",
 "session_open":false,"seize_usd_e6":"12000000000",
 "quotes":[{"id":7,"max_discount_bps":250,"remaining_usd_e6":"50000000000"}],
 "depth":{"oneclick_asset_in":"<assetId>","oneclick_asset_out":"<assetId>","jupiter_mint":"<mint>"}}
```

**Output (stdout JSON, ≤ 900 bytes)**

```json
{"v":1,"symbol":"NVDAx","price_e6":"182340000","src":"hermes|oracle",
 "depth_e6":"0","depth_src":"1click|jupiter|none","session_open":false,
 "vol_bps":420,"fills":[{"id":7,"disc_bps":65}],"ts":1762700000}
```

At most 8 fills, ids as integers, all amounts as strings: this stays under 900 bytes with margin (measured at G4).

**What the WASM does, in order**

1. Parse stdin; refuse if `v != 1`.
2. Fetch the price: Hermes `GET /v2/updates/price/latest?ids[]=<feed>` (public endpoint confirmed at G5; bearer key from secrets if required) and compare with the contract-supplied oracle price; if they differ by more than `oracle_band_bps`, report `src:"oracle"` and the contract's price.
3. Fetch depth: 1Click `POST /v0/quote` with `dry: true`, `EXACT_INPUT`, sell `seize` units of the collateral for USDC on the destination chain, read `amountOutUsd`; if the asset is not on `GET /v0/tokens` (xStocks are not, as of 2026-11-09), try the Jupiter quote API on Solana (G6); else `depth_e6: "0"`.
4. For each quote id, read `MM_<id>_Q_BPS` and `MM_<id>_GAMMA_BPS` from env (the buyer's secrets profile), compute the Avellaneda discount (section 4.5), clamp to `max_discount_bps`.
5. Print one JSON line and flush.

**Determinism.** Same inputs and same secrets give the same output except for live fetches; the contract never depends on byte-identical reruns, only on the clamp and the band. The WASM is open source; the secrets are not.

**Honest limits.** The contract cannot verify the TDX quote itself (no on-chain verifier today). It trusts `outlayer.testnet` to run the pinned hash; the README says so. The buyer, not the borrower, bears the quoter's risk, because the clamp only ever lowers the discount.

## 8. Oracle and depth design

The sources conflict, so the oracle is chosen at a gate and the contract defends itself with a freshness check and a sanity band either way.

**What the sources say (2026-11-09)**

| Source | Says |
| --- | --- |
| docs.near.org/primitives/oracles | `pyth-oracle.near` / `pyth-oracle.testnet` with `get_price(price_identifier)` (view) and `update_price_feeds(data)` fed from Hermes `hermes.pyth.network` (mainnet) / `hermes-beta.pyth.network` (testnet); and an OutLayer-run `price-oracle.near` / `price-oracle.testnet` "implementing Pyth-compatible view methods", migratable by changing one address |
| docs.pyth.network | "Pyth Core also no longer supports ... NEAR"; contract addresses removed. Hermes REST exists at `https://pyth.dourolabs.app/hermes` and Pyth Pro requires a bearer API key |

**Gate G5 decides**, in this order: (1) `price-oracle.testnet.get_price(<feed>)` returns a fresh price for an equity feed → use it; (2) else `pyth-oracle.testnet` returns one → use it and note the deprecation; (3) else deploy `oracle-mock.testnet` that the owner updates from Hermes through a signed keeper job, and say so plainly in the README. Whatever wins, the contract stores `oracle: AccountId` and `price_feed_id` per collateral and reads through one adapter.

**Contract-side defences (all tiers)**

- Freshness: refuse to borrow or settle if `now − publish_time > oracle_max_age_ns` (default 120 s in session, 24 h closed session with the weekend haircut applied).
- Sanity band: a new price more than `oracle_band_bps` (default 1,500 bps) from the last accepted one is rejected and emits `oracle_rejected`; the owner can override with a two-step `propose_price`/`apply_price` (PROD: timelock).
- No DEX-derived valuation, ever. The Rhea Finance exploit (April 2026, \~$7.6M) came from pricing fake tokens off fresh pool activity; Nectar prices only whitelisted collateral from a named feed, and `ft_on_transfer` panics for any other token.
- Session flag: `market_session_open` is owner-set in P0 and quoter-set in P1 from the exchange calendar; when false, `D_c = 0` and `h_c = weekend_haircut_bps`.

**Depth D\_c.** Public depth is a `dry: true` 1Click quote selling the seize amount for USDC (`EXACT_INPUT`, `slippageTolerance` 100), read as `amountOutUsd` against `amountInUsd`; `D_c` is the size at which realised discount stays under the best quote's `max_discount_bps`, found by three dry quotes at 0.5×, 1× and 2× the seize amount. 1Click has no testnet, so this is a mainnet read of a public API with no funds moved (allowed by HACKATHON.md Q-007). Fees: 25 bps unauthenticated, 20 bps or 1 bp on stablecoin pairs with an `X-API-Key` (VERIFIED).

**Equities trade in sessions.** Outside NYSE hours the quoter sets `session_open:false`; the contract then counts only Q\_c and R\_c. This is the whole point of the product and the demo runs on a Friday evening for that reason.

## 9. Chain Signatures and Solana settlement (P2)

The NEAR contract never signs a Solana transaction; it signs a canonical settlement *message* it built itself, and a small Solana program releases collateral only when that exact message carries a valid signature from the position's NEAR-derived Ed25519 key. This removes the recent-blockhash problem and the keeper from the trust path.

&#91;embedded content: Solana settlement sequence · keeper, nectar-core, OutLayer, v1.signer, nectar\_vault\]

The keeper never holds a key that can move Solana funds: nectar-core produces the signed message, `nectar_vault` checks the preceding Ed25519 verify instruction through the Instructions sysvar before paying anyone, and the keeper closes the loop with `relay_settlement_result`.

**Signer facts (VERIFIED from `near/mpc` at commit b5bafa3, 2026-11-09, and docs.near.org)**

| Fact | Value |
| --- | --- |
| Contracts | mainnet `v1.signer`; testnet `v1.signer-prod.testnet` |
| Method | `sign(request)` with `request = { "path": String, "payload_v2": { "Ecdsa": "<64 hex>" } or { "Eddsa": "<hex, variable length>" }, "domain_id": u32 }`; legacy `payload: [u8;32]` + `key_version` still parse as ECDSA |
| Domains | `0` = Secp256k1, `1` = Ed25519 |
| Deposit | `SIGN_DEPOSIT_YOCTONEAR = 1` (yoctoNEAR) |
| Gas | `config.sign_call_gas_attachment_requirement_tera_gas`, read from the contract's `state`/config view at G3 (not a constant) |
| Response | `SignatureResponse::Ed25519 { signature }` returned to the caller's callback via yield/resume |
| Derived key | derived from (caller account, `path`) and the domain's public key; off-chain `chainsig.js` `deriveAddressAndPublicKey`; the keeper derives and the contract stores `derived_pubkey` at position open (G3 confirms the derivation library and that it matches the MPC's response) |
| Replay rule from the docs | use a distinct derivation path per chain, e.g. `solana-devnet/pos/<id>` |

**Canonical preimage (built by the contract, never by the keeper)**

```text
NECTAR_SETTLE_V1|chain=solana-devnet|program=<vault_program>|pos=<position_id>|quote=<quote_id>|repay_e6=<n>|seize_units=<n>|recipient=<buyer_remote_recipient>|nonce=<n>|expires=<unix_s>
```

ASCII, pipe-separated, decimal integers, no spaces; the Solana program rebuilds the same string from instruction arguments and compares byte for byte. Signed as `payload_v2: { Eddsa: hex(utf8(preimage)) }` (Ed25519 signs the message directly; no pre-hash).

**Solana program `nectar_vault` (Anchor 0.32.1, devnet)**

- `init_vault(symbol, mint)`: creates a PDA token account owned by the program.
- `open_position(position_id, near_derived_pubkey, amount)`: borrower deposits collateral SPL tokens into the PDA and records the position's authorised signer pubkey (the NEAR-derived key).
- `settle(preimage_fields..., signature)`: requires that the **previous instruction** in the same transaction is the Ed25519 native program `Ed25519SigVerify111111111111111111111111111` (VERIFIED ID) verifying `signature` over the rebuilt preimage with `near_derived_pubkey`; the program reads it through the Instructions sysvar (address confirmed at G7), checks `nonce` unused and `expires` in the future, then transfers `seize_units` to `recipient` and the remainder back to the borrower. Anything else fails.
- `cancel_position`: borrower withdraws only when the NEAR side reports the debt repaid (keeper-relayed, advisory in the hackathon; PROD: NEAR light-client proof or Chain-Signature-signed release).

**Who does what at settlement time**

1. `on_quoter_result` decides the fill and calls `v1.signer-prod.testnet.sign(...)`.
2. `on_signature` stores the signature and emits `settlement_signed{preimage, signature, pubkey}`.
3. The keeper reads the event, builds one Solana transaction: `[Ed25519Program.verify(pubkey, message, signature), nectar_vault.settle(...)]`, pays the Solana fee, sends it.
4. The keeper calls `relay_settlement_result(position_id, sig)`; the Feed indexer confirms the Solana transaction independently.

**Why this is safe against the keeper.** The keeper never chooses the recipient, the amount or the nonce; it can only relay or refuse to relay. A refusal is visible (position stuck in `Settling`), and any other keeper can relay the same signed message. A stolen keeper key cannot drain anything.

**Accounts and funding (CLI-created, section 16).** Devnet SOL from `solana airdrop`; the mock xStock mint is created by the deploy script; the derived Ed25519 pubkey needs no SOL because it never signs a Solana transaction.

**Mainnet note (PROD).** Same program, real xStocks mints, `v1.signer` on NEAR mainnet, a 24 h `expires` window, and a bonded keeper set.

## 10. Keepers, Nectar Feed and the MCP server

### 10.1 Nectar Keepers

A keeper is a small daemon with one function-call key. In the hackathon one keeper account exists (`keeper.nectar.testnet`); PROD adds a registry, USDC bonds and races.

- **Key:** `near account add-key keeper.nectar.testnet grant-function-call-access --receiver-account-id nectar-core.nectar.testnet --method-names trigger_preliquidation,relay_settlement_result ...` (exact flag spelling confirmed with `near account add-key --help` at G2; the docs page shows only the full-access and gas-key variants). All full-access keys are then deleted from the keeper account and `view_access_key_list` output goes into EVIDENCE.md.
- **Allowance:** unset (unlimited gas); the account holds a small NEAR balance, so a leaked key burns at most that balance. The access-keys docs warn that a spent allowance bricks a function-call-only account and cannot be topped up.
- **Loop:** every 10 s read `list_positions`, the oracle, and `get_exit_capacity`; when `debt × 10000 > V × pre_liq_ltv_bps`, call `trigger_preliquidation`. Idempotent: a position in `Settling` is skipped.
- **Relay (P2):** watch `settlement_signed`, build and send the Solana transaction, call `relay_settlement_result`.
- **Observability:** JSON logs, a `/healthz` endpoint, and a `keeper_runs` table in SQLite that the Keepers page reads.
- **PROD:** `register_keeper` with a USDC bond via `ft_transfer_call`, `keeper_fee_bps` paid per execution, slashing when a relay is not completed within `relay_window_ns`, races resolved by first valid `trigger_preliquidation`.

### 10.2 Nectar Feed

Feed is the public, machine-readable side of the protocol: committed exit capacity per asset, the limit it supports, and the history of both.

| Surface | Shape |
| --- | --- |
| On-chain views | `get_exit_capacity(symbol)`, `list_collaterals`, `list_quotes`, `get_pool` (section 6.7) |
| REST (web app API routes) | `GET /api/feed`, `GET /api/feed/:symbol`, `GET /api/feed/:symbol/history?from=&to=`, `GET /api/export.csv`; all read from the indexer, cached 10 s |
| Indexer | the keeper process also tails NEP-297 events from `nectar-core` by polling `EXPERIMENTAL_tx_status` of its own transactions and `view` calls each block interval; writes SQLite. (PROD: a Data API or Neardata stream; NEAR Lake is deprecated since 2026-03-24) |
| Page | `/feed` table per asset: collateral at stake, DEX depth, committed bids, Reserve, haircut, session, exit gap, effective limit; sparkline of Q\_c over 7 days |

### 10.3 Feed MCP server (P1; enters the `agents` track only if it ships)

A stdio and HTTP MCP server, `packages/feed-mcp`, built on `@modelcontextprotocol/sdk` (version pinned at G9). Tools:

| Tool | Input | Output |
| --- | --- | --- |
| `get_exit_capacity` | `{symbol}` | the view result plus USD formatting and `as_of` |
| `preview_borrow` | `{symbol, units, borrow_usd}` | `{limit_usd, premium_usd, ok, reason}` |
| `list_quotes` | `{symbol, limit?}` | live quotes without buyer identity (ids and sizes only) |
| `explain_limit` | `{symbol}` | the Cramér formula with the live numbers substituted, as text |

Read-only, no keys, rate limited per IP. Listed on Agent Market (docs.market.near.ai/list-your-agent) as a free read agent if time allows (HUMAN: listing requires an account).

### 10.4 What agents are expected to do with it

A lending agent calls `preview_borrow` before sizing a loan; a risk agent polls `get_exit_capacity` and alerts when the exit gap widens; a buyer's agent reads `list_quotes` to price its own commitment. None of these needs a key, which is the point: the Feed is the top of the funnel for buyers and curators.

## 11. NEAR AI Cloud copilot (P2)

The copilot explains; it never decides. It sits in the curator console and the buyer page, answers questions about a portfolio or a filing, and every answer carries a verifiable signature from the TEE that produced it. No number it produces reaches the contract.

**Scope**

- "Explain this limit": turns `get_exit_capacity` into plain English for a curator.
- "Brief me on NVDAx": summarises a filing or issuer notice the user pastes; private data stays in the TEE request.
- "What if": runs the Cramér formula on hypothetical Q\_c/R\_c/D\_c the user types; the arithmetic is done by our code, the prose by the model.

**Integration (VERIFIED docs, 2026-11-09)**

- Base URL `https://cloud-api.near.ai/v1`, OpenAI-compatible, `Authorization: Bearer $NEARAI_API_KEY`; model chosen from `GET /v1/models` at G8 (the quickstart example is `zai-org/GLM-5.1-FP8`; the verification example uses `z-ai/glm-5.3-flash`; pick a TEE-hosted model that exists on the day).
- Send the canonical model id with header `x-no-aliasing: true`, and `Accept-Encoding: identity`; keep the exact request and response bytes.
- Preflight: `GET /v1/attestation/report?model=<id>&provider=near&signing_algo=ecdsa&nonce=<64 hex>` with `x-no-aliasing: true`; verify `gateway_attestation` and every `model_attestations[]` candidate with `@phala/dcap-qvl` (report\_data = 32-byte signer identity, zero-padded, then the 32-byte nonce; MRCONFIGID = `01` + SHA-256(app\_compose) + 15 zero bytes; RTMR3 replay).
- After the completion: `GET /v1/signature/<chat_id>?signing_algo=ecdsa`; expected `text` is `<MODEL_ID>:<request_hash>:<response_hash>` for `signature_kind: provider_tee` or `<request_hash>:<response_hash>` for `gateway`; recover the EIP-191 signer and match it to the verified report's `signing_address` and `signing_algo`.
- UI shows a "Verified" panel listing the checks that passed and the ones that could not run (e.g. TCB status not in the accepted set), never a bare green tick.

**Credits.** $10 by joining nearbuilders.org/join, or paid at cloud.near.ai (HACKATHON.md Q-000). HUMAN: the API key.

**Why it is P2.** It adds the `privacy` story but the privacy track is already carried by OutLayer. If time is short, the copilot ships as "Explain this limit" with the signature check and nothing else.

## 12. Web app: pages, routes, states

The web app is the Nectar Network redesign (12 pages in your `Nectar_Frontend_Redesign.html`, six desktop and six phone) made live against testnet. Next.js 15 App Router, React 19, `near-api-js` 7.4.0, NEAR wallet-selector for NEAR wallets, `@solana/kit` 8.6.0 plus wallet-standard for Phantom on the Solana leg. Every number on every page comes from a view call or the indexer; nothing is hard-coded except the illustrative example on the landing page, which is labelled.

| Route | Page (title from the redesign) | Primary data | States that must exist |
| --- | --- | --- | --- |
| `/` | Nectar — The buyer behind every loan | `get_exit_capacity` for the hero card; stat tiles with dated sources | loading skeleton; RPC error banner; `DEMO` ribbon on testnet |
| `/feed` | Nectar Feed — exit capacity by market | `list_collaterals` + indexer history | empty (no assets), stale (oracle age > max), closed-session badge |
| `/quote` | Post a funded quote (redesign calls this Macaulay; label it Pappus for the hackathon) | wallet balance, `preview` of fee rate, `ft_transfer_call` | not connected; insufficient USDC; cap reached (64 quotes); pending; confirmed with explorer link; failed with reason |
| `/quote/[id]` | Quote detail | `get_quote`, fee history | exiting (countdown to unlock), withdrawable, consumed by settlement |
| `/console` | Curator console — size exit capacity | `get_exit_capacity`, `get_pool`, owner params; formula expanded with live values | read-only for non-owners; owner edit forms behind a confirmation modal |
| `/borrow` | Borrow (demo page, not in the redesign; styled as a console sub-page) | `preview_borrow`, `ft_transfer_call` with `LockCollateralAndBorrow` | over-limit (shows B\_c and why), premium breakdown, pending, opened |
| `/positions/[id]` | Position detail | `get_position`, `get_pending_settlement`, Solana tx link | open, at risk (keeper will act), settling, settled with waterfall table, closed |
| `/keepers` | Nectar Keepers — operators and races | keeper runs table, last 50 triggers, fee earned | no keeper online banner |
| `/talk` | Talk to us — Nectar pilot cohort | form → provider (HUMAN) | sent; failed with mailto fallback `kunal@nectarnetwork.fun` |
| `/security` | Security (section of the landing page, also a route) | static + audit status |  |
| `/legal/privacy`, `/legal/cookies`, `/legal/terms`, `/legal/disclaimers` | Legal | static MDX, shared with the docs site |  |
| `/api/*` | feed, export, quote preview, health | server routes; no secrets in the browser |  |

**Shared components (one implementation each, in `packages/ui`)**

SiteHeader (wordmark, links, Talk to us, theme toggle, 760px menu), ExitCapacityCard, StatTile (value, caption, dated source), FormulaBlock (monospace, expands to live numbers), FlowDiagram (the how-it-works SVG with animated dashed paths), QuoteRow, PositionRow, StatusPill (open / at risk / settling / settled / closed), TxLink (explorer URL from the API response, never hand-built), WalletButton (NEAR and Solana), SiteFooter, CookieBanner, Verified panel (copilot).

**Wallets.** NEAR: wallet-selector with Meteor and MyNearWallet modules; the app never asks for a full-access key. Solana (P2): wallet-standard, Phantom first. For the demo the keeper and owner use CLI accounts, not browser wallets.

**Performance and hosting.** Static-first; view calls through a public RPC from `docs.near.org/api/rpc/providers` chosen at G0, with FastNEAR as the first candidate; Vercel (HUMAN: account) or any static host; Lighthouse budget: LCP under 2.5 s on the landing page with the fonts self-hosted.

**Copy rules.** Keep the redesign's voice: short declaratives, the hexagon `⬡` bullet, uppercase mono eyebrows, dated figures, no exclamation marks. Every "Coming soon" in the redesign becomes either live data or "PROD" copy that says it is not built. No hackathon branding in the product UI (landing, app, docs navigation): no banner, badge or copy about the NEAR Hackathon; disclosures say "testnet" and "mock collateral" instead, and hackathon context lives in README, EVIDENCE and SUBMISSION only.

## 13. Design system (from the Nectar Network redesign)

Tokens, type and motion below were extracted from `Nectar_Frontend_Redesign.html` on 2026-11-09 and are the only values the build may use; `docs/DESIGN_SYSTEM.md` in the support bundle carries the same table for Claude Code.

**Colour tokens** (`[data-theme="dark"]` is the default; `[data-theme="light"]` toggles)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#0d0f12` | `#f9fafb` | page |
| `--surface` | `#16181d` | `#ffffff` | cards, rows |
| `--surface-2` | `#202327` | `#f0f2f4` | nested panels, code |
| `--border` | `#23272f` | `#d6dae0` | hairlines |
| `--border-strong` | `#303541` | `#cbcfd8` | inputs, focus rings |
| `--text` | `#bcc3d2` | `#202632` | body |
| `--heading` | `#e6e9ef` | `#141924` | headings |
| `--dim` | `#8f96a3` | `#5e6778` | eyebrows, captions |
| `--wordmark` | `#b4bccc` | `#202632` | NECTAR wordmark |
| `--accent` | `#16f3a9` | `#15845f` | links, primary buttons, live values |
| `--accent-hover` | `#77f3ca` | `#106046` | hover |
| `--on-accent` | `#0d0f12` | `#ffffff` | text on accent |
| `--accent-fill` | `rgba(0,229,160,0.08)` | `rgba(24,149,108,0.08)` | tinted panels |
| `--accent-glow` | `rgba(22,243,169,0.45)` | `rgba(21,132,95,0.35)` | pulse |
| `--accent-deep` | `#09aa74` | `#8fdcbf` | bars |
| `--warn` / `--warn-bar` | `#faaf2e` | `#9a5f00` / `#dc8f09` | at-risk, stale |
| `--warn-fill` | `rgba(245,158,11,0.08)` | `rgba(220,143,9,0.10)` | warn panels |
| `--info` | `#51b8ec` | `#17699a` | informational |
| `--grid` | `rgba(122,184,163,0.043)` | `rgba(110,122,145,0.07)` | background grid |

Error red is not in the redesign; the hackathon adds `--danger: #ff8a80` (dark) / `#b3261e` (light) and `--danger-fill: rgba(255,138,128,0.10)`, the only new tokens.

**Type.** Headings: Syne 500–800 (Google Fonts, OFL). Body and data: DM Mono 300/400/500; `--body-font: 'DM Mono', ui-monospace, monospace`, with `[data-font="sans"]` switching to the system stack. Eyebrows: 11px DM Mono, letter-spacing 0.1em, uppercase, `--dim`. Numbers always DM Mono with tabular figures. Fonts are self-hosted in `apps/web/public/fonts` (the redesign bundles the woff2 files) to keep LCP down.

**Layout.** Max width 1120px; section padding 96px desktop, 56px under the 760px container query; 16px gutters on phones; cards radius 4px (tables) and 6px (panels); hairline borders, no shadows, no gradients except `--accent-fill` tints and the background `--grid`.

**Motion** (all disabled under `prefers-reduced-motion`): `rise` 0.8 s cubic-bezier(0.22,1,0.36,1) for section entry; `grow` 1.4 s for bars; `pulse` 2.2 s on live indicators; dashed `flow-line` paths animating at 1.6 s on the how-it-works diagram; `float` 7 s on the hero card.

**Components** (names as in the redesign CSS): `.site-links`, `.site-actions`, `.menu-btn` (shown under 760px), `.pilot-row`, `.arch-wide` / `.arch-narrow` (diagram variants), `.rt` responsive tables that collapse to labelled rows under 760px with `td::before` labels, `.hide-sm`, `.hide-xs`, `.only-light` / `.only-dark` logo swaps.

**Logo.** Three mint hexagons in a triangular cluster, one on top and two below with edges nearly touching (`#3dd68c` range in the supplied PNG) with the lowercase `nectar` wordmark; monochrome variants in `--wordmark`; supplied as `brand/nectar-logo.png` and to be traced to SVG in the build (`brand/nectar-mark.svg`).

**Accessibility.** WCAG 2.1 AA: `--text` on `--bg` is 9.6:1 (dark) and 11.3:1 (light); `--accent` on `--bg` is 11.9:1 dark; the light accent `#15845f` on white is 4.6:1, so light-mode accent text stays at 16px or larger. Focus rings use `--border-strong` 2px; all interactive targets are at least 44px on phones (the redesign already sets `min-height:44px` on menu links). Live regions announce status pill changes.

**What we borrow from morpho.org (structure, not styling).** Audience-first navigation (Institutions / Fintechs / Users there; Buyers / Curators / Borrowers here), a "protocols powering the network" card row, a trust section titled "Open by default, minimal by design" (the redesign already says "Open by default. Thin by design."), and a six-column footer: Customers, Company, Resources, Solutions, Legal, Social. The Nectar footer keeps its four columns (Products, Protocols, Build, Company) and adds Legal (Legal notice, Terms, Privacy, Cookies, Disclaimers) and Social (X, GitHub, LinkedIn), with Morpho's Resources list (Developer tools, Whitepaper, GitHub, Documentation, Governance, Bug bounty, Audits) folded into Build. Tagline line under the mark: "Credit and liquidity for tokenized assets." Copyright line: "© 2026 Nectar Labs · MIT License" plus the existing disclaimer sentence.

## 14. Docs site

Docusaurus 3.10.2 (VERIFIED on npm 2026-11-09; Node 20 or later) in `apps/docs`, themed with the same tokens as the web app, deployed at `docs.<domain>` or `/docs` behind the web app. The docs are also what the AI screeners read second, after the README.

**Information architecture**

| Section | Pages |
| --- | --- |
| Start | What Nectar is · Try it in 3 minutes · Glossary |
| Concepts | Funded quotes (Pappus) · Borrowing limits (Cramér) · Pre-liquidation waterfall · Sessions and haircuts · Fees |
| Protocol | Contract reference (generated from the ABI with `cargo near abi`) · Events · Errors · Storage |
| Integrations | NEAR Intents depth · OutLayer quoter · Chain Signatures and the Solana vault · Oracle · NEAR AI copilot |
| Operate | Run a keeper · Post a quote by CLI · Curator parameters · Deploy to testnet |
| Feed | REST · MCP server · CSV columns |
| Security | Threat model · Trust assumptions · Disclosure policy · Audits (status) |
| Legal | Privacy policy · Cookie policy · Terms of use · Disclaimers · Legal notice |
| About | Nectar Labs · Baseline disclosure (Q-002, Q-005) · Changelog |

**Theme.** `src/css/custom.css` maps Docusaurus Infima variables to the Nectar tokens: `--ifm-color-primary` = `--accent`, `--ifm-background-color` = `--bg`, `--ifm-font-family-base` = DM Mono, headings Syne; dark mode default (`colorMode.defaultMode: 'dark'`, `respectPrefersColorScheme: true`). Navbar: logo mark + "Nectar Docs", links Concepts / Protocol / Integrations / Feed / GitHub. Footer mirrors the web app footer (section 13).

**Analytics.** `@docusaurus/preset-classic` `gtag: { trackingID: 'G-XXXXXXX', anonymizeIP: true }` (VERIFIED config shape; inactive in development). HUMAN: the GA4 property id. Until it exists the field is read from `DOCS_GTAG_ID` and the plugin is skipped when empty. Alternative that needs no banner: Plausible, cookieless, via a `<script>` in `headTags`; the choice is Kunal's (section 19).

**Cookies and consent.** The web app and the docs site use no cookies of their own: theme and cookie-choice live in `localStorage`. With GA4 enabled, a consent banner (`CookieBanner`) loads gtag only after "Accept analytics"; "Reject" stores the refusal and loads nothing. The banner text links to `/legal/cookies`. The cookie page lists each storage key, purpose, lifetime and whether it is first-party.

**Privacy policy (draft content, not legal advice).** Who: Nectar Labs, contact `kunal@nectarnetwork.fun`. What is processed: wallet addresses and on-chain activity (public by nature), form submissions on Talk to us (name, email, message), analytics events if consented, server logs (IP, user agent, 24 h retention). Purpose and legal basis stated per item; no selling, no profiling; retention table; rights (access, deletion, objection) with the contact; sub-processors list (host, form provider, analytics) left as HUMAN placeholders; GDPR and India DPDP 2023 notices; changelog of the policy.

**Terms and disclaimers.** Testnet software, no warranty, not investment advice (keeps the site's existing sentence), capacity is limited to committed quote size, smart-contract risk, third-party dependencies (OutLayer, 1Click, oracle), jurisdiction placeholder (HUMAN).

**Build and deploy.** `pnpm docs:build` runs in CI; broken links fail the build (`onBrokenLinks: 'throw'`); sitemap and `robots.txt` on; OpenGraph image generated from the logo; search with the local search plugin (no external service) at G9.

## 15. Security model

The guard lives in the contract: every rule that moves money is enforced by `nectar-core`, and every off-chain party (keeper, quoter, oracle, copilot) can at worst delay or degrade, never redirect.

**Trust assumptions, stated for the README**

| We trust | For | Bounded by |
| --- | --- | --- |
| NEAR validators | execution and storage | protocol |
| The owner key (deployer in the hackathon) | risk parameters, pause, oracle choice | PROD: multisig + timelock; all owner actions emit events |
| `outlayer.testnet` | running the pinned WASM | clamp to `max_discount_bps`; fallback to P0 pricing on failure |
| `price-oracle.testnet` or `pyth-oracle.testnet` | spot price | freshness + band; weekend haircut |
| `v1.signer-prod.testnet` MPC set | signing only what we send | contract-built preimage; distinct path per chain; nonce + expiry |
| NEAR Intents 1Click | public depth figure | dry quotes only; D\_c = 0 if unavailable |
| The keeper | liveness | function-call key, 0 deposit, cannot pick payloads |
| NEAR AI Cloud | prose for humans | never a contract input; signature verified |

**Threat table**

| Threat | Control | Test |
| --- | --- | --- |
| Fake collateral or fake USDC credited | `ft_on_transfer` predecessor check against configured token accounts; unknown tokens refunded | unit: wrong predecessor panics |
| Oracle manipulation (Rhea-style, April 2026) | named feed only, no DEX valuation, freshness, 1,500 bps band, two-step override | unit: band rejects; sandbox: stale price blocks borrow |
| Keeper signs arbitrary payload | keeper passes only `position_id`; preimage built from state; `payload_v2` constructed in `on_quoter_result` | unit: no method accepts a hash |
| Keeper key leak | function-call key scoped to two methods, no deposit; `set_keeper` rotation | sandbox: `ft_transfer` with keeper key fails |
| Quoter returns absurd discount | clamp to `[0, max_discount_bps]`; price band; `quoter_fallback` | unit: 9,999 bps clamps |
| Quoter down | timeout → P0 pricing; event | sandbox: callback failure path |
| Escrow double-use | `remaining_usd_e6` decremented before any promise; `Settling` lock | unit: two triggers on one position |
| Withdrawal race | Q\_c decremented at initiate; notice period; settlement may consume during notice | unit: settle during notice |
| Fee accumulator drift | O(1) maths tested against a loop model; `fee_debt` set at fund and top-up | property test over 1,000 random ops |
| Storage griefing | 64-quote cap per asset, minimum quote size, cap on positions per account | unit |
| Signature replay on Solana | nonce set in program state, `expires`, program id in preimage, path per chain | Anchor test: second settle fails |
| Relay refusal | any keeper can relay a signed message; position visibly stuck | integration |
| Web supply chain | pinned versions, `pnpm audit` in CI, no inline third-party scripts except consented gtag | CI |
| Secrets | `.env` only, `.env.example` names; keys created by CLI into the keychain; never committed | pre-commit hook `gitleaks` |

**Disclosure.** `SECURITY.md` with the contact, 90-day coordinated disclosure, and a note that no bug bounty exists yet. PROD: audit before mainnet (the Nectar Network site already says "audit in process"; this repo says "not audited").

## 16. Production operations

Everything that runs is created by a script from an empty machine, keys included; the only steps a human performs are funding mainnet accounts, holding the owner key, and pressing publish on public channels.

### 16.1 Accounts and keys (created by CLI, never pasted)

| Account | Network | Created by | Key policy |
| --- | --- | --- | --- |
| `nectar.testnet` (parent) | testnet | `near account create-account sponsor-by-faucet-service nectar.testnet autogenerate-new-keypair save-to-keychain network-config testnet create` (VERIFIED syntax; name availability checked first) | full-access, keychain only |
| `nectar-core.nectar.testnet`, `usdc-mock.nectar.testnet`, `nvdax-mock.nectar.testnet`, `keeper.nectar.testnet`, `buyer1.nectar.testnet`, `borrower1.nectar.testnet` | testnet | `near account create-account fund-myself <sub> '5 NEAR' autogenerate-new-keypair save-to-keychain sign-as nectar.testnet network-config testnet sign-with-keychain send` (exact form confirmed with `--help` at G0) | contracts: full-access deleted after deploy on mainnet only; keeper: function-call key only |
| Solana deployer, mock mint authority | devnet | `solana-keygen new --no-bip39-passphrase --outfile ~/.config/solana/nectar-devnet.json`; `solana airdrop 2 --url devnet` (rate limits; retry at G7) | file in the user keychain dir, never in repo |
| `nectar-labs.near` and sub-accounts | mainnet (PROD) | HUMAN funds the parent; scripts create sub-accounts the same way | owner = multisig (Sputnik DAO) with 48 h timelock on parameter changes |

If a faucet or airdrop fails, the script stops and prints the exact command for Kunal; it never improvises a key.

### 16.2 Deploy pipeline (`scripts/`)

`00-accounts.sh` → `10-build.sh` (`cargo near build non-reproducible-wasm` for dev, `reproducible-wasm` for the submitted artifact; `anchor build`) → `20-deploy-testnet.sh` (mocks, then core with `new`, then `upsert_collateral`, `set_keeper`, `fund_gas_reserve`) → `30-quoter-publish.sh` (`outlayer upload`, `outlayer deploy`, prints sha256, calls `set_quoter_pin`) → `40-seed-demo.sh` (mint mocks to demo accounts, fund two quotes, open one position) → `50-verify.sh` (every view call, compares to `tests/model.csv`, writes `docs/EVIDENCE.md`). Each script is idempotent and reads `FACTS.md` for IDs. GitHub Actions runs build, unit tests, sandbox tests, `pnpm lint`, `pnpm docs:build`, `gitleaks` on every push.

### 16.3 Monitoring and alerts

- Keeper `/healthz` and a heartbeat row every minute; the Keepers page shows "no keeper online" after 3 missed beats.
- Oracle age, pool utilisation, Q\_c per asset and pending settlements exposed at `/api/metrics` (Prometheus text) for Grafana (PROD).
- Alerts (PROD): oracle stale > 10 min in session, `oracle_rejected` event, `quoter_fallback` rate > 10%, position in `Settling` > 15 min, keeper offline, gas reserve below 5 NEAR.

### 16.4 Incident runbook (`docs/RUNBOOK.md`)

| Incident | First action | Then |
| --- | --- | --- |
| Oracle wrong or stale | `pause()` (owner) | `propose_price` / `apply_price`, or switch `oracle` to the fallback; unpause |
| Quoter compromised or absurd | `set_quoter_pin("")` disables P1 pricing; contract uses `max_discount_bps` | publish fixed WASM, re-pin |
| Keeper key leaked | `set_keeper(new)`; delete old key | rotate `.env`, redeploy keeper |
| Settlement stuck in `Settling` | any keeper relays the signed message | if expired, owner `cancel_settlement` returns position to `Open` and emits |
| Contract bug | `pause()`; announce; patch | upgrade via `deploy` on the same account (hackathon) or DAO proposal (PROD) with state migration tested in sandbox |

### 16.5 Upgrades and governance

Hackathon: owner key redeploys; every deploy tags the git commit in `FACTS.md` and the `contract_version()` view. PROD: Sputnik DAO owner, 48 h timelock on `upsert_collateral` and `set_oracle_source`, instant `pause`, public changelog in the docs, and an upgrade path that keeps `Quote` and `Position` borsh layouts versioned.

### 16.6 Backups and data

All state is on-chain and reconstructible; SQLite indexes are rebuilt from events by `pnpm index:rebuild`. The only unrecoverable items are keys: owner and deployer keys are exported once to an encrypted file Kunal stores offline (HUMAN).

### 16.7 Costs (hackathon)

Testnet NEAR is free (faucet); devnet SOL is free; OutLayer testnet execution cost is read from `estimate_execution_cost` at G4 and paid from the gas reserve; 1Click dry quotes are free; NEAR AI Cloud $10 credit; hosting on free tiers. Mainnet costs are not reimbursed (HACKATHON.md Q-008) and nothing mainnet is deployed.

## 17. Analytics, telemetry and product metrics

Three layers: product metrics from the chain, usage analytics from the sites with consent, and operational telemetry from the services. None of them stores personal data beyond what the privacy policy lists.

**Product metrics (from events, shown on `/feed` and the console)**

| Metric | Definition | Why it matters |
| --- | --- | --- |
| Committed capacity Q\_c | sum of live `remaining_usd_e6` per asset | the product |
| Exit gap | collateral at stake − (Q\_c + R\_c + D\_c) | the problem, per market |
| Limit uplift | Nectar B\_c − static limit, in USD and bps | value to borrowers |
| Premium paid / fees distributed | from `position_opened` and `fees_claimed` | revenue proof |
| Settlement discount vs DEX | `disc_bps` vs the dry-quote implied discount at settlement time | the demo claim, measured |
| Quoter fallback rate | `quoter_fallback` / `preliq_triggered` | TEE reliability |
| Keeper latency | block of flag condition → block of trigger | liveness |

**Site analytics.** GA4 through the Docusaurus preset and gtag on the web app, loaded only after consent, `anonymizeIP: true`, no user-id, events: `view_feed`, `preview_borrow`, `quote_started`, `quote_funded`, `talk_submitted`, `docs_search`. Or Plausible, cookieless, no banner needed. Kunal picks (section 19).

**Operational telemetry.** Keeper and web API log JSON lines to stdout (level, event, position\_id, tx hash, duration); hosts collect them. No wallet address is joined to an IP in any log.

**Hackathon evidence.** `docs/EVIDENCE.md` records, per gate and milestone, the command, trimmed output and explorer links. `pnpm demo:testnet` prints the same links judges can open.

## 18. Roadmap: P0 → PROD

Development closes 2026-11-14 23:59 UTC. Each phase is a shippable product on its own; a later phase never breaks the demo of an earlier one. The build prompt enforces the order.

| Phase | Window | Ships | Gate to pass |
| --- | --- | --- | --- |
| **P0 Core credit** | Nov 9–11 | Rust contract on testnet with real NEP-141 custody (`SupplyLendingLiquidity`, `FundPappusQuote`, `TopUpQuote`, `LockCollateralAndBorrow`, `Repay`), O(1) fee index, two-step notice withdrawal, static `max_discount_bps` settlement with owner oracle; mock USDC and NVDAx tokens; keeper that flags and triggers; web app Home / Feed / Post a quote / Borrow / Keepers in Nectar theme; docs site with legal pages; README that a fresh clone can follow; `pnpm demo:testnet` | G0 toolchain, G1 contract tests + sandbox, G2 testnet deploy + explorer links, G3 web E2E against testnet |
| **P1 Verified pricing and depth** | Nov 11–13 | OutLayer quoter (`wasm32-wasip2`, pinned `version_key`, `≤900` byte stdout) producing clamped `disc_bps`; `request_execution` + `on_quoter_result` with fallback; Pyth/OutLayer oracle read with staleness and conf checks; 1Click `dry: true` depth probe displayed on Feed; Feed REST + MCP server; evidence page with attestation links | G4 OutLayer execution cost + round-trip, G5 oracle read live, G6 1Click dry quote recorded |
| **P2 Cross-chain settlement and copilot** | Nov 13–14 | Solana `nectar_vault` Anchor program on devnet; `on_signature` → Ed25519 verify ix + `settle`; `relay_settlement_result`; NEAR AI Cloud copilot with signature + attestation verification; agents track entry only if G8 passes | G7 Chain Signatures Ed25519 round-trip on devnet (Instructions sysvar confirmed), G8 copilot verifier green |
| **Submission** | Nov 14 | `docs/EVIDENCE.md`, 3-minute demo script, X post draft, submission payload prepared; Kunal confirms send, repo public, post | G9 fresh-clone rehearsal by a verifier agent |
| **PROD (post-hackathon)** | 2027 Q1+ | Mainnet with DAO owner and timelock, audit (contract + Anchor + quoter), real xStocks / Opening Bell collateral via 1Click routing, Rhea depth source, curator fee schedule, keeper network with bonds, mainnet Pyth or OutLayer oracle, status page, Plausible or GA4 per Kunal | Audit report, 30 days testnet soak, legal review of disclaimers |

**Cut order if time runs short** (last to first): copilot → Feed MCP → Solana leg (keep the signer round-trip demo) → 1Click depth → oracle (stay on owner oracle, disclosed) → OutLayer quoter (static discount, disclosed). P0 is never cut.

**What is deliberately not built**: Robinhood Chain, Base, Arbitrum, Stellar, EVM paths; secp256k1 settlement; mainnet anything; a token; governance UI; mobile apps.

## 19. Risks, open questions and human decisions

### 19.1 Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Pyth not live on NEAR testnet despite NEAR docs listing it | medium | P1 oracle slips | G5 tries `pyth-oracle.testnet` then `price-oracle.testnet`; falls back to owner `propose_price`/`apply_price` with a visible "owner oracle" badge |
| OutLayer testnet unavailable or cost too high | medium | P1 quoter slips | `set_quoter_pin("")` path keeps settlement working; evidence shows the attempted execution |
| Chain Signatures Ed25519 round-trip fails on devnet (sysvar, serialization, gas) | medium | P2 slips | Demo the signer response on NEAR alone; Solana program verified in `solana-test-validator` with a locally produced signature |
| `near-cli-rs` function-call key syntax differs | low | keeper setup | checked with `--help` at G0; fallback is `near-api-js` `addKey` script |
| Faucet rate limits (NEAR testnet, Solana devnet) | high | minutes lost | create all accounts in one early pass; cache keys; retry with backoff; print the manual command |
| Judges' agents cannot run the README | medium | screened out | G9 fresh-clone rehearsal; pinned versions; `pnpm demo:testnet` reads only testnet state and needs no keys |
| Mock tokens read as fake | low | credibility | Named `*-mock.nectar.testnet`, explained in README and Feed banner; mainnet asset plan in docs |
| Scope creep | high | P0 unfinished | build prompt forbids starting P1 before G3; verifier agent blocks |
| Rate premium cannot fund fees at demo scale | low | economics questioned | Feed shows the equation with live numbers; whitepaper page in docs explains break-even |

### 19.2 Open questions (answered by gates, not by guessing)

1. Does `pyth-oracle.testnet` answer `get_price` for the NVDA feed id today? (G5)
2. What does `estimate_execution_cost` return for `max_instructions=1e8`, `max_memory_mb=128`, input 512 bytes? (G4)
3. Does `v1.signer-prod.testnet` return `SignatureResponse::Ed25519` for `domain_id: 1` within one receipt chain under 300 Tgas total? (G7)
4. Instructions sysvar address and `Ed25519SigVerify111111111111111111111111111` instruction layout in Anchor 0.32.1 (G7)
5. 1Click `/v0/tokens` lists any tokenized equity today? (G6, expected no; display "no 1Click route" then)
6. Exact `near account create-account fund-myself` and `add-key grant-function-call-access` syntax in the installed `near-cli-rs` (G0)

### 19.3 Decisions that need Kunal (placeholders exist until then)

| # | Decision | Default if silent | Where the placeholder lives |
| --- | --- | --- | --- |
| H1 | Submission payload send | never sent | `docs/SUBMISSION.md` ready, `scripts/submit.sh --dry-run` only |
| H2 | Make repo public, push to GitHub, final tag | never | `docs/process/human-handoff.md` step list |
| H3 | X post | never | `docs/process/x-post.md` draft |
| H4 | Analytics vendor: GA4 (consent banner) or Plausible (cookieless) | Plausible script tag commented, GA4 id `G-XXXXXXX` placeholder, banner shipped | `apps/web/src/lib/analytics.ts`, `docs-site/docusaurus.config.ts` |
| H5 | Domain and hosting (Vercel project names, DNS) | `*.vercel.app` previews | `docs/process/human-handoff.md` |
| H6 | Mainnet account names and funding | none | `FACTS.md` MAINNET section empty |
| H7 | NEAR AI Cloud API key | copilot shows "key missing" state | `.env.example` `NEAR_AI_API_KEY=` |
| H8 | 1Click API key (optional, better fees) | unauthenticated 25 bps | `.env.example` `ONE_CLICK_API_KEY=` |
| H9 | Legal entity name and contact for privacy/terms pages | "Nectar Labs (unincorporated project)", `kunal@nectarnetwork.fun` | `docs-site/docs/legal/*.md` |
| H10 | Team members listed in submission; second project (Q-015 limit) | Kunal only | `docs/SUBMISSION.md` |
| H11 | Demo video recording (voice) | silent screen capture with captions produced by Claude Code | `docs/DEMO_SCRIPT.md` |
| H12 | Baseline disclosure wording (Q-002/Q-005) | drafted from `attachment.txt` v4 summary | `README.md` section "Prior work" |

Each row has a matching section in `docs/process/human-handoff.md` with the exact command or click path and what Claude Code does the moment the answer arrives.

## 20. Glossary

| Term | Meaning in this document |
| --- | --- |
| Pappus quote | A buyer's escrowed, time-committed offer to purchase a fixed USD amount of a collateral asset at up to `max_discount_bps` below oracle, with a notice period |
| Cramér limit (B\_c) | Borrowing limit per collateral derived from committed capacity: `B_c = min(ltv_static + uplift(Q_c), ltv_max) × collateral_value` |
| Q\_c | Committed capacity: sum of live quote remainders for asset c |
| R\_c, D\_c | Revocable DEX depth (1Click dry quote) and displayed depth, shown but not relied on |
| Exit gap | Collateral value at stake minus committed plus revocable depth |
| Limit premium | Extra rate borrowers pay for the uplift; split to buyers (fee index) and protocol |
| Fee index | `acc_fee_per_dollar_e18` MasterChef-style accumulator giving O(1) fee accrual |
| Notice period | Time between `initiate_quote_withdrawal` and `complete_quote_withdrawal`; Q\_c drops immediately |
| Pre-liquidation | Settlement triggered when health < 1 that sells collateral to a Pappus buyer at the clearing discount instead of a DEX |
| Clearing discount | `disc_bps` the quoter returns, clamped to `[0, max_discount_bps]` |
| Quoter | OutLayer WASM program that computes the clearing discount in a TEE from private MM parameters |
| Keeper | Permissionless bot holding a function-call key that triggers settlements and relays results |
| Chain Signatures | NEAR MPC service (`v1.signer`) producing Ed25519 or secp256k1 signatures for derived addresses |
| Derived address | Solana public key derived from (`nectar-core` account, `path`) via the MPC root key |
| `nectar_vault` | Solana Anchor program holding collateral for cross-chain positions and settling on a verified NEAR-signed message |
| Health | `(collateral_value × liq_threshold) / debt`; below 1 triggers pre-liquidation |
| Owner oracle | Fallback price path (`propose_price` / `apply_price`) with on-page disclosure |
| Feed | Public page and REST/MCP endpoints exposing Q\_c, exit gap, limits and settlements |
| Copilot | NEAR AI Cloud chat with verified TEE signatures used for qualitative briefings, never for prices |
| Gate (G0–G9) | A verification checkpoint the build prompt must pass before continuing; failure means STOP and report |
| HUMAN | A step only Kunal can do; always has a placeholder and instructions |

## 21. References (verified 2026-11-09 unless noted)

**Hackathon**

- NEAR Hackathon rules and submission API: https://nearhackathon.com/ and `HACKATHON.md` (Q-002, Q-005, Q-007, Q-008, Q-010, Q-015, Q-017)
- NEAR Builders: https://nearbuilders.org/build

**NEAR protocol and tooling**

- NEAR docs: https://docs.near.org/ (smart contracts, NEP-141, storage staking, access keys, oracles page listing `pyth-oracle.near/.testnet` and `price-oracle.near/.testnet`)
- `near-sdk` 5.30.1: https://crates.io/crates/near-sdk ; `cargo-near` 0.23.0: https://github.com/near/cargo-near
- `near-api-js` 7.4.0: https://www.npmjs.com/package/near-api-js
- near-cli-rs: https://github.com/near/near-cli-rs
- near-workspaces (sandbox tests): https://github.com/near/near-workspaces-rs
- NEP-141 fungible token standard: https://nomicon.io/Standards/Tokens/FungibleToken/Core
- NEP-297 events: https://nomicon.io/Standards/EventsFormat

**Chain Signatures**

- near/mpc repository (commit b5bafa3): https://github.com/near/mpc — `crates/near-mpc-contract-interface/src/deposits.rs` (`SIGN_DEPOSIT_YOCTONEAR = 1`), `crates/near-mpc-crypto-types/src/sign.rs` (`payload_v2`, `SignatureResponse::Ed25519`), `primitives.rs` (domain ids)
- Chain Signatures docs: https://docs.near.org/chain-abstraction/chain-signatures

**OutLayer**

- OutLayer docs and app: https://docs.outlayer.ai/ , https://app.outlayer.ai/executions
- Contracts `outlayer.testnet`, `outlayer.near`; FastFS testnet `test.fastfs.io`

**Oracles**

- Pyth contract addresses (states NEAR not supported for Pyth Core): https://docs.pyth.network/price-feeds/contract-addresses
- Hermes: `https://hermes.pyth.network`, `https://hermes-beta.pyth.network`, REST mirror `https://pyth.dourolabs.app/hermes` (`/v2/updates/price/latest?ids[]=`)
- Halborn on the Rhea Finance April 2026 oracle exploit

**NEAR Intents / 1Click**

- 1Click API: https://1click.chaindefuser.com (`/v0/tokens`, `/v0/quote`, `/v0/status`) ; docs: https://docs.near-intents.org/
- `@defuse-protocol/one-click-sdk-typescript` 0.1.26: https://www.npmjs.com/package/@defuse-protocol/one-click-sdk-typescript

**NEAR AI Cloud**

- API `https://cloud-api.near.ai/v1`; verification example: https://github.com/near-examples/nearai-cloud-verification-example ; `@phala/dcap-qvl`

**Solana**

- Anchor 0.32.1: https://www.anchor-lang.com/ ; `@solana/kit` 8.6.0: https://www.npmjs.com/package/@solana/kit
- Ed25519 program `Ed25519SigVerify111111111111111111111111111`: https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program

**Web, docs, analytics**

- Docusaurus 3.10.2: https://docusaurus.io/ (gtag plugin via preset)
- Morpho site structure and footer (reference for IA, not copied): https://morpho.org/
- Nectar Network design tokens: `Nectar_Frontend_Redesign.html` bundle (decoded; tokens in section 13)

**Claude Code**

- Prompt caching, subagents, agent teams, settings: https://docs.claude.com/en/docs/claude-code/ (`CLAUDE_CODE_PROMPT_CACHE_TTL`, `.claude/agents/*.md`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`)

**Market figures (Kunal's `FACTS-nectar-labs.md`, dated 2026-11-09, DefiLlama / Solana case study)**

- NEAR Intents $37.006B cumulative volume, $189.13M TVL; Rhea $235.99M TVL; RWA on-chain $33.609B vs $4.09B in DeFi; xStocks \~$196M, >$182M on Solana. Re-verify on submission day and update `FACTS.md` dates.

Conflicts recorded in `FACTS.md`: Pyth-on-NEAR (Pyth docs vs NEAR docs); 1Click fee 20 vs 25 bps by auth; OutLayer stdout cap per docs vs observed at G4.
