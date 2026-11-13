#!/usr/bin/env node
// WO-35a: frame-gap check for a raw take. For each page, only while it is the active (front) page: the longest time without a new frame.
// Usage: node scripts/demo/capture/gapcheck.mjs <take> [page] [--limit 100]   → exit 1 if any gap > limit ms (prints the worst 5).
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

export function gapcheck(dir, { page = null, limit = 100 } = {}) {
  const take = resolve(dir);
  const frames = readJsonl(join(take, 'frames.jsonl'));
  const events = existsSync(join(take, 'events.jsonl')) ? readJsonl(join(take, 'events.jsonl')) : [];
  const meta = existsSync(join(take, 'take.json')) ? JSON.parse(readFileSync(join(take, 'take.json'), 'utf8')) : {};
  const end = meta.duration_ms ?? Math.max(0, ...frames.map((f) => f.t), ...events.map((e) => e.t));
  const byPage = new Map();
  for (const f of frames) { if (!byPage.has(f.page)) byPage.set(f.page, []); byPage.get(f.page).push(f.t); }
  for (const ts of byPage.values()) ts.sort((a, b) => a - b);

  const pages = {};
  const gaps = [];
  for (const iv of activeIntervals(events, end)) {
    if (page && iv.page !== page) continue;
    const ts = byPage.get(iv.page) ?? [];
    const pts = [iv.a, ...ts.filter((t) => t > iv.a && t < iv.b), iv.b];
    const s = (pages[iv.page] ??= { frames: ts.length, activeMs: 0, framesWhileActive: 0, maxGap: 0, sizes: new Set() });
    s.activeMs += iv.b - iv.a;
    s.framesWhileActive += pts.length - 2;
    for (let i = 1; i < pts.length; i++) {
      const g = pts[i] - pts[i - 1];
      gaps.push({ page: iv.page, from: pts[i - 1], to: pts[i], ms: g });
      if (g > s.maxGap) s.maxGap = g;
    }
  }
  for (const f of frames) pages[f.page]?.sizes.add(`${f.w}x${f.h}`);
  for (const s of Object.values(pages)) { s.fps = s.activeMs ? Math.round((s.framesWhileActive / s.activeMs) * 10000) / 10 : 0; s.sizes = [...s.sizes]; }
  gaps.sort((a, b) => b.ms - a.ms);
  const worst = gaps.slice(0, 5);
  return { take, end, limit, pages, worst, maxGap: worst[0]?.ms ?? 0, pass: !gaps.some((g) => g.ms > limit) && gaps.length > 0 };
}

export function printReport(r) {
  console.log(`gapcheck ${tilde(r.take)} · ${(r.end / 1000).toFixed(1)} s · limit ${r.limit} ms`);
  for (const [id, s] of Object.entries(r.pages)) {
    console.log(`  ${id}: ${s.frames} frames · active ${(s.activeMs / 1000).toFixed(1)} s · ${s.fps} fps while active · max gap ${s.maxGap} ms · ${s.sizes.join(', ')}`);
  }
  console.log(`  worst: ${r.worst.map((g) => `${g.page} ${g.ms} ms @ ${g.from}–${g.to}`).join(' | ') || 'none'}`);
  console.log(r.pass ? `PASS max gap ${r.maxGap} ms` : `FAIL max gap ${r.maxGap} ms (> ${r.limit} ms or no frames)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? Number(args.splice(li, 2)[1]) : 100;
  const [dir, page] = args;
  if (!dir) { console.error('usage: node scripts/demo/capture/gapcheck.mjs <take> [page] [--limit 100]'); process.exit(2); }
  const r = gapcheck(dir, { page: page ?? null, limit });
  printReport(r);
  process.exitCode = r.pass ? 0 : 1;
}
