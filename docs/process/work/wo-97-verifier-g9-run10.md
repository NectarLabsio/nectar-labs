# WO-97 — verifier — G9 run 10 on main d55ba25 (WO-92 step 3; < 50 min; commit `test: evidence — G9 run 10 (WO-97)`)
Fresh clone of the LOCAL repo at d55ba25 (`git clone /Volumes/T7/nectar-labs /tmp/g9-run10-<ts> && git checkout d55ba25`) outside /Volumes/T7; pnpm install is
allowed there only. Write only docs/EVIDENCE.md and evidence/ (in your worktree). Don't touch host services. NO Co-Authored-By.
Since G9 run 9b: README final pass (WO-92 step 1 + WO-94: a–k order, Mermaid, glossary, deployed accounts, after-close stills 02–05, closed-market borrow
9uwAk6Vy…), docs reorganised (WO-95a: docs/process/, LICENSE, .claude settings+hooks only, FACTS-nectar-labs.md removed), scripts audit + new CI (WO-95b),
copilot copy (WO-93), docs-site method names (WO-94), EVIDENCE after-close takes (WO-96). Production = 54bdd32: web dpl_C82s82HaQiU4KLGwvCfhv9Fe91dN,
docs dpl_DiUxyPb5KcfYaF2Ai8CaFpyfWogw (evidence/WO-34/deploy-*-cli-20261113T2145*.log, smoke-prod-wo92s2-*.log).
1. Full G9 as run 7/9: README quick start from the clone, timed (< 15 min), every command; README claims vs EVIDENCE and the live hosts (re-read the figures that
   carry a read time — they may have moved; a moved live figure with its read time intact is not a FAIL); gitleaks over history; branding check; host grep;
   submission dry run `node scripts/build-submission.mjs --dry-run` (projectUrl https://github.com/NectarLabsio/nectar-labs, website absent; TODO-H3 demoUrl is the
   one expected open handoff — report the count); handoffs.
2. WO-92 step 3 items: markdown link check over README.md and docs/** (0 broken relative links; write the checker in /tmp); `git status` clean in the clone;
   product diff `git diff --stat 54bdd32 d55ba25 -- apps packages services contracts` empty; no tracked file > 5 MB; no `/Users/<name>` in tracked files;
   top-level tree as listed in docs/process/work/wo-92-readme-repo-final.md §2a (+ the orchestrator's kept dirs: quoter, solana, evm, landing, tool dotfiles).
3. Production: smoke-prod.sh (4 custom hosts) 0; /borrow shows the copilot "Recorded fixture" notice (system Chrome headless via
   scripts/demo/capture/recorder.mjs CAPTURE_LAUNCH; the Playwright headless shell is not installed — do not install it).
FastNear RPC throttles this machine: space RPC calls ≥ 2 s or use rpc.testnet.near.org. PASS → EVIDENCE row + block. FAIL on a product claim →
docs/process/gate-fail-g9-r10.md. Report ≤ 10 lines.
