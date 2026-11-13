# WO-99 — verifier — G9 run 10b, re-check after the run 10 FAIL (< 30 min; commit `test: evidence — G9 run 10b (WO-99)`)
Fresh clone of the LOCAL repo at the commit the orchestrator names, under /tmp (pnpm install allowed there only). Write only docs/EVIDENCE.md and evidence/.
NO Co-Authored-By. Don't touch host services. Write findings into evidence/G9/run10b-<ts>/ as you go (turn limit).
Run 10 (d55ba25) FAILED on 2 broken relative links inside quoted text (docs/EVIDENCE.md quote of feed-rest.md; docs/FACTS.md F-440 Vercel link). Since d55ba25:
WO-98 README fixes (Feed DB path, demo:testnet → scripts/50-verify.sh + 429 fallback NEAR_RPC_URL=https://rpc.testnet.near.org, pnpm i build-scripts note,
local / = landing, price bot cadence + contract limits 120 s / 86,400 s / 900 s, glossary entries), .gitignore *.sqlite, and 0c475f7 (the two links, "exit
capacity" in SUBMISSION tracks, README evidence pointer). Product diff vs production 54bdd32 must stay empty.
1. Link check: relative links in README.md + docs/** (git ls-files), skipping fenced blocks and inline code: 0 broken.
2. Every README line changed since d55ba25 (`git diff d55ba25 <commit> -- README.md`): each factual claim matches its source (file:line, config, or an RPC read
   ≥ 2 s apart via rpc.testnet.near.org). Run the quick start's `pnpm demo:testnet` once with the README's NEAR_RPC_URL fallback; exit 0.
3. Banned words over README.md, docs/SUBMISSION.md (list: docs/process/work/wo-92-readme-repo-final.md line 32); branding check 0; gitleaks over history;
   `node scripts/build-submission.mjs --dry-run` (website absent; open TODO-H count = 1, TODO-H3 demoUrl); `git status` clean in the clone;
   `git diff --stat 54bdd32 <commit> -- apps packages services contracts` empty.
PASS → EVIDENCE row + block "G9 run 10b". FAIL → docs/process/gate-fail-g9-r10b.md. Report ≤ 8 lines.
