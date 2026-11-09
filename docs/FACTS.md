# FACTS.md — single source of truth

Every entry: `F-nnn | date verified | statement | source (URL or command) | used by`.
Status: **V** verified from a primary source on the date · **VERIFY** must be confirmed at the named gate
before use · **LIVE** re-checked daily (see §LIVE). Conflicts are listed in §CONFLICTS and never
resolved by preference. Seeded 2026-11-09 from the PRD research session; the researcher agent
re-dates entries it re-confirms.

## Hackathon
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-001 | 2026-11-09 | V | Development closes 2026-11-14 23:59 UTC; judging 16–18 Nov | https://nearhackathon.com/ , docs/HACKATHON.md | all |
| F-002 | 2026-11-09 | V | Q-007: no NEAR Intents testnet; mainnet only with tiny amounts; 1Click `dry: true` for quotes | docs/HACKATHON.md Q-007 | WO-11 |
| F-003 | 2026-11-09 | V | Q-010: testnet-only projects eligible | docs/HACKATHON.md Q-010 | all |
| F-004 | 2026-11-09 | V | Q-017: Claude Code / Codex screen repos for "runs and does what README says" | docs/HACKATHON.md Q-017 | README, G9 |
| F-005 | 2026-11-09 | V | Q-002/Q-005: pre-hackathon baseline must be disclosed | docs/HACKATHON.md | README |
| F-006 | 2026-11-09 | V | Q-015: one person in ≤ 2 projects | docs/HACKATHON.md Q-015 | SUBMISSION |
| F-007 | 2026-11-09 | V | Submission API `website` field is a spam trap: leave empty | docs/HACKATHON.md | SUBMISSION |
| F-008 | 2026-11-09 | V | Q-008: mainnet costs not reimbursed | docs/HACKATHON.md Q-008 | ops |

## NEAR toolchain
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-010 | 2026-11-10 | V | `near-sdk` 5.30.1 is max_stable (published 2026-11-05, rust_version 1.95, edition 2024, not yanked); `near-sdk-macros` 5.30.1 | https://crates.io/api/v1/crates/near-sdk/5.30.1 | contracts |
| F-011 | 2026-11-10 | V | `cargo-near` 0.23.0; `cargo near build non-reproducible-wasm` / `reproducible-wasm` (README RUSTFLAGS section, tag cargo-near-v0.23.0) | git clone --branch cargo-near-v0.23.0 https://github.com/near/cargo-near → README.md | scripts/10 |
| F-012 | 2026-11-09 | V | `near-api-js` 7.4.0; Node ≥ 22.22.2 | https://www.npmjs.com/package/near-api-js | services, web |
| F-013 | 2026-11-09 | V | NEP-141: `ft_transfer` / `ft_transfer_call` require exactly 1 yoctoNEAR; receiver `ft_on_transfer(sender_id, amount, msg)` returns the unused amount | https://nomicon.io/Standards/Tokens/FungibleToken/Core | contracts |
| F-014 | 2026-11-09 | V | Storage staking 1E19 yoctoNEAR per byte | https://docs.near.org/ (storage staking) | contracts |
| F-015 | 2026-11-09 | V | Function-call access keys cannot attach deposits; exhausting allowance makes the key unusable | https://docs.near.org/ (access keys) | keeper, contracts |
| F-016 | 2026-11-10 | V | Faucet account creation: `near account create-account sponsor-by-faucet-service <id> autogenerate-new-keypair save-to-keychain network-config testnet create` (v0.31.1 also accepts `autogenerate-new-keypair --signature-scheme ed25519`; see F-020) | near-cli-rs v0.31.1 src/commands/account/create_account/sponsor_by_faucet_service + docs/GUIDE.en.md:661 | scripts/00 |
| F-017 | 2026-11-10 | V | Deploy: `near contract deploy <id> use-file <wasm> without-init-call network-config testnet sign-with-keychain send`; init variant `... use-file <wasm> with-init-call <fn> json-args '<json>' prepaid-gas '100 TGas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send` (signer = `<id>`, no `sign-as`) | near-cli-rs v0.31.1 src/commands/contract/deploy/{mod.rs,initialize_mode/call_function_type/mod.rs}; docs/GUIDE.en.md:2438-2450 | scripts/20 |
| F-018 | 2026-11-10 | V | Calls: `near contract call-function as-transaction <contract> <method> json-args '<json>' prepaid-gas '<n> Tgas' attached-deposit '<x> NEAR' sign-as <signer> network-config testnet sign-with-keychain send`; `near contract call-function as-read-only <contract> <method> json-args '<json>' network-config testnet now` | near-cli-rs v0.31.1 src/commands/contract/call_function; docs/GUIDE.en.md:2345-2406 | scripts, verifier |
| F-019 | 2026-11-10 | V (corrected) | `near account delete-keys <owner> public-keys <pk,...> network-config ...` and `near account export-account <id> using-seed-phrase\|using-private-key\|using-web-wallet` exist. **No `generate-keypair` / `save-to-file` key command exists in v0.31.1** (only tx `save-to-file`); keypairs are generated via `autogenerate-new-keypair` inside create-account/add-key. See C-005 | near-cli-rs v0.31.1 src/commands/account/{delete_key,export_account}/mod.rs; `grep -rn generate-keypair src` → none | scripts, RUNBOOK |
| F-020 | 2026-11-10 | V (source v0.31.1; --help confirm pending H-TOOLCHAIN) | Sub-account: `near account create-account fund-myself <new_account_id> '<amount>' autogenerate-new-keypair [--signature-scheme ed25519] save-to-keychain sign-as <signer_account_id> network-config testnet sign-with-keychain send` (positional: new_account_id, initial_balance; `sign-as` takes a positional signer id). Function-call key: `near account add-key <owner_account_id> grant-function-call-access --allowance '<amount>\|unlimited' --contract-account-id <receiver> --function-names 'm1,m2' autogenerate-new-keypair [--signature-scheme ed25519] save-to-keychain network-config testnet sign-with-keychain send` (signer = owner_account_id; function names comma-split + trimmed). Flags are `--contract-account-id` / `--function-names`, **not** `--receiver-account-id` / `--method-names` (C-004). `--signature-scheme` (ed25519 \| ml-dsa-65) is new: omitted → defaults to ed25519 when stdin is not a TTY, but prompts in a TTY → scripts should pass `--signature-scheme ed25519` | near-cli-rs v0.31.1 (commit 5cdedc38) src/commands/account/create_account/fund_myself_create_account/{mod.rs,add_key/autogenerate_new_keypair/mod.rs,sign_as/mod.rs}; src/commands/account/add_key/{mod.rs,access_key_type/mod.rs:53-65}; src/common.rs:1000-1064; docs/GUIDE.en.md:1428-1441 | scripts/00, PRD §keeper |
| F-021 | 2026-11-09 | V | NEP-297 event format: `EVENT_JSON:{"standard","version","event","data"}` in logs | https://nomicon.io/Standards/EventsFormat | contracts, feed |
| F-022 | 2026-11-10 | V | near-cli-rs latest release v0.31.1 (2026-11-05); tag commit 5cdedc38 | https://api.github.com/repos/near/near-cli-rs/releases (orchestrator G0) | scripts/01 |
| F-023 | 2026-11-10 | V | cargo-near latest release `cargo-near-v0.23.0` (2026-11-06) | https://api.github.com/repos/near/cargo-near/releases (orchestrator G0) | scripts/01 |
| F-024 | 2026-11-10 | V | gitleaks latest release v8.30.1 | https://api.github.com/repos/gitleaks/gitleaks/releases (orchestrator G0) | G9 |
| F-025 | 2026-11-10 | V | agave stable v4.4.1 (2026-11-05) | https://api.github.com/repos/anza-xyz/agave/releases (orchestrator G0) | scripts/05 |
| F-026 | 2026-11-10 | V | pnpm 10.34.9 on npm; root package.json pins `packageManager: pnpm@10.34.9` (corepack rejects bare `pnpm@10`) | https://registry.npmjs.org/pnpm (orchestrator G0) | root |
| F-027 | 2026-11-10 | V | cargo-near 0.23.0 wasm stage: target `wasm32-unknown-unknown`, default rustflags `-C link-arg=-s`, `--cfg near` force-appended (near-sdk ≥ 5.27 needs it for the on-chain host-function path); ambient RUSTFLAGS stripped. ⇒ build contracts only with `cargo near build`; plain `cargo build --target wasm32-unknown-unknown` lacks `--cfg near`. No `target-cpu=mvp`/feature flag in cargo-near source. Whether Rust 1.95 wasm output is accepted by the NEAR VM without extra flags: **VERIFY G1** (sandbox deploy in near-workspaces test is the proof) | cargo-near-v0.23.0 README.md:283-295, cargo-near-build/src/near/build/mod.rs:552-611, src/lib.rs:56 | WO-2, scripts/10 |
| F-028 | 2026-11-10 | V | near-sdk 5.30.1 API names: `#[near(contract_state)]` (macro arg `contract_state`), `#[derive(PanicOnDefault)]`, `near_sdk::store::{LookupMap, IterableMap, IterableSet, LookupSet, Vector, LazyOption, Lazy, TreeMap, UnorderedMap}`, `BorshStorageKey`, `ext_contract`, `Promise`, `PromiseOrValue`, `NearToken`, `Gas`, `env::sha256` / `env::sha256_array`, yield/resume: `Promise::new_yield(..) -> (Promise, YieldId)`, `Promise::new_yield_with_id(.., UserYieldId)`, `YieldId::resume`, `ResumeError`, low-level `env::promise_yield_create`, `env::promise_yield_resume(&data_id, data) -> bool`, `env::promise_yield_resume_with_yield_id`; `Nep297Event`/`AsNep297Event` for events | near-sdk-rs tag near-sdk-v5.30.1 (bacd081a): near-sdk/src/lib.rs:1305-1626, store/mod.rs:164-193, environment/env.rs:41,2390-2541, promise.rs:399-480, near-sdk-macros/src/lib.rs:110,227 | WO-2 |
| F-029 | 2026-11-10 | V | `near-workspaces` 0.24.0 is max_stable (2026-10-26, rust_version 1.95) | https://crates.io/api/v1/crates/near-workspaces | WO-2 tests |

## Chain Signatures (near/mpc commit b5bafa3, read 2026-11-09)
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-030 | 2026-11-09 | V | Contracts: `v1.signer` (mainnet), `v1.signer-prod.testnet` (testnet) | https://docs.near.org/chain-abstraction/chain-signatures | contracts |
| F-031 | 2026-11-09 | V | `sign({ path, payload_v2: {Ecdsa: <64 hex>} \| {Eddsa: <hex>}, domain_id })`; legacy `payload: [u8;32]` + `key_version` still parse | near/mpc crates/near-mpc-crypto-types/src/sign.rs | contracts |
| F-032 | 2026-11-09 | V | domain_id 0 = Secp256k1, 1 = Ed25519 | near/mpc primitives.rs | contracts |
| F-033 | 2026-11-09 | V | `SIGN_DEPOSIT_YOCTONEAR = 1` | near/mpc crates/near-mpc-contract-interface/src/deposits.rs | contracts |
| F-034 | 2026-11-09 | V | Gas requirement from contract config `sign_call_gas_attachment_requirement_tera_gas` | near/mpc | contracts, config |
| F-035 | 2026-11-09 | V | Response `SignatureResponse::Ed25519 { signature }` | near/mpc sign.rs | contracts, keeper |
| F-036 | — | VERIFY G7 | Ed25519 derived-key derivation for a (`account`, `path`) and how to compute the Solana pubkey off-chain; root key via `public_key` view | docs.near.org chain signatures + mpc repo | scripts/derive-solana-authority.ts |

## OutLayer (read 2026-11-09)
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-040 | 2026-11-09 | V | Contracts `outlayer.testnet`, `outlayer.near`; `request_execution` with `source: {Project:{project_id, version_key}}` or `{WasmUrl:{url,hash,build_target}}`, `resource_limits`, `input_data`, `secrets_ref{profile,account_id}`, `response_format`, `payer_account_id` | https://docs.outlayer.ai/ | contracts |
| F-041 | 2026-11-09 | V | `resource_limits`: max_instructions default 1e9 / max 5e11; max_memory_mb 128 / 4096; max_execution_seconds 60 / 180 | OutLayer docs | config |
| F-042 | 2026-11-09 | V | `estimate_execution_cost(resource_limits, input_len)` view | OutLayer docs | scripts/30, contracts |
| F-043 | 2026-11-09 | V | stdout ≤ 900 bytes; HTTP only on `wasm32-wasip2` via `wasi-http-client`; secrets delivered as env vars | OutLayer docs | quoter |
| F-044 | 2026-11-09 | V | Attestations viewable at https://app.outlayer.ai/executions ; FastFS testnet `test.fastfs.io` | OutLayer docs | web, EVIDENCE |
| F-045 | — | VERIFY G4 | Exact publish flow (`outlayer upload` / `outlayer deploy` CLI or UI) and `version_key` format on testnet | OutLayer CLI `--help` | scripts/30 |
| F-046 | — | VERIFY G4 | `estimate_execution_cost` result for max_instructions 1e8, max_memory_mb 128, input 512 B | RPC view | config |

## Oracles
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-050 | 2026-11-09 | V | docs.near.org lists `pyth-oracle.near` / `pyth-oracle.testnet` (`get_price(price_identifier)`, `update_price_feeds(data)`) and OutLayer `price-oracle.near` / `price-oracle.testnet` (Pyth-compatible views) | https://docs.near.org/primitives/oracles | contracts |
| F-051 | 2026-11-09 | V | Hermes: `https://hermes.pyth.network`, `https://hermes-beta.pyth.network`; REST mirror `https://pyth.dourolabs.app/hermes` `GET /v2/updates/price/latest?ids[]=` | Pyth docs | keeper |
| F-052 | 2026-11-09 | V | Rhea Finance (NEAR) lost ~$7.6M in April 2026 to a fake-token oracle exploit → staleness + confidence + allowlist checks are mandatory | Halborn write-up | contracts, SECURITY |
| F-053 | — | VERIFY G5 | NVDA price feed id on Hermes; whether `pyth-oracle.testnet` answers `get_price` today | Hermes `/v2/price_feeds?query=NVDA`, RPC view | config |

## NEAR Intents / 1Click (read 2026-11-09)
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-060 | 2026-11-09 | V | Base `https://1click.chaindefuser.com`; `GET /v0/tokens`, `POST /v0/quote`, `GET /v0/status`; header `X-API-Key` optional | https://docs.near-intents.org/ | keeper |
| F-061 | 2026-11-09 | V | `/v0/quote` required: dry, swapType, slippageTolerance, originAsset, depositType, destinationAsset, amount, refundTo, refundType, recipient, recipientType, deadline | 1Click docs | keeper |
| F-062 | 2026-11-09 | V | `@defuse-protocol/one-click-sdk-typescript` 0.1.26 exposes `verifyQuoteSignature()` | npm | keeper |
| F-063 | 2026-11-09 | V | xStocks / tokenized equities not in `/v0/tokens` on 2026-11-09 → Feed shows "no 1Click route" for NVDAx | `curl /v0/tokens` | web |

## NEAR AI Cloud (read 2026-11-09)
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-070 | 2026-11-09 | V | API base `https://cloud-api.near.ai/v1` (OpenAI-compatible chat completions) | https://cloud.near.ai docs | web |
| F-071 | 2026-11-09 | V | `GET /v1/attestation/report?model=&provider=near&signing_algo=ecdsa&nonce=<64hex>` with header `x-no-aliasing: true`; `report_data` = 32-byte signer identity zero-padded + 32-byte nonce; MRCONFIGID = `01` + SHA256(app_compose) + 15 zero bytes; RTMR3 replay | near-examples/nearai-cloud-verification-example | web |
| F-072 | 2026-11-09 | V | `GET /v1/signature/<chat_id>?signing_algo=`; `provider_tee` signs `<MODEL_ID>:<sha256(request)>:<sha256(response)>`; `gateway` signs `<sha256(request)>:<sha256(response)>` | same | web |
| F-073 | 2026-11-09 | V | DCAP quote verification with `@phala/dcap-qvl` | same | web |

## Solana
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-080 | 2026-11-09 | V | Ed25519 program id `Ed25519SigVerify111111111111111111111111111`; secp256k1 `KeccakSecp256k11111111111111111111111111111` | Solana docs | solana |
| F-081 | 2026-11-09 | V | Anchor 0.32.1; `@solana/kit` 8.6.0 | anchor-lang.com, npm | solana, keeper |
| F-082 | — | VERIFY G7 | Instructions sysvar address and Anchor 0.32.1 accessor; Ed25519 instruction data offsets | Solana docs, anchor source | solana |

## Web, docs, analytics
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-090 | 2026-11-09 | V | Docusaurus 3.10.2 (Node ≥ 20); gtag via classic preset `gtag: {trackingID, anonymizeIP}` loads in production only | https://docusaurus.io/ | docs-site |
| F-091 | 2026-11-09 | V | morpho.org IA: footer Customers / Company / Resources / Solutions / Legal / Social; principle line under logo | https://morpho.org/ (structure only; no copy reused) | footer |
| F-092 | 2026-11-09 | V | Nectar Network design tokens (see docs/DESIGN_SYSTEM.md) decoded from the redesign bundle | Nectar_Frontend_Redesign.html | ui |

## Claude Code (docs read 2026-11-09)
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-100 | 2026-11-09 | V | Prompt caching automatic; CLAUDE.md loaded at session start; invalidators: model switch, effort change, fast mode, MCP server add/remove, plugin enable, whole-tool deny, `/compact`, image accumulation, upgrade | docs.claude.com/claude-code | CLAUDE.md §3 |
| F-101 | 2026-11-09 | V | `CLAUDE_CODE_PROMPT_CACHE_TTL`, `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` (`5m`\|`1h`); settings `promptCacheTtl` / `subagentPromptCacheTtl`; `/usage` shows "Prompt cache (main)" | same | settings.json |
| F-102 | 2026-11-09 | V | Subagent frontmatter: name, description, tools, disallowedTools, model, permissionMode, maxTurns, autoCompactWindow, skills, mcpServers, hooks, memory, background, effort, isolation (worktree), color, initialPrompt, omitClaudeMd; `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` default 20 | same | .claude/agents |
| F-103 | 2026-11-09 | V | Agent teams experimental: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `teammateMode`, hooks TeammateIdle/TaskCreated/TaskCompleted | same | optional |

## Market figures (Kunal's FACTS-nectar-labs.md, 2026-11-09; re-pull on Nov 14)
| id | date | status | statement | source | used by |
| --- | --- | --- | --- | --- | --- |
| F-110 | 2026-11-09 | V | NEAR Intents cumulative volume $37.006B; TVL $189.13M (ATH $267.08M 2026-09-28) | https://defillama.com/protocol/near-intents | README |
| F-111 | 2026-11-09 | V | NEAR Intents Q3 2026 swap fees $14.43M; Oct 2026 fees $6.39M / revenue $2.19M | DefiLlama income statement | docs |
| F-112 | 2026-11-09 | V | Rhea Finance TVL $235.99M (#1 on NEAR) | https://defillama.com/chain/near | README |
| F-113 | 2026-11-09 | V | RWA on-chain AUM $33.609B ($30.239B active); DeFi active TVL $4.09B (13.5 %) | https://defillama.com/rwa | README |
| F-114 | 2026-11-09 | V | xStocks ~$196M total, >$182M on Solana (~93 %), >$3B cumulative volume; Superstate Opening Bell live on Solana | https://solana.com/news/case-study-xstocks | README |

## CONFLICTS (record, do not resolve by taste)
| id | topic | source A | source B | decision |
| --- | --- | --- | --- | --- |
| C-001 | Pyth on NEAR | Pyth contract-addresses page: NEAR not listed for Pyth Core | docs.near.org/primitives/oracles lists `pyth-oracle.near/.testnet` | G5 decides by calling the contract; fallback OutLayer `price-oracle.testnet`, then owner oracle (disclosed) |
| C-002 | 1Click fee | 25 bps unauthenticated | 20 bps (1 bp stable) with API key | display the fee returned by the quote itself |
| C-003 | Agent API hosts | docs name differing hosts for the NEAR AI Agent API | — | not used; only cloud-api.near.ai (F-070) |
| C-004 | add-key FC flag names | near-cli-rs docs/NEW_NEAR_CLI_INTERFACE.md:65 "`grant-function-call-access --receiver-account-id <account-id> --method-names 'comma,separated,list' --allowance '0.25NEAR'`" (also PRD §keeper, scripts/00-accounts.sh) | v0.31.1 source access_key_type/mod.rs:53-62 fields `allowance`, `contract_account_id`, `function_names` (all `long`) and docs/GUIDE.en.md:1431 "`--contract-account-id meta.pool.testnet --function-names 'set_a, set_b'`" | open; source + GUIDE agree; `--help` at H-TOOLCHAIN decides. Orchestrator/scripts owner to update scripts/00 + PRD |
| C-005 | F-019 `generate-keypair save-to-file` | FACTS F-019 seed (2026-11-09, "near-cli-rs README") | v0.31.1 source: no such command (`grep -rn generate-keypair src` empty) | open; F-019 corrected to source; nothing in scripts uses it |
| C-006 | fund-myself `sign-as` | docs/GUIDE.en.md:795-801 shows `sign-as` with no id before `network-config` | source sign_as/mod.rs:7-13 positional `signer_account_id` then named `network-config` | open; scripts pass the parent id explicitly (matches source) |

## LIVE (daily, researcher)
| checked (UTC) | signer `public_key` | outlayer `estimate_execution_cost` | Hermes NVDA price | 1Click tokens count | testnet RPC |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

## Account ids (filled by scripts at G2; mirrored in packages/config/config.yaml)
| role | testnet id | explorer |
| --- | --- | --- |
| owner / parent | TODO-G2 | |
| core | TODO-G2 | |
| usdc mock | TODO-G2 | |
| nvdax mock | TODO-G2 | |
| keeper | TODO-G2 | |
| buyer1 / buyer2 / borrower1 | TODO-G2 | |
| quoter project / version_key / sha256 | TODO-G4 | |
| solana program id / vault / authority | TODO-G7 | |
