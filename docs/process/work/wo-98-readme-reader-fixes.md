# WO-98 — README fixes from the README-only reader test (docs scope; WO-92 step 3). Base: main.

Source: a fresh agent read only README.md at d55ba25 and followed the 60-second path and quick start (2026-11-13 ~21:51–22:00Z). Fix README.md only
(plus docs/README.md if a link moves). Text only: no product change, no pnpm install, no deploys. Write the edits first, then verify facts in one pass.

1. Feed `no env needed` (quick start table): false in effect — with FEED_DB_PATH unset the Feed writes SQLite to `~/.nectar/feed.sqlite`
   (services/feed/src/main.ts:42; mcp-stdio.ts:20 reads the same). Say so and give the local override, e.g. `FEED_DB_PATH=./feed.sqlite pnpm --filter feed start`
   (check main.ts `home()` for relative-path handling before writing the example).
2. `pnpm demo:testnet`: package.json maps it to `bash scripts/50-verify.sh` — the table says it "runs scripts/demo-testnet.mjs". Read 50-verify.sh and describe what
   actually runs. On a busy IP FastNear answers 429 and the command fails 3/3; with `NEAR_RPC_URL=https://rpc.testnet.near.org` it passed in 39 s. Name that
   fallback URL in the README (it is the RPC the verifier used tonight). Replace "4 s" with an honest range. The output listed loans #0–#15 only while
   the contract has #27: find out why in the script (page size? range?) and describe the output accurately.
3. `pnpm i` prints "Ignored build scripts: core-js, secp256k1. Run pnpm approve-builds" — add one line: expected, nothing to approve for the quick start.
4. Local `/` serves the landing page (hosted APP redirects / → /feed): say the app routes start at /feed locally.
5. Price bot cadence (README "How NEAR is used" item 6 and the oracle row): add the schedule and the contract limits, verified live on 2026-11-13 ~22:10Z
   (get_config at block 277568411): `max_age_ns_session` 120 s, `max_age_ns_closed` 86,400 s; the refresher (packages/config/config.yaml ops.oracle_refresher)
   checks every 15 s, re-asserts at ≥ 60 s inside NYSE session windows and at ≥ 6 h outside, so a borrow works at any hour; a session counts as open only
   with a price under 900 s (SESSION_MAX_PRICE_AGE_NS, contracts/nectar-core/src/lib.rs:75, :348).
6. Terms before definition: add a one-line pointer to the Glossary near the top, and add glossary entries for the terms used undefined: Standard (protection),
   Intear (a NEAR wallet used in the screenshots), x402 (HTTP 402 payment flow), Feed, Nectar Reserve, keeper, health, flag line, Profit-Lock. Check each
   definition against the code or docs-site; keep each to one line.
7. Do not change: the public clone URL (Kunal pushes main before the tag), screenshots, claims table rows already verified.
Checks: banned words (docs/process/work/wo-92-readme-repo-final.md line 32), relative links resolve, `node scripts/check-no-branding-all.mjs` 0.
Commit `docs: README fixes from the README-only reader (WO-98)`. NO Co-Authored-By. Report ≤ 10 lines (each item: done / changed text / unverified).
