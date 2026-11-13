# WO-92 — README and repo, final pass (Kunal 2026-11-13 ~20:05Z). SUPERSEDES WO-89/WO-90/WO-91 (Parts A/B/C). Kunal's brief, verbatim below.
Orchestrator schedule: STEP 1 (text only, now → ~22:30Z): README/SUBMISSION idea/X_POST text + Mermaid + glossary + deployed-accounts table + docs/README.md
index draft + evidence/README.md draft — NO pnpm, NO tests, NO builds, NO deletes, NO git mv/rm until the orchestrator says the takes are done.
STEP 2 (after the takes): repo cleanup (moves/removals), product copy (copilot notice) + docs-site method-name fixes → one web + one docs deploy + re-check.
STEP 3: verify (link check, git status, G9 + a fresh README-only reader, prod smoke, product diff vs the deployed commit) → submission-rc → report.

Goal: a judge, the Claude Code/Codex screener or a future partner opens the repo and in 2 minutes knows what Nectar is, tries it, and sees exactly what NEAR does. It should read like a serious product repo: calm, precise, no marketing, nothing stray.

TIMING
- Text edits may run any time. No builds, tests, deploys or deletes on this machine from 20:50 UTC until the after-close takes finish.
- Everything below is done, verified and on main before the 10:00 UTC tag move. Main freezes after submission.

1. README.md, final pass (rewrite where needed; keep what's already verified)
Order:
  a. Logo: <picture> with lockup-dark/lockup-light from packages/ui/logo for dark/light themes. Then one line: what Nectar is and who it's for. Then screenshot 3. Then the problem in 3 plain sentences.
  b. 60-second path: a table "Do this | You should see" on https://testnet.nectarlabs.io, with screenshots 2, 4 and 6. It must match real behaviour: if the borrow toast shows no tx hash with Intear, point to where the link does appear.
  c. How NEAR is used, concretely: numbered, each with the exact contract/method/standard and a tx checked on chain or a test name: nectar-core-v2 escrow and limits; NEP-141 ft_transfer_call; NEP-171 Position Notes via nft_transfer (wording per the Notes check); NEP-297 events read by the Feed; x402 with NEP-366 SignedDelegate; the function-call key limited to update_owner_price (on-chain record); OutLayer TEE quoter only if EVIDENCE verifies it; 1Click quotes as read-only reference (no Intents testnet, Q-007); Chain Signatures settlement only as far as EVIDENCE shows (Base on a local fork).
  d. Deployed on testnet: a table of every account (core contract, mock tokens, keeper, refresher key) with explorer links, plus the hosts (site, testnet app, docs, status, Feed).
  e. What is real, what is mock.
  f. What this does not prove.
  g. What we set out to prove, and the result: claim | result | evidence, in product language. Every live figure carries its read time, or links the live view.
  h. Next: this build becomes Nectar's cross-chain layer. NEAR coordinates settlement on other chains through Chain Signatures and, later, native BTC custody, when a lender or grant funds it. Shields, Profit-Lock, Position Notes, x402 credit and the Reserve stay hackathon features until a partner lender exists; don't present them as roadmap.
  i. Architecture: one Mermaid diagram (contract, Feed, keeper, refresher, web, agents, wallets, chains), accurate to the code. Then a short glossary: quote, limit, exit capacity, Shield, Note.
  j. Run locally: copy-paste commands tested by G9, plus a commands table for the scripts a judge needs.
  k. Security (link SECURITY.md, its reporting contact and disclosed limitations); Prior work (H12 text); libraries (Q-005); our other project if H10 lists one (Q-015); team ("Kunal"); links (site, docs, status, NEAR Builders page, X @nectarlabsio); license.
Style:
- First screen ≤ 25 lines; whole README ≤ ~400 lines; deeper material in docs/.
- Sentence-case headings, short paragraphs, units on every number.
- Relative links for repo files.
- No gate IDs (G#, WO-, H-, F-, §) and no process talk.
- Every factual sentence has evidence or goes.
- Banned: seamless, revolutionary, game-changing, unlock, empower, leverage (as a verb), robust, cutting-edge, next-generation, innovative, effortless, supercharge, harness, delve, guaranteed, exit liquidity, insurance, without liquidations, powered by NEAR; "live" without evidence. No emoji; no badge that isn't real (CI and license only).
Apply the same rules to SUBMISSION idea and X_POST.md. Re-check both against the final README.

2. Repo cleanup (no history rewrite)
a. Top level holds only: README.md, LICENSE (MIT, "© 2026 Nectar Labs"), SECURITY.md, CLAUDE.md (leave its content alone), workspace config (package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig*, Cargo files), .gitignore, .github/, .claude/ (settings and hooks only), apps/, packages/, services/, contracts/, scripts/, docs/, evidence/.
b. docs/: add docs/README.md as an index. Product docs at docs/ (EVIDENCE.md, FACTS.md, architecture, demo script). All process material under docs/process/: work orders, HUMAN_HANDOFF, STATE, DECISIONS, FINAL_REPORT, GATE_FAIL_*, PRD and build prompts, BUNDLE_README. Kebab-case file names for new or moved docs. Update every link to a moved file.
c. Remove from git: ._* files, .DS_Store, stray logs outside evidence/, scratch and one-off scripts, agent-memory notes, duplicate screenshots, any tracked build output (dist, .next, target). Run git ls-files to list files over 1 MB and justify or remove each. .gitignore gets ._*, .DS_Store, .claude/worktrees/, nectar-demo-media/, build outputs and video files.
d. evidence/: add evidence/README.md, an index of what each folder proves, linked to the README claim it supports. No home paths. No file over 5 MB.
e. scripts/: every script is referenced by a doc, test or package.json, or it goes.
f. Root package.json: name, description, repository, license, private. No dependency changes.
g. .github/workflows: whatever runs on GitHub after the push passes there without secrets, or is removed.
h. Never commit the Nov 12 strategy doc or anything with economics, counsel questions or keys. The repo is public.

3. Allowed product changes, with one deploy and one re-check
- The copilot's amber "Key missing" notice becomes neutral copy that says what the code actually does when live mode is off.
- Docs-site text fixes (move_note and any other method name not in the contract's exports) in apps/docs-site.
Nothing else under apps/, packages/, services/, contracts/.

4. Verify, then report
- Markdown link check over README.md and docs/: 0 broken.
- git status clean.
- G9 from a fresh clone. As part of it, a fresh agent reads only the README, follows the 60-second path and quick start, and lists every step where it had to guess.
- Production smoke after the deploy.
- Product diff against the deployed commit: empty.
- Then move submission-rc.
- Report: README lines 1–40, the final top-level tree, files moved and removed, links updated, and anything you couldn't verify.
Nothing pushed, posted or sent.

## Orchestrator inputs for step 1 (facts already established this session; re-verify on chain before citing)
- Notes check (2026-11-13, contracts/nectar-core/src/notes.rs, lib.rs, shields.rs; tests in tests_notes.rs + tests/v7/notes.rs): after nft_transfer the new holder can
  repay/close and receives released collateral; repay is permissionless, so the old holder can still repay (collateral still goes to the new holder); old holder is
  blocked from self_settle and from re-transferring. move_note is a private fn; the callable methods are nft_transfer / nft_transfer_call. Wording: "the loan's rights".
- Screenshots: 03 and 06 exist (quick take, production, 2026-11-13 ~19:30–20:02Z); 02 and 04 come from tonight's after-close takes — leave slots.
- Intear borrow toast: no tx hash for single-tx borrows (txs 4oRVJZmK…, Gatpru4m…, AauPLji7…); the faucet batch toast does show hashes.
- Production: web + docs c9fd56b (web dpl_F8NmBUE5…, docs dpl_2gj8GAFN…); Feed 37dfec9; refresher 7833aa3.
