# Nectar Labs — Build Prompt Addendum v7

Nov 10, 2026 · @Kunal Drall

This addendum brings the build from PRD v6 to PRD v7 without throwing away work: it detects how far the first build prompt got, folds the v7 changes in at the next phase boundary, and adds the Base Sepolia spoke last.

## 0. How this addendum fits

The first build prompt stays in force; this addendum only adds and overrides, and everything it changes is listed here.

- **Spec:** PRD v7 replaces PRD v6 as `docs/PRD.md`. New sections the agents read: 1A (module verdicts), 4.6–4.11 (mechanisms), 6.11 (contract surface), 9B (remote lifecycle and Base), 10.5 (agent skill and x402), 12.1 (screens), 19.4 (risks and handoffs).
- **Files:** the refreshed bundle carries v7 versions of `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/guard.sh`, a new `.claude/agents/evm.md`, `docs/FACTS.md` (F-120–F-139 and conflicts C-004–C-008), `docs/HUMAN_HANDOFF.md` (H13–H18), `docs/work/wo-18` to `wo-32`, `docs/work/gates-v7.md`, `packages/config/config.yaml`, `.env.example`, `scripts/06-base.sh`, `scripts/21-deploy-v2.sh`, `scripts/26-deploy-base.sh`, the landing page and `packages/ui/notes/position-note.svg`.
- **What is not overridden:** the never-without-Kunal list, the STOP rule, verify-before-implementing, worktree isolation, the evidence format, the human-handoff protocol. They apply to every new work order.
- **What is corrected from the first prompt:** the Feed equation and config used an "uplift" form of the Cramér limit and called 1Click depth R\_c. The canonical forms are PRD §4.2 and R\_c = Nectar Reserve, D\_c = verified DEX depth (C-007, C-008). Any code already written with the old names is renamed in WO-19 and WO-20.

## 1. State detection

The orchestrator reads `docs/STATE.md`, `git tag`, and `packages/config/config.yaml` before doing anything else, places the build in one of five states, and adopts v7 the way that state allows.

| State | Signal | Adoption |
| --- | --- | --- |
| A · not started | no phase in STATE.md, no tags, `contracts/` empty | Copy every v7 bundle file over the seed, commit `chore: adopt v7`, then run the first prompt's kickoff with the resume message (section 13) appended. |
| B · P0 in progress | phase P0, no `p0-green` tag | Running work orders finish untouched. At the next merge boundary: write the v7 `CLAUDE.md` and agents, send WO-19 to the contract agent and WO-20 to the web agent before G1. G1 gains the v7 tests. The first deployment is already v7-shaped, so no v2 is needed. |
| C · P0 green | tag `p0-green`, v1 live | v1 stays untouched as evidence. WO-19 builds the v7 layout; `scripts/21-deploy-v2.sh` deploys `nectar-core-v2.nectar.testnet`, reseeds it and switches `config.yaml`; G2 and G3 re-run against v2 and are recorded as G2b and G3b. |
| D · P1 in progress | phase P1 | Open P1 work orders finish. WO-19, WO-22 and WO-23 merge into one contract change and one v2 deployment. |
| E · P2 in progress | tag `p1-green` | WO-21 joins the Solana work in flight; Base (P2b) starts only after G7 passes. |

Rules that hold in every state:

- At most one contract deployment per phase. Contract deltas are batched until the phase's gate.
- If a running agent's work order conflicts with v7 (a renamed field, the old formula), the orchestrator writes a follow-up work order. It never edits that agent's worktree.
- The adoption is recorded as D-009 in `docs/DECISIONS.md` and as the first line of `docs/STATE.md`, with the state letter and the commit it started from.

## 2. CLAUDE.md, settings, guard and agents

One new agent (`evm`), one widened guard, and seven edits to `CLAUDE.md`; the v7 files in the bundle already contain all of them.

**`CLAUDE.md` v7 edits**

| § | Change |
| --- | --- |
| 1 Mission | Chains: NEAR testnet (hub), Solana devnet (P2a), Base Sepolia `84532` (P2b). Phase order P0 → P1 → P2a → P2b → package. |
| 1 Tracks | `defi`, `security`, `privacy` always; `agents`, `nfts`, `realworld` only after their gates; `thesis` only if H18 says yes and a reproducible notebook ships. |
| 1 Cut order | the v7 order from PRD §18 (thesis, Base, copilot, x402, Reserve, Notes, Profit-Lock, Shields, MCP skill, Solana, depth, oracle, quoter). |
| 1 Never list | adds: any Base mainnet (`8453`) transaction or deployment; posting on market.near.ai; registering a Base builder code. |
| 1 Copy rules | never "insurance", never "without liquidations", never "live" before EVIDENCE shows it. |
| 4 Ownership | `evm/` → evm agent; `services/x402/` → keeper agent; NEP-171 code stays with the contract agent; `packages/ui/notes/` → web agent. |
| 5 Gates | adds G10–G14 (section 4 here). |

**`.claude/settings.json`:** allow `forge *`, `cast *`, `anvil *`; env `BASE_CHAIN_ID=84532`, `BASE_RPC_URL` from `.env`.

**`.claude/hooks/guard.sh` additions** (blocked unless `HUMAN_CONFIRMED=1` is in Kunal's shell):

- chain id `8453` (but not `84532`), `mainnet.base.org`, or `--chain base` in any `cast`/`forge` command;
- any `--private-key` argument with a literal key (EVM keys live in Foundry keystores and are passed with `--account` and `--password-file`);
- `curl` POSTs to market.near.ai.

**New agent `.claude/agents/evm.md`**

```
---
name: evm
description: Owns evm/ — NectarVaultBase (Foundry), MockB20 and PolicyRegistryMock, B20 creation scripts for Base Sepolia (84532). Use for any Solidity, Foundry or Base Sepolia work. P2b only.
tools: Read, Edit, Write, Bash, Grep, Glob
permissionMode: acceptEdits
maxTurns: 60
isolation: worktree
memory: project
color: blue
---
You own evm/. Read docs/FACTS.md (F-120–F-139) and your work order first. Do not start before the orchestrator opens P2b.
Rules: Solidity version pinned in foundry.toml at G10. EIP-712 domain {NectarVault, 1, 84532, vault}. settle and release recompute the digest on-chain, ecrecover against the stored authority, check nonce and expiry, and check isAuthorized on the B20 PolicyRegistry before any transfer. Every revert path has a forge test, including a signature produced for Solana replayed on Base. Keys: Foundry keystores under ~/.nectar/evm only; never --private-key. Broadcasts only to 84532 through scripts/26-deploy-base.sh.
Report in ≤ 20 lines with addresses, tx hashes and test counts.
```

**Keeper key.** The keeper's function-call key is re-issued with `confirm_remote_deposit` and `keeper_attest_deposit` added to its method list; the old key is deleted with `near account delete-keys` in the same script run.

## 3. Priority, scope lock and cut order

P0 grows by exactly five items; everything else in v7 waits for `p0-green`, and the Base spoke has a hard stop at 2026-11-14 12:00 UTC.

**P0 additions (WO-19, WO-20):** aggregate-debt check, weekend guard rule in the contract, multiplier field with bounded owner updates, `pay_to` with `claimable_usdc`, `referrer` with the origination split. Nothing else enters P0.

**P1 lanes, in build order**

| Lane | Order |
| --- | --- |
| contract | WO-10 (OutLayer path) → WO-23a (Shields, Profit-Lock, fee stack) → WO-22 (Position Notes) → WO-23b (Reserve) |
| quoter + keeper | WO-9, WO-11 → WO-24 (OutLayer jobs: calendar, multiplier read, vault read) → WO-25 (MCP skill, x402) |
| web | WO-12 → WO-26 (v7 screens, landing port) |
| docs | WO-30 |
| researcher | WO-18 at P1 open (G10), WO-28 alongside |

**Contract-lane bottleneck.** One agent owns `contracts/`, and v7 adds most of its work there. If the contract lane's queue exceeds one day when P1 opens, the orchestrator may start a second contract agent, `contract-b`, owning only new files (`src/notes.rs`, `src/reserve.rs`, `src/shield.rs`, `src/self_settle.rs` and their tests). It asks for state fields and method registrations through a work order to `contract`, which owns `lib.rs`, `state.rs`, settlement and remote code. The orchestrator merges `contract` first.

**Scope lock**

- No v7 P1 file before `p0-green`. No P2b file before G7 has passed or been recorded as a disclosed failure.
- If P2b is not green by 2026-11-14 12:00 UTC, the orchestrator freezes it, records what exists in EVIDENCE and the README, and moves to the package.
- `thesis` work starts only if Kunal answers H18 with yes, and never before P2a is done.

**Cut order (cut first → cut last):** thesis notebook → Base spoke → copilot → x402 demo → Reserve → Position Notes → Profit-Lock → Shields → Feed MCP and agent skill → Solana leg (keep the signer round-trip) → 1Click depth → oracle (owner oracle, disclosed) → OutLayer quoter (static discount, disclosed). P0 is never cut. A cut module leaves its contract fields in place, unused and documented, so no redeploy is needed to drop it.

## 4. Gates G10–G14 and changes to G1, G2, G7

The verifier runs the new gates exactly like the old ones: fresh clone, no secrets beyond `.env.example`, evidence in `docs/EVIDENCE.md`, STOP on FAIL. Exact commands are in `docs/work/gates-v7.md`.

| Gate | When | Commands (abridged) | Pass criteria |
| --- | --- | --- | --- |
| **G10 v7 facts + toolchain** | P1 opens | `npm view @fastnear/x402 version` and its README (facilitator asset config); `cargo search near-contract-standards`; docs.rs for `near_sdk::env::keccak256_array`; `near contract call-function as-read-only v1.signer-prod.testnet derived_public_key json-args '{"path":"solana-devnet/pos/0","predecessor":"<core>","domain_id":1}' network-config testnet now` and the same with `domain_id: 0`; NYSE holiday and early-close list from nyse.com; Rhea on testnet nearblocks; `forge --version`, `cast --version`; viem and wallet-adapter versions | F-129, F-136, F-137, F-139 resolved in FACTS; derived keys returned for both domains; calendar JSON committed with its source URL and date |
| **G11 v7 contract** | after WO-22 and WO-23 merge | `cargo test -p nectar-core v7_`; `cargo test -p nectar-core --test sandbox_v7`; `python3 tests/model.py --check --v7` | every v7 test in PRD 6.11 green; gas per new method recorded and under 100 Tgas; F-127 answered (xStocks mechanism) or recorded as open |
| **G14 x402 paid call** | after WO-25 | `pnpm --filter x402 demo:testnet`: the demo agent borrows against mock NVDAx, requests `/api/feed/export.csv`, receives 402, pays, receives 200 | one paid response in EVIDENCE with the NEAR testnet transfer hash and the facilitator's relay transaction |
| **G12 Base toolchain + collateral** | P2b opens | `scripts/06-base.sh` (keystores), funding (H15), `cast call` simulation of `createB20` from the deployer (reverts if creation is gated), else `forge script script/DeployMock.s.sol`; `forge test` in `evm/`; `scripts/26-deploy-base.sh` | vault and collateral addresses visible on a Base Sepolia explorer; `forge test` green; F-123 resolved |
| **G13 Base round-trip** | after WO-29 | open a Base position, confirm the deposit, trigger settlement, keeper sends `settle` with the ERC-8021 suffix; separately repay and `release` | both transactions confirmed on 84532; `ecrecover` passed on-chain; a replayed nonce and a Solana-domain signature both revert; F-132 resolved |

**Changes to existing gates**

- **G1** adds the P0 subset of v7 tests: aggregate debt, weekend rule (price older than 900 s), multiplier bounds and announcement, `pay_to` failure to `claimable_usdc`, referrer ≠ borrower.
- **G2/G3** re-run as **G2b/G3b** against `nectar-core-v2` when the build was in state C or D.
- **G7** adds the remote lifecycle on Solana devnet: stored authority equals `derived_public_key`, attested deposit (or the labelled keeper fallback), and a signed release after repay.

## 5. P0 delta work orders

Three work orders bring P0 to the v7 shape; in states B and A they land before G1, in states C and D they produce `nectar-core-v2`.

**WO-19 · contract · P0 delta** (`docs/work/wo-19-contract-p0-delta.md`)

1. `CollateralConfig.total_debt_usd_e6`; the borrow check becomes `debt ≤ LTV_c × V_position` and `total_debt + borrow ≤ (1 − h_c)(Q_c + R_c + D_c)`; updated on borrow, repay and settlement (PRD 4.2).
2. Weekend guard: `session_calendar` windows loaded by `set_session_calendar`; until a calendar is loaded the asset is treated as closed (fail closed); price older than 900 s forces closed; `force_session_closed` (owner) (PRD 4.7).
3. Multiplier: `multiplier_e18` (default 1e18), `price_kind`, `ca_pending`; `set_multiplier` capped at +5% per call; `announce_corporate_action` at least one hour ahead; new borrows refused while pending (PRD 4.6). `mock-ft` gains `multiplier()` and owner `update_multiplier`.
4. `pay_to: {receiver_id, memo}` on `LockCollateralAndBorrow`; transfer-failure callback credits `claimable_usdc`; `withdraw_claimable()`.
5. `referrer` with `register_referrer` (owner) and referrer ≠ borrower; origination 30 bps, half to the referrer (PRD 4.11).
6. Rename anything built with the old "uplift" formula or with R\_c meaning DEX depth. `reserve` fields exist with value 0 until WO-23b.
7. Tests: the G1 additions in section 4, each in `tests/sandbox.rs` against the real mock-ft; `model.py` extended for aggregate debt and multiplier.

**WO-20 · web · P0 delta** (`docs/work/wo-20-web-p0-delta.md`)

1. Feed equation card uses PRD 4.2 with live Q\_c, R\_c, D\_c, h\_c and total debt; labels R\_c "Nectar Reserve" and D\_c "verified DEX depth".
2. Session badge on every asset: "In session" or "Weekend parameters" with the reason (calendar, stale price, forced closed).
3. Sign modal shows the fee stack and its total; `/borrow` gains the `pay_to` field and reads `?ref=` into `referrer`; the multiplier line appears when M ≠ 1.
4. Landing: port `landing/index.html` v7 as the home page. Sections for modules not yet built stay in the code behind a flag in `config.yaml` (`features:`), off until their gate passes.

**WO-6a · orchestrator · v2 deployment** (states C and D only; `docs/work/wo-06a-deploy-v2.md`)

1. `scripts/21-deploy-v2.sh`: create `nectar-core-v2.nectar.testnet`, deploy with `new`, `upsert_collateral`, `set_session_calendar` (if G10 ran) and `fund_gas_reserve`.
2. Re-issue the keeper function-call key for the v2 receiver; delete the old key.
3. `scripts/40-seed-demo.sh --core nectar-core-v2.nectar.testnet`; switch `config.yaml`; record both accounts in FACTS.
4. Verifier runs G2b and G3b; EVIDENCE keeps the v1 blocks.

## 6. P1 v7 work orders

Nine work orders add the v7 modules after `p0-green`; each has its own file under `docs/work/` and one acceptance test the verifier can run.

| WO | Agent | Builds | Acceptance | FACTS |
| --- | --- | --- | --- | --- |
| WO-18 | researcher | G10 checks: x402 package and asset config, NFT standards crate, `keccak256_array`, both derived keys, NYSE calendar 2026–2027, Rhea on testnet, Foundry and wallet library versions | every VERIFY item of F-129, F-136, F-137, F-139 resolved or recorded as a conflict | F-129, F-136–F-139 |
| WO-23a | contract | Shields (`shield` field, weekend sizing, flat fee, window, 5 opens per account per day), Profit-Lock (`self_settle`, opt-in quotes, daily cap, 50 bps), fee-stack constants | sandbox: shield sized at weekend limit while in session; self-settle refused without opted-in capacity and above the cap | — |
| WO-22 | contract (or `contract-b`) | NEP-171/177/181 Position Notes in nectar-core: mint on quote, loan and Reserve deposit; owner-as-authority checks; transfer lock while Settling; transfer clears remote recipient; `nft_token` media as live data-URI SVG from `packages/ui/notes/position-note.svg`; `nft_token_svg` | sandbox: authority follows transfer; transfer refused while Settling; SVG view under 30 Tgas | F-134, F-137 |
| WO-23b | contract (or `contract-b`) | Nectar Reserve: `JoinNectarReserve` (≥ $10), shares, per-share fee and unit indexes, `unit_debt`, waterfall after quotes at `reserve_discount_bps`, 7-day exit | model.py: late depositor gets no earlier units; waterfall order holds | — |
| WO-24 | quoter + keeper | OutLayer jobs beside the quoter: `calendar` (holidays, halts → `force_closed`), `multiplier` (eth\_call `multiplier()` on Base Sepolia), `vault_read` (Solana `getAccountInfo`, Base `eth_call`) returning attested JSON ≤ 900 bytes; keeper pushes results through `confirm_remote_deposit` and owner-bounded updates | one attested execution per job visible on app.outlayer.ai | F-040–F-046, F-120 |
| WO-25 | keeper | MCP tools `open_protected_stock_loan`, `preview_borrow`, `quote_capacity`, `get_note`, `build_self_settle`; `services/x402/`: resource server on the Feed (`/api/feed/export.csv`, 0.01 mock USDC) with `@fastnear/x402`, own facilitator with a CLI-created relayer, and `demo-agent.ts` that borrows then pays | G14 | F-128, F-129 |
| WO-26 | web | `/shield`, `/reserve`, `/notes`, `/note/[id]`, `/agents`; additions to `/borrow`, `/position/[id]`, `/console`; landing sections switched on per `features:` flag as their gates pass | Playwright flows for each screen; a11y ≥ 90; no horizontal scroll at 400 px | — |
| WO-28 | researcher | multiplier sources: B20 `multiplier()` on Base Sepolia; xStocks on-chain mechanism (Token-2022 Scaled UI Amount or not) | F-127 resolved or recorded open; WO-24 input updated | F-120, F-127 |
| WO-30 | docs | docs pages for every v7 module (Concepts and Protocol), README "What is live" rows for each module with its gate, legal pages updated for Notes and Reserve (no investment offer), cut modules removed from landing and README at package time | `pnpm --filter docs-site build` green; README rows match EVIDENCE | all v7 ids |

**x402 demo specifics (WO-25).** The facilitator relayer is `x402-relayer.nectar.testnet`, created by `scripts/00-accounts.sh --extra x402-relayer` and funded with 3 NEAR. The demo agent is `agent1.nectar.testnet` with a full-access key in the keychain, because NEP-366 delegates need one (F-128). If the facilitator cannot take the mock USDC as its asset (F-129), the orchestrator records the failure and drops x402 per the cut order; it does not swap in a different token without a FACTS entry.

## 7. P2a delta: remote lifecycle on Solana

The first prompt's Solana work orders (WO-13 to WO-17) stay; v7 adds the reserve, confirm and release steps so a Solana loan is never paid against an unverified deposit (PRD 9B).

| WO | Agent | Change |
| --- | --- | --- |
| WO-21 | contract | `reserve_remote_position` with path `solana-devnet/pos/<id>` and a cross-contract call to `v1.signer-prod.testnet.derived_public_key(path, predecessor = self, domain_id = 1)`; `on_authority` stores the key; 30-minute reservation expiry; `confirm_remote_deposit` → OutLayer `vault_read` → `on_deposit_verified` (authority and units match, both limits re-checked with a fresh price, then payout); `keeper_attest_deposit` behind `allow_keeper_deposit_attestation`; `request_remote_release` signing the NECTAR\_RELEASE\_V1 message (pipe-joined fields, PRD 9B) over raw bytes with Eddsa (F-130). Sandbox tests use stub signer and OutLayer contracts. |
| WO-14 delta | solana | `open_position(position_id, authority, amount)` stores the NEAR-derived authority; new `release` instruction that, like `settle`, requires the preceding Ed25519 verify instruction over the rebuilt `NECTAR_RELEASE_V1` bytes and pays the depositor; `cancel_position` removed. Negative tests: release with a settlement signature, release replayed, release before repay (wrong message). |
| WO-16 delta | keeper | after `remote_reserved`, watch the vault for the deposit and call `confirm_remote_deposit`; after `remote_release_signed`, build `[Ed25519 verify, release]` and send it. |
| WO-31 | web | remote flow on `/borrow`: chain selector, reserve step, Phantom (devnet) deposit with the stored authority shown, "waiting for attested deposit" state, release button after repay. |

G7 is extended as described in section 4: the verifier checks that the vault's stored authority equals the `derived_public_key` view result before it accepts the round-trip.

## 8. P2b work orders: Base Sepolia spoke

The Base spoke reuses the Solana lifecycle with a secp256k1 key and an EIP-712 message; it starts after G7 and stops at 2026-11-14 12:00 UTC whatever its state.

| WO | Agent | Builds | Acceptance |
| --- | --- | --- | --- |
| WO-27 | evm | `evm/` Foundry project: `NectarVaultBase.sol`, `MockB20.sol` (ERC-20 + `multiplier()`, `scaledBalanceOf`, `toScaledBalance`, `toRawBalance`), `PolicyRegistryMock.sol` (`isAuthorized(policyId, account)`); scripts `CreateB20.s.sol` (B20Factory `createB20` with ASSET params from the base-std interfaces, policies set explicitly), `DeployMock.s.sol`, `DeployVault.s.sol`; `tests/eip712_vectors.json` generated with viem for the contract agent | G12 |
| WO-29a | contract | `RemoteChain {chain_id: "base-sepolia", vault, mpc_domain_id: 0}`; reserve path `base-sepolia/pos/<id>`; `derived_public_key` with `domain_id = 0` → EVM address = last 20 bytes of keccak256(x‖y); EIP-712 digest for `Settle` and `Release` built on-chain and unit-tested against `eip712_vectors.json`; `sign` with `payload_v2: {Ecdsa: <64 hex>}`, 1 yoctoNEAR, gas from the signer config; `on_signature` stores `big_r`, `s`, `recovery_id` | vectors match byte for byte; sandbox with a stub signer |
| WO-29b | keeper | `services/keeper/base.ts`: viem client on 84532, keystore account, converts the signature (`r` = x of `big_r`, `s`, `v = 27 + recovery_id`), builds `settle`/`release` calldata, appends the ERC-8021 suffix when `BASE_BUILDER_CODE` is set (H13), sends, then `relay_settlement_result` | G13 |
| WO-29c | evm | vault checks: digest recomputed, `ecrecover == authority`, nonce unused, not expired, `isAuthorized(policyId(TRANSFER_RECEIVER_POLICY), recipient)`; forge tests for every revert including a replayed nonce and a digest built for chain 8453 | `forge test` green |
| WO-31 Base | web | injected EVM wallet on 84532 (viem/wagmi, versions from G10): approve and `openPosition` with the stored authority shown, waiting state, `release` after repay | Playwright against a local anvil fork plus one manual Base Sepolia run recorded in EVIDENCE |
| WO-32 | researcher | optional `thesis/` notebook: pinned DefiLlama pulls, the premium-versus-spot-fee model, every number re-computable with one command | only if H18 = yes; never before P2a is done |

If `createB20` is gated (F-123), WO-27 uses `MockB20` and the README says "B20-compatible mock" wherever the collateral appears.

## 9. Keys and wallets added by v7

Every new key is created by a script into a keystore or the OS keychain; no key appears in a command line, a log or the repo.

**NEAR testnet (`scripts/00-accounts.sh --extra`)**

| Account | Purpose | Key |
| --- | --- | --- |
| `x402-relayer.nectar.testnet` | x402 facilitator relayer, about 3 NEAR | full access, keychain (it relays delegates) |
| `agent1.nectar.testnet` | demo agent for the skill and the x402 call | full access, keychain (NEP-366 delegates need one, F-128) |
| `nectar-core-v2.nectar.testnet` | v2 contract in states C and D | full access during the hackathon, deleted on mainnet |

**Base Sepolia (`scripts/06-base.sh`)**

```
mkdir -p ~/.nectar/evm && chmod 700 ~/.nectar/evm
openssl rand -hex 24 > ~/.nectar/evm/password && chmod 600 ~/.nectar/evm/password
# grammar confirmed with `cast wallet new --help` at G10 and written to FACTS
for name in deployer keeper borrower1 buyer1; do
  cast wallet new ~/.nectar/evm "$name" --unsafe-password "$(cat ~/.nectar/evm/password)"
done
cast wallet address --keystore ~/.nectar/evm/deployer --password-file ~/.nectar/evm/password
```

The script prints addresses only. Funding comes from a Base Sepolia faucet that needs a login (H15); once the deployer is funded, the script moves a small amount to the keeper and borrower with `cast send --account` from the keystore.

**`.env.example` additions**

| Variable | Set by | Placeholder |
| --- | --- | --- |
| `BASE_CHAIN_ID=84532` | fixed | — |
| `BASE_RPC_URL` | G12 (public Base Sepolia endpoint, recorded in FACTS) | `TODO-G12` |
| `BASE_KEYSTORE_DIR`, `BASE_PASSWORD_FILE` | script | paths only |
| `BASE_VAULT_ADDRESS`, `BASE_COLLATERAL_ADDRESS` | G12 | `TODO-G12` |
| `BASE_BUILDER_CODE` | Kunal (H13) | empty = no ERC-8021 suffix |
| `X402_FACILITATOR_URL`, `X402_RELAYER_ACCOUNT_ID`, `AGENT1_ACCOUNT_ID` | WO-25 | `TODO-G14` |

The guard hook refuses any `--private-key` argument, so a key cannot reach the transcript even by mistake.

## 10. UI work

The landing page is already rebuilt for v7 in the bundle; the web agent ports it, adds the screens in PRD 12.1, and wires the Position Note SVG the contract renders.

**Landing v7 (`landing/index.html`, ported in WO-20):** hero "Borrow against stocks without fire-sales"; a live limit card showing the weekend effect (in-session vs weekend parameters); three Shield cards; a Reserve strip from $10; Spend-without-selling and Profit-Lock; a Position Note preview; NEAR hub with Solana and Base spokes; agent channel; FAQ; the shared footer. Each module section carries `data-feature="<name>"` and is shown only when `config.yaml features.<name>` is true, which the orchestrator flips when that module's gate passes.

**Screens:** the eight routes in PRD 12.1, each handling no wallet, wrong network, no balance, loading, RPC error, empty, paused and — new in v7 — weekend parameters and pending corporate action.

**Position Note SVG (`packages/ui/notes/position-note.svg`)**

- 600 × 360, fixed Nectar dark palette (a Note is shown in wallets and on X, outside our theme): background `#0d0f12`, accent `#16f3a9`, heading `#e6e9ef`, dim `#8f96a3`.
- Placeholders filled by the contract with `format!`: `{{TYPE}}` (QUOTE, LOAN, RESERVE), `{{ID}}`, `{{ASSET}}`, `{{M1_LABEL}}`…`{{M4_VALUE}}` (four metrics per type), `{{BAR_PCT}}` (0–100, LTV or utilisation), `{{STATUS}}`, `{{CONTRACT}}`.
- Metrics per type: LOAN = LTV, health, debt, backing (Q\_c + R\_c); QUOTE = remaining, max discount, unlock, claimable fees; RESERVE = shares, USDC value, claimable units, fees.
- Only numbers and fixed words enter the SVG. Account ids are XML-escaped; no user-supplied text is rendered. The template stays under 2 KB so `nft_token_svg` costs little gas.
- `/note/[id]` renders the same SVG and a "Share to X" link (a tweet-intent URL the user clicks; no agent posts).

## 11. New human handoffs

Six new handoffs, none of which blocks P0 or P1; each already has its entry in `docs/HUMAN_HANDOFF.md` with the format of the first prompt.

| Id | What Kunal does | What Claude Code does then | Default if silent |
| --- | --- | --- | --- |
| H15 · Base Sepolia ETH | 1. Read the deployer address in `docs/HUMAN_HANDOFF.md` (printed by `scripts/06-base.sh`). 2. Sign in to a Base Sepolia faucet from the list recorded in FACTS at G12. 3. Send at least 0.05 Sepolia ETH to the deployer. 4. Reply `H15 done <tx hash>`. | funds keeper and borrower from the deployer, runs G12 | P2b skipped and disclosed |
| H13 · Base builder code | 1. Register the project on Base Dashboard. 2. Copy the code from Settings → Project Settings → Builder Code (F-126). 3. `echo 'BASE_BUILDER_CODE=<code>' >> services/keeper/.env.local`. 4. Reply `H13 done`. | keeper appends the suffix; G13 checks the last 16 bytes of calldata | no suffix; README says so |
| H16 · final tracks | Read the track list the orchestrator proposes in `docs/SUBMISSION.md` (core three plus each track whose gate passed) and reply `H16 <ids>`. | fills the submission payload | core three plus passed tracks |
| H17 · consumer line | Reply `H17 fire-sales` or `H17 liquidations`. | updates landing, README and X draft | "without fire-sales" |
| H18 · thesis notebook | Reply `H18 yes` or `H18 no`. | yes: WO-32 after P2a | not attempted |
| H14 · market.near.ai task (optional) | Post the task text from `docs/MARKET_TASK.md` on market.near.ai from your own account; reply `H14 <url>`. | links it from `/agents` and the README | not posted |

As before: the agents write the placeholder, try the correct alternative (for example `MockB20` when `createB20` is gated), and move on. They never register, post or fund anything themselves.

## 12. Token economy while applying the addendum

Adopting v7 costs exactly one cache rebuild if it happens at a phase boundary; done mid-dispatch it costs one per running agent.

- Apply the v7 `CLAUDE.md` and agents only between dispatch rounds (state B: next merge boundary; state C: before P1 opens). Write `docs/STATE.md` first, then `/compact`, then replace the files, then send the resume message.
- Keep the model and effort the session started with. A model switch mid-build resets the prompt cache for every subsequent turn of that session; if one already happened, do not switch back, just continue.
- New agents (`evm`, optional `contract-b`) start with `omitClaudeMd: false` and read only their own work order plus the FACTS ids it lists.
- The researcher answers G10 in one pass (one report of at most 40 lines) instead of one call per fact.
- The PRD is long: agents read only the sections their work order names (`docs/PRD.md` §4.6 for WO-19 item 3, §6.11 for WO-22, and so on). The orchestrator never pastes PRD text into a message.
- Test vectors are shared files (`tests/vectors.json`, `tests/eip712_vectors.json`, `tests/model.csv`), referenced by path, never re-pasted between agents.

## 13. The resume message

Paste this into the running Claude Code session (or append it to the first kickoff message in state A). Before pasting, copy the refreshed bundle's `docs/BUILD_PROMPT_V7.md`, `docs/PRD.md` (v7) and `docs/work/wo-18`…`wo-32` into the repo; the orchestrator installs the rest itself.

```
PRD v7 and Build Prompt Addendum v7 are in docs/PRD.md and docs/BUILD_PROMPT_V7.md.
The first build prompt stays in force; the addendum adds and overrides.

1. Detect the build state (addendum section 1) from docs/STATE.md, git tags and
   packages/config/config.yaml. Write the state letter and current commit as the first
   line of docs/STATE.md and as D-009 in docs/DECISIONS.md.
2. Do not interrupt running work orders. At the next merge boundary: write STATE.md,
   /compact, then install the v7 files from the bundle (CLAUDE.md, .claude/settings.json,
   .claude/hooks/guard.sh, .claude/agents/evm.md, docs/FACTS.md, docs/HUMAN_HANDOFF.md,
   packages/config/config.yaml, .env.example, scripts/06-base.sh, scripts/21-deploy-v2.sh,
   scripts/26-deploy-base.sh, landing/index.html, packages/ui/notes/position-note.svg).
   Merge FACTS: keep every entry already verified in this repo, add F-120..F-139 and
   C-004..C-008, never overwrite a newer date with an older one.
3. P0: dispatch WO-19 (contract) and WO-20 (web) now if P0 is open; in state C or D,
   build v2 and run WO-6a, then G2b and G3b. P0 grows by five items only.
4. P1 opens only after p0-green: WO-18 first (G10), then the lanes in addendum section 3.
   Gates G11 and G14 join G4-G6.
5. P2a adds WO-21 and the WO-14/WO-16 deltas; G7 includes the remote lifecycle.
6. P2b (Base Sepolia, 84532) starts after G7 and stops at 2026-11-14 12:00 UTC whatever
   its state. Base mainnet is blocked; never use --private-key.
7. New handoffs H13-H18 are in docs/HUMAN_HANDOFF.md. Never register a builder code,
   post on market.near.ai or fund an account yourself.

Rules unchanged: verify before implementing, STOP on a failed gate, never send, post,
publish or touch mainnet without my typed confirmation, keep the README truthful,
no hackathon branding in the product UI. Report in <= 15 lines at each gate.

Begin with step 1.
```

After P2b or at 2026-11-14 12:00 UTC, whichever comes first, the closing message from the first prompt applies unchanged: `Prepare the submission package per section 13 and run G9. Do not send anything.`
