# WO-35c — demo take script (< 2 h; commit `feat(demo): take script (WO-35c)`). Write only scripts/demo/takes/**.
Read first: docs/work/wo-35-demo-video.md (all sections + decisions), scripts/demo/capture/CAPTURE.md and EDIT.md (APIs), docs/DEMO_SCRIPT.md (beats),
scripts/demo/intear-setup.mjs (how Intear's connector iframe + popup behave: "Intear Wallet" in the near-connect picker → iframe
wallet.intear.tech/hot-wallet-connector-iframe.html → "🌐 Web" → popup wallet.intear.tech/… with Connect/Cancel; the popup closes itself after approval).
## HARD SAFETY RULES (violating any = stop and report)
- NEVER approve, confirm or sign anything in Intear or the app. Every step that would sign is behind `--sign`; you NEVER pass `--sign`. In dev, open the
  wallet popup, probe it, then click Cancel/close. Faucet claims are capped at 3 for demo.nectar.testnet (1/h): never press the final wallet approval.
- The dedicated profile ~/.nectar/demo-chrome-profile holds the connected Intear wallet: use it READ-ONLY (no settings changes, no disconnect, no wallet
  import). Close Chrome when done (profile lock). Never print key files; never cat ~/.nectar/keys/*.
- Section 5's real command signs as agent1 and spends mock USDC: in dev run the terminal with `--cmd "echo dry-run"`, never the real command.
- No installs/downloads/new deps. No home paths in output or committed files. NO Co-Authored-By. Don't touch host services (:8788 :8789 :8790 :8791 :8545).
## Build: scripts/demo/takes/take.mjs `--mode rehearsal|take --section 1..5|all [--sign] [--out dir]` + README.md
- Launch: CAPTURE_LAUNCH with the dedicated profile (launchPersistentContext(~/.nectar/demo-chrome-profile, {...CAPTURE_LAUNCH})); real takes run with
  CAPTURE_HEADED=1 (headed passes gapcheck on app pages; headless does not). installCursor; startTake per section into <out>/s<N>/ ; stopTake; gapcheck.
- Each section = one continuous take (no navigation jumps inside a section except a visible tab switch where noted). Log section/box/hold/wait/mark
  events per the shared format; mark every tx hash (type mark, label "tx", data {hash, explorer}). Hold 1–1.5 s on every number to read.
- Write <out>/edit.json for compose.mjs: intro (/Volumes/T7/nectar-demo-media/intro/nectar-intro-6s.mp4) · s1..s5 · endcard (headline "Testnet with mock
  collateral", the 4 URLs). Captions (section starts only, sentence case, no hype/emoji):
  1 "testnet.nectarlabs.io · Market makers commit quotes for at least 7 days' notice." (first app frame shows the real URL)
  2 "Testnet. Mock assets, no value."
  3 take mode: "Market closed: weekend limits apply." · rehearsal mode: "Standard protection (rehearsal)."
  4 "On-chain on NEAR testnet."
  5 "A separate agent account borrows on its own: agent1.nectar.testnet."
- S1 Market (~15 s): start https://testnet.nectarlabs.io/feed → click into NVDAx (/feed/NVDAx) → box+hold [data-testid=market-exit] → box+hold one
  ladder row ([data-testid=market-ladder] tbody tr) — the ladder has no hover tooltip; just rest on the row → zoom out.
- S2 Test assets (~15 s): nav "Borrow" → /borrow (wallet shows demo.nectar.testnet) → "Get test assets" (components/TestAssets.tsx; label "Mock assets, no
  value") → app sign modal → wallet popup (Intear) → [--sign: approve] → balance updates (hold on the NVDAx balance). If already funded, skip per WO-35.
- S3 Borrow (~35 s): composer (components/borrow/BorrowComposer.tsx): NVDAx collateral, type the lock units (5) and a round borrow under the limit (e.g. 100)
  with human typing; protection = Weekend Shield in take mode, Standard in rehearsal ([data-testid=protection-weekend] / the Standard option); hold on the
  live preview (limit, fees, health) → "Review borrow" → drawer ("Show what your wallet signs") → "Confirm in wallet" → Intear popup → [--sign: approve]
  → toast (success title + "tx <hash>": production has no NEXT_PUBLIC_EXPLORER_TX, so the hash is plain text) → zoom on the hash, mark it.
- S4 Position (~20 s): open the new position (toast "next" link or the position link the app offers — find it; no typed URLs) → box+hold the health ring
  ("Health at the simulated price") → drag the "Simulate the NVDAx price" slider (#sim) once, eased → then a visible tab switch: new page
  https://testnet.nearblocks.io/txns/<hash> (popup_open-style event so the edit shows it as a tab) → hold 2 s on the confirmed status. Check nearblocks loads in
  this browser (cookie banner? bot wall?) with a known tx, e.g. De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG; if blocked, try https://explorer.testnet.near.org/transactions/<hash> and report.
- S5 Agent (~20 s): terminal page from scripts/demo/capture/terminal/server.mjs with --cmd "pnpm -s --filter x402 demo:testnet" (cwd repo root) and
  --env-file ~/.nectar/demo-x402.env (create it 0600 with paths/ids only: X402_URL=http://127.0.0.1:8791/api/feed/export.csv,
  AGENT1_KEY_PATH=~/.nectar/keys/agent1.json, FEED_MCP_URL=<hosted Feed MCP URL — find it in README/services/feed>); type the command; output streams
  (borrow_verified, borrow_sent + explorer, challenge 402, paid_fetch 200); hold on 402 → 200; then tab switch to the agent's borrow tx on the explorer.
  The on-screen command must not contain localhost/127.0.0.1 or paths.
- Dev self-test (no --sign): run every section in rehearsal mode headless up to each wallet popup, Cancel there, and report per section: selectors found,
  duration, gapcheck, anything the product does not offer (no workaround that changes the product). Report ≤ 15 lines.
