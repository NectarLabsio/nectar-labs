# Demo edit + encode (WO-35b)

Turns raw takes (shared take format, see `docs/work/wo-35a-demo-capture-tooling.md` and `CAPTURE.md`) into the master,
the captioned master, the X copy, the SRT and the contact sheet. Node ESM, no new dependencies: sharp and Playwright
resolve from the repo (or the main checkout when a worktree has no `node_modules`), Chrome is the system Google Chrome.

## Commands

```sh
cd scripts/demo/capture
node compose.mjs edit.json /path/out-plain --no-captions --work /path/work   # PNG frames + edit-timeline.json (+ cursor-track.json)
node compose.mjs edit.json /path/out-caps  --captions    --work /path/work
node encode.mjs  /path/out-plain/frames /path/nectar-demo.mp4                # also writes nectar-demo-720p.mp4
node encode.mjs  /path/out-caps/frames  /path/nectar-demo-captions.mp4
node srt.mjs     /path/out-plain/edit-timeline.json /path/nectar-demo.srt
node contact.mjs /path/nectar-demo.mp4 /path/contact-sheet.jpg               # or a PNG frame dir
node compose.mjs --synth /path/take                                          # synthetic take for the self-test
```

Put frames on the internal disk (T7 is nearly full): about 1-3 MB per 1080p PNG, 30 per second.
`--work` caches the decoded intro and the rendered end card, so a second compose (captions on) reuses them.
`--jobs N` sets parallel frame renders (default: cores - 2, between 2 and 6).

## edit.json

```json
{
  "fps": 30, "captions": false, "dissolve_frames": 10,
  "sections": [
    { "intro": "/Volumes/T7/nectar-demo-media/intro/nectar-intro-6s.mp4" },
    { "take": "~/.nectar/demo-capture/take-a", "section": 1 },
    { "take": "~/.nectar/demo-capture/take-a", "section": 3, "caption": "optional override" },
    { "endcard": { "headline": "Testnet with mock collateral",
                   "urls": ["https://nectarlabs.io", "https://testnet.nectarlabs.io",
                            "https://docs.nectarlabs.io", "https://status.nectarlabs.io"] } }
  ]
}
```

Relative paths resolve from the edit.json folder; `~/` expands. Optional keys: `dsf` (2), `camera_ms` (600, clamped
500-700), `max_zoom` (1.5, never above), `jobs`. Endcard options: `base` (default the brand `endcard-base.png`),
`lines` (array of URL arrays per line; default two URLs per line), `seconds` (5). The CLI flag `--captions` /
`--no-captions` overrides `captions`.

## What compose does

- **Timing.** A take section runs from its `section` event to `section_end` (or the next section, or the last frame).
  Output frames are 30 fps CFR; each picks the latest raw frame with `t <=` the mapped source time, from the page in
  front (`active`). The intro is used frame for frame (no re-timing); the end card is 5 s x 30 fps.
- **Waits.** `wait_start`..`wait_end` pairs (matched by label) longer than 2 s, minus any `hold` interval, play at
  `ceil(d / 2 s)` clamped to 2-4x, so they last at most 2 s. A wait over 8 s still plays at 4x and is reported in
  `warnings` (no hidden cut). A tag with the actual factor (e.g. `3×`) sits top right while it plays. Holds are never
  sped up.
- **Popups.** While a popup page (`popup_open`) is in front, the base app frame (latest frame <= t) is dimmed to 50 %
  and the popup frame is drawn centred at its own pixel size (it is captured at 2x like the app), with rounded
  corners, a hairline edge and a soft drop shadow. Nothing is drawn until the popup's first frame exists.
- **Camera.** Each `box` event sets a target crop centred on the box: zoom = min(1.5, box fits in 75 % of the frame),
  at least 1; a `zoom` field on the box overrides it (still <= 1.5). `zoom_out` returns to the full frame. Moves are
  eased (cubic in-out) over `camera_ms`, in output time, interpolating the crop rectangle. Box coordinates are CSS px
  of their page (x `dsf`; popup boxes are offset to where the popup is drawn). Every section starts at full frame.
- **Cursor (WO-35d).** For takes logged with `cursor_mode {post:true}` (take.mjs default, no DOM cursor in the frames) compose
  draws the arrow (human.mjs's path, white outline, drop shadow) and the click ring (34 px, 460 ms, scale .3 → 1.2, fade) on
  each output frame at the source time: `cursor` samples of one motion (`m`) are interpolated with a finite-difference cubic
  Hermite, between motions the cursor holds. Samples are CSS px of their page, mapped through the camera (x `dsf`, popups
  offset and scaled to where the popup is drawn); only the page in front shows a cursor, and a popup with no sample yet shows
  it where it is on the base page. The sprite is rasterised by librsvg at the output scale (1 CSS px = 1 px at zoom 1, more
  when zoomed) with the sub-pixel offset baked in (quarter px), and blended on the 1080p frame. `"cursor": false` (edit.json
  or a take item) or `--no-cursor` turns it off; older takes are untouched.
- **Resampling.** The scene is composed at 3840x2160; the camera crop is reduced to 1920x1080 with one sharp
  lanczos3 resize (a zoomed crop is not first upscaled back to 4K). Captions and tags are rendered by Chrome at DSF 2
  in DM Sans and lanczos-reduced, then blended on the 1080p frame so they do not move with the camera.
- **Captions** (only with captions on): the section's `caption` text for its first 3.5 s (after the dissolve),
  lower left, Nectar dark panel (bg rgba(13,15,18,.86), 1 px border rgba(122,184,163,.18), radius 12, #e6e9ef,
  DM Sans 400 30 px), 0.4 s ease-out fade in, 0.3 s fade out. Text is used as written (sentence case is on the author).
- **Dissolves.** Consecutive sections overlap by `dissolve_frames` (10) with a linear cross-dissolve, so each
  transition shortens the master by 10 frames.
- **edit-timeline.json** (next to `frames/`): per section `start_s` (dissolve begins), `full_s`, `end_s`, frames,
  caption and its window, source range, speed-ups (output window, factor, source length) and `mark` events mapped to
  master time (tx hashes for shotlist.md), and `cursor` (post, samples, clicks, frames drawn, frames in motion,
  `freeze_frames` = frames inside a motion where the drawn cursor did not advance, `max_step_px`). Paths are written with `~`.
- **cursor-track.json** (post cursor only): the drawn hotspot per master frame `{frame, section, x, y, page}` in output px,
  for review crops.

## Encode

`encode.mjs <png dir> <out.mp4>` writes `out.mp4` (1920x1080) and `out-720p.mp4` (1280x720 for X, lanczos from the
same PNGs; `--no-720` skips it), then verifies each file (size, fps, frame count, High profile, constant frame spacing,
`moov` before `mdat`) and exits 1 on a mismatch.

- `FFMPEG` set: `-framerate 30 -i %06d.png -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 18 -movflags +faststart`
  (720p adds `-vf scale=1280:720:flags=lanczos`); ffprobe next to it (or `FFPROBE`) verifies.
- Otherwise (current machine: no ffmpeg): `encode.swift` is compiled once with `swiftc -O` (cached in the OS temp dir;
  if the default SDK is newer than the compiler it retries the other installed macOS SDKs) and fed raw RGBA over a
  pipe: AVAssetWriter H.264 High (auto level), 4:2:0 bi-planar video range via vImage (BT.709 matrix and tags),
  exact `frame / 30` timestamps, average bitrate 16 Mbps (720p: 8 Mbps), `shouldOptimizeForNetworkUse` (faststart).
  It prints `deviation: no x264 CRF 18 (AVFoundation bitrate mode)`. The 16 Mbps is an average target: VideoToolbox
  spends less on simple frames (the synthetic self-test came out at about 1.8 Mbps), so judge quality from frames.

`encode.swift` also has `decode` (intro frames, contact sheets) and `probe` (the verification above) modes.

## Self-test (2026-11-13)

`compose.mjs --synth` writes a 23 s take: p0 frames at 3840x2160 with 22-40 ms jitter, a popup page p1 (800x1200 px)
for 3 s, two sections with captions, a box + hold + zoom_out in section 1, a 6 s wait (played at 3x = 2 s), a box on
the popup, a mark and a final box in section 2; since WO-35d also post-cursor events (a move + click on p0, a move +
click on the popup). Edit: intro + section 1 + section 2 + end card. WO-35d run (sections only, no captions): 542
frames in 11.5 s; cursor 15 + 14 moving frames, 0 frozen; ring and arrow checked in crops.

Result (AVFoundation path, no ffmpeg): 855 raw frames (97 MB) → 852 master frames = 28.400 s (180 + 237 + 315 + 150
minus 3 dissolves of 10); compose about 45 s per pass (captions on and off), PNGs about 195 MB per pass. Encode checks
all OK: 1920x1080 30.000 fps 852 frames High, moov first, 6.3 MB (captions 6.5 MB); 720p 3.7 MB (3.8 MB); about 15 s
for both sizes. A decode round trip against the PNGs gives a mean absolute difference of 0.15-0.55 per channel
(PSNR 45-54 dB), so the BT.709 video-range conversion matches. SRT: 2 cues (6.000-9.500, 13.567-17.067). Contact
sheet: 6 tiles.
