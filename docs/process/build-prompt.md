# Nectar Labs — Claude Code Build Prompt (NEAR Hackathon)

Nov 9, 2026 · @Kunal Drall · Companion to *Nectar Labs PRD v6*. The PRD says what; this document says how Claude Code builds it, in what order, with which agents, and where it must stop for a human.

## 0. How to use this document

Three things come out of it, and the support bundle (`nectar-labs-support.zip`) already contains them as files:

1. **`CLAUDE.md`** at the repo root. Sections 1, 3, 5 and 12 are its content, verbatim. Claude Code loads it at session start, so everything there is cached across the whole session; keep it stable and put anything that changes often in `docs/FACTS.md` instead.
2. **`.claude/agents/*.md` and `.claude/settings.json`**. Section 4 is their content. They give the orchestrator a fixed team with fixed tool scopes.
3. **The kickoff message** (section 15). Paste it as the first user message in a fresh Claude Code session opened in the empty repo. Nothing else is needed; the session reads `CLAUDE.md`, the PRD export in `docs/process/prd.md`, and begins at G0.

Operating stance for the whole build:

- Verify before implementing: no protocol, SDK or CLI fact is used until it has been read from a primary source this session and written to `docs/FACTS.md` with a date and URL. A conflict between sources is written down as a conflict, never resolved by preference.
- Priority is linear: P0 ships before any P1 file is created; P1 before P2. A gate failure stops the phase and produces a report; it never triggers a workaround that hides the failure.
- Kunal may be absent for hours. When a step needs him, the agent writes the placeholder, writes the instructions, and continues with the next item in the current phase. It never waits, and never does the human step itself.
- Everything the judges' agents will run (Q-017) is written for a fresh clone with no secrets: `pnpm demo:testnet` and `pnpm verify` read only public testnet state.
- Honest over optimistic: the README states what is live on testnet, what is a mock, what fell back, and what is PROD-only. A fallback that is not disclosed is a bug.

## 1. Mission, deadline, scope lock, non-negotiables

**Mission.** Ship Nectar Labs on NEAR testnet (plus a Solana devnet settlement leg) for the NEAR Hackathon: time-committed, escrowed market-maker quotes (Pappus) raise borrowing limits (Cramér) on thin-exit collateral; borrowers pay a limit premium that funds the buyers' commitment fees. Everything in *Nectar Labs PRD v6* is the spec; this document is the plan.

**Deadline.** Development closes **2026-11-14 23:59 UTC**; judging 16–18 Nov. Internal targets: P0 green by Nov 11 evening, P1 by Nov 13 noon, P2 by Nov 14 noon, submission package by Nov 14 18:00 UTC so Kunal has six hours to confirm.

**Scope lock.** Chains: NEAR testnet and Solana devnet only. Tracks: `defi`, `security`, `privacy`; `agents` only if the Feed MCP server passes G9. Not built: any other chain, mainnet, a token, governance UI, mobile. Collateral is mock NVDAx (`nvdax-mock.nectar.testnet`) standing in for xStocks/Opening Bell; the README says so in the first screen.

**Hackathon rules that bind the agents (from `HACKATHON.md`, verified 2026-11-09):**

| Rule | Consequence in the build |
| --- | --- |
| Q-007 no Intents testnet; mainnet 1Click only with tiny amounts | 1Click is called with `dry: true` only; no deposit is ever made |
| Q-010 testnet-only projects are eligible | all deployments are testnet/devnet |
| Q-017 Claude Code/Codex screen repos for "runs and does what README says" | README has a 5-command quick start that works from a fresh clone; G9 rehearses it |
| Q-002 / Q-005 disclose pre-hackathon baseline | README "Prior work" section lists the Nectar Network research baseline and states that all code in this repo is new |
| Q-015 one person ≤ 2 projects | `docs/SUBMISSION.md` lists team; Kunal confirms |
| Submission API `website` field is a spam trap | left empty unless Kunal says otherwise |

**Never without Kunal's explicit, same-session confirmation:** send the submission; post on X or anywhere public; make the repo public, push to a public remote, or force-push; sign any mainnet transaction, spend real tokens, or deploy to mainnet; commit a secret or a private key (keys live in env vars and OS keychains, never in the repo; `gitleaks` runs in CI and in the pre-commit hook); delete testnet accounts; change the submission fields after Kunal approved them.

**Always:** write `docs/FACTS.md` before code; write `docs/EVIDENCE.md` after each gate; write `docs/process/human-handoff.md` the moment a human step appears; keep `README.md` truthful at every commit.

## 2. Repository layout

One pnpm + cargo monorepo, `nectar-labs/`. Each top-level directory has exactly one owner agent; other agents may read it but only the owner writes to it (enforced by the agents' `tools` scopes and by the orchestrator's work orders).

```
nectar-labs/
├─ CLAUDE.md                     # sections 1, 3, 5, 12 of this doc (stable, cached)
├─ README.md                     # quick start, what is live, prior-work disclosure
├─ .claude/
│  ├─ settings.json              # promptCacheTtl, permissions, hooks
│  └─ agents/                    # orchestrator, researcher, contract, quoter, keeper, web, docs, solana, verifier
├─ docs/                         # owner: docs agent (FACTS/EVIDENCE/DECISIONS written by any agent via orchestrator)
│  ├─ docs/process/prd.md                     # export of PRD v6 (read-only reference)
│  ├─ FACTS.md                   # single source of truth: dated, sourced, with CONFLICTS section
│  ├─ docs/process/decisions.md               # ADR-style, one entry per irreversible choice
│  ├─ EVIDENCE.md                # per gate: command, trimmed output, explorer links
│  ├─ docs/process/human-handoff.md           # H1–H12 with status, instructions, what unblocks
│  ├─ RUNBOOK.md                 # incidents, pause, oracle override, key rotation
│  ├─ DESIGN_SYSTEM.md           # tokens, type, components, motion, a11y
│  ├─ DEMO_SCRIPT.md             # 3-minute walkthrough with exact clicks and commands
│  ├─ SUBMISSION.md              # payload fields, filled, never sent
│  └─ docs/process/x-post.md                  # draft, never posted
├─ contracts/                    # owner: contract agent
│  ├─ nectar-core/               # Rust, near-sdk 5.30.1, cargo-near 0.23.0
│  │  ├─ src/{lib,state,ft_receiver,quotes,positions,settlement,oracle,views,events,admin}.rs
│  │  └─ tests/                  # near-workspaces sandbox tests + tests/model.csv
│  └─ mock-ft/                   # NEP-141 mock with mint(owner) — deployed twice (USDC, NVDAx)
├─ quoter/                       # owner: quoter agent — Rust, wasm32-wasip2, OutLayer
│  ├─ src/main.rs                # stdin JSON → stdout JSON (≤900 bytes), fixed-point only
│  └─ tests/vectors.json         # inputs → expected disc_bps, shared with contract tests
├─ solana/                       # owner: solana agent — Anchor 0.32.1
│  ├─ programs/nectar_vault/
│  └─ tests/                     # solana-test-validator tests incl. Ed25519 precompile
├─ services/
│  ├─ keeper/                    # owner: keeper agent — TS, near-api-js 7.4.0, @solana/kit 8.6.0
│  └─ feed/                      # owner: keeper agent — indexer, REST, MCP server, SQLite
├─ apps/
│  ├─ web/                       # owner: web agent — Next.js, wallet-selector, Nectar tokens
│  └─ docs-site/                 # owner: docs agent — Docusaurus 3.10.2, Nectar theme
├─ packages/
│  ├─ ui/                        # owner: web agent — tokens.css, components, logo SVGs
│  ├─ sdk/                       # owner: web agent — typed views/calls, preimage builder (shared by web, keeper, tests)
│  └─ config/                    # owner: orchestrator — config.yaml (account ids, feed ids, gas) read by everything
├─ scripts/                      # owner: orchestrator — 00-accounts.sh … 50-verify.sh, submit.sh --dry-run
├─ .github/workflows/ci.yml      # build, test, lint, docs build, gitleaks
├─ .env.example                  # every variable, commented, no values
└─ pnpm-workspace.yaml, Cargo.toml (workspace), package.json, turbo.json
```

Pinned toolchain (checked at G0, written to `FACTS.md`): Rust 1.95 (edition 2024), `near-sdk` 5.30.1, `cargo-near` 0.23.0, `near-cli-rs` latest release, `near-api-js` 7.4.0, Node ≥ 22.22.2, pnpm 10, Anchor 0.32.1, Solana CLI matching Anchor's requirement, `@solana/kit` 8.6.0, Docusaurus 3.10.2, Next.js 15 (or current LTS), `@defuse-protocol/one-click-sdk-typescript` 0.1.26, `@phala/dcap-qvl` current. Any version that differs on the machine is recorded, and the lockfile wins.

## 3. Token economy: caching, isolation, compaction

The build is long and mostly autonomous, so the dominant cost is re-reading context. The rules below are in `CLAUDE.md` so every agent inherits them. Claude Code facts here were verified against the docs on 2026-11-09; anything else is marked VERIFY.

### 3.1 Prompt cache settings

- `.claude/settings.json`: `"promptCacheTtl": "1h"` and `"subagentPromptCacheTtl": "1h"` (or env `CLAUDE_CODE_PROMPT_CACHE_TTL=1h`, `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=1h`). Confirm with `/usage` → "Prompt cache (main)" after the first few turns; if it shows 5m, set `ENABLE_PROMPT_CACHING_1H=1` in the environment and restart (VERIFY the exact flag name against `/help` in the installed version).
- Caching is automatic; the job is not to invalidate it. In one session: never switch model, never change effort level mid-task, never toggle fast mode, never add or remove an MCP server or enable a plugin, never deny a whole tool via permissions mid-session; each of these resets the cache prefix. Set them once before the kickoff message.
- Do not paste images or large logs into the main thread. Screenshots go to the verifier agent as files; logs are tailed to 40 lines in the main thread and stored whole under `evidence/`.

### 3.2 Stable prefix discipline

- `CLAUDE.md` changes only at phase boundaries (P0→P1→P2). Everything volatile (account ids, feed ids, gas numbers, test results) goes to `docs/FACTS.md` or `packages/config/config.yaml`, which agents read on demand.
- Work orders are files (`docs/process/work/<agent>-<n>.md`), not long chat messages: the orchestrator writes the file, then tells the agent one line. The agent reads the file. The main thread stays short.
- Large reads go through subagents: the researcher reads OutLayer/MPC/1Click docs and returns ≤ 40 lines plus `FACTS.md` edits; the main thread never holds a full docs page.

### 3.3 Isolation and concurrency

- Build agents run with `isolation: worktree` so parallel work never collides; the orchestrator merges with `git merge --no-ff` per work order and runs `pnpm verify:quick` after each merge.
- Concurrency cap: 4 build agents in parallel at most (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` defaults to 20; the cap here is for sanity of merges, not the tool limit). Typical P0 fan-out: contract + web + docs + keeper; quoter and solana start only when their phase opens.
- Agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `teammateMode`) are optional; the subagent model above is sufficient and better understood. If teams are used, hooks `TeammateIdle` → assign the next work order; `TaskCompleted` → run the verifier.

### 3.4 Compaction and context budget

- `/compact` only at phase boundaries or after a gate report is written (it invalidates the cache). Before compacting, the orchestrator writes `docs/process/state.md` (what is done, what is next, open handoffs) so nothing lives only in context.
- Subagents `autoCompactWindow` set to a size that lets a work order finish in one window; `maxTurns` 60 for build agents, 25 for the researcher, 40 for the verifier.
- Budget per work order: one agent, one directory, one gate-sized deliverable, < 2 hours wall clock. Anything larger is split into two work orders.
- Repetition costs tokens: `FACTS.md` entries are quoted by id (`F-012`) rather than re-pasted; test vectors live in one JSON file used by the contract, the quoter and the web.

### 3.5 Tool choices that save tokens

- `Grep`/`Glob` before `Read`; `Read` with offsets on large files; never `cat` a lockfile.
- `cargo near build` output, `anchor test` output and `pnpm build` output are piped through `tail -n 40`; full logs saved to `evidence/<gate>/<timestamp>.log`.
- Explorer checks use `near contract call-function as-read-only` and `curl` to RPC, not screenshots, except the one screenshot per gate the verifier takes for `EVIDENCE.md`.

## 4. Agent roster

Nine agents in `.claude/agents/`. The main session is the **orchestrator**; it never writes product code itself. Frontmatter fields used: `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `isolation`, `memory`, `skills`, `color`. Model names are left to the installed defaults (changing them mid-session invalidates the cache); effort is set once in settings.

| Agent | Owns | Tools | Isolation | Notes |
| --- | --- | --- | --- | --- |
| `orchestrator` (main) | `scripts/`, `packages/config/`, `docs/process/state.md`, merges | all | none | writes work orders, runs gates, merges worktrees, updates `docs/process/human-handoff.md`; never edits product code |
| `researcher` | `docs/FACTS.md` entries | Read, Grep, Glob, WebFetch, WebSearch, Bash (curl/git clone only) | none | returns ≤ 40 lines + FACTS edits; clones repos to `/tmp/research/` and greps instead of fetching GitHub pages |
| `contract` | `contracts/` | Read, Edit, Write, Bash, Grep, Glob | worktree | Rust; runs `cargo near build`, unit + sandbox tests; never touches web |
| `quoter` | `quoter/` | same as contract | worktree | `wasm32-wasip2`, fixed-point only, stdout ≤ 900 bytes; shares `tests/vectors.json` with contract |
| `keeper` | `services/keeper/`, `services/feed/` | same | worktree | TS; function-call key only; MCP server for Feed |
| `web` | `apps/web/`, `packages/ui/`, `packages/sdk/` | same + Playwright via Bash | worktree | Nectar tokens; E2E against testnet; landing page |
| `docs` | `apps/docs-site/`, `docs/*.md` (except FACTS/EVIDENCE) | same | worktree | Docusaurus, legal pages, README prose |
| `solana` | `solana/` | same | worktree | Anchor; `solana-test-validator`; devnet deploy |
| `verifier` | `docs/EVIDENCE.md`, `evidence/` | Read, Bash, Grep, Glob, WebFetch (read-only; `disallowedTools: Edit, Write` except the two paths above via a wrapper script) | none | has not seen the work being produced; runs the gate from a fresh clone; writes PASS/FAIL with reasons |

**Frontmatter example (`.claude/agents/contract.md`):**

```
---
name: contract
description: Owns contracts/. Rust near-sdk 5.30.1. Builds, tests (unit + near-workspaces), deploys to testnet via scripts only. Use for any change under contracts/.
tools: Read, Edit, Write, Bash, Grep, Glob
permissionMode: acceptEdits
maxTurns: 60
isolation: worktree
memory: project
color: green
---
You own contracts/. Read docs/FACTS.md and the work order before any edit. Never assert an SDK or NEP fact you have not read this session; ask the orchestrator for a researcher run instead. Every public method has a unit test; every ft_on_transfer variant has a sandbox test against the real mock-ft. Run `cargo near build non-reproducible-wasm` and `cargo test` before reporting. Report in ≤ 20 lines: what changed, test counts, gas numbers, anything that contradicts FACTS.md.
```

**Orchestration loop (per phase):**

1. Orchestrator writes `docs/process/work/<agent>-<n>.md` for every agent that has work in this phase (goal, inputs, acceptance test, files allowed, FACTS ids to use).
2. Dispatches researcher first for any VERIFY item in those work orders; waits; merges FACTS.
3. Dispatches build agents in parallel (max 4). Each returns a ≤ 20-line report.
4. Merges worktrees one at a time; after each merge runs `pnpm verify:quick` (lint, typecheck, unit tests).
5. Runs the phase's gates via the verifier from a fresh clone. PASS → `EVIDENCE.md`, tag `p0-green` etc., `/compact`, next phase. FAIL → STOP: write `docs/process/gate-fail-<g>.md` (what, why, options), fix only if the fix is inside the phase's scope, re-run the gate; never proceed to the next phase on a failed gate.
6. After every dispatch round, update `docs/process/human-handoff.md` and `docs/process/state.md`.

**Hooks (`.claude/settings.json`):** `PreToolUse` on Bash blocks commands matching `git push`, `gh repo edit --visibility`, `near .* mainnet`, `solana .* -um`, `curl .*nearhackathon.com/api.*POST` unless env `HUMAN_CONFIRMED=1` is set in the shell by Kunal himself; `PostToolUse` on Edit/Write runs `gitleaks protect --staged` when a commit is attempted; `Stop` hook writes `docs/process/state.md`.

## 5. Gates G0–G9

A gate is run by the **verifier** from a fresh clone in a temp directory, with only `.env.example` and public testnet state. The verifier records in `docs/EVIDENCE.md`: gate id, UTC time, git commit, exact commands, trimmed output (≤ 40 lines each), explorer links, PASS or FAIL with reasons. **STOP rule:** a FAIL halts the phase; the orchestrator writes `docs/process/gate-fail-<g>.md` and either fixes within scope or records the fallback as a disclosed limitation. No agent may begin the next phase while a gate of the current phase is FAIL.

| Gate | Phase | Commands (abridged) | Pass criteria |
| --- | --- | --- | --- |
| **G0 toolchain + facts** | P0 start | `rustc --version`, `cargo near --version`, `near --version`, `node -v`, `pnpm -v`, `anchor --version`, `solana --version`; `near account create-account --help`, `near account add-key --help`; \`curl -s https://1click.chaindefuser.com/v0/tokens | head -c 400` ;  `curl -s 'https://pyth.dourolabs.app/hermes/v2/updates/price/latest?ids\[\]=\<NVDA\_ID>'\` |
| **G1 contract tests** | P0 | `cargo test -p nectar-core`, `cargo test -p nectar-core --test sandbox` (near-workspaces with real mock-ft) | all green; `tests/model.csv` cases match contract views within 1 unit; gas per method < 100 Tgas recorded |
| **G2 testnet deploy** | P0 | `scripts/00-accounts.sh`, `scripts/10-build.sh`, `scripts/20-deploy-testnet.sh`, `scripts/40-seed-demo.sh`, then `near contract call-function as-read-only nectar-core.nectar.testnet get_collateral json-args '{"token":"nvdax-mock.nectar.testnet"}' network-config testnet now` | accounts exist on explorer; core answers views; two quotes and one position visible; links recorded |
| **G3 web E2E** | P0 | `pnpm --filter web build`, `pnpm --filter web e2e` (Playwright against testnet, read-only flows + one write flow with the demo borrower key from env) | Home/Feed/Post a quote/Borrow/Console/Keepers render; Lighthouse a11y ≥ 90; dark and light themes; phone width no horizontal scroll |
| **G4 OutLayer** | P1 | `outlayer upload`, `outlayer deploy` (or the documented equivalents), `near contract call-function as-read-only outlayer.testnet estimate_execution_cost ...`, then one `request_execution` via nectar-core on a seeded position | execution appears at app.outlayer.ai/executions; `on_quoter_result` stored `disc_bps` within `[0,max]`; cost recorded; fallback path tested by pinning a wrong hash once |
| **G5 oracle** | P1 | `near contract call-function as-read-only pyth-oracle.testnet get_price json-args '{"price_identifier":"<id>"}' ...`; if absent, same on `price-oracle.testnet`; `update_price_feeds` with Hermes bytes | a price with publish\_time < 10 min; staleness and conf rejection tested; chosen source written to FACTS; if neither works, owner oracle declared in README |
| **G6 1Click depth** | P1 | `POST /v0/quote` with `dry: true` for USDC→\<asset> on NEAR; `verifyQuoteSignature()` | signed quote recorded; implied depth shown on Feed; for assets with no route, Feed shows "no 1Click route" |
| **G7 Solana + signer** | P2 | `anchor test` (local validator with Ed25519 precompile); `anchor deploy --provider.cluster devnet`; one `trigger_preliquidation` end to end; keeper submits `[ed25519 verify ix, settle ix]`; `relay_settlement_result` | devnet tx with both ixs confirmed; vault balances changed as `model.csv` predicts; `SignatureResponse::Ed25519` seen on NEAR explorer; Instructions sysvar address confirmed in FACTS |
| **G8 copilot** | P2 | `pnpm --filter web test:copilot` (signature + attestation verify against a recorded response and a live one if key present) | verifier green; if no key, UI shows "key missing" and the test runs on the recorded fixture |
| **G9 fresh-clone rehearsal** | Submission | `git clone`, `pnpm i`, `pnpm demo:testnet`, `pnpm verify`, `pnpm --filter docs-site build`; read README top to bottom | a verifier that has never seen the repo completes the README in < 15 minutes; every claim in README has an explorer link or a test; `docs/EVIDENCE.md` complete |

**Evidence format (per gate, in `docs/EVIDENCE.md`):**

```
### G2 — testnet deploy — PASS — 2026-11-10T19:42Z — commit 3f9c1a2
$ scripts/20-deploy-testnet.sh
... (≤ 40 lines)
Explorer: https://testnet.nearblocks.io/address/nectar-core.nectar.testnet
Views: get_collateral → {...}
Notes: faucet rate-limited once; retried after 90 s.
```

## 6. P0 work orders (Nov 9–11) — the product that must exist

Order of dispatch: WO-0 (orchestrator) → WO-1 researcher → WO-2 contract ∥ WO-3 web ∥ WO-4 docs ∥ WO-5 keeper → G1 → WO-6 deploy → G2 → WO-7 E2E → G3.

**WO-0 orchestrator — scaffold.** Monorepo per section 2; `CLAUDE.md`, `.claude/`, `.env.example`, `packages/config/config.yaml` with every account id as `TODO-G2`; `scripts/*.sh` skeletons that fail loudly on missing vars; CI workflow; pre-commit with `gitleaks`. Commit `chore: scaffold`.

**WO-1 researcher — FACTS seed.** Confirm and record (ids F-001…): near-sdk 5.30.1 API surface used (`#[near(contract_state)]`, `PanicOnDefault`, `Promise`, `env::sha256_array`, `NearToken`, `Gas`, yield/resume availability), NEP-141 `ft_on_transfer` return semantics, 1 yoctoNEAR deposit on `ft_transfer`, storage cost 1E19 yocto/byte, function-call key limits (no deposit, allowance exhaustion), `near-cli-rs` exact syntax for create sub-account / add function-call key / call-function, Hermes REST shape, 1Click `/v0/quote` required fields, `v1.signer-prod.testnet` `sign` args and gas config name, OutLayer `request_execution` args and limits, Docusaurus gtag preset, Next.js wallet-selector packages. Output: FACTS entries + CONFLICTS section (Pyth-on-NEAR; 1Click fee by auth).

**WO-2 contract — nectar-core + mock-ft.** Implement PRD §4 and §6 exactly: state (`Config`, `CollateralConfig` with `active_committed_q_usd_e6`, `acc_fee_per_dollar_e18`, `max_discount_bps`, `ltv_static_bps`, `ltv_max_bps`, `uplift_bps_per_usd_e6`, `liq_threshold_bps`, `remote_chain_id`, `remote_vault`), `Quote` (buyer, asset, `remaining_usd_e6`, `max_discount_bps`, `notice_period_ns`, `unlock_ts`, `fee_debt_e18`, `claimable_fees_e6`, `buyer_remote_recipient`), `Position` (borrower, asset, `collateral_units`, `debt_e6`, `premium_bps`, `opened_at`, `status`), `LendingPool`; `ft_on_transfer` with the five `msg` variants (`SupplyLendingLiquidity`, `FundPappusQuote`, `TopUpQuote`, `LockCollateralAndBorrow`, `Repay`), refund-unused semantics; `initiate_quote_withdrawal` / `complete_quote_withdrawal` / `claim_fees`; `trigger_preliquidation(position_id)` with P0 static pricing (`disc_bps = max_discount_bps`, settle to the best quote by lowest `max_discount_bps` then oldest, bounded to 8 quotes per call, 64 quotes per asset); `on_signature`, `relay_settlement_result` and `on_quoter_result` as stubs that compile and are feature-gated for P1/P2; owner admin (`new`, `upsert_collateral`, `set_keeper`, `set_oracle_source`, `propose_price`, `apply_price`, `pause`, `unpause`, `fund_gas_reserve`, `set_quoter_pin`); views per PRD §7.6; NEP-297 events per §7.7; `contract_version()`. `mock-ft`: NEP-141 + storage management + `mint(owner)`. Tests: unit for every method; sandbox for every `msg` variant with the real `mock-ft`, for notice-period timing, for fee index with two buyers, for settlement with 2 and 9 quotes (bounded), for pause. `tests/model.csv` is generated by a tiny Python script in `contracts/nectar-core/tests/model.py` so numbers are independently computed.

**WO-3 web — app shell + P0 pages.** `packages/ui`: `tokens.css` from PRD §13 (dark default, light via `data-theme`), fonts Syne + DM Mono (self-hosted woff2, no Google request at runtime), components: `Button`, `Card`, `Stat`, `Table (.rt responsive)`, `Badge`, `Banner`, `Field`, `Modal`, `Tabs`, `Toast`, `Sparkline`, `Hexmark` (logo). `packages/sdk`: typed clients for every view and `ft_transfer_call` msg builder, `preimage.ts` (shared with keeper tests). `apps/web`: routes Home `/`, `/feed`, `/quote/new`, `/borrow`, `/console`, `/keepers`, `/legal/*` mirror links to docs; wallet-selector with MyNearWallet + Meteor (testnet); theme toggle; consent banner stub (analytics off by default); every write shows the exact `msg` JSON before signing; Feed shows the equation `B_c = min(ltv_static + uplift·Q_c, ltv_max)` with live numbers and a "mock collateral" badge. Landing page content per section 10. Playwright E2E config.

**WO-4 docs — site + prose.** Docusaurus per section 11 with placeholders where values arrive at G2; `README.md` draft with quick start, architecture figure (SVG export of PRD §5 drawing), "What is live / mock / fallback / PROD-only" table, prior-work disclosure; `docs/DESIGN_SYSTEM.md`, `docs/RUNBOOK.md`, `docs/DEMO_SCRIPT.md` v1.

**WO-5 keeper — bot + indexer.** `services/keeper`: polls `list_positions(status=Open)` every block batch, computes health from the contract's own view (`get_health(position_id)`), calls `trigger_preliquidation` with the function-call key from env (`KEEPER_PRIVATE_KEY`), retries with backoff, `/healthz`, JSON logs. `services/feed`: NEP-297 event indexer over RPC (`EXPERIMENTAL_changes`/receipt logs; researcher confirms the cheapest method) into SQLite; REST `/api/feed`, `/api/asset/:id`, `/api/settlements`; MCP server stub registered but tools land in P1.

**WO-6 orchestrator — deploy.** Run `scripts/00–40`; fill `config.yaml` and `FACTS.md` with real ids; redeploy web env; commit `feat: p0 testnet`.

**WO-7 verifier — G1, G2, G3.** From fresh clone. On PASS tag `p0-green`.

P0 acceptance (all must be true): a stranger with the README can open the Feed, see two live quotes and one position on testnet, fund a quote from a faucet account in the UI, borrow against mock NVDAx, watch health, and run `pnpm demo:testnet` to print the same via CLI.

## 7. P1 work orders (Nov 11–13) — verified pricing and depth

Opens only after `p0-green`. Dispatch: WO-8 researcher → WO-9 quoter ∥ WO-10 contract ∥ WO-11 keeper ∥ WO-12 web → G4, G5, G6.

**WO-8 researcher.** Live checks: OutLayer CLI availability and exact publish flow (`outlayer upload`/`deploy` or UI); `estimate_execution_cost` output for the planned limits; Pyth NVDA price id on Hermes and whether `pyth-oracle.testnet` answers; OutLayer `price-oracle.testnet` view names; 1Click `/v0/tokens` equity presence; `one-click-sdk-typescript` `verifyQuoteSignature` usage. All to FACTS with dates.

**WO-9 quoter.** Rust, `wasm32-wasip2`, no floats: stdin JSON `{asset, oracle_price_e6, conf_e6, size_usd_e6, max_discount_bps, quote_ids:[...], ts}`; secrets via env (`MM_INVENTORY_RATIO_BPS`, `MM_GAMMA_BPS`) from `secrets_ref`; Avellaneda–Stoikov-style reservation discount in basis points, clamped to `[0, max_discount_bps]`; stdout JSON `{disc_bps, chosen_quote_id, model_version, input_hash}` ≤ 900 bytes; deterministic: same input → same output; `tests/vectors.json` (20 cases incl. edge: zero inventory, max gamma, conf > price/10) consumed by both quoter tests and contract tests. Publish with pinned `version_key`; write sha256 and `version_key` to FACTS.

**WO-10 contract.** Enable `request_execution` path: `trigger_preliquidation` → if `quoter_pin` set, call `outlayer.testnet::request_execution` (source Project with pinned `version_key`, `resource_limits` from config, `input_data` = JSON above, `secrets_ref` = MM profile, `payer_account_id` = self) with gas from config and deposit from `estimate_execution_cost`; callback `on_quoter_result` validates `input_hash`, clamps `disc_bps`, falls back to `max_discount_bps` on any failure and emits `quoter_fallback`; oracle module reads `get_price(price_identifier)` from the configured source, rejects `publish_time` older than `max_age_s` or `conf > price × max_conf_bps`, emits `oracle_rejected`; `update_price_feeds(data)` passthrough for the keeper. Sandbox tests mock the OutLayer and oracle contracts with tiny stubs in `contracts/test-stubs/`.

**WO-11 keeper.** Hermes fetch → `update_price_feeds` before each trigger when oracle is Pyth; 1Click `POST /v0/quote` `dry: true` every 5 min per asset with `verifyQuoteSignature`, stored as `R_c` series; Feed MCP server: tools `get_feed`, `get_asset`, `get_quotes`, `get_positions`, `get_settlements`, `explain_limit(asset)` returning the equation with live numbers; MCP transport stdio + HTTP; README section for Claude Desktop / Claude Code registration.

**WO-12 web.** Feed: `Q_c`, `R_c`, `D_c`, exit gap, limit uplift per asset with sparkline; settlement history with `disc_bps` vs implied DEX discount; attestation link per settlement (app.outlayer.ai/executions/\<id>); oracle badge (source, age, conf). Post a quote: `max_discount_bps`, notice period presets (24 h / 7 d), preview of fee share. Console (owner): collateral params, oracle source, pause, quoter pin, with every write previewed. Keepers page: online keepers, last trigger, instructions to run one.

P1 acceptance: a settlement on testnet whose `disc_bps` came from an attested OutLayer execution, visible on the Feed with the attestation link, and an oracle price with age shown; or, if G4/G5 failed, a README that says exactly which fallback is active and why.

## 8. P2 work orders (Nov 13–14) — cross-chain settlement and copilot

Opens only after P1 gates are PASS or disclosed. Dispatch: WO-13 researcher → WO-14 solana ∥ WO-15 contract ∥ WO-16 keeper ∥ WO-17 web → G7, G8.

**WO-13 researcher.** Confirm: Instructions sysvar address and how Anchor 0.32.1 exposes it; Ed25519 precompile instruction data layout (offsets for pubkey, signature, message); `@solana/kit` 8.6.0 APIs for building the two-instruction tx; `v1.signer-prod.testnet` `sign` gas config (`sign_call_gas_attachment_requirement_tera_gas`) current value; derived-key derivation for Ed25519 (`path` convention) and how to compute the Solana pubkey off-chain for the vault's `authority`; Anchor devnet deploy flow and airdrop limits.

**WO-14 solana.** `nectar_vault` program: `init_vault(authority_pubkey /* MPC-derived */, mint)`, `open_position(position_id, borrower, units)` (escrows SPL tokens), `settle(position_id, quote_id, repay_e6, seize_units, recipient, nonce, expires)` which loads the Instructions sysvar, requires the immediately preceding instruction to be the Ed25519 program verifying `authority_pubkey` over the exact `NECTAR_SETTLE_V1|...` bytes rebuilt on-chain from the args, checks `nonce` unused and `expires` in the future, then transfers `seize_units` to `recipient` and marks settled; `cancel_position` by borrower after repay proof (P2 scope: owner-signed cancel). Tests on `solana-test-validator` with a locally generated Ed25519 keypair standing in for the MPC key; negative tests: wrong message, missing verify ix, replayed nonce.

**WO-15 contract.** Enable Chain Signatures path: after `on_quoter_result`, if the collateral's `remote_chain_id` is set, build the preimage (PRD §9.2), `sha256` it, call `v1.signer-prod.testnet::sign({path, payload_v2:{Eddsa:<hex>}, domain_id:1})` with deposit 1 yoctoNEAR and gas from config, callback `on_signature` stores `SignatureResponse::Ed25519` bytes on the position, sets status `Settling`, emits `settlement_signed{position_id, preimage, signature}`; `relay_settlement_result(position_id, solana_tx_sig)` (keeper) closes the position, credits the fee index, emits `position_settled`; owner `cancel_settlement` after expiry.

**WO-16 keeper.** On `settlement_signed`: fetch preimage + signature from the view `get_settlement(position_id)`, build Solana tx `[Ed25519SigVerify ix(pubkey=authority, msg=preimage, sig), nectar_vault.settle(...)]`, send to devnet with the keeper's own fee-payer keypair (`KEEPER_SOLANA_KEYPAIR` path), confirm, call `relay_settlement_result`; idempotent on restart.

**WO-17 web.** Copilot panel (Console and Borrow): calls `https://cloud-api.near.ai/v1/chat/completions` through a server route with `NEAR_AI_API_KEY`; shows the model's answer only after the browser verifies: `GET /v1/signature/<chat_id>?signing_algo=ecdsa` → `provider_tee` text `<MODEL_ID>:<sha256(request)>:<sha256(response)>` recovers to the attested `signing_address`; `GET /v1/attestation/report?model=&provider=near&signing_algo=ecdsa&nonce=<64hex>` with `x-no-aliasing: true`, `report_data` = 32-byte signer identity zero-padded + nonce, quote verified with `@phala/dcap-qvl` in a server route (WASM); badge "verified in TEE" or "unverified — hidden". System prompt forbids prices and amounts; it summarises risk and corporate-action context from the user's pasted notes only. Settlement page: shows the NEAR tx, the signer response, the Solana tx with both instructions, and the preimage bytes side by side.

P2 acceptance: one position opened on NEAR with a Solana-escrowed collateral record, pre-liquidated through the full path, visible as two linked transactions on two explorers; copilot verifier green on a recorded fixture at minimum.

## 9. Wallets and keys created by CLI

No key is ever typed, pasted into chat, or committed. Scripts create keys into the OS keychain or a `0600` file under `~/.nectar/`, and `.env` holds only paths or account ids. `gitleaks` runs on every commit. The exact `near-cli-rs` subcommand grammar is confirmed at G0 with `--help` and written to FACTS (F-020); the forms below are the expected ones from the docs read on 2026-11-09.

### 9.1 NEAR testnet (`scripts/00-accounts.sh`)

```
# parent account from the faucet (name availability checked with a view first)
near account create-account sponsor-by-faucet-service nectar.testnet \
  autogenerate-new-keypair save-to-keychain network-config testnet create

# sub-accounts funded by the parent (syntax confirmed at G0)
for sub in nectar-core usdc-mock nvdax-mock keeper buyer1 buyer2 borrower1; do
  near account create-account fund-myself $sub.nectar.testnet '5 NEAR' \
    autogenerate-new-keypair save-to-keychain sign-as nectar.testnet \
    network-config testnet sign-with-keychain send
done

# keeper: a function-call key on keeper.nectar.testnet restricted to nectar-core methods
near account add-key keeper.nectar.testnet grant-function-call-access \
  --allowance '1 NEAR' --receiver-account-id nectar-core.nectar.testnet \
  --method-names 'trigger_preliquidation,relay_settlement_result,update_price_feeds' \
  autogenerate-new-keypair save-to-keychain network-config testnet sign-with-keychain send
```

If the faucet is rate-limited the script prints the command and the next retry time and exits 2; the orchestrator retries after 90 s up to five times, then writes H-NEAR-FAUCET to `docs/process/human-handoff.md` (Kunal can create the parent at the faucet page in a browser). Keys in the keychain are exported once to `~/.nectar/keys/` with `near account export-account` for backup; the file path is printed, never the key.

### 9.2 Keeper key handling

The keeper reads `KEEPER_ACCOUNT_ID` and `KEEPER_KEY_PATH` (a JSON key file produced by `near account export-account ... using-private-key`, redirected to a `0600` file). Function-call keys cannot attach deposits, so `trigger_preliquidation` and `relay_settlement_result` are not `#[payable]`; the contract pays MPC and OutLayer deposits from `gas_reserve_yocto` (funded by owner through `fund_gas_reserve`, target 5 NEAR on testnet). Allowance is topped up by `scripts/45-keeper-allowance.sh` when below 0.2 NEAR (checked by the keeper's `/healthz`).

### 9.3 Solana devnet (`scripts/05-solana.sh`)

```
solana-keygen new --no-bip39-passphrase --outfile ~/.nectar/solana/deployer.json
solana-keygen new --no-bip39-passphrase --outfile ~/.nectar/solana/keeper-fee-payer.json
solana config set --url https://api.devnet.solana.com --keypair ~/.nectar/solana/deployer.json
solana airdrop 2           # repeat with backoff; devnet airdrops are rate-limited
solana airdrop 1 $(solana-keygen pubkey ~/.nectar/solana/keeper-fee-payer.json)
spl-token create-token --decimals 6                       # mock NVDAx on devnet (mint authority = deployer)
```

The vault's `authority` is the MPC-derived Ed25519 public key for (`nectar-core.nectar.testnet`, `path = "solana-v1"`), computed off-chain by `scripts/derive-solana-authority.ts` with the published root public key from `v1.signer-prod.testnet` (`public_key` view) and the documented derivation for Ed25519 (researcher confirms in WO-13; until then `authority` is `TODO-G7`). If devnet airdrops fail five times, H-SOL-AIRDROP is written with the faucet URL and pubkeys for Kunal.

### 9.4 Secrets inventory (`.env.example`)

| Var | Who sets | Default / placeholder |
| --- | --- | --- |
| `NEAR_NETWORK=testnet` | script | fixed |
| `OWNER_ACCOUNT_ID`, `CORE_ACCOUNT_ID`, `USDC_MOCK_ID`, `NVDAX_MOCK_ID` | script after G2 | `TODO-G2` |
| `KEEPER_ACCOUNT_ID`, `KEEPER_KEY_PATH` | script | path only |
| `KEEPER_SOLANA_KEYPAIR` | script | path only |
| `OUTLAYER_PROJECT_ID`, `OUTLAYER_VERSION_KEY`, `QUOTER_WASM_SHA256` | script after G4 | `TODO-G4` |
| `ORACLE_SOURCE`, `NVDA_PRICE_ID` | researcher/G5 | `TODO-G5` |
| `ONE_CLICK_API_KEY` | HUMAN H8 (optional) | empty = unauthenticated 25 bps |
| `NEAR_AI_API_KEY` | HUMAN H7 | empty = copilot shows "key missing" |
| `NEXT_PUBLIC_ANALYTICS` | HUMAN H4 | `off` |
| `HUMAN_CONFIRMED` | Kunal only, in his shell | unset |

Mainnet accounts, keys and funding are HUMAN-only (H6) and absent from this repo.

## 10. Design system and UI build

The Nectar Network design system is reused exactly; Nectar Labs is a product under it. Source of truth: `docs/DESIGN_SYSTEM.md` (in the support bundle) and `packages/ui/tokens.css`. Nothing is invented where the system already decides. No hackathon branding appears in the product UI (landing, web app, docs navigation): no banner, badge or copy about the NEAR Hackathon; that context lives in README.md, docs/EVIDENCE.md and docs/SUBMISSION.md only, where judges read it.

### 10.1 Tokens (both themes, from the Nectar redesign bundle)

Dark (default): `--bg #0d0f12`, `--surface #16181d`, `--surface-2 #202327`, `--border #23272f`, `--border-strong #303541`, `--text #bcc3d2`, `--heading #e6e9ef`, `--dim #8f96a3`, `--wordmark #b4bccc`, `--accent #16f3a9`, `--accent-hover #77f3ca`, `--on-accent #0d0f12`, `--accent-fill rgba(0,229,160,.08)`, `--accent-glow rgba(22,243,169,.45)`, `--accent-deep #09aa74`, `--warn #faaf2e`, `--warn-fill rgba(245,158,11,.08)`, `--info #51b8ec`, `--grid rgba(122,184,163,.043)`. Light (`[data-theme=light]`): `--bg #f9fafb`, `--surface #fff`, `--surface-2 #f0f2f4`, `--border #d6dae0`, `--border-strong #cbcfd8`, `--text #202632`, `--heading #141924`, `--dim #5e6778`, `--accent #15845f`, `--accent-hover #106046`, `--on-accent #fff`, `--accent-fill rgba(24,149,108,.08)`, `--accent-glow rgba(21,132,95,.35)`, `--accent-deep #8fdcbf`, `--warn #9a5f00`, `--warn-bar #dc8f09`, `--warn-fill rgba(220,143,9,.10)`, `--info #17699a`, `--grid rgba(110,122,145,.07)`. Type: Syne 600/700 for headings and the wordmark, DM Mono 400/500 for everything else; sizes 12/13/14/16/20/28/40/56; line-height 1.5 body, 1.1 display. Radius 8 (cards 12). Motion: `rise` (fade + 8 px up, 320 ms), `grow` (bars from 0), `pulse` (live dot), `dash` (SVG stroke), `float` (hex marks, 6 s); all respect `prefers-reduced-motion`. Background: `--grid` 24 px grid on `--bg`. Container query at 760 px flips tables to `.rt` stacked rows. Logo (from Kunal's file): three mint hexagons in a triangular cluster, one on top and two below with edges nearly touching, plus the lowercase rounded geometric "nectar" wordmark in `--wordmark`; Nectar Labs adds "labs" in `--dim` after the wordmark; files `packages/ui/logo/{mark,wordmark,lockup}.svg` from Kunal's PNG (vectorised by the web agent, checked against the PNG at G3).

### 10.2 Components (`packages/ui`)

`Button` (primary accent / ghost / danger; loading; icon), `Card` (header, body, footer; `data-live` adds pulse dot), `Stat` (label, value, delta, sparkline slot), `Table` (sortable, `.rt` responsive), `Badge` (mock / live / fallback / verified / unverified), `Banner` (info/warn; the "mock collateral" and "owner oracle" banners), `Field` (label, hint, error, unit suffix), `Modal` (sign preview: shows `msg` JSON + gas + deposit before the wallet opens), `Tabs`, `Toast`, `Sparkline` (SVG, tokens only), `Hexmark`, `ThemeToggle`, `ConsentBanner`, `Footer`, `Nav`.

### 10.3 Pages (apps/web) — every page, both themes, phone and desktop

| Route | Purpose | Content and states |
| --- | --- | --- |
| `/` Home (landing) | sell the thesis in one scroll | hero: "The buyer behind every loan" line adapted: **"Committed buyers. Higher limits."** + sub "Escrowed, time-committed quotes turn thin-exit collateral into borrowing power on NEAR"; live strip (Q\_c, exit gap closed, limit uplift, settlements) from Feed API; three cards (Buyers / Borrowers / Curators) each with one number and one CTA; "How a settlement works" 4-step strip (flag → TEE price → MPC sign → Solana settle); "Built on" row (NEAR, Chain Signatures, OutLayer, NEAR AI Cloud, 1Click, Solana) as text badges; "testnet · mock collateral" badge inside the hero card (no hackathon banner); FAQ (6); footer |
| `/feed` | public truth | per-asset rows: Q\_c, R\_c, D\_c, exit gap, static vs Nectar limit, premium, oracle age; settlements table with `disc_bps`, attestation link, tx links; equation card; MCP connect snippet |
| `/quote/new` | buyer posts a Pappus quote | asset, size USD, `max_discount_bps` slider, notice preset, remote recipient (Solana) optional; preview: fee share now, what you buy at worst; sign modal; success with explorer link |
| `/quote/[id]` | manage | remaining, fees claimable, initiate/complete withdrawal with countdown, top-up |
| `/borrow` | borrower | collateral amount → limit (static vs Nectar, shown as two bars), premium bps, health preview at −5/−10/−20 % price; sign modal; positions list |
| `/position/[id]` | one position | health gauge, debt, repay, settlement timeline (NEAR tx, signer, Solana tx) |
| `/console` | curator/owner | collateral params form, oracle source + age, pause state, quoter pin + sha, gas reserve; every write previewed; read-only for non-owner with "you are viewing as guest" banner |
| `/keepers` | keeper network | online keepers, last triggers, allowance; "Run a keeper" snippet |
| `/talk` | contact | form posts to a Formspree-style endpoint or `mailto:kunal@nectarnetwork.fun` (H9) |
| `/legal/privacy`, `/legal/cookies`, `/legal/terms`, `/legal/disclaimers` | legal | rendered from the same markdown as the docs site |

States every page must handle: no wallet, wrong network, wallet connected but no balance (faucet link), loading, RPC error (retry), empty (no quotes yet), paused contract (banner). Accessibility: focus rings in `--accent`, 4.5:1 contrast checked for both themes, all interactive elements keyboard reachable, Lighthouse a11y ≥ 90 at G3.

### 10.4 Landing page in the support bundle

`landing/index.html` is the hand-built reference (tokens inline, both themes, responsive) that the web agent ports to Next.js; it is also published as a standalone artifact for Kunal to review today.

## 11. Docs site (Docusaurus 3.10.2, Nectar theme)

`apps/docs-site`, deployed to `docs.<domain>` (H5) or `nectar-labs-docs.vercel.app`. Theme: `src/css/custom.css` maps Docusaurus Infima variables to the Nectar tokens (`--ifm-color-primary` = `--accent`, `--ifm-background-color` = `--bg`, fonts Syne/DM Mono, navbar and footer on `--surface`, code blocks on `--surface-2`), dark default with light toggle, logo lockup in navbar.

### 11.1 Information architecture

- **Start here**: What Nectar Labs is (one page, the equation, the three roles), Quick start (5 commands), Live on testnet (ids, links, what is mock)
- **Concepts**: Pappus quotes, Cramér limits, Exit gap, Limit premium and fee index, Notice periods, Pre-liquidation vs liquidation
- **Protocol**: Contract reference (every method, args, events, errors), Storage and gas, Settlement flow (diagram), Preimage format, Oracle policy, Quoter (TEE) and fallback, Solana vault, Chain Signatures leg
- **Integrate**: Feed REST, Feed MCP (register in Claude Desktop / Claude Code), SDK (`packages/sdk`), Run a keeper, Post quotes programmatically
- **Security**: Trust model, Threat table, Keys and roles, Audits (none yet — stated), Bug reports
- **Operations**: Runbook, Incident response, Upgrades, Monitoring
- **Project (not "Hackathon" in the nav)**: Evidence (mirrors `docs/EVIDENCE.md`), Prior work disclosure, Roadmap, Team
- **Legal**: Privacy policy, Cookie policy, Terms of use, Risk disclaimers
- **Changelog** (blog plugin, one post per tag)

### 11.2 Analytics, consent, cookies

- Default: no analytics script loads. `ConsentBanner` (shared component, also in the web app) offers Accept / Decline / Settings; the choice is stored in `localStorage` under `nectar-consent` with a 180-day expiry and a version number; declining stores the decline.
- If H4 = GA4: `presets[0].gtag = { trackingID: 'G-XXXXXXX', anonymizeIP: true }` in `docusaurus.config.ts` is production-only, and a small `src/theme/Root.tsx` gates `window.gtag` consent (`consent 'default'` denied until Accept). If H4 = Plausible: a single `<script defer data-domain=...>` added via `scripts` in config, cookieless, and the Cookie page says so; the banner then only covers preference storage.
- The Cookie page lists every storage key the sites use: `nectar-consent`, `nectar-theme`, wallet-selector keys (named from the library at build time), analytics cookies if GA4 is chosen.
- The Privacy page states: on-chain data is public by nature; the sites collect no account data; wallet addresses are never joined to IP addresses in logs; the Talk form is processed by the named provider (H9); contact `kunal@nectarnetwork.fun`; controller name placeholder (H9).
- Terms and Disclaimers: testnet software, no financial advice, mock assets, hackathon status, MIT license, no warranty.

### 11.3 Footer (web app and docs share one component)

Nectar Network columns kept: **Products** (Nectar Labs, Nectar Feed, Keepers, Post a quote), **Protocols** (NEAR, Solana, Chain Signatures, OutLayer, NEAR Intents), **Build** (Docs, SDK, Feed MCP, GitHub, Status), **Company** (About, Talk to us, X, kunal@nectarnetwork.fun). Added from Morpho's pattern: a **Resources** column (Whitepaper page, Security, Changelog, Brand assets, Evidence) and a **Legal** column (Privacy, Cookies, Terms, Disclaimers); a one-line principle under the lockup ("Open by default, minimal by design" is Morpho's; ours reads **"Committed liquidity, verifiable settlement."**); bottom bar "© 2026 Nectar Network · MIT License" plus theme toggle and consent-settings link. Morpho's structure informs the IA; no copy, names or imagery from morpho.org are reused.

### 11.4 Build and checks

`pnpm --filter docs-site build` runs in CI; broken links fail the build (`onBrokenLinks: 'throw'`); search via local search plugin (no external service); OpenAPI page for the Feed REST generated from `services/feed/openapi.yaml`; every protocol page carries a "Verified against" line with the FACTS id and date.

## 12. Human handoff protocol

Kunal is one person with a job; assume he is away for most of the build. The agents' job is to make every human step small, exact and ready, and to keep working on everything else.

### 12.1 Rule

When an agent reaches a step it cannot do (needs a credential, a payment, a public action, a legal name, a decision that cannot be undone), it:

1. Writes the placeholder in code or config as `TODO-H<n>` with a comment that names the handoff id.
2. Appends or updates the entry in `docs/process/human-handoff.md` (format below) with the exact command or click path, what Claude Code will do the moment the answer arrives, and the default that applies if no answer comes before the deadline.
3. Tries the correct alternative if one exists (another faucet, another RPC, the recorded fixture, the owner-oracle fallback) and records that it did.
4. Moves to the next work item in the current phase. It never waits, never asks twice, never performs the human step itself, and never pretends the step is done.

### 12.2 `docs/process/human-handoff.md` entry format

```
## H7 — NEAR AI Cloud API key            status: OPEN   needed by: P2 / G8   blocks: copilot live test only
Why a human: paid credential tied to Kunal's account.
What Kunal does (3 min):
  1. https://cloud.near.ai → sign in → API keys → Create key (name: nectar-labs-hackathon)
  2. In his shell:  echo 'NEAR_AI_API_KEY=<paste>' >> apps/web/.env.local   (never commit)
  3. Reply in Claude Code: "H7 done"
What Claude Code does then: runs `pnpm --filter web test:copilot --live`, updates EVIDENCE G8, flips the badge from "key missing" to live.
Default if not done by 2026-11-14 15:00 UTC: copilot ships with the recorded-fixture verifier and a visible "key missing" state; README says so.
```

### 12.3 The handoffs, in the order they will appear

| Id | Step | When it appears | Default if silent |
| --- | --- | --- | --- |
| H-NEAR-FAUCET | parent testnet account if the faucet CLI is rate-limited | G0/G2 | retry ×5 with backoff; then browser faucet instructions |
| H-SOL-AIRDROP | devnet SOL if airdrops fail | G7 prep | retry; web faucet instructions with the pubkeys |
| H4 | analytics vendor (GA4 id or Plausible domain) | WO-4 | analytics off; banner shipped; both code paths present |
| H5 | domains and Vercel project names | WO-3/WO-4 | `*.vercel.app` previews; agents deploy previews with `vercel` CLI only if Kunal's token is in env, else write the deploy commands |
| H7 | NEAR AI Cloud key | WO-17 | fixture-only verifier |
| H8 | 1Click API key (optional) | WO-11 | unauthenticated dry quotes |
| H9 | legal entity name, contact, form provider | WO-4 | "Nectar Labs (unincorporated project)", `kunal@nectarnetwork.fun`, mailto form |
| H10 | team list and second-project check (Q-015) | SUBMISSION.md | Kunal only |
| H11 | demo video voice-over | DEMO\_SCRIPT.md | captioned silent capture produced by Playwright + ffmpeg, uploaded nowhere; file path given |
| H12 | prior-work disclosure wording approval | README | drafted text stands, marked "draft — approve" |
| H2 | repo public + push + tag | Nov 14 | never |
| H1 | submission send | Nov 14 | never |
| H3 | X post | after H1 | never |
| H6 | mainnet (post-hackathon) | PROD | absent |

### 12.4 When Kunal returns

He reads `docs/process/state.md` (one screen: phase, gates, open handoffs, next action) and `docs/process/human-handoff.md`, does the OPEN items top to bottom, and replies with their ids. The orchestrator resumes exactly where each handoff says. Nothing else is required of him until the submission confirmations.

## 13. Evidence, demo, README, submission payload, X post

**`docs/EVIDENCE.md`** is written by the verifier only, one block per gate (format in section 5), plus a top table: gate, status, date, commit, link. The docs site mirrors it. Every explorer link is clicked once by the verifier at G9.

**README.md order** (judges' agents read top to bottom; Q-017): title + one-line thesis; "Live on testnet" table (account ids with explorer links, what is mock, what is fallback); quick start (5 commands: clone, `pnpm i`, `pnpm demo:testnet`, `pnpm --filter web dev`, `pnpm --filter docs-site start`); 60-second architecture (figure + 6 lines); how a settlement works (the sequence figure); tracks and why; evidence summary with links; prior work disclosure (Q-002/Q-005); roadmap; team; license MIT.

**`docs/DEMO_SCRIPT.md`** (3 minutes, exact clicks): 0:00 Feed shows NVDAx with static limit 40 % and Nectar limit 62 % because two buyers committed $X; 0:30 buyer posts a quote (sign modal shows `msg`); 1:00 borrower borrows at the higher limit, pays premium; 1:30 owner drops the oracle price in Console (testnet demo control, disclosed) → health < 1; 1:50 keeper triggers; Feed shows settlement with attested `disc_bps` (P1) and the Solana tx (P2); 2:30 docs site, Feed MCP in Claude Code answering "explain the NVDAx limit"; 2:50 what is mock, what is next. `scripts/demo-capture.ts` records the same flow with Playwright to `evidence/demo.webm` with captions; voice-over is H11.

**`docs/SUBMISSION.md`**: every field of the submission API from `HACKATHON.md` filled in (project name, one-liner, description, tracks `defi, security, privacy` (+ `agents` only if G9 passed the MCP check), repo URL placeholder until H2, demo video path/URL placeholder until H11, testnet ids, team (H10), baseline disclosure, `website` left empty). `scripts/submit.sh` builds the JSON and runs `--dry-run` printing it; the real send requires `HUMAN_CONFIRMED=1` set by Kunal in his own shell and the hook still asks for an interactive `yes`.

**`docs/process/x-post.md`**: one draft thread (5 posts, ≤ 280 chars each, no fabricated metrics; only numbers that appear in EVIDENCE), plus one standalone post; links are placeholders until H2. Never posted by an agent.

**Final package check (G9 verifier):** README commands work from a fresh clone in < 15 min; `pnpm verify` green; docs build green; EVIDENCE complete; HUMAN\_HANDOFF has only H1/H2/H3/H10/H11 open; no secret in history (`gitleaks detect --log-opts=--all`); every "mock", "fallback" and "PROD-only" is disclosed where a reader would first meet it.

## 14. Daily verification ritual

At the start of each build day (and once more before the submission package) the researcher runs `docs/process/work/daily-verify.md`:

1. **nearhackathon.com** — re-read rules and submission section; diff against `HACKATHON.md` notes; any change → FACTS entry + `docs/process/decisions.md` if scope moves. Check the deadline line literally (2026-11-14 23:59 UTC) and the judging dates.
2. **nearbuilders.org/build** — check for new tooling or track guidance; record anything that affects `defi`/`security`/`privacy`/`agents` tracks.
3. **docs.near.org** — pages used today only: smart contract SDK page(s) for the methods touched, NEP-141, access keys, Chain Signatures, oracles page (`pyth-oracle.*`, `price-oracle.*`), 1Click; confirm versions in `FACTS.md` still match; note doc changes with date.
4. **Live endpoints** — `v1.signer-prod.testnet` `public_key` view; `outlayer.testnet` `estimate_execution_cost`; Hermes price for the NVDA id; 1Click `/v0/tokens` count; testnet RPC health. Write the four results with timestamps to `FACTS.md` §LIVE.
5. **Market figures** in README (from Kunal's `FACTS-nectar-labs.md`, dated 2026-11-09: NEAR Intents $37.006B cumulative volume and $189.13M TVL; Rhea $235.99M TVL; RWA on-chain $33.609B vs $4.09B in DeFi; xStocks \~$196M with >$182M on Solana) — on Nov 14 re-pull from DefiLlama and the Solana case study, update numbers and dates, keep the sources.
6. Output: ≤ 20-line report to the orchestrator; FACTS and CONFLICTS updated; `docs/process/state.md` "verified on" date bumped.

If a daily check contradicts a decision already built (for example the oracle contract disappears from docs.near.org), the orchestrator writes a DECISIONS entry and the README disclosure in the same session; it does not silently keep the old claim.

## 15. The kickoff prompt

Preparation (Kunal, once, 5 minutes): create an empty directory `nectar-labs`, unzip the support bundle into it (it contains `CLAUDE.md`, `.claude/`, `docs/`, `landing/`, `.env.example`, `packages/config/config.yaml`), copy the PRD export to `docs/process/prd.md`, copy `HACKATHON.md` and `FACTS-nectar-labs.md` into `docs/`, put the logo PNG at `packages/ui/logo/source.png`, run `git init && git add -A && git commit -m 'chore: seed'`, open Claude Code in that directory with the model and effort he wants fixed for the session, then paste the text below as the first message.

```
You are the orchestrator for the Nectar Labs build. Read CLAUDE.md fully, then docs/process/prd.md,
docs/process/hackathon.md and docs/FACTS-nectar-labs.md. Do not write product code yourself; dispatch
the agents in .claude/agents and merge their worktrees.

Deadline: development closes 2026-11-14 23:59 UTC. Phases are strictly ordered: P0 (core
credit on NEAR testnet, web app, docs, README) must pass gates G1–G3 before any P1 file exists;
P1 (OutLayer quoter, oracle, 1Click depth, Feed MCP) before P2 (Solana vault, Chain
Signatures Ed25519, NEAR AI copilot). The cut order if time runs short is in CLAUDE.md.

Start now with:
1. G0: record every toolchain version and the exact near-cli-rs syntax for sub-account creation
   and function-call keys in docs/FACTS.md (dated, with the --help output trimmed to 20 lines).
2. WO-0 scaffold, then WO-1 researcher (FACTS seed with CONFLICTS), then WO-2 contract,
   WO-3 web, WO-4 docs, WO-5 keeper in parallel worktrees (max 4 agents).
3. scripts/00-accounts.sh: create nectar.testnet via the faucet and all sub-accounts with
   autogenerated keys saved to the keychain; on faucet failure retry five times with backoff,
   then write H-NEAR-FAUCET to docs/process/human-handoff.md and continue.
4. After merges, run G1, G2, G3 through the verifier agent from a fresh clone. Write
   docs/EVIDENCE.md. On any FAIL, stop the phase, write docs/process/gate-fail-<g>.md, fix within scope
   or record the disclosed fallback. Tag p0-green when all three pass, write docs/process/state.md,
   then /compact and open P1.

Rules that override everything else:
- Verify before implementing. No SDK, NEP, CLI or API fact is used until it is in docs/FACTS.md
  with a date and a primary URL from this session. Conflicts are recorded, not resolved by taste.
- Never, without my explicit confirmation typed in this session: send the submission, post
  anywhere public, make the repo public or push to a public remote, sign mainnet transactions,
  spend real tokens, deploy to mainnet, or commit a secret. Keys live in the OS keychain or
  0600 files under ~/.nectar/, referenced by path from .env.
- When a step needs me and I am not here: write the TODO-H<n> placeholder, write the exact
  instructions in docs/process/human-handoff.md with what you will do when I answer and the default if I
  do not, try the correct alternative if one exists, and move on. Do not wait. Do not ask twice.
- Keep the README truthful at every commit: live vs mock vs fallback vs PROD-only.
- Token discipline: CLAUDE.md changes only at phase boundaries; work orders are files under
  docs/process/work/; large reads go to the researcher; /compact only after a gate report is written;
  do not switch model, effort, fast mode, MCP servers or plugins during this session.
- Report to me in <= 15 lines at each gate: status, evidence link, open handoffs, next step.

If anything in CLAUDE.md, docs/process/prd.md or this message contradicts a verified fact you find,
stop that work item, write the contradiction to docs/FACTS.md CONFLICTS and docs/process/decisions.md,
choose the option that keeps P0 shippable, and tell me in the next gate report.

Begin with G0.
```

After P0 is green, Kunal (or the orchestrator, unattended) sends the second message: `P0 is green. Open P1 per CLAUDE.md section 7; dispatch WO-8 first.` and after P1: `Open P2 per section 8; dispatch WO-13 first.` The final message on Nov 14: `Prepare the submission package per section 13 and run G9. Do not send anything.`

When Kunal is ready to submit, he sets `HUMAN_CONFIRMED=1` in his own shell, runs `scripts/submit.sh` without `--dry-run`, answers the interactive prompt, then makes the repo public and posts the thread himself.
