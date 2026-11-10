# Nectar Labs — CLAUDE.md

This file is loaded at session start and cached for the whole session. It changes only at phase
boundaries (P0 → P1 → P2). Anything volatile lives in `docs/FACTS.md`, `docs/STATE.md` or
`packages/config/config.yaml`.

Spec: `docs/PRD.md` (Nectar Labs PRD v7; v6 kept as `docs/PRD-v6.md`). Plan: this file + `docs/BUILD_PROMPT_V7.md`
(addendum, overrides the first prompt where they differ) + `docs/work/*.md`. v7 id mapping (addendum → repo): D-017 in DECISIONS.
Rules source: `docs/HACKATHON.md` (NEAR Hackathon, verified 2026-11-09).

## 1. Mission and deadline

Ship Nectar Labs on NEAR testnet (hub) with Solana devnet (P2a) and Base Sepolia `84532` (P2b) spokes for the NEAR Hackathon:
time-committed, escrowed market-maker quotes (Pappus) raise borrowing limits (Cramér) on
thin-exit collateral; borrowers pay a limit premium that funds buyers' commitment fees.

- Development closes **2026-11-14 23:59 UTC**. Judging 16–18 Nov.
- Internal: P0 green Nov 11 evening · P1 Nov 13 noon · P2 Nov 14 noon · package Nov 14 18:00 UTC.
- Chains: NEAR testnet (hub), Solana devnet (P2a), Base Sepolia `84532` (P2b). Nothing else. No mainnet. No token.
- Tracks: `defi`, `security`, `privacy` always; `agents`, `nfts`, `realworld` only after their gates; `thesis` only if H18 = yes
  and a reproducible notebook ships.
- Collateral is **mock NVDAx** (`nvdax-mock.nectar.testnet`) standing in for xStocks / Opening Bell.
  The README says so on the first screen.
- **No hackathon branding in the product UI** (landing, web app, docs navigation): no banner, badge or
  copy about the NEAR Hackathon. UI disclosures say "testnet" and "mock collateral". Hackathon context
  lives only in README.md, docs/EVIDENCE.md and docs/SUBMISSION.md, where judges read it.
- Copy rules: never "insurance", never "without liquidations", never "live" before EVIDENCE shows it.

### Phases are strictly ordered
P0 → G1–G3 → P1 (+ v7 modules, G10 G11 G14) → G4–G6 → P2a (Solana lifecycle, copilot) → G7–G8 → P2b (Base
Sepolia, G12 G13; hard stop 2026-11-14 12:00 UTC) → submission package → G9. **No P1 file before `p0-green`; no P2b
file before G7 passed or is recorded as a disclosed failure.** v7 P0 delta = five items only (WO-19/WO-20).

Cut order (cut first → cut last): thesis → Base spoke → copilot → x402 → Reserve → Position Notes → Profit-Lock →
Shields → Feed MCP + agent skill → Solana leg (keep the signer round-trip) → 1Click depth → oracle (owner oracle,
disclosed) → OutLayer quoter (static discount, disclosed). P0 is never cut. A cut module leaves its contract fields
in place, unused and documented.

### Hackathon rules that bind you
| Rule | Consequence |
| --- | --- |
| Q-007 no Intents testnet | 1Click only with `dry: true`; never deposit |
| Q-010 testnet eligible | everything on testnet/devnet |
| Q-017 agents screen repos | README quick start works from a fresh clone (G9) |
| Q-002 / Q-005 baseline disclosure | README "Prior work" section; all code here is new |
| Q-015 ≤ 2 projects per person | `docs/SUBMISSION.md`, Kunal confirms |
| `website` field is a spam trap | leave empty unless Kunal says otherwise |

### Never, without Kunal's explicit confirmation typed in this session
send the submission · post on X or anywhere public · make the repo public, push to a public
remote, or force-push · sign any mainnet transaction, spend real tokens, deploy to mainnet ·
commit a secret or private key · delete testnet accounts · change approved submission fields · any Base mainnet
(`8453`) transaction or deployment · post on market.near.ai · register a Base builder code.
Keys live in the OS keychain or `0600` files under `~/.nectar/`; `.env` holds paths and ids only.
`HUMAN_CONFIRMED=1` is set only by Kunal in his own shell; the Bash hook enforces this.

### Always
`docs/FACTS.md` before code · `docs/EVIDENCE.md` after each gate · `docs/HUMAN_HANDOFF.md` the
moment a human step appears · `README.md` truthful at every commit (live / mock / fallback /
PROD-only) · `docs/STATE.md` after every dispatch round and before any `/compact`.

## 2. Verify before implementing
No protocol, SDK, CLI or API fact is used until it is in `docs/FACTS.md` with a date and a
primary URL read **this session**. Quote facts by id (`F-012`), never re-paste. A conflict
between sources is recorded under CONFLICTS and surfaced in the next gate report; it is never
resolved by preference. If verification contradicts the PRD or this file: stop that work item,
write FACTS CONFLICTS + `docs/DECISIONS.md`, choose the option that keeps P0 shippable, report.

## 3. Token economy (applies to every agent)
- Caching is automatic. Do not invalidate it: no model switch, no effort change, no fast-mode
  toggle, no MCP server add/remove, no plugin enable, no whole-tool deny during the session.
  `promptCacheTtl` and `subagentPromptCacheTtl` are `1h` in `.claude/settings.json`; check `/usage`.
- This file changes only at phase boundaries. Work orders are files in `docs/work/`; the
  orchestrator writes the file and tells the agent one line.
- Large reads go through the `researcher` agent (≤ 40-line reports + FACTS edits). Never hold a
  full docs page in the main thread. Clone repos to `/tmp/research/` and grep.
- Build agents run in worktrees (`isolation: worktree`); max 4 in parallel; the orchestrator
  merges one at a time with `git merge --no-ff` and runs `pnpm verify:quick` after each merge.
- `/compact` only at phase boundaries or after a gate report is written, and only after
  `docs/STATE.md` is current.
- `Grep`/`Glob` before `Read`; `Read` with offsets; pipe build/test output through `tail -n 40`
  and save full logs to `evidence/<gate>/<timestamp>.log`. No images in the main thread.
- One work order = one agent, one directory, one gate-sized deliverable, < 2 h wall clock.

## 4. Agents and ownership
| Agent | Owns (writes only here) |
| --- | --- |
| orchestrator (main session) | `scripts/`, `packages/config/`, `docs/STATE.md`, `docs/work/`, merges; never product code |
| researcher | `docs/FACTS.md` entries |
| contract | `contracts/` |
| quoter | `quoter/` |
| keeper | `services/keeper/`, `services/feed/`, `services/x402/` |
| web | `apps/web/`, `packages/ui/` (incl. `packages/ui/notes/`), `packages/sdk/` |
| docs | `apps/docs-site/`, `docs/*.md` except FACTS/EVIDENCE |
| solana | `solana/` |
| evm (P2b) | `evm/` |
| verifier | `docs/EVIDENCE.md`, `evidence/` (read-only elsewhere; runs gates from a fresh clone) |

Dispatch loop per phase: write work orders → researcher for VERIFY items → build agents (≤ 4) →
merge one by one → verifier runs gates from a fresh clone → PASS: EVIDENCE, tag, STATE, compact,
next phase · FAIL: STOP, `docs/GATE_FAIL_<G>.md`, fix within scope or record disclosed fallback.

## 5. Gates (verifier, fresh clone, no secrets)
G0 toolchain + exact CLI syntax in FACTS · G1 contract unit + sandbox tests, model.csv match ·
G2 testnet deploy, views answer, explorer links · G3 web E2E, a11y ≥ 90, both themes, phone ·
G4 OutLayer execution attested, cost recorded, fallback tested · G5 oracle live price, staleness
+ conf rejection tested · G6 1Click dry quote verified · G7 Solana devnet tx with Ed25519 verify
ix + settle, signer response on NEAR · G8 copilot verifier green (fixture at minimum) ·
G9 fresh-clone README rehearsal < 15 min, EVIDENCE complete, no secrets in history.
v7 (`docs/work/gates-v7.md`): G10 v7 facts + toolchain · G11 v7 contract tests · G12 Base toolchain + collateral ·
G13 Base round-trip · G14 x402 paid call. G1 adds the v7 P0 tests; G2b/G3b re-run against `nectar-core-v2`; G7 adds
the remote lifecycle (stored authority = `derived_public_key`, attested deposit, signed release).
A FAIL halts the phase. Nobody begins the next phase while a gate of this phase is FAIL.

## 6. Human handoff protocol
When a step needs Kunal (credential, payment, public action, legal name, irreversible decision):
1. Put `TODO-H<n>` in code/config with a comment naming the handoff.
2. Write/update the entry in `docs/HUMAN_HANDOFF.md`: why human, exact command or click path,
   what you do the moment he answers, default if silent by the deadline.
3. Try the correct alternative if one exists (other faucet, other RPC, recorded fixture, owner
   oracle) and record it.
4. Move on. Never wait. Never ask twice. Never do the human step yourself. Never claim it is done.
Kunal returns, reads `docs/STATE.md` + `docs/HUMAN_HANDOFF.md`, does OPEN items, replies with ids.

## 7. Reporting
At each gate, ≤ 15 lines to Kunal: status, evidence link, open handoffs, next step. Agents report
to the orchestrator in ≤ 20 lines: what changed, test counts, gas, anything contradicting FACTS.

## 8. Conventions
Rust: `near-sdk` 5.30.1, edition 2024, `cargo near build`; no floats in contracts or quoter;
amounts `_e6` (USD/USDC) and `_e18` (fee index); `bps` everywhere; borsh layouts versioned.
TS: Node ≥ 22.22.2, pnpm, strict TS, `near-api-js` 7.4.0, `@solana/kit` 8.6.0; no `any`.
Commits: conventional (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), one work order per commit,
no `Co-Authored-By` trailer — kunal-drall is the sole author (Kunal, 2026-11-10). Tags: `p0-green`, `p1-green`, `p2-green`, `submission-rc`.
