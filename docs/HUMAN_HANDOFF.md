# HUMAN_HANDOFF.md

Steps only Kunal can do. Agents append or update entries here the moment such a step appears, then
continue with other work. Kunal reads `docs/STATE.md`, does the OPEN items top to bottom, and replies
in Claude Code with the id (for example `H7 done`). The orchestrator then does exactly what the
entry's "What Claude Code does then" line says.

Status values: OPEN · WAITING (agent did its part, needs Kunal) · DONE · DEFAULTED (deadline passed,
default applied, disclosed in README).

---

## H-TOOLCHAIN — pinned P0 toolchain                status: DONE 2026-11-10   (Kunal asked; installed by Claude Code)
Installed: Rust 1.95.0, near-cli-rs 0.31.1, cargo-near 0.23.0, gitleaks 8.30.1, yq v4.54.3, pnpm 10.34.9. Log: evidence/G0/toolchain.log.

## H-TOOLCHAIN-SOLANA — Solana CLI + Anchor 0.32.1   status: OPEN   needed by: P2 / G7 (not P0)
Why a human: the auto-mode classifier refused `scripts/01-toolchain.sh --with-solana` (Anza installer + `cargo install avm`).
What Kunal does (≈10 min, mostly compile): `cd /Volumes/T7/nectar-labs && bash scripts/01-toolchain.sh --with-solana 2>&1 | tee evidence/G0/toolchain-solana.log`,
  or add `"Bash(bash scripts/01-toolchain.sh*)"` to `permissions.allow` in `.claude/settings.json`. Reply `H-TOOLCHAIN-SOLANA done`.
What Claude Code does then: records `solana`/`anchor` versions in FACTS, unblocks WO-14 when P2 opens.
Default if silent by 2026-11-13 12:00 UTC: Solana leg cut per CLAUDE.md cut order (signer round-trip demo on NEAR only), disclosed in README.

## H-EXPLORER — open the three testnet explorer links once   status: OPEN   needed by: G9 (non-blocking for G2/G3)
Why a human: nearblocks returns HTTP 403 to automated fetches (bot protection); the verifier could not see the pages (EVIDENCE §G2).
What Kunal does (1 min): open in a browser and confirm each shows a contract with recent transactions:
  https://testnet.nearblocks.io/address/nectar-core.nectar.testnet · https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet · https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet
  Reply `H-EXPLORER ok` (or what looked wrong).
What Claude Code does then: marks the links human-verified in EVIDENCE §G2.
Default if silent: RPC evidence (view_account code_hash = G1 wasm) stands; README links stay; G9 notes "explorer pages not machine-verified".

## H13 — Pyth API key (for a live NVDA price, G5)        status: OPEN   needed by: P1 / G5 (2026-11-13 12:00 UTC)
Why a human: Hermes `/v2/updates/price/latest` returns 401 without a key (C-007, F-056); keys are tied to a personal account at app.pyth.com.
What Kunal does (5 min): 1. https://app.pyth.com → sign up (free) → create an API key (name: nectar-labs-testnet).
  2. In his shell: `mkdir -p ~/.nectar && printf '%s' '<paste key>' > ~/.nectar/pyth.key && chmod 600 ~/.nectar/pyth.key` (never in chat, never committed).
  3. Reply `H13 done`.
What Claude Code does then: keeper reads PYTH_API_KEY_PATH=~/.nectar/pyth.key, tests Hermes with Bearer auth; if it works, creates the
  updater account, pushes the NVDA update to pyth-oracle.testnet, switches NVDAx to `oracle_source = Pyth` and runs G5 live.
  If the key does not unlock Hermes (docs only promise it for Pyth Pro, F-056), records that and keeps the owner oracle.
Default if silent by 2026-11-13 12:00 UTC: owner oracle stays (D-013), README/Feed show the "owner oracle" badge, G5 records the disclosed fallback.

## H-NEAR-FAUCET — top up nectar.testnet with testnet NEAR     status: OPEN   needed by: P1 redeploy (WO-10 merge)
NOW (2026-11-10): nectar.testnet holds ~0.95 NEAR. P1 needs ~2–3 NEAR: larger nectar-core wasm storage (~+0.5–1 NEAR), OutLayer
`create_project` 0.1 NEAR, gas reserve for executions (~0.004 NEAR each, F-046), an oracle-updater sub-account.
What Kunal does (2 min): open https://near-faucet.io/ (F-154), request NEAR for `nectar.testnet` (repeat if allowed), reply `H-NEAR-FAUCET done`.
Default if silent: P1 contract upgrade waits; quoter and web work continue; if still silent at G4 time, G4 is recorded as blocked on funds.
(History below: the original parent-creation entry.)
Why a human: the faucet CLI may be rate-limited; the browser faucet needs a human.
What Kunal does (2 min):
  1. Open the NEAR testnet wallet / faucet page the script prints, create `nectar.testnet` (or the
     name the script printed if taken), choose "save key to keychain" flow or export the key.
  2. If a key file was downloaded: `mkdir -p ~/.nectar/keys && mv ~/Downloads/<file>.json ~/.nectar/keys/nectar.testnet.json && chmod 600 ~/.nectar/keys/nectar.testnet.json`
  3. Reply: `H-NEAR-FAUCET done <account id>`
What Claude Code does then: imports the key to the keychain, re-runs `scripts/00-accounts.sh --skip-parent`, records F-020/ids in FACTS, continues G2.
Default if silent: the orchestrator keeps retrying the faucet every 15 min; P0 deploy waits on this one item while web/docs/contract tests continue.

## H4 — analytics vendor                             status: OPEN   needed by: WO-4 (any time before Nov 14)
Why a human: a tracking id or domain is tied to Kunal's account; it is also a privacy policy decision.
Options: (a) GA4 — needs a measurement id `G-XXXXXXX`; consent banner required (shipped). (b) Plausible — cookieless, needs the site domain registered at plausible.io; banner only covers preference storage.
What Kunal does (3 min): create the property/site, then reply `H4 ga4 G-XXXXXXX` or `H4 plausible <domain>`.
What Claude Code does then: sets `NEXT_PUBLIC_ANALYTICS` and `docusaurus.config.ts` accordingly, updates the Cookie page's storage list, redeploys previews, records in EVIDENCE.
Default if silent: analytics off; banner shipped; both code paths present and tested with a dummy id.

## H5 — domains and hosting                          status: OPEN   needed by: G3 (previews fine without)
Why a human: domain DNS and Vercel account ownership.
What Kunal does (5 min): in Vercel create projects `nectar-labs-web` and `nectar-labs-docs` (or run `vercel link` in `apps/web` and `apps/docs-site`); add domains; optionally `vercel env add VERCEL_TOKEN` is NOT needed — instead run `vercel --prod` yourself, or paste a scoped token into `~/.nectar/vercel.token` (0600) and reply `H5 token`.
What Claude Code does then: with a token, deploys previews after each green gate via `vercel deploy --prebuilt`; without, prints the exact `vercel` commands in EVIDENCE.
Default if silent: no hosted preview; README links to `pnpm --filter web dev` and screenshots in evidence/.

## H7 — NEAR AI Cloud API key                         status: OPEN   needed by: P2 / G8 (live test only)
Why a human: paid credential tied to Kunal's account ($10 credit).
What Kunal does (3 min):
  1. https://cloud.near.ai → sign in → API keys → Create key (name `nectar-labs-hackathon`).
  2. `echo 'NEAR_AI_API_KEY=<paste>' >> apps/web/.env.local` (never commit).
  3. Reply: `H7 done`
What Claude Code does then: runs `pnpm --filter web test:copilot --live`, updates EVIDENCE G8, flips the copilot badge from "key missing" to live.
Default if silent (2026-11-14 15:00 UTC): copilot ships with the recorded-fixture verifier and a visible "key missing" state; README says so.

## H8 — 1Click API key (optional)                     status: OPEN   needed by: WO-11 (optional)
Why a human: key issued per partner; lowers displayed fee from 25 to 20 bps.
What Kunal does: request a key per https://docs.near-intents.org/ ; `echo 'ONE_CLICK_API_KEY=<paste>' >> services/keeper/.env.local`; reply `H8 done`.
Default if silent: unauthenticated dry quotes; Feed shows the fee the quote returns.

## H9 — legal identity and contact                    status: OPEN   needed by: WO-4 legal pages
Why a human: entity name, controller address, contact email, form provider are legal statements.
What Kunal does (2 min): reply `H9 <entity name> | <contact email> | <form provider or mailto>`.
What Claude Code does then: replaces `TODO-H9` in `apps/docs-site/docs/legal/*.md` and the web footer; rebuilds docs.
Default if silent: "Nectar Labs (unincorporated project)", `kunal@nectarnetwork.fun`, mailto form.

## H10 — team and second-project check               status: OPEN   needed by: SUBMISSION.md
What Kunal does: reply `H10 team: <names/handles> | projects: <0 or 1 other>`.
Default if silent: Kunal only; Q-015 noted as unconfirmed in SUBMISSION.md (blocks H1).

## H11 — demo video voice-over                         status: OPEN   needed by: Nov 14
Why a human: voice. Agents produce `evidence/demo.webm` (captioned, silent) with `pnpm demo:capture`.
What Kunal does (15 min): record voice over `docs/DEMO_SCRIPT.md`, or accept the captioned version; upload to the host the submission form expects; reply `H11 <url>`.
Default if silent: captioned silent video path given in SUBMISSION.md; URL field `TODO-H11`.

## H12 — prior-work disclosure wording               status: OPEN   needed by: README before H2
What Kunal does: read README "Prior work", edit if needed, reply `H12 approved`.
Default if silent: drafted text stands with the note "draft — approve" removed only after H12.

## H2 — repo public, push, final tag                 status: OPEN   needed by: Nov 14   NEVER by an agent
What Kunal does: `git tag submission-rc && git remote add origin <url> && git push -u origin main --tags`; make public in GitHub settings; reply `H2 done <url>`.
What Claude Code does then: fills repo URL in SUBMISSION.md and X_POST.md; re-runs G9 against the public URL.

## H1 — send the submission                            status: OPEN   needed by: Nov 14 23:59 UTC   NEVER by an agent
Pre-conditions: G9 PASS, H2 done, H10 done, H12 approved.
What Kunal does: review `docs/SUBMISSION.md`; `HUMAN_CONFIRMED=1 scripts/submit.sh` (interactive `yes`); reply `H1 done`.

## H3 — X post                                         status: OPEN   needed by: after H1   NEVER by an agent
What Kunal does: post from `docs/X_POST.md` himself.

## H6 — mainnet (post-hackathon)                       status: not in scope
Nothing mainnet is created, funded or deployed during the hackathon.
