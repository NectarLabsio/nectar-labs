# WO-35d — demo capture: post-drawn cursor, paced input, motion-interval gapcheck (< 2 h; commit `feat(demo): post-drawn cursor + motion gapcheck (WO-35d)`)
Write only scripts/demo/capture/** and scripts/demo/takes/**. No product change. Rules as WO-35a/b/c (no installs/downloads; throwaway profile for dev; never sign;
never touch ~/.nectar/demo-chrome-profile except read-only; no home paths; NO Co-Authored-By; don't touch host services).
Measurement 1 (~/.nectar/demo-capture/measure-1, headed, quiet machine): S1 PASS 83 ms; S2–S5 FAIL. The worst motion gaps are the APP pausing, not capture drops:
S2 p0 434/333/283 ms right after the click that opens the Intear popup (window creation); S3 p0 ~250 ms ×2 while typing amounts (preview recompute) and ~270–284 ms at the
clicks that open the drawer / wallet; S4 p0 450 ms during the #sim slider drag; S4/S5 p1 250/123 ms while the explorer tab loads. The in-page DOM cursor freezes during
these pauses, which is what makes them visible.
Kunal's rule (2026-11-13): 100 ms on frames WITH MOTION (cursor, zoom, scroll, the simulator drag); up to 120 ms on still holds.
1. Post-drawn cursor: human.mjs logs every cursor sample it sends (event `cursor` {page, x, y} at the time of each mouse.move step, plus `click` {page, x, y}) and,
   with env CURSOR_POST=1 (default for takes), does NOT inject the DOM cursor/ring. compose.mjs draws the cursor sprite (same arrow look, 2× crisp) and the click
   ring from those events at output frame times (interpolated, in page coordinates, through the camera transform; popups offset to where the popup is drawn).
   Cursor motion is then smooth at 30 fps whatever the page does. Keep the DOM cursor path working when CURSOR_POST=0.
2. Motion intervals: human.mjs logs `motion_start`/`motion_end` {kind: move|scroll|drag|type} around each moveTo (only page-content motion matters once the cursor is
   post-drawn: scroll, drag, type), scroll, drag and type. gapcheck: with post cursor, a gap counts as MOTION only if it overlaps a scroll/drag/type interval → 100 ms;
   inside holds → 120 ms; everything else (clicks waiting for a window/panel, page loads) → report separately as `transition` gaps (print max; not pass/fail) —
   Kunal decides on those. Without post cursor, moves count as motion too.
3. Pacing (take.mjs/human.mjs): drag #sim in fewer, slower steps (e.g. 12–16 steps over ~1.2 s, waiting for a rendered frame between steps); type amounts at the
   human rate but wait for the preview to settle (network idle / stable text) before the next action; after a click that opens a window/panel, hold until the
   new content has painted.
4. Re-measure: headed (CAPTURE_HEADED=1), rehearsal mode, all sections, NO --sign, into ~/.nectar/demo-capture/measure-2; machine quiet (orchestrator stopped the
   local Feed and x402). Then compose measure-2 (captions on) with FFMPEG=~/.nectar/tools/node_modules/ffmpeg-static/ffmpeg, encode, contact sheet. Report ≤ 15
   lines: per section motion max / hold max / transition max, cursor smoothness check (crops), output paths.
