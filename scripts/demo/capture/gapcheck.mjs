#!/usr/bin/env node
// WO-35a/35d: frame-gap check for a raw take. For each page, only while it is the active (front) page and inside the section window: the
// time between consecutive frames, classified (Kunal 2026-11-13: 100 ms on frames with motion; up to 120 ms on still holds):
//   motion      overlaps a motion interval (motion_start/motion_end): scroll, drag, type; plus move when the cursor is in-page (DOM cursor).
//               With the post-drawn cursor (cursor_mode post) moves do not count: compose draws the cursor at 30 fps whatever the page does.
//   hold        entirely inside a `hold` [t, t + ms]                                                           → ≤ stillLimit (120 ms)
//   transition  everything else (clicks waiting for a window/panel, page loads): reported (max, worst), not pass/fail — Kunal decides.
//   unchanged   (CLI / gapcheckVisual) a motion gap over the limit whose two frames are identical: nothing moved on screen; reported.
// Takes logged before WO-35d have no motion events: every non-hold gap counts as motion there (legacy).
// Usage: node scripts/demo/capture/gapcheck.mjs <take> [page] [--limit 100] [--still 120] [--no-visual]  → exit 1 if a motion or hold gap is over.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tilde = (s) => String(s).split(homedir()).join('~');
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

/** Active intervals per page from `active` events (p0 is active from 0 until the first active event says otherwise). */
function activeIntervals(events, end) {
  const acts = events.filter((e) => e.type === 'active').sort((a, b) => a.t - b.t);
  if (!acts.length || acts[0].t > 0) acts.unshift({ t: 0, page: 'p0' });
  const out = [];
  acts.forEach((a, i) => {
    const b = i + 1 < acts.length ? acts[i + 1].t : end;
    if (b > a.t) out.push({ page: a.page, a: a.t, b });
  });
  return out;
}

/** Still windows = `hold` events [t, t + ms]. */
function holdWindows(events) {
  return events.filter((e) => e.type === 'hold' && Number.isFinite(e.ms)).map((e) => ({ a: e.t, b: e.t + e.ms }));
}

/** Motion intervals from motion_start/motion_end (paired by `m`; an unterminated one runs to `end`). */
export function motionIntervals(events, end) {
  const open = new Map(), out = [];
  for (const e of events) {
    if (e.type === 'motion_start') open.set(e.m, e);
    else if (e.type === 'motion_end' && open.has(e.m)) { const s = open.get(e.m); open.delete(e.m); out.push({ kind: s.kind, page: s.page, a: s.t, b: e.t }); }
  }
  for (const s of open.values()) out.push({ kind: s.kind, page: s.page, a: s.t, b: end });
  return out.sort((x, y) => x.a - y.a);
}

export function gapcheck(dir, { page = null, limit = 100, stillLimit = 120 } = {}) {
  const take = resolve(dir);
  const frames = readJsonl(join(take, 'frames.jsonl'));
  const events = existsSync(join(take, 'events.jsonl')) ? readJsonl(join(take, 'events.jsonl')) : [];
  const meta = existsSync(join(take, 'take.json')) ? JSON.parse(readFileSync(join(take, 'take.json'), 'utf8')) : {};
  const end = meta.duration_ms ?? Math.max(0, ...frames.map((f) => f.t), ...events.map((e) => e.t));
  const byPage = new Map();
  for (const f of frames) { if (!byPage.has(f.page)) byPage.set(f.page, []); byPage.get(f.page).push(f.t); }
  for (const ts of byPage.values()) ts.sort((a, b) => a - b);

  const post = events.some((e) => e.type === 'cursor_mode' && e.post === true);
  const legacy = !events.some((e) => e.type === 'motion_start');
  const kinds = post ? ['scroll', 'drag', 'type'] : ['move', 'scroll', 'drag', 'type'];
  const motions = motionIntervals(events, end).filter((m) => kinds.includes(m.kind));
  const holds = holdWindows(events);
  const classify = (from, to) => {
    const mv = motions.find((m) => from < m.b && to > m.a);
    if (mv) return { cls: 'motion', kind: mv.kind };
    if (holds.some((h) => from >= h.a && to <= h.b)) return { cls: 'hold' };
    return { cls: legacy ? 'motion' : 'transition' };
  };

  const pages = {};
  const gaps = [];
  const fileAt = new Map(frames.map((f) => [`${f.page}@${f.t}`, f.file])); // frame file by page + t (the latest one if two share a t)
  // Only the part the edit uses: from the `section` event to `section_end` (or the end of the take).
  const secStart = events.find((e) => e.type === 'section')?.t ?? 0;
  const secEnd = events.find((e) => e.type === 'section_end')?.t ?? end;
  for (const raw of activeIntervals(events, end)) {
    if (page && raw.page !== page) continue;
    const iv = { page: raw.page, a: Math.max(raw.a, secStart), b: Math.min(raw.b, secEnd) };
    if (iv.b <= iv.a) continue;
    const ts = byPage.get(iv.page) ?? [];
    const pts = [iv.a, ...ts.filter((t) => t > iv.a && t < iv.b), iv.b];
    const s = (pages[iv.page] ??= { frames: ts.length, activeMs: 0, framesWhileActive: 0, maxGap: 0, sizes: new Set() });
    s.activeMs += iv.b - iv.a;
    s.framesWhileActive += pts.length - 2;
    for (let i = 1; i < pts.length; i++) {
      const g = pts[i] - pts[i - 1];
      // Frame files at both ends (for the visual check); an interval boundary that is not a frame has none.
      const fromFile = i > 1 ? fileAt.get(`${iv.page}@${pts[i - 1]}`) : null, toFile = i < pts.length - 1 ? fileAt.get(`${iv.page}@${pts[i]}`) : null;
      gaps.push({ page: iv.page, from: pts[i - 1], to: pts[i], ms: g, fromFile, toFile, ...classify(pts[i - 1], pts[i]) });
      if (g > s.maxGap) s.maxGap = g;
    }
  }
  for (const f of frames) pages[f.page]?.sizes.add(`${f.w}x${f.h}`);
  for (const s of Object.values(pages)) { s.fps = s.activeMs ? Math.round((s.framesWhileActive / s.activeMs) * 10000) / 10 : 0; s.sizes = [...s.sizes]; }
  gaps.sort((a, b) => b.ms - a.ms);
  const clip = (m) => Math.max(0, Math.min(m.b, secEnd) - Math.max(m.a, secStart));
  return summarize({ take, end, limit, stillLimit, post, legacy, pages, gaps, motionMs: motions.reduce((a, m) => a + clip(m), 0) });
}

function summarize(r) {
  const of = (cls) => r.gaps.filter((g) => g.cls === cls);
  const motion = of('motion'), holdGaps = of('hold'), transition = of('transition'), unchanged = of('unchanged');
  const pass = r.gaps.length > 0 && !motion.some((g) => g.ms > r.limit) && !holdGaps.some((g) => g.ms > r.stillLimit);
  return {
    ...r, pass, maxGap: r.gaps[0]?.ms ?? 0, maxMotion: motion[0]?.ms ?? 0, maxStill: holdGaps[0]?.ms ?? 0, maxTransition: transition[0]?.ms ?? 0,
    maxUnchanged: unchanged[0]?.ms ?? 0, worst: r.gaps.slice(0, 5), worstMotion: motion.slice(0, 5), worstHold: holdGaps.slice(0, 3),
    worstTransition: transition.slice(0, 5), worstUnchanged: unchanged.slice(0, 3),
  };
}

/**
 * gapcheck + a visual check of the motion gaps over the limit: when the frames on both sides are identical (mean absolute difference
 * < 0.05 on a 480 px greyscale copy), nothing moved on screen during the gap (typically the app stalling right after a scroll came to
 * rest, inside the scroll's 160 ms tail), so it is reclassified `unchanged`: reported, not pass/fail. Needs sharp (as compose does);
 * without it the plain report is returned.
 */
export async function gapcheckVisual(dir, opts = {}) {
  const r = gapcheck(dir, opts);
  const over = r.gaps.filter((g) => g.cls === 'motion' && g.ms > r.limit && g.fromFile && g.toFile);
  if (!over.length) return r;
  let sharp;
  try { sharp = (await import('./encode.mjs')).loadSharp(); } catch { return r; }
  const small = (f) => sharp(join(r.take, f)).resize(480, null).greyscale().raw().toBuffer();
  for (const g of over) {
    const [a, b] = await Promise.all([small(g.fromFile), small(g.toFile)]);
    let d = 0;
    for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    g.diff = Math.round((d / a.length) * 100) / 100;
    if (g.diff < 0.05) g.cls = 'unchanged';
  }
  return summarize(r);
}

const fmt = (l) => l.map((g) => `${g.page} ${g.ms} ms @ ${g.from}–${g.to}${g.kind ? ` (${g.kind})` : ''}${g.diff !== undefined ? ` Δ${g.diff}` : ''}`).join(' | ') || 'none';

export function printReport(r) {
  const mode = r.legacy ? 'legacy (no motion events: every non-hold gap is motion)'
    : r.post ? 'post cursor (motion = scroll/drag/type)' : 'DOM cursor (motion = move/scroll/drag/type)';
  console.log(`gapcheck ${tilde(r.take)} · ${(r.end / 1000).toFixed(1)} s · ${mode}`);
  for (const [id, s] of Object.entries(r.pages)) {
    console.log(`  ${id}: ${s.frames} frames · active ${(s.activeMs / 1000).toFixed(1)} s · ${s.fps} fps while active · max gap ${s.maxGap} ms · ${s.sizes.join(', ')}`);
  }
  console.log(`  motion (${(r.motionMs / 1000).toFixed(1)} s in intervals): ${fmt(r.worstMotion)}`);
  console.log(`  holds: ${fmt(r.worstHold)}`);
  if (r.worstUnchanged.length) console.log(`  motion intervals, no visible change (not pass/fail): ${fmt(r.worstUnchanged)}`);
  if (!r.legacy) console.log(`  transitions (not pass/fail): ${fmt(r.worstTransition)}`);
  const v = `motion max ${r.maxMotion} ms (≤ ${r.limit}) · holds max ${r.maxStill} ms (≤ ${r.stillLimit})${r.legacy ? '' : ` · transitions max ${r.maxTransition} ms`}` +
    (r.maxUnchanged ? ` · unchanged max ${r.maxUnchanged} ms` : '');
  console.log(r.pass ? `PASS ${v}` : `FAIL ${v}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const num = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args.splice(i, 2)[1]) : d; };
  const limit = num('--limit', 100), stillLimit = num('--still', 120);
  const noVisual = args.includes('--no-visual') && args.splice(args.indexOf('--no-visual'), 1);
  const [dir, page] = args;
  if (!dir) { console.error('usage: node scripts/demo/capture/gapcheck.mjs <take> [page] [--limit 100] [--still 120] [--no-visual]'); process.exit(2); }
  const o = { page: page ?? null, limit, stillLimit };
  const r = noVisual ? gapcheck(dir, o) : await gapcheckVisual(dir, o);
  printReport(r);
  process.exitCode = r.pass ? 0 : 1;
}
