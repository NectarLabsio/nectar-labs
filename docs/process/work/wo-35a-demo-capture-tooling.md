# WO-35a / WO-35b — demo capture tooling (two agents in parallel, < 2 h each). Owner of scripts/demo/: orchestrator; agents write only their files below.
Source of truth: docs/process/work/wo-35-demo-video.md ("Look", "Capture/encode", "Deliverables", decisions). Brand: /Volumes/T7/nectar-demo-media/intro/README.md.
Rules for both: Node ESM .mjs, strict and small; NO new dependencies, NO downloads, NO pnpm/npm install (disk rule: symlink node_modules if you need them in a
worktree). Resolve libraries with createRequire: Playwright `createRequire('/Volumes/T7/nectar-labs/apps/web/package.json')('@playwright/test')` (1.65.0,
channel 'chrome' = system Google Chrome); sharp 0.35.5 from /Volumes/T7/nectar-labs/node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp.
Fonts: packages/ui/fonts (DM Sans, Syne; see packages/ui/fonts.css). ffmpeg is NOT installed (download refused); `FFMPEG` env may point to one later.
Never use ~/.nectar/demo-chrome-profile (wallet state): test with a throwaway profile in a temp dir. Never sign, never connect a wallet, never touch host
services (:8788 :8789 :8790 :8791 :8545). Raw frames go on the internal disk (default ~/.nectar/demo-capture/<take>/, T7 is 96% full). No home paths in
committed files or logs (print ~). NO Co-Authored-By. Commit `feat(demo): <what> (WO-35a|b)`. Report ≤ 15 lines.

## Shared take format (both agents code against this)
<take>/frames/<pageId>/<seq:06d>.jpg — CDP screencast JPEG (quality 92) at viewport 1920×1080, deviceScaleFactor 2 → 3840×2160 (popups: their own size × 2).
<take>/frames.jsonl — {"t":ms_since_take_start,"page":"p0|p1…","file":"frames/p0/000123.jpg","w":3840,"h":2160}
<take>/events.jsonl — {"t":ms,"type":…} with types:
  section {id:1..6,title,caption}        start of a section (caption text = what to burn in; "" = none)
  section_end {id}
  active {page}                          which page is in front from t on (p0 = app/terminal; popup id while a wallet popup is open)
  popup_open {page,w,h} / popup_close {page}
  box {label,page,x,y,w,h}               element box in CSS px of that page (zoom target), logged when the camera should move there
  zoom_out {}                            back to full frame
  wait_start {label} / wait_end {label}  a real wait (tx confirm etc.); > 2 s → speed-up in the edit
  hold {ms,label}                        a deliberate reading pause (never sped up)
  mark {label,data}                      anything else (tx hash, URL shown)

## WO-35a (agent A) — capture: scripts/demo/capture/{human.mjs,recorder.mjs,gapcheck.mjs,terminal/,CAPTURE.md}
1. human.mjs: `installCursor(context)` = context.addInitScript drawing a crisp arrow cursor (SVG, 2× sharp, fixed position, z-index max, pointer-events none,
   follows Playwright mouse via mousemove listeners) + a subtle click ring on mousedown, in EVERY page incl. popups. `moveTo(page, locatorOrPoint)` eased
   (cubic in-out) path with slight curvature, 300–800 ms scaled by distance, ~60 Hz steps; `click(page, locator)` = moveTo + 150–300 ms pause + click;
   `type(page, text)` 50–120 ms per key, varied; `hold(ms,label)`; `box(page,label,locator)` logs a box event. All helpers write events via the recorder.
2. recorder.mjs: `startTake(context, dir)` → CDP Page.startScreencast per page (jpeg q92, everyNthFrame 1, max 3840×2160), ack every frame, write frames +
   frames.jsonl with a single monotonic take clock; attach to new pages (popups) automatically (popup_open/close + active events); inject (capture context
   only) an invisible 1×1 px element animating opacity so the compositor emits frames continuously; `event(type, data)`; `stopTake()`.
3. gapcheck.mjs <take> [page]: max inter-frame gap per page while active; exit 1 if any > 100 ms (print the worst 5).
4. terminal/: a local page (served by a tiny Node http server on 127.0.0.1, port arg) that looks like a terminal in the app's dark colours (bg #0d0f12,
   text #e6e9ef, accents from packages/ui/tokens.css), mono font ≥ 20 px, prompt "$ " only (no user, host or path). When the typed line is submitted,
   the server runs the REAL command given on its own command line (env set server-side and never shown) and streams stdout/stderr lines to the page
   (SSE). Sanitize every streamed line: replace $HOME with ~, drop ANSI codes. The typed text must equal the displayed command.
5. Self-test: a 20 s take on https://nectarlabs.io (throwaway profile): move, hover, type into a search-free field or the terminal page running `echo ok`,
   two box events, one hold; gapcheck PASS; report frame count, max gap, disk used. Document the API in CAPTURE.md.

## WO-35b (agent B) — edit + encode: scripts/demo/capture/{compose.mjs,encode.mjs,encode.swift,contact.mjs,srt.mjs,endcard.html,EDIT.md}
1. compose.mjs <edit.json> <outdir>: edit.json lists sections in order: {intro:"…/nectar-intro-6s.mp4"}, {take:"<take dir>", section:N}, {endcard:{…}}.
   For each output frame at 30 fps CFR: source = latest raw frame ≤ t of the active page; a wallet popup is drawn centred over the dimmed app frame at its
   own size with a soft shadow (like a real window); camera = eased zoom (≤ 1.5×, 500–700 ms transitions) centred on the latest box, zoom_out → 1×;
   wait_start…wait_end longer than 2 s → played at 2–4× (choose so it lasts ≤ 2 s) with a small "4×"-style tag (actual factor) top right; holds never
   sped up; 10-frame cross-dissolve between sections; captions (only first 3.5 s of a section, DM Sans, sentence case, lower left, Nectar dark panel:
   bg rgba(13,15,18,.86), 1px border rgba(122,184,163,.18), radius 12, text #e6e9ef) when `captions:true`. Compose at 3840×2160, then sharp
   resize to 1920×1080 with kernel lanczos3, write PNG frames. Output also edit-timeline.json (section start times in the master).
2. endcard.html: 1920×1080 page per intro README (endcard-base.png background; lines under the lockup: Syne 600 58 px #e6e9ef for the headline, DM Sans
   400 #8f96a3 for the URL lines; ease-out 0.4–0.7 s, words rise 22 px; hold; fade to #0d0f12 over the last 0.5 s). Inputs: headline "Testnet with mock
   collateral", URLs https://nectarlabs.io · https://testnet.nectarlabs.io · https://docs.nectarlabs.io · https://status.nectarlabs.io. Render 5 s × 30 fps
   (window.setT(t) pattern; Playwright screenshots at DSF 2 → lanczos to 1080p).
3. Intro: decode nectar-intro-6s.mp4 to frames: ffmpeg if FFMPEG is set, else encode.swift's decode mode (AVAssetReader). Use as is (no re-timing).
4. encode.mjs <png dir> <out.mp4>: if FFMPEG set → `-framerate 30 -i %06d.png -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 18 -movflags +faststart`.
   Else compile+run encode.swift (swiftc, Xcode CLT present): AVAssetWriter H.264 High (AVVideoProfileLevelH264HighAutoLevel), 30 fps exact timestamps,
   420 bi-planar video range, average bitrate 16 Mbps, shouldOptimizeForNetworkUse = true (faststart), and print "deviation: no x264 CRF 18 (AVFoundation
   bitrate mode)". Also a 1280×720 variant for X (lanczos from the same PNGs). Verify with AVFoundation/`mdls` or ffprobe if present: fps, size, duration.
5. contact.mjs <mp4|png dir> <out.jpg>: one frame every 5 s, tiled with timecodes. srt.mjs <edit-timeline.json> <out.srt>: one cue per section caption.
6. Self-test: synthesize a fake take (generated JPEG frames + events with a box, a 6 s wait, a popup) → compose (captions on/off) → encode → contact sheet
   → srt; report sizes, durations, the encoder used. Document in EDIT.md.
