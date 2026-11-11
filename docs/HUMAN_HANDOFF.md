# HUMAN_HANDOFF.md

Steps only Kunal can do. Agents append or update entries here the moment such a step appears, then
continue with other work. Kunal reads `docs/STATE.md`, does the OPEN items top to bottom, and replies
in Claude Code with the id (for example `H7 done`). The orchestrator then does exactly what the
entry's "What Claude Code does then" line says.

Status values: OPEN · WAITING (agent did its part, needs Kunal) · DONE · DEFAULTED (deadline passed,
default applied, disclosed in README) · SUPERSEDED (replaced by the entries it names; history kept).

---

## H-TOOLCHAIN — pinned P0 toolchain                status: DONE 2026-11-10   (Kunal asked; installed by Claude Code)
Installed: Rust 1.95.0, near-cli-rs 0.31.1, cargo-near 0.23.0, gitleaks 8.30.1, yq v4.54.3, pnpm 10.34.9. Log: evidence/G0/toolchain.log.

## H-TOOLCHAIN-SOLANA — Solana CLI + Anchor 0.32.1   status: DONE 2026-11-10 (Kunal asked; installed by Claude Code: anchor-cli 0.32.1 via avm, active solana-cli 2.3.0 = Anchor CI pin C-017; Anza stable 4.3.2 also present; logs evidence/G0/toolchain-*)   needed by: P2 / G7 (not P0)
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

## H-NEAR-FAUCET — top up nectar.testnet with testnet NEAR     status: DONE 2026-11-10 (Kunal replied `H-NEAR-FAUCET done`; nectar-core-v2 deployed after, EVIDENCE §G2b PASS 2026-11-10T16:52Z)   needed by: P1 redeploy (WO-10 merge)
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

## H5 — domains and hosting                          status: SUPERSEDED 2026-11-12 by H-HOST + H-DOMAIN (+ H-DNS), D-030; history below   needed by: G3 (previews fine without)
Why a human: domain DNS and Vercel account ownership.
What Kunal does (5 min): in Vercel create projects `nectar-labs-web` and `nectar-labs-docs` (or run `vercel link` in `apps/web` and `apps/docs-site`); add domains; optionally `vercel env add VERCEL_TOKEN` is NOT needed — instead run `vercel --prod` yourself, or paste a scoped token into `~/.nectar/vercel.token` (0600) and reply `H5 token`.
What Claude Code does then: with a token, deploys previews after each green gate via `vercel deploy --prebuilt`; without, prints the exact `vercel` commands in EVIDENCE.
Default if silent: no hosted preview; README links to `pnpm --filter web dev` and screenshots in evidence/.

## H-DOMAIN — a domain for the hosted demo             status: OPEN   needed by: 2026-11-13 06:00 UTC (WO-34 deploy, round 3)
Why a human: registering a domain spends real money and binds a registrar account. Agents never buy a domain.
Facts: nectarlabs.io is **not registered** (F-395: whois.nic.io "Domain not found", NXDOMAIN at a0.nic.io, 2026-11-11T19:43Z). The orchestrator's
  pre-check (docs/work/wo-34-deploy.md) saw the Vercel registry offer it at $14.99 for the first year, $46 renewal. That contradicts the brief, which said it
  already answered HTTP (FACTS C-022).
What Kunal does (5 min), one of:
  (a) Vercel dashboard → Domains → Buy → `nectarlabs.io` (check the price shown), then reply `H-DOMAIN nectarlabs.io`.
  (b) Name a domain you already own (the team already holds nectar.monster, nectarnetwork.fun, nectarn.wtf on Vercel DNS): reply `H-DOMAIN <domain>`.
  (c) Reply `H-DOMAIN none` to keep the platform URLs.
What Claude Code does then: adds the domain to the new Vercel web project (SITE = apex, APP = `ac.<domain>`, `www` → apex 301), sets SITE_URL, APP_URL,
  DOCS_URL and DOCS_ORIGIN_URL (see RUNBOOK "Docs site under /docs"), redeploys the same commit, then writes the records Vercel returns into H-DNS.
Default if silent by 2026-11-13 06:00 UTC: `*.vercel.app` aliases for SITE and APP (docs under APP `/docs`) and `*.up.railway.app` for the Feed. A domain
  added later is an env + alias change, no code change.

## H-DNS — DNS records for the chosen domain           status: OPEN (blocked on H-DOMAIN; records are filled in at deploy time)   needed by: production on a custom domain
Why a human: only the domain's owner can edit its DNS zone (unless the domain uses Vercel DNS, where Vercel sets the records itself).
What Kunal does (5 min): after H-DOMAIN, add exactly the records listed below at the domain's DNS provider, then reply `H-DNS done`.
  Records: TODO-H-DNS (the orchestrator pastes the A/CNAME/TXT values Vercel returns when the domain is added to the project; none yet).
What Claude Code does then: waits for Vercel to show the domain as verified and the certificate as issued, then the verifier re-runs the production checks
  (wo-34v) on the custom domain and records them in EVIDENCE.
Default if silent: the platform URLs from H-DOMAIN's default stay the public URLs.

## H-LEGAL — operator, country, contact, X handle     status: OPEN   needed by: 2026-11-13 12:00 UTC (production promotion)
Why a human: the legal pages name who operates the site and where; only Kunal can state his legal identity and choose a public contact. Overlaps H9
  (entity name, TODO-H9); one answer covers both.
Where it goes: `packages/config/config.yaml` → `site:` (`operator`, `country`, `contact`, `x_handle`; all null today, marked TODO-H-LEGAL). The pages read
  them from there. A production build with operator, country or contact null fails on purpose, so no page ships a blank operator.
What Kunal does (2 min): reply `H-LEGAL operator="<person or company name>" country="<country>" contact="<email>" x="<@handle or none>"`.
What Claude Code does then: the orchestrator fills `site:`; the legal pages (privacy, cookies, terms, disclaimers; WO-34e) and the site footer show the
  values; the production guard passes; the deploy is promoted to production.
Default if silent by 2026-11-13 12:00 UTC: no production promotion (previews only, noindex). The submission continues without hosting.

## H-KEYS — testnet signing keys as Railway secrets   status: OPEN (treated as not confirmed)   needed by: hosted keeper / x402 relayer only
Why a human: storing a signing key with a third party changes where keys live (CLAUDE.md: OS keychain or `0600` files under `~/.nectar/`). Kunal's
  paste kept the line "New testnet-only function-call keys… may be stored as Railway secrets", but the template fields around it were left unfilled, so it
  is not read as a confirmation.
What Kunal does (1 min): reply `H-KEYS yes` (new testnet-only function-call keys, one for the keeper and one for the x402 relayer, created for this
  purpose with a small allowance, stored only as Railway service variables) or `H-KEYS no`.
What Claude Code does then, on yes: creates the two new function-call keys on testnet (method-restricted, never full access, never the keys in
  `~/.nectar/`), sets them as Railway variables on the new project, deploys the keeper and x402 services, records the public keys and allowance in
  EVIDENCE. On no: nothing leaves `~/.nectar/`.
Default if silent: keeper and x402 stay local (they run when the operator runs them). The hosted app says when settlement runs.

## H-HOST — Vercel and Railway CLI login, Railway plan   status: OPEN   needed by: 2026-11-13 06:00 UTC (WO-34 deploy, round 3)
Why a human: a CLI login binds Kunal's accounts (Vercel team "kunal's projects", Hobby plan; Railway workspace "kunal drall's Projects"). The Railway
  plan is not readable through the API. Agents never log in for him and never upgrade a plan.
What Kunal does (5 min), in his own shell:
  1. `npx -y vercel@65.14.0 login`
  2. `npx -y @railway/cli@5.71.0 login`
     (versions: F-394, npm latest on 2026-11-11; the subcommand grammar is still VERIFY there, so the orchestrator checks `--help` before scripting.)
  3. Railway: Dashboard → Workspace settings → Plan. Reply `H-HOST done, railway plan <name>`. Do not upgrade.
What Claude Code does then: creates new projects only (the pre-repo Vercel projects nectar-landing, nectar-frontend, docs-site-nectar and the five
  pre-repo Railway projects stay untouched), sets env per RUNBOOK, deploys the code-final commit after the G3b re-run (scripts/deploy/*), and the
  verifier records deployment ids, URLs and headers in EVIDENCE (wo-34v).
Default if silent by 2026-11-13 06:00 UTC: no hosting. README keeps the local quick start; the submission continues.

## H7 — NEAR AI Cloud API key                         status: OPEN   needed by: P2 / G8 (live test only)
Why a human: paid credential tied to Kunal's account ($10 credit).
What Kunal does (3 min):
  1. https://cloud.near.ai → sign in → API keys → Create key (name `nectar-labs-hackathon`).
  2. `echo 'NEAR_AI_API_KEY=<paste>' >> apps/web/.env.local` (never commit).
  3. Reply: `H7 done`
What Claude Code does then: runs `pnpm --filter web test:copilot --live`, updates EVIDENCE G8, flips the copilot badge from "key missing" to live.
Default if silent (2026-11-14 15:00 UTC): copilot ships with the recorded-fixture verifier and a visible "key missing" state; README says so.

UPDATE 2026-11-10T00:15Z (C-019, daily verify): the NEAR Builders $10 credit is now a SEPARATE API key claimed at
https://nearbuilders.org/dashboard (not applied to a cloud.near.ai account). Either route works: claim it there, or create a key at
cloud.near.ai. Store it outside the repo: `printf '%s' '<key>' > ~/.nectar/nearai.key && chmod 600 ~/.nectar/nearai.key`, then reply `H7 done`.
Note: NEAR AI Cloud /v1/models has returned HTTP 500 since 2026-11-09T23:05Z; the live G8 run happens once it answers.

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
What Kunal does: reply `H10 team: <names/handles> | projects: <0 or 1 other> | lead: <name> | email: <address> | size: <1 or "2 - 4" …>` (SUBMISSION.md `leadName`, `email`, `size`).
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
Pre-conditions: G9 PASS, H2 done, H3 done (its URL is `demoUrl`), H10 done, H12 approved, H14 done.
What Kunal does: review `docs/SUBMISSION.md`; `HUMAN_CONFIRMED=1 scripts/submit.sh --send` (without `--send` it is a dry run; interactive `yes`); reply `H1 done`.

## H3 — X post                                         status: OPEN   needed by: before H1   NEVER by an agent
HACKATHON.md: send the submission only once the repo is public and the demo post is up; the post URL is the `demoUrl` field.
What Kunal does: after H2 and H11, post from `docs/X_POST.md` himself (video on post 1); reply `H3 <post url>`.
What Claude Code does then: puts the URL in SUBMISSION.md `demoUrl`.

## H14 — payout account, contact consent                status: OPEN   needed by: H1   NEVER by an agent
Why a human: the mainnet payout account is Kunal's own wallet; consent must be his agreement to the verbatim notice.
What Kunal does: create or pick a mainnet NEAR account in his wallet; read "I agree that the organizers may use these details to
review our submission and contact us about this hackathon."; reply `H14 <account.near> | consent yes`.
Default if silent: `nearAddress`/`consent` stay `TODO-H14`; the payload is not sendable (submit script exits 2 on `TODO-H`).

## H6 — mainnet (post-hackathon)                       status: not in scope
Nothing mainnet is created, funded or deployed during the hackathon.

---
# v7 handoffs (2026-11-10, D-017). Addendum ids: H13 → **H19**, H14 → **H20** here (H13/H14 were already used); H15–H18 unchanged.

## H-GUARD-V7 — install the v7 guard rules + evm agent        status: OPEN (Kunal-only; no product claim depends on it: Base runs on the local fork, D-026)   needed by: P2b (Base) only
Why a human: the auto-mode classifier refuses to let an agent edit its own guard and settings (self-modification), which is correct.
What Kunal does (1 min, repo root): `python3 scripts/v7-install-claude-config.py && bash scripts/test-guard-v7.sh` (every line should say `ok`).
That blocks Base mainnet (8453), any `--private-key`, and POSTs to market.near.ai. It allows forge/cast/anvil/avm and installs `.claude/agents/evm.md`, which loads next session.
What Claude Code does then: records it in EVIDENCE G12 prep and uses the `evm` agent for WO-27/29c.
Default if silent: P2b does not start (Base is cut first anyway). Superseded: P2b ran on the local fork without it (D-026, EVIDENCE §G12, §G13); if silent, the guard rules stay uninstalled.

## H15 — Base Sepolia ETH for the deployer          status: OPEN (optional since D-026)   needed by: real-Base-Sepolia G12/G13 only
Deployer (Foundry keystore, scripts/06-base.sh): **0x4CAd440076321Da4ef05d35113aC6A58F3aDBFBd** — send ≥ 0.05 Base Sepolia ETH (CDP portal faucet ~1 min) and reply
`H15 done <tx>`; then `BASE_RPC_URL=https://sepolia.base.org bash scripts/26-deploy-base.sh` re-runs G12/G13 on the real chain. Until then the spoke runs
on a disclosed local fork of Base Sepolia (D-026).
1. After `scripts/06-base.sh` runs (P2b), read the deployer address printed here. 2. Sign in to a Base Sepolia faucet from the FACTS list (WO-18 item 11).
3. Send ≥ 0.05 Sepolia ETH to the deployer. 4. Reply `H15 done <tx hash>`.
Then: funds keeper + borrower from the deployer, runs G12. Default if silent: P2b skipped and disclosed.

## H16 — final track list                            status: DONE 2026-11-11 (Kunal: "H16 defi security agents (I'll decide nfts after item 3)"; D-028)   needed by: submission
Applied (WO-52): docs/SUBMISSION.md `tracks` = `["defi","security","agents"]`; README "Tracks and why". `privacy` dropped by Kunal (overrides CLAUDE.md §1 "privacy always"). Still open: `nfts`. Reply `H16 nfts yes` or `H16 nfts no`; on yes the docs agent appends `"nfts"` to the `tracks` row. Default if silent: not entered.

## H17 — consumer line                               status: OPEN   needed by: landing copy (WO-20 uses the default)
Reply `H17 fire-sales` or `H17 liquidations`. Default: "Borrow against stocks without fire-sales" (accurate; "without liquidations" is not).

## H18 — thesis notebook                             status: OPEN
Reply `H18 yes` or `H18 no`. Yes → WO-32 after P2a. Default: not attempted.

## H19 — Base builder code (addendum H13)            status: OPEN   needed by: G13 (optional)
1. Register the project on Base Dashboard. 2. Settings → Project Settings → Builder Code. 3. `echo 'BASE_BUILDER_CODE=<code>' >> services/keeper/.env.local`
4. Reply `H19 done`. Then: the keeper appends the ERC-8021 suffix; G13 checks the last bytes of calldata. Default: no suffix; README says so. Agents never register it.

## H20 — market.near.ai task (addendum H14, optional) status: OPEN
Post the task text from docs/MARKET_TASK.md (written by WO-30) from your own account; reply `H20 <url>`. Then it is linked from /agents and the README.
Default: not posted. Agents never post there.

## H-NEAR-FAUCET — v7 update (2026-11-10 11:30Z)     status: DONE 2026-11-10 (see the entry above; v2 deployed)
nectar.testnet holds **0.064 NEAR**. The v7 deploy (D-018) needs about **11 NEAR** (updated 20:00Z: v2 wasm is 628 KB after WO-23a, more with Notes/Reserve): the `nectar-core-v2` account + wasm storage (~9), `keeper-v2` (0.5),
`x402-relayer` (3, only if x402 survives F-329), `agent1` (0.5), and the demo reseed. Same steps as above (https://near-faucet.io/ → `nectar.testnet`, repeat if allowed).
Until then: v7 is built and sandbox-tested, but nothing new deploys; v1 stays the live demo.

## H-SOL-AIRDROP — devnet SOL for the vault deploy          status: DONE 2026-11-10 ~18:10Z (deployer showed 5 SOL at the end of the CLI retry loop; source not recorded) → vault deployed (9fb7cfb)   needed by: G7 (Solana leg)
Why: `solana airdrop` is rate-limited per IP (2026-11-10 17:55Z, every try failed). The vault deploy needs ≥ 4.5 SOL (program rent 2.02 + same-size buffer).
What Kunal does (2 min): open https://faucet.solana.com (GitHub sign-in raises the limit), choose devnet, request SOL to
`3pF3vKewQdsKd4TEZvWYZrHZfRRJnzW3EsgtU3x8bZgS` (deployer, 5 SOL if allowed) and 1 SOL to `82hq1LTc9cuYsdkKxYQVQ6p4qxvYM9hdrQ6V8zW7HVa7` (keeper fee payer); reply `H-SOL-AIRDROP done`.
What Claude Code does then: `scripts/05-solana.sh` (mint), the vault deploy per solana/deploy.md, `init_vault`, config update, G7 run.
Meanwhile: retries the CLI airdrop with backoff. Default if silent at 2026-11-13 12:00 UTC: the Solana leg stays local-validator only (25/25 anchor tests) + the NEAR-side signer round trip, disclosed (cut order).
