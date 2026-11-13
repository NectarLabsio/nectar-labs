# Demo capture (WO-35a)

Raw takes for the demo video: a CDP screencast of every page in a Playwright context (app, terminal page, wallet popups), a drawn
cursor, human-paced input, and the events the edit (WO-35b, `EDIT.md`) needs. Node ESM, no dependencies beyond the repo's Playwright
1.65.0 (system Google Chrome). Never point any of this at `~/.nectar/demo-chrome-profile` for testing: use a throwaway profile.

## Take format (shared with WO-35b)

```
<take>/frames/<page>/<seq:06d>.jpg   CDP screencast JPEG q92; 1920×1080 viewport at 2× = 3840×2160 (popups: their own size × 2)
<take>/frames.jsonl                  {"t":ms,"page":"p0","file":"frames/p0/000123.jpg","w":3840,"h":2160}  (arrival order; t never
                                     decreases within a page; w/h read from the JPEG itself)
<take>/events.jsonl                  {"t":ms,"type":…,…}  t never decreases
<take>/take.json                     {version, started, duration_ms, frames:{p0:n,…}, bytes, quality, max, everyNthFrame}
```

`t` is one monotonic take clock (ms since `startTake`). For frames it is Chrome's frame-swap timestamp mapped onto that clock (arrival
time as a fallback). Event types: `section {id,title,caption}` · `section_end {id}` · `active {page}` · `popup_open {page,w,h}` (w/h in
CSS px; frames are 2× that) · `popup_close {page}` · `box {label,page,x,y,w,h}` (CSS px of that page) · `zoom_out` ·
`wait_start/wait_end {label}` (`ok:false` on error) · `hold {ms,label}` · `mark {label,data}`. Marks written by the tooling:
`click {page,x,y,what?}`, `type {page,chars,what?}` (length only, never the text), `take_end` (last line).

Pages: the take's existing pages are `p0`, `p1`, … in order; any page opened later (a wallet popup) gets the next id. `active p0` is
logged at t=0. A popup's `popup_open` + `active` are logged at its **first frame** (so a reader always has a frame for the active page).
On close: `popup_close` and `active` for the page that was in front before it. Use `take.setActive(page)` if you switch tabs yourself.

## Recording a take

```js
import { createRequire } from 'node:module';
import { CAPTURE_LAUNCH, defaultTakeDir, startTake, stopTake } from './recorder.mjs';
import * as h from './human.mjs';
const { chromium } = createRequire('/Volumes/T7/nectar-labs/apps/web/package.json')('@playwright/test');

const ctx = await chromium.launchPersistentContext(profileDir, { ...CAPTURE_LAUNCH });
await h.installCursor(ctx);                       // before the take: cursor in every page, popups included
const page = ctx.pages()[0];
await page.goto(url, { waitUntil: 'load' });
await startTake(ctx, defaultTakeDir('take-01'));  // ~/.nectar/demo-capture/take-01 (internal disk)
h.section(1, 'Market', 'Exit capacity is set by escrowed buy-side quotes.');
await h.moveTo(page, page.getByRole('link', { name: 'NVDAx' }));
await h.box(page, 'ladder', page.locator('[data-ladder]'));  await h.hold(1200, 'read ladder');  h.zoomOut();
await h.click(page, page.getByRole('button', { name: 'Borrow' }));
await h.type(page, '250');                        // focused field, key by key
await h.wait('tx confirm', page.getByText('Confirmed').waitFor({ timeout: 60_000 }));
h.sectionEnd(1);
await stopTake();
```

`CAPTURE_LAUNCH` = `channel 'chrome'`, headless, viewport 1920×1080, `deviceScaleFactor 2`, dark, and
`--force-device-scale-factor=2`. The flag is required: Playwright's `deviceScaleFactor` alone only emulates DPR, and the screencast stays
1× (`startTake` warns if frames are not 2×). Headless is recommended: headless Chrome here renders on the GPU (ANGLE Metal), and a
headed window that is covered stops producing frames.

### recorder.mjs
- `startTake(context, dir, opts?)` → `Take`. Opts: `quality` 92, `maxWidth/maxHeight` 3840/2160, `everyNthFrame` 1, `keepAlive` true,
  `fitWindow` true, `popupSize` null (force a popup viewport), `log`. One take at a time. Waits for p0's first frame (≤ 5 s).
- `event(type, data)` · `pageId(page)` · `setActive(page)` · `stopTake()` → summary (also written to take.json) · `currentTake()`.
  Without a running take `event` is a no-op, so the same script rehearses unrecorded.
- Every frame is acked at once, written asynchronously, and flushed before `stopTake` returns.
- Keepalive: a 1×1 px element animating opacity 0 ↔ 0.01 in each top-level page of the capture context (init script plus re-injection
  on `domcontentloaded`), so a static page still yields frames. Removed at `stopTake`.
- Window fit: headless windows reserve simulated browser UI (view 1920×993 for a 1920×1080 viewport, 480×573 for a 480×640 popup), and
  the screencast captures the view. On the first frame of each page the window grows by the difference via `Browser.setWindowBounds`
  and the screencast restarts. Frames before the fit are dropped.
- Popup size: `window.open(url, name, "width=…,height=…")` is recorded in the opener (any frame) and applied to the popup's viewport
  (Playwright otherwise gives every page the context viewport). Override with `popupSize`.

### human.mjs
- `installCursor(context)`: an arrow cursor (SVG, crisp at 2×, white outline, soft shadow) plus an accent click ring on mousedown. It is
  built with DOM APIs (CSP and Trusted Types safe), sits in the top layer as a manual popover (above `<dialog>` and popovers opened later;
  z-index max as the fallback), follows real `mousemove`, and is also placed explicitly on every step (mousemove over an iframe never
  reaches the top document). Re-injected on every `domcontentloaded`. Position survives same-origin navigation.
- `moveTo(page, locator | {x,y}, {ms?})`: cubic in-out on a slightly curved quadratic path, 300–800 ms by distance, ~60 Hz steps.
  Locators: a point near the centre (small jitter); off-screen elements are first brought in with an eased wheel `scroll`.
- `click(page, target, {label?, timeout?})`: moveTo, 150–300 ms pause, ring, click. With a locator Playwright's actionability checks
  still apply, at the same point. Logs `mark click`.
- `type(page, text)`: 50–120 ms per key, varied (slower after spaces and punctuation); never fill or paste. `press(page, key)`.
- `hold(ms, label)` · `box(page, label, locator | {x,y,w,h})` · `wait(label, promise | fn)` · `section(id, title, caption)` ·
  `sectionEnd(id)` · `zoomOut()` · `mark(label, data)` · `scroll(page, dy)`.

### gapcheck.mjs
`node scripts/demo/capture/gapcheck.mjs <take> [page] [--limit 100]`: per page, only while it is active, the longest time without a
new frame (measured from the moment it became active to the moment it stopped). Prints fps and the worst 5. Exit 1 if any gap > limit.

### terminal/
`node scripts/demo/capture/terminal/server.mjs --port 7681 [--cwd dir] [--env-file f] [--replace FROM=TO]… --cmd "<command>"`
(or `-- <argv…>`). It serves a terminal-looking page on 127.0.0.1 only (bg #0d0f12, text #e6e9ef, accent prompt `$ `, DM Mono 22 px,
block caret). Typing the exact configured command and pressing Enter runs it server side via `/bin/sh -c`, with this process's env
(set it off camera, or use `--env-file`; nothing about env reaches the page), and streams stdout/stderr over SSE. Any other typed line is
refused visibly (red line) and nothing runs. Every line is sanitized: ANSI/OSC dropped, `\r` redraws collapsed, `$HOME` → `~`, host
and user names masked, then the `--replace` pairs (e.g. `--replace /Volumes/T7/nectar-labs=.`). The child gets `NO_COLOR=1
FORCE_COLOR=0 TERM=dumb`. Requests from another Origin get 403. For section 5: `--cmd "pnpm --filter x402 demo:testnet"` with
`X402_URL` etc. in the server's env (C4: no localhost on camera). Navigate p0 to the terminal URL so it stays `p0`.

## Self-test and measured limits (2026-11-13, M4, 10 cores, other agents running)

`node scripts/demo/capture/recorder.mjs selftest [takeDir] [--nth N] [--max WxH]`: a throwaway profile under the OS temp dir,
https://nectarlabs.io (moves, hover, two boxes, a hold), then the terminal page (`echo ok`), then a 480×640 popup (move, click, type,
close), ~18 s, then gapcheck.

| run | p0 (3840×2160 unless noted) | p1 popup (960×1280) | disk |
| --- | --- | --- | --- |
| q92, nth 1 | 527–658 frames, 26–34 fps, max gap 284–367 ms | 59 fps, max gap 33 ms | 99–122 MB |
| q92, nth 3 | 350 frames, 19 fps, max gap 300 ms | 20 fps, max gap 50 ms | 65 MB |
| q92, nth 1, `--max 2560x1440` | 1032 frames, 55 fps, max gap 300 ms (2560×1440) | 60 fps, max gap 17 ms | 94 MB |

What limits it: the page itself renders at 60 fps (rAF, max 17 ms) with or without capture. Chrome's 4K screencast (capture plus JPEG
encode) tops out at about 26–31 fps on detailed pages (1440p and 1080p reach 60 fps), and spikes beyond 100 ms under CPU load. Two
parallel screencast sessions do not help. The remaining 230–300 ms gaps fall at the same moment in every run, including 1440p at 55 fps:
hovering a nav link on the production landing page, so they look page-side (a render stall), not recorder-side. The terminal and
popup segments pass at every setting.

For takes: record on a quiet machine (no builds or encodes running), run gapcheck on each take, and keep the take if it passes. If 4K
q92 fails on app pages, the measured fallbacks are `everyNthFrame: 3` (steady 20 fps at 4K, 50 ms gaps on flat pages) or
`maxWidth: 2560, maxHeight: 1440` (55–60 fps; compose must then scale by each frame's `w/h`). Either is a deviation from the brief
(2×, every frame), so it needs Kunal's decision.
