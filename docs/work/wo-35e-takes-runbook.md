# WO-35e — takes runbook (orchestrator, 2026-11-13). Takes from 21:00Z (after the close); master + contact sheet to Kunal by 03:00Z.
Sources: wo-35-demo-video.md (+ decisions), wo-81-finish-line.md, scripts/demo/takes/README.md, capture/CAPTURE.md + EDIT.md. Signing approved for demo.nectar.testnet
and agent1.nectar.testnet during takes only. Owner mints to demo.nectar.testnet off camera approved (S3 retakes). Never post/send/upload.
## Preflight (each take, ≤ 10 min before)
1. Web = 1a95022 (chunk marker onClaimed on testnet.nectarlabs.io/borrow), docs unchanged; `scripts/deploy/smoke-prod.sh` 0 (once, before take A).
2. Feed /health ok, events_indexed > 0, indexer_lag_blocks ≈ 0; keeper `curl 127.0.0.1:8790/healthz` ok:true.
3. Oracle: one-shot owner refresh right before S1 (keeps age < 15 min; outside hours the refresher only re-asserts at 6 h):
   near contract call-function as-transaction nectar-core-v2.nectar.testnet update_owner_price json-args '{"symbol":"NVDAx","price_usd_e6":"135000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as nectar.testnet network-config testnet sign-with-keychain send
   then get_exit_capacity: oracle_age_s small, session_open false (outside_hours) → weekend limits (caption S3).
4. Faucet: faucet_status(demo.nectar.testnet) can_claim true on both tokens (1 claim/h, cap 3; claim 1 used 12:43Z → claims 2 and 3 left). If S2 cannot claim, S3 may
   still run from an owner mint (off camera) but S2 needs the real claim.
5. Local Feed :8788 and x402 :8791 STOPPED for S1–S4 (Kunal). Machine quiet: no agents running, `uptime` load < 3.
## Take A (≥ 21:00Z), out ~/.nectar/demo-capture/take-a
  CAPTURE_HEADED=1 node scripts/demo/takes/take.mjs --mode take --section 0,1,2,3,4 --sign --out ~/.nectar/demo-capture/take-a   (s0 = landing still)
  then restart x402 (background): X402_PORT=8791 FEED_URL=https://feed-production-2f2776c9.up.railway.app X402_RELAYER_KEY_PATH=~/.nectar/keys/x402-relayer.json pnpm -s --filter x402 start
  check unpaid export.csv → 402; then
  CAPTURE_HEADED=1 node scripts/demo/takes/take.mjs --mode take --section 5 --sign --out ~/.nectar/demo-capture/take-a
  stop x402 again. gapcheck per section (motion ≤ 100, holds ≤ 120, transitions reported). Retake a failing section alone (S3 retake: owner mint if needed).
## Take B (≥ 1 h after take A's faucet claim), out ~/.nectar/demo-capture/take-b — same steps.
## Edit (best take; per-section mix allowed only between complete takes of the same section, never inside a section)
  FFMPEG=~/.nectar/tools/node_modules/ffmpeg-static/ffmpeg node scripts/demo/capture/compose.mjs <take>/edit.json <work>/master --no-captions
  ... compose --captions → <work>/caps; encode.mjs both → nectar-demo.mp4, nectar-demo-captions.mp4 (+ -720p); srt.mjs; contact.mjs (1 frame / 5 s).
  Write vo-script.md (timed to edit-timeline.json), shotlist.md (section, start, tx hash, explorer URL — nearblocks link + near.rocks shown).
  Copy to /Volumes/T7/nectar-demo-media/demo/: the two mp4s (+720p), srt, vo-script.md, shotlist.md, contact-sheet.jpg, the two complete raw takes (take-a/, take-b/).
  Nothing > 50 MB in git.
## Review before sending
  Frames every second of the master (agent, not the main thread): no console overlays, error toasts, stale-price badges, empty states, personal data, localhost or
  wrong URLs; on-screen numbers = the transactions. Then the verifier (has not seen the edit) checks the same list against shotlist.md and adds the take tx hashes to
  EVIDENCE. Send Kunal the master + contact sheet (files), nothing else public.
## Fallbacks (Kunal): no take passes by 03:00Z → best take; none usable → `pnpm demo:capture` captioned version.
