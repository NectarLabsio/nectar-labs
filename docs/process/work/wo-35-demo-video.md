# WO-35 — demo video (H11). Owner: orchestrator. Starts after WO-67 + freeze (submission-rc). No product changes: a product bug = stop, tell Kunal.
Brief (Kunal, 2026-11-13 ~02:20Z), condensed. Goal: one real, continuous demo ≤ 2:00 on the final tagged build that looks like a person used it.
Inputs: /Volumes/T7/nectar-demo-media/intro/ (nectar-intro-6s.mp4 1920×1080 30 fps silent, ends on #0d0f12; endcard-base.png; README.md = end-card +
caption look: Syne 600 58 px #e6e9ef, DM Sans 400 #8f96a3, ease-out 0.4–0.7 s, rise 22 px; src/). docs/DEMO_SCRIPT.md, demo.nectar.testnet (D1), production.
Output dir: /Volumes/T7/nectar-demo-media/demo/ (outside git). Capture tooling: scripts/demo/ (orchestrator-owned; no product code).

## Preflight (stop + report on any failure)
1. Production = tagged commit; Feed healthy AND recording events; keeper healthy; oracle price < 15 min old (SESSION_MAX_PRICE_AGE_NS 900 s). Takes in
   NYSE hours 14:30–21:00 UTC; rehearse earlier. NOTE: the only NYSE session before the 2026-11-14 23:59Z deadline is Fri 2026-11-13 (Sat closed).
2. Wallet: a supported web wallet with no extension (live near-connect manifest 2026-11-13: Meteor web wallet.meteorwallet.app, Intear web
   wallet.intear.tech, both testnet; FACTS row pending). Kunal does the one-time setup, seed import and any terms acceptance himself in a dedicated
   Chrome profile (--user-data-dir ~/.nectar/demo-chrome-profile); agents never accept third-party terms, never see the phrase. Record in that profile.
3. Clean state: cookie choice made, single tab, no bookmarks bar, no devtools, no notifications, dark theme, 100% zoom, 1920×1080 viewport, DSF 2.
4. Full timed dry run against production. Fix only script problems.

## Shot list (one continuous take per section; real transactions; deployed numbers only; same account/position/tx throughout)
0:00 intro mp4 as is · 1 Market ~15 s: app → NVDAx market, exit capacity + buy-side ladder, hover one quote (notice period) · 2 Test assets ~15 s:
connect demo account, Get test assets, balance updates (skip if button dropped, start funded) · 3 Borrow ~35 s: NVDAx, type amount, Weekend Shield,
live preview (limit, fees, health), review drawer, wallet sign, toast · 4 Position ~20 s: health gauge, drag price simulator once, open tx on
testnet explorer, hold 2 s on confirmed · 5 Agent ~20 s: terminal, agent previews, opens a protected loan, pays 0.01 mock USDC over x402 (402 → 200);
then the app's Agents page shows the run · 6 End card 5 s: endcard-base.png + live URLs + "Testnet with mock collateral" (repo URL only if public).

## Look
Cursor visible on every page incl. the wallet's; eased moves 300–800 ms by distance; pause before click; subtle click ring. Typing 50–120 ms/key,
varied; no fills/pastes. Hold 1–1.5 s on every number to read. Camera: eased zoom ≤ 1.5×, 500–700 ms, from element boxes logged in the take; full
frame between sections; no effects. No hidden cuts in a section; waits > 2 s → visible 2–4× speed-up with a small "4×" tag. 10-frame dissolves between
sections. Captions only at section starts: DM Sans, sentence case, lower left, Nectar dark panel; no emoji/hype/"Introducing". Silent; no TTS, no
generated music; vo-script.md timed to the cut. Real URL visible on the first app frame (real address bar or a URL caption; never a mock frame).

## Capture/encode
Capture 2×, lanczos to 1920×1080, CFR 30, H.264 high, yuv420p, CRF 18, +faststart; raw capture has no frame gap > 100 ms. Terminal ≥ 20 px, app dark
colours, same pipeline, no personal prompt/hostname/home paths. X video limits → FACTS (researcher), stay within.

## Deliverables (nectar-demo-media/demo/)
nectar-demo.mp4 (silent master) · nectar-demo-captions.mp4 (burned-in) · nectar-demo.srt · vo-script.md · shotlist.md (section, start, tx hash,
explorer URL) · contact-sheet.jpg (1 frame / 5 s) · two complete raw takes · take tx hashes → EVIDENCE (verifier).
Review: every second of the master as frames (no console overlays, error toasts, stale-price badges, empty states, personal data, localhost/wrong
URLs; on-screen numbers = the transactions); then the verifier (has not seen the edit) checks the same list against shotlist.md.
Limits: nothing posted, uploaded or sent. Videos > 50 MB out of git; tell Kunal the path.

## Known conflicts found at intake (2026-11-13 ~02:25Z) — Kunal decides; product unchanged
- C1 Feed events: the hosted Feed runs FEED_INDEXER=views (neardata answered 429 to Railway egress, STATE 05:17Z 11-12) → events_indexed 0. Preflight 1
  "recording events" fails, and the x402 paid CSV (section 5) may come back with 0 rows. Fix = H-NEARDATA (FastNear key as a sealed Railway variable;
  hosted.ts reads FEED_NEARDATA_API_KEY since dff819a) then FEED_INDEXER=neardata; or Kunal allows a keyless neardata try.
- C2 Agents page: apps/web/app/agents/page.tsx renders a labelled fixture ("Example, not a call made on testnet", badge "example"); it cannot show the
  take's run. Proposed: end section 5 on the agent's tx in the explorer (or the agent's position page) instead.
- C3 Continuity: services/x402/src/demo-agent.ts signs as agent1.nectar.testnet (AGENT1_KEY_PATH) and opens its own loan, so section 5 has a second
  account and position. Proposed: caption names it as a separate agent account.
- C4 localhost: the on-camera command must not show X402_URL=http://127.0.0.1:8791 (x402 is local by design, D-031). demo-agent.ts logs no URL
  (lines 59/70/76/77), so env is set off camera and the take types only `pnpm --filter x402 demo:testnet`.
- C5 Oracle: < 15 min needs the Railway refresher (H-ORACLE, staged) or a one-shot owner refresh right before each take.

## Kunal's decisions (2026-11-13 ~02:20Z)
- C1: key added (Kunal pasted it; orchestrator set FEED_NEARDATA_API_KEY on Railway feed, plus FEED_INDEXER=neardata, FEED_START_BLOCK=head-50000,
  FEED_DB_PATH=/data/feed-neardata-20261113.sqlite — fresh DB so the start block applies). Confirm events recording; before rehearsal run the agent's
  paid download (DEMO_SKIP_BORROW=1, local x402 :8791 restarted with FEED_URL = hosted Feed) and report the CSV row count.
- C2: section 5 ends on the agent's tx in the testnet explorer. The Agents page stays out of the video.
- C3: ok. Section 5 caption exactly: "A separate agent account borrows on its own: agent1.nectar.testnet."
- Oracle: Kunal applies the Railway refresher after seeing the FC key permissions (contract, method names, allowance).
- Wallet: send Meteor + Intear steps; Kunal picks the one with fewer steps (F-468 Intear verified from source; F-469 Meteor not verified).
- Fallback: if Friday's takes fail, record Saturday 2026-11-14 with the market closed and a caption saying weekend limits apply.
- C6 (found 02:24Z): during an OPEN session a borrow needs the price < max_age_ns_session = 120 s (deployed get_config; lib.rs:381, 1590), while the
  session itself stays open up to 900 s (lib.rs:75, 348). A 10-min refresher leaves borrows failing "oracle stale" ~8 of every 10 min in NYSE hours.
  Takes: one-shot owner refresh < 60 s before sections 1 and 3. Refresher cadence → Kunal decides (recommendation in the 02:25Z report).
- X limits (F-465/F-466, C-027): developer docs cap 1280x1024 and non-Premium playback is 720p; master stays 1920×1080 as briefed, plus a 1280×720
  copy for X. Kunal checks help.x.com in a browser.

## Kunal's decisions (2026-11-13 ~11:55Z)
- Weekend Shield = A: record the takes AFTER the 21:00 UTC close (Weekend Shield available; window ends Monday 09:30 New York), with a caption that weekend
  limits apply (section 3 caption: "Market closed: weekend limits apply."). Retakes any time Saturday. Rehearse BEFORE the close with Standard protection
  (Weekend Shield is disabled in Friday's session: next open 72 h > 65.5 h cap, packages/sdk/src/shields.ts).
- H-DEMO-WALLET: done by the orchestrator (Intear, dedicated profile). Kunal approves signing testnet txs with demo.nectar.testnet and, for section 5,
  agent1.nectar.testnet, during rehearsal and takes only. Orchestrator records every take, incl. the Intear steps. Send contact sheet + master to Kunal first.
- Voice-over choice left blank → vo-script.md delivered per the original brief.
- ffmpeg: Kunal installs it at ~/.nectar/tools (FFMPEG env → libx264 CRF 18 path); AVFoundation fallback stays (WO-35b).
- Feed: WO-71 fixes the v2 event version (services/feed only); paid-download row count after re-index.
- Faucet: 1 claim/h, 3 per account → rehearsal + take 1 + take 2 for demo.nectar.testnet. After the close the price may be up to 6 h old (closed threshold):
  one-shot owner refresh right before each take so no stale badge shows.
- Kunal 2026-11-13 ~15:20Z: "accept transitions" (window/panel opening and explorer-tab loads, 166–267 ms, no motion on screen; post-drawn cursor stays smooth).

## Screenshots (Kunal 2026-11-13 ~17:00Z) — from take A's raw 2× capture, no separate capture
Six stills, 1920×1080 PNG (lanczos from the 3840×2160 raw frame), each ≤ 400 KB, in docs/media/screens/: 1 landing hero (take A pre-roll s0, not in the edit),
2 market (exit capacity + buy-side ladder), 3 borrow with the Weekend Shield preview (limit, fees, health), 4 position (health gauge + simulator), 5 explorer with the
confirmed tx, 6 agent terminal 402 → 200. 1600×900 JPG copies of 3 and 6 for X thread posts 2 and 3. No cursor (raw frames have none: CURSOR_POST), no cookie banner,
no personal data, nothing edited. Alt text for each; timestamps (take, section, ms) in shotlist.md. README after the takes: shot 3 under the one-line summary; shots 2,
4, 6 in the 60-second path table (covered by Saturday's G9 step 3). Video for X: the captioned 1280×720 copy; the 1080p master for the repo and docs.
take.mjs (orchestrator 17:05Z): `--section 0,1,2,3,4` records s0; S2 is skipped only when faucet_status.can_claim is false (the old ≥ 5 NVDAx rule would have
skipped S2 because demo.nectar.testnet holds 5 NVDAx from rehearsal 1).
