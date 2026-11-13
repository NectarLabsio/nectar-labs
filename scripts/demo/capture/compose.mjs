#!/usr/bin/env node
// compose.mjs <edit.json> <outdir> [--captions|--no-captions] [--no-cursor] [--jobs N] [--work <dir>]      (WO-35b, WO-35d)
// compose.mjs --synth <take dir>   writes a synthetic take in the shared format (self-test fixture)
// Builds the master as 1920x1080 PNG frames at 30 fps CFR (<outdir>/frames/000000.png …) + <outdir>/edit-timeline.json.
// Take sections: latest raw frame <= t of the active page; wallet popups drawn centred over the dimmed app with a soft
// shadow; eased camera zoom (<= 1.5x) on logged boxes; waits > 2 s at 2-4x with a tag; holds never sped up; 10-frame
// dissolves between sections; captions (first 3.5 s of a section) when enabled. The scene is composed at 3840x2160 and
// reduced to 1920x1080 with one lanczos3 resize; captions and tags are rendered by Chrome at DSF 2 and lanczos-reduced.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HERE, REPO_ROOT, decodeFrames, expandHome, isMain, loadPlaywright, loadSharp, log, probeVideo, tilde } from './encode.mjs';

const sharp = loadSharp();
const W4 = 3840, H4 = 2160, W = 1920, H = 1080;
const BG = { r: 13, g: 15, b: 18 };
const CAPTION_S = 3.5;
const DEFAULT_BASE = '/Volumes/T7/nectar-demo-media/intro/endcard-base.png';
const DEFAULT_HEADLINE = 'Testnet with mock collateral';
const DEFAULT_URLS = ['https://nectarlabs.io', 'https://testnet.nectarlabs.io', 'https://docs.nectarlabs.io', 'https://status.nectarlabs.io'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const pad = (n) => String(n).padStart(6, '0');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

function readJsonl(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    try {
      out.push(JSON.parse(l));
    } catch (e) {
      if (i < lines.length - 2) throw new Error(`${tilde(file)}:${i + 1}: ${e.message}`);
      log(`warn: ignored a partial last line in ${file}`);
    }
  });
  return out;
}

// ---------- overlays (Chrome, DSF 2, lanczos to 1x) ----------
const OVERLAY_HTML = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"DM Sans";font-weight:400;src:url(/fonts/dm-sans-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"DM Sans";font-weight:600;src:url(/fonts/dm-sans-latin-600-normal.woff2) format("woff2")}
html,body{margin:0;background:transparent}
#el{position:absolute;left:0;top:0;display:inline-block;box-sizing:border-box;color:#e6e9ef;background:rgba(13,15,18,.86);
 border:1px solid rgba(122,184,163,.18);border-radius:12px;-webkit-font-smoothing:antialiased}
.cap{font:400 30px/1.35 "DM Sans",sans-serif;padding:16px 24px;max-width:1180px}
.tag{font:600 24px/1 "DM Sans",sans-serif;padding:9px 14px;font-variant-numeric:tabular-nums}
</style><div id="el"></div>`;

class Chrome {
  constructor() { this.files = new Map(); }
  async page() {
    if (this.p) return this.p;
    const { chromium } = loadPlaywright();
    this.browser = await chromium.launch({ channel: 'chrome' });
    const ctx = await this.browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await ctx.route('http://nectar-edit.local/**', (route) => {
      const u = new URL(route.request().url()).pathname;
      if (u === '/overlay.html') return route.fulfill({ body: OVERLAY_HTML, contentType: 'text/html' });
      if (u.startsWith('/fonts/')) return route.fulfill({ path: path.join(REPO_ROOT, 'packages/ui/fonts', path.basename(u)) });
      if (u === '/endcard.html') return route.fulfill({ path: path.join(HERE, 'endcard.html') });
      if (this.files.has(u)) return route.fulfill({ path: this.files.get(u) });
      return route.fulfill({ status: 404, body: '' });
    });
    this.p = await ctx.newPage();
    this.p.on('pageerror', (e) => log('chrome pageerror:', e.message));
    return this.p;
  }
  /** Returns { data: RGBA straight alpha, w, h } at 1080p scale. */
  async panel(kind, text) {
    const p = await this.page();
    if (!p.url().endsWith('/overlay.html')) {
      await p.goto('http://nectar-edit.local/overlay.html');
      const fams = await p.evaluate(async () => {
        await document.fonts.load('400 30px "DM Sans"');
        await document.fonts.load('600 24px "DM Sans"');
        return [...document.fonts].filter((f) => f.status === 'loaded').length;
      });
      if (fams < 2) throw new Error('DM Sans did not load for captions');
    }
    await p.evaluate(([k, t]) => { const el = document.getElementById('el'); el.className = k; el.textContent = t; }, [kind, text]);
    const png = await p.locator('#el').screenshot({ omitBackground: true });
    const m = await sharp(png).metadata();
    const w = Math.round(m.width / 2), h = Math.round(m.height / 2);
    const data = await sharp(png).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).ensureAlpha().raw().toBuffer();
    return { data, w, h };
  }
  async close() { if (this.browser) await this.browser.close(); }
}

/** Straight-alpha blend of an RGBA overlay into an RGB 1920x1080 frame at (x0,y0) with global opacity. */
function blend(dst, ov, x0, y0, alpha) {
  if (alpha <= 0) return;
  const { data, w, h } = ov;
  for (let y = 0; y < h; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= H) continue;
    for (let x = 0; x < w; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= W) continue;
      const s = (y * w + x) * 4, a = (data[s + 3] * alpha) / 255;
      if (a <= 0) continue;
      const d = (dy * W + dx) * 3;
      dst[d] = (dst[d] + (data[s] - dst[d]) * a + 0.5) | 0;
      dst[d + 1] = (dst[d + 1] + (data[s + 1] - dst[d + 1]) * a + 0.5) | 0;
      dst[d + 2] = (dst[d + 2] + (data[s + 2] - dst[d + 2]) * a + 0.5) | 0;
    }
  }
}

// ---------- post-drawn cursor (WO-35d) ----------
// The arrow and click ring of human.mjs's DOM cursor (same path, outline, shadow and ring), rasterised by librsvg at the output scale with
// the sub-pixel offset baked in (quarter-pixel steps), so a slow cursor glides instead of stepping whole pixels.
const CURSOR_PATH = 'M3 2 L3 26.5 L8.9 20.9 L12.9 30.2 L16.9 28.5 L13 19.4 L21 19.4 Z';
const RING_MS = 460;
/** CSS cubic-bezier(x1,y1,x2,y2) as a function of progress (Newton on x, bisection fallback). */
function cubicBezier(x1, y1, x2, y2) {
  const bx = (u) => 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3;
  const by = (u) => 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0, hi = 1, u = p;
    for (let k = 0; k < 30; k++) { const x = bx(u); if (Math.abs(x - p) < 1e-5) break; if (x < p) lo = u; else hi = u; u = (lo + hi) / 2; }
    return by(u);
  };
}
const ringEase = cubicBezier(0.2, 0.7, 0, 1);
const spriteCache = new Map();
/** RGBA sprite: hotspot at (pad + fx, pad + fy); c = output px per CSS px; ring = null (the arrow) | {scale, opacity} (a click ring only). */
async function cursorSprite(c, fx, fy, ring) {
  const key = `${c}|${fx}|${fy}|${ring ? `${ring.scale.toFixed(3)}|${ring.opacity.toFixed(3)}` : 'arrow'}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const pad = Math.ceil(22 * c) + 2;
  const w = pad + Math.ceil(26 * c) + 2, h = pad + Math.ceil(36 * c) + 2;
  const vb = [-(pad + fx) / c, -(pad + fy) / c, w / c, h / c].map((v) => v.toFixed(4)).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">` +
    '<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity=".5"/></filter></defs>' +
    (ring ? `<g transform="scale(${ring.scale.toFixed(4)})" opacity="${ring.opacity.toFixed(4)}"><circle r="17" fill="#16f3a9" fill-opacity=".14"/>` +
      '<circle r="16" fill="none" stroke="#16f3a9" stroke-opacity=".9" stroke-width="2"/></g>'
      : `<path d="${CURSOR_PATH}" transform="translate(-3,-2)" fill="#0b0d10" stroke="#ffffff" stroke-width="1.7" stroke-linejoin="round" filter="url(#s)"/>`) +
    '</svg>';
  const p = sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({ data, w: info.width, h: info.height, pad }));
  if (spriteCache.size > 3000) spriteCache.clear();
  spriteCache.set(key, p);
  return p;
}

function mix(a, b, p) {
  const o = Buffer.allocUnsafe(a.length);
  for (let i = 0; i < a.length; i++) o[i] = (a[i] + (b[i] - a[i]) * p + 0.5) | 0;
  return o;
}

// ---------- segments ----------
async function introSegment(file, work) {
  const info = await probeVideo(file);
  if (Math.abs(info.fps - 30) > 0.01) log(`warn: intro is ${info.fps} fps; used frame for frame (no re-timing)`);
  const st = fs.statSync(file);
  const dir = path.join(work, `intro-${hash(file + st.size + st.mtimeMs)}`);
  const done = path.join(dir, 'done.json');
  if (!fs.existsSync(done)) {
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for await (const f of decodeFrames(file)) {
      let img = sharp(f.data, { raw: { width: f.width, height: f.height, channels: 4 } }).removeAlpha();
      if (f.width !== W || f.height !== H) img = img.resize(W, H, { kernel: 'lanczos3', fit: 'contain', background: BG });
      await img.png({ compressionLevel: 1 }).toFile(path.join(dir, `${pad(n++)}.png`));
    }
    fs.writeFileSync(done, JSON.stringify({ frames: n }));
  }
  const { frames } = JSON.parse(fs.readFileSync(done, 'utf8'));
  log(`intro: ${frames} frames (${(frames / 30).toFixed(2)} s) from ${file}`);
  return { kind: 'intro', source: tilde(file), frames, caption: '', render: (i) => sharp(path.join(dir, `${pad(i)}.png`)).removeAlpha().raw().toBuffer() };
}

async function endcardSegment(cfg, chrome, work, baseDir, fps) {
  const base = path.resolve(baseDir, expandHome(cfg.base || DEFAULT_BASE));
  const urls = cfg.urls || DEFAULT_URLS;
  const lines = cfg.lines || [];
  if (!lines.length) for (let i = 0; i < urls.length; i += 2) lines.push(urls.slice(i, i + 2));
  const conf = { headline: cfg.headline || DEFAULT_HEADLINE, lines, seconds: cfg.seconds || 5, fps };
  const st = fs.statSync(base);
  const dir = path.join(work, `endcard-${hash(JSON.stringify(conf) + fs.readFileSync(path.join(HERE, 'endcard.html'), 'utf8') + base + st.size + st.mtimeMs)}`);
  const done = path.join(dir, 'done.json');
  const frames = Math.round(conf.seconds * fps);
  if (!fs.existsSync(done)) {
    fs.mkdirSync(dir, { recursive: true });
    chrome.files.set('/endcard-base.png', base);
    const p = await chrome.page();
    await p.goto('http://nectar-edit.local/endcard.html');
    await p.evaluate((c) => window.setup(c), conf);
    for (let i = 0; i < frames; i++) {
      await p.evaluate((t) => window.setT(t), i / fps);
      const png = await p.screenshot({ type: 'png' });
      await sharp(png).resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().png({ compressionLevel: 1 }).toFile(path.join(dir, `${pad(i)}.png`));
    }
    fs.writeFileSync(done, JSON.stringify({ frames }));
  }
  log(`endcard: ${frames} frames, "${conf.headline}" + ${urls.length} URLs`);
  return { kind: 'endcard', source: tilde(base), headline: conf.headline, urls, frames, caption: '',
    render: (i) => sharp(path.join(dir, `${pad(i)}.png`)).removeAlpha().raw().toBuffer() };
}

/** Piecewise-linear source<->output time map for one section (ms). */
function buildTimeMap(a, b, speedPieces) {
  const segs = [];
  let cur = a;
  for (const p of speedPieces) {
    if (p.s > cur) segs.push({ s: cur, e: p.s, f: 1 });
    segs.push({ s: p.s, e: p.e, f: p.f, label: p.label });
    cur = p.e;
  }
  if (cur < b) segs.push({ s: cur, e: b, f: 1 });
  let o = 0;
  for (const s of segs) { s.o = o; o += (s.e - s.s) / s.f; s.oe = o; }
  const outDur = o;
  const toSrc = (tau) => {
    for (const s of segs) if (tau < s.oe || s === segs[segs.length - 1]) return Math.min(s.e, s.s + (tau - s.o) * s.f);
    return b;
  };
  const toOut = (t) => {
    for (const s of segs) if (t <= s.e) return s.o + (Math.max(t, s.s) - s.s) / s.f;
    return outDur;
  };
  return { segs, outDur, toSrc, toOut };
}

function subtractIntervals(iv, holes) {
  let parts = [iv];
  for (const h of holes) {
    const next = [];
    for (const p of parts) {
      if (h.e <= p.s || h.s >= p.e) { next.push(p); continue; }
      if (h.s > p.s) next.push({ s: p.s, e: h.s });
      if (h.e < p.e) next.push({ s: h.e, e: p.e });
    }
    parts = next;
  }
  return parts;
}

async function takeSegment(item, baseDir, opts, chrome, isFirst) {
  const dir = path.resolve(baseDir, expandHome(item.take));
  const frames = readJsonl(path.join(dir, 'frames.jsonl'));
  const events = readJsonl(path.join(dir, 'events.jsonl')).map((e, i) => ({ ...e, _i: i })).sort((x, y) => x.t - y.t || x._i - y._i);
  const pages = new Map();
  for (const f of frames) {
    if (!pages.has(f.page)) pages.set(f.page, []);
    pages.get(f.page).push({ t: f.t, file: path.join(dir, f.file), w: f.w, h: f.h });
  }
  for (const l of pages.values()) l.sort((x, y) => x.t - y.t);
  const lastFrameT = Math.max(...frames.map((f) => f.t));

  const sec = events.find((e) => e.type === 'section' && Number(e.id) === Number(item.section));
  if (!sec) throw new Error(`section ${item.section} not in ${tilde(dir)}/events.jsonl`);
  const a = sec.t;
  const endEv = events.find((e) => e.type === 'section_end' && Number(e.id) === Number(item.section) && e.t > a);
  const nextSec = events.find((e) => e.type === 'section' && e.t > a);
  const b = endEv ? endEv.t : nextSec ? nextSec.t : lastFrameT;
  if (!(b > a)) throw new Error(`section ${item.section}: empty range`);
  const inSec = events.filter((e) => e.t >= a && e.t <= b);

  // Popups and the page in front.
  const popupPages = new Set(events.filter((e) => e.type === 'popup_open').map((e) => e.page));
  const activeEv = events.filter((e) => e.type === 'active');
  const popupEv = events.filter((e) => e.type === 'popup_open' || e.type === 'popup_close');
  const stateAt = (t) => {
    let active = 'p0', base = 'p0';
    for (const e of activeEv) {
      if (e.t > t) break;
      active = e.page;
      if (!popupPages.has(e.page)) base = e.page;
    }
    const open = new Set();
    for (const e of popupEv) {
      if (e.t > t) break;
      if (e.type === 'popup_open') open.add(e.page); else open.delete(e.page);
    }
    return { base, popup: open.has(active) ? active : null };
  };
  const frameAt = (page, t, strict) => {
    const l = pages.get(page);
    if (!l || !l.length) return null;
    if (t < l[0].t) return strict ? null : l[0];
    let lo = 0, hi = l.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (l[mid].t <= t) lo = mid; else hi = mid - 1; }
    return l[lo];
  };

  // Speed-ups: waits > 2 s (minus holds) at f = ceil(d / 2 s) clamped to 2..4.
  const holds = inSec.filter((e) => e.type === 'hold').map((e) => ({ s: e.t, e: e.t + Number(e.ms || 0) }));
  const openWaits = new Map(), pieces = [], warnings = [];
  for (const e of events) {
    if (e.type === 'wait_start') { if (!openWaits.has(e.label)) openWaits.set(e.label, []); openWaits.get(e.label).push(e.t); }
    if (e.type === 'wait_end' && openWaits.get(e.label)?.length) {
      const s = Math.max(a, openWaits.get(e.label).shift()), en = Math.min(b, e.t);
      if (en <= s) continue;
      const parts = subtractIntervals({ s, e: en }, holds);
      const d = parts.reduce((acc, p) => acc + p.e - p.s, 0);
      if (d <= 2000) continue;
      const f = clamp(Math.ceil(d / 2000), 2, 4);
      if (d / f > 2000) warnings.push(`wait "${e.label}" ${(d / 1000).toFixed(1)} s lasts ${(d / f / 1000).toFixed(1)} s at ${f}x (cap 4x)`);
      for (const p of parts) pieces.push({ ...p, f, label: e.label });
    }
  }
  pieces.sort((x, y) => x.s - y.s);
  const tm = buildTimeMap(a, b, pieces);
  const fps = opts.fps, nFrames = Math.max(1, Math.round((tm.outDur * fps) / 1000));
  const frameMs = 1000 / fps;

  // Camera keyframes in output time; rect = crop of the 3840x2160 composite.
  const full = { x: 0, y: 0, w: W4 };
  const placePopup = (page, t) => {
    const f = frameAt(page, t, false);
    const pw = f ? f.w : W4 / 2, ph = f ? f.h : H4 / 2;
    const s = Math.min(1, (W4 * 0.92) / pw, (H4 * 0.86) / ph); // keeps popup + shadow inside the frame
    const w = Math.round(pw * s), h = Math.round(ph * s);
    return { x: Math.round((W4 - w) / 2), y: Math.round((H4 - h) / 2), w, h, s };
  };
  const boxRect = (e) => {
    let ox = 0, oy = 0, sc = opts.dsf;
    if (popupPages.has(e.page)) { const pl = placePopup(e.page, e.t); ox = pl.x; oy = pl.y; sc = opts.dsf * pl.s; }
    const bx = ox + e.x * sc, by = oy + e.y * sc, bw = Math.max(1, e.w * sc), bh = Math.max(1, e.h * sc);
    const z = clamp(e.zoom ? Number(e.zoom) : Math.min(opts.maxZoom, (0.75 * W4) / bw, (0.75 * H4) / bh), 1, opts.maxZoom);
    const w = W4 / z, h = H4 / z;
    return { x: clamp(bx + bw / 2 - w / 2, 0, W4 - w), y: clamp(by + bh / 2 - h / 2, 0, H4 - h), w };
  };
  const keys = inSec.filter((e) => e.type === 'box' || e.type === 'zoom_out')
    .map((e) => ({ tau: tm.toOut(e.t), target: e.type === 'box' ? boxRect(e) : full, label: e.label || 'zoom_out' }));
  const lerp = (r0, r1, p) => ({ x: r0.x + (r1.x - r0.x) * p, y: r0.y + (r1.y - r0.y) * p, w: r0.w + (r1.w - r0.w) * p });
  const camAt = (tau) => {
    let cur = full;
    for (let k = 0; k < keys.length && keys[k].tau <= tau; k++) {
      const from = k === 0 ? full : camAtKey[k];
      const p = easeInOutCubic(clamp((tau - keys[k].tau) / opts.cameraMs, 0, 1));
      cur = lerp(from, keys[k].target, p);
    }
    return cur;
  };
  const camAtKey = [];
  for (let k = 0; k < keys.length; k++) camAtKey[k] = k === 0 ? full : (() => {
    const prevFrom = k === 1 ? full : camAtKey[k - 1];
    const p = easeInOutCubic(clamp((keys[k].tau - keys[k - 1].tau) / opts.cameraMs, 0, 1));
    return lerp(prevFrom, keys[k - 1].target, p);
  })();
  const intRect = (r) => {
    const w = Math.min(W4, Math.round(r.w / 16) * 16 || 16), h = Math.round((w * 9) / 16);
    return { left: clamp(Math.round(r.x), 0, W4 - w), top: clamp(Math.round(r.y), 0, H4 - h), width: w, height: h };
  };

  // Post-drawn cursor (WO-35d): only for takes logged with cursor_mode post (no DOM cursor in their frames). Samples are CSS px of their page;
  // within one motion (`m`) they are interpolated (finite-difference cubic Hermite), between motions the cursor holds, then moves on.
  const post = opts.cursor && item.cursor !== false && events.some((e) => e.type === 'cursor_mode' && e.post === true);
  const track = new Map(), clicks = [];
  if (post) {
    for (const e of events) {
      if (e.type === 'cursor' && Number.isFinite(e.x) && Number.isFinite(e.y)) {
        if (!track.has(e.page)) track.set(e.page, []);
        track.get(e.page).push({ t: e.t, x: e.x, y: e.y, m: e.m || 0 });
      } else if (e.type === 'click') clicks.push(e);
    }
  }
  const cursorPos = (page, t, strict) => {
    const l = track.get(page);
    if (!l || !l.length) return null;
    if (t < l[0].t) return strict ? null : l[0];
    let lo = 0, hi = l.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (l[mid].t <= t) lo = mid; else hi = mid - 1; }
    const s = l[lo], n = l[lo + 1];
    if (!n || !s.m || n.m !== s.m || !(n.t > s.t)) return s;
    const p = l[lo - 1]?.m === s.m && l[lo - 1].t < s.t ? l[lo - 1] : s, q = l[lo + 2]?.m === s.m && l[lo + 2].t > n.t ? l[lo + 2] : n;
    const dt = n.t - s.t, u = (t - s.t) / dt, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const tan = (a, b, k) => (b.t > a.t ? (b[k] - a[k]) / (b.t - a.t) : 0) * dt;
    return { x: h00 * s.x + h10 * tan(p, n, 'x') + h01 * n.x + h11 * tan(s, q, 'x'), y: h00 * s.y + h10 * tan(p, n, 'y') + h01 * n.y + h11 * tan(s, q, 'y') };
  };
  /** Cursor in 4K scene px for the page in front ({X, Y, sc: scene px per CSS px}), or null. A popup without a sample yet shows the cursor
   *  where it is on the base page (human.mjs starts the popup's first move from that screen point). */
  // pl = the popup's placement when a popup is in front (its samples are offset to where it is drawn), else null.
  const toScene = (c, pl) => (pl
    ? { X: pl.x + c.x * opts.dsf * pl.s, Y: pl.y + c.y * opts.dsf * pl.s, sc: opts.dsf * pl.s }
    : { X: c.x * opts.dsf, Y: c.y * opts.dsf, sc: opts.dsf });
  const cursorAt = (t, st, pl) => {
    const front = pl ? st.popup : st.base;
    let c = cursorPos(front, t, true);
    if (c) return toScene(c, pl);
    if (pl && (c = cursorPos(st.base, t, false))) return toScene(c, null);
    return (c = cursorPos(front, t, false)) ? toScene(c, pl) : null;
  };
  const ringsAt = (t, st, pl) => {
    const front = pl ? st.popup : st.base, out = [];
    for (const k of clicks) {
      if (k.page !== front || t < k.t || t >= k.t + RING_MS) continue;
      const e = ringEase((t - k.t) / RING_MS);
      out.push({ ...toScene(k, pl), ring: { scale: 0.3 + 0.9 * e, opacity: 0.95 * (1 - e) } });
    }
    return out;
  };
  /** Cursor hotspot in output px ({x, y, c: output px per CSS px}) for a frame, or null; r = the camera crop (4K px). */
  const cursorOut = (t, st, pl, r) => {
    const s = cursorAt(t, st, pl);
    if (!s) return null;
    const k = W / r.width;
    return { x: (s.X - r.left) * k, y: (s.Y - r.top) * k, c: s.sc * k };
  };
  /** Blend the click ring(s) and the arrow into the 1080p frame. Returns the hotspot in output px. */
  const drawCursor = async (out, t, st, pl, r) => {
    const cur = cursorOut(t, st, pl, r);
    if (!cur) return null;
    const k = W / r.width;
    const put = async (ox, oy, sc, ring) => {
      const c = Math.round(sc * 100) / 100;
      let ix = Math.floor(ox), iy = Math.floor(oy), fx = Math.round((ox - ix) * 4) / 4, fy = Math.round((oy - iy) * 4) / 4;
      if (fx === 1) { ix++; fx = 0; }
      if (fy === 1) { iy++; fy = 0; }
      const sp = await cursorSprite(c, fx, fy, ring);
      blend(out, sp, ix - sp.pad, iy - sp.pad, 1);
    };
    for (const g of ringsAt(t, st, pl)) await put((g.X - r.left) * k, (g.Y - r.top) * k, g.sc * k, g.ring);
    await put(cur.x, cur.y, cur.c, null);
    return cur;
  };

  // Speed tags and caption window in local frames.
  const speedups = tm.segs.filter((s) => s.f > 1).map((s) => ({
    from: Math.floor((s.o * fps) / 1000), to: Math.ceil((s.oe * fps) / 1000), factor: s.f, label: s.label, src_ms: Math.round(s.e - s.s),
  }));
  const tagCache = new Map();
  for (const s of speedups) if (!tagCache.has(s.factor)) tagCache.set(s.factor, await chrome.panel('tag', `${s.factor}×`));
  const caption = item.caption !== undefined ? String(item.caption) : String(sec.caption || '');
  const capFrom = isFirst ? 0 : opts.dissolve;
  const capTo = Math.min(nFrames, capFrom + Math.round(CAPTION_S * fps));
  const capImg = opts.captions && caption ? await chrome.panel('cap', caption) : null;
  const capFade = Math.round(0.4 * fps), capOut = Math.round(0.3 * fps);

  // Popup chrome (shadow, rounded mask, hairline) cached per size.
  const deco = new Map();
  const popupDeco = async (w, h) => {
    const k = `${w}x${h}`;
    if (deco.has(k)) return deco.get(k);
    const padPx = 140, r = 22;
    const shadow = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w + 2 * padPx}" height="${h + 2 * padPx}">` +
      `<rect x="${padPx}" y="${padPx + 28}" width="${w}" height="${h}" rx="${r}" fill="#000" fill-opacity=".62"/></svg>`)).blur(44).png().toBuffer();
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);
    const line = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r - 1}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/></svg>`);
    const d = { shadow, mask, line, padPx };
    deco.set(k, d);
    return d;
  };
  const loadBase = async (f) => {
    if (!f) return sharp({ create: { width: W4, height: H4, channels: 3, background: BG } });
    if (f.w === W4 && f.h === H4) return sharp(f.file);
    const buf = await sharp(f.file).resize(W4, H4, { kernel: 'lanczos3', fit: 'contain', background: BG }).removeAlpha().raw().toBuffer();
    return sharp(buf, { raw: { width: W4, height: H4, channels: 3 } });
  };

  /** What is in front at local frame i: source time, page state, popup placement (when a popup frame is drawn), camera crop. */
  const frameState = (i) => {
    const tau = i * frameMs, t = tm.toSrc(tau);
    const st = stateAt(t);
    const popF = st.popup ? frameAt(st.popup, t, true) : null;
    return { tau, t, st, popF, pl: popF ? placePopup(st.popup, t) : null, r: intRect(camAt(tau)) };
  };

  const render = async (i) => {
    const { t, st, popF, pl, r } = frameState(i);
    let img = await loadBase(frameAt(st.base, t, false));
    if (popF) {
      const d = await popupDeco(pl.w, pl.h);
      let pop = sharp(popF.file);
      if (pl.s !== 1 || popF.w !== pl.w || popF.h !== pl.h) pop = pop.resize(pl.w, pl.h, { kernel: 'lanczos3', fit: 'fill' });
      const popBuf = await pop.ensureAlpha().composite([{ input: d.mask, blend: 'dest-in' }, { input: d.line }]).png({ compressionLevel: 0 }).toBuffer();
      // sharp applies linear() after composite(), so the dim is a 50 % black layer under the popup instead.
      const comp = await img.composite([
        { input: { create: { width: W4, height: H4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }, left: 0, top: 0 },
        { input: d.shadow, left: pl.x - d.padPx, top: pl.y - d.padPx },
        { input: popBuf, left: pl.x, top: pl.y },
      ]).removeAlpha().raw().toBuffer();
      img = sharp(comp, { raw: { width: W4, height: H4, channels: 3 } });
    }
    if (r.width !== W4) img = img.extract(r);
    const out = await img.resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().raw().toBuffer();
    if (post) await drawCursor(out, t, st, pl, r);
    const sp = speedups.find((s) => i >= s.from && i < s.to);
    if (sp) { const tg = tagCache.get(sp.factor); blend(out, tg, W - 48 - tg.w, 48, 1); }
    if (capImg && i >= capFrom && i < capTo) {
      const al = Math.min(easeOutCubic(clamp((i - capFrom + 1) / capFade, 0, 1)), clamp((capTo - i) / capOut, 0, 1));
      blend(out, capImg, 64, H - 64 - capImg.h, al);
    }
    return out;
  };

  // Cursor track per output frame (no pixels): smoothness stats for the timeline, and cursor-track.json for review crops.
  let cursor = { post };
  const cursorFrames = [];
  if (post) {
    const inMotion = (pg, t) => { // between two samples of one motion that differ: the drawn cursor must advance every frame here
      const l = track.get(pg) ?? [];
      if (!l.length || t < l[0].t) return false;
      let lo = 0, hi = l.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (l[mid].t <= t) lo = mid; else hi = mid - 1; }
      const s = l[lo], n = l[lo + 1];
      return Boolean(s.m && n && n.m === s.m && n.t > s.t && Math.hypot(n.x - s.x, n.y - s.y) > 0.5);
    };
    let prev = null, maxStep = 0, freezes = 0, moving = 0, drawn = 0;
    for (let i = 0; i < nFrames; i++) {
      const { t, st, pl, r } = frameState(i);
      const front = pl ? st.popup : st.base;
      const c = cursorOut(t, st, pl, r);
      cursorFrames.push(c ? { i, x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100, page: front } : { i, x: null, y: null });
      if (c) drawn++;
      if (c && prev && prev.page === front) {
        const step = Math.hypot(c.x - prev.x, c.y - prev.y);
        if (inMotion(front, t)) { moving++; if (step < 0.05) freezes++; }
        maxStep = Math.max(maxStep, step);
      }
      prev = c ? { ...c, page: front } : null;
    }
    cursor = { post, samples: [...track.values()].reduce((s, l) => s + l.length, 0), clicks: clicks.filter((k) => k.t >= a && k.t <= b).length,
      frames_drawn: drawn, frames_in_motion: moving, freeze_frames: freezes, max_step_px: Math.round(maxStep * 10) / 10 };
  }

  for (const w of warnings) log(`warn: section ${item.section}: ${w}`);
  log(`take ${dir} section ${item.section} "${sec.title || ''}": src ${(a / 1000).toFixed(2)}–${(b / 1000).toFixed(2)} s → ${nFrames} frames ` +
    `(${(nFrames / fps).toFixed(2)} s), ${keys.length} camera keys, ${speedups.length} speed-up(s)${speedups.map((s) => ` ${s.factor}x`).join('')}` +
    (post ? `, post cursor ${cursor.frames_in_motion} moving frames (${cursor.freeze_frames} frozen), ${cursor.clicks} click ring(s)` : ''));
  return {
    cursor, cursorFrames,
    kind: 'take', take: tilde(dir), section: Number(item.section), title: sec.title || '', caption, frames: nFrames, render,
    src_start_ms: a, src_end_ms: b, capFrom, capTo: caption ? capTo : capFrom, warnings,
    speedups, marks: inSec.filter((e) => e.type === 'mark').map((e) => ({ local_ms: tm.toOut(e.t), label: e.label, data: e.data })),
  };
}

// ---------- master ----------
async function runPool(n, jobs, fn) {
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < n) {
      const j = next++;
      await fn(j);
      if (++done % 150 === 0) log(`  ${done}/${n} frames (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }));
}

async function compose(editPath, outdir, args) {
  const edit = JSON.parse(fs.readFileSync(editPath, 'utf8'));
  const baseDir = path.dirname(path.resolve(editPath));
  const items = Array.isArray(edit) ? edit : edit.sections;
  const fps = Number(edit.fps || 30);
  if (fps !== 30) log(`warn: fps ${fps} (brief: 30 CFR)`);
  const opts = {
    fps, captions: args.captions ?? Boolean(edit.captions), dissolve: Number(edit.dissolve_frames ?? 10), dsf: Number(edit.dsf || 2),
    cameraMs: clamp(Number(edit.camera_ms || 600), 500, 700), maxZoom: Math.min(1.5, Number(edit.max_zoom || 1.5)),
    cursor: args.cursor ?? edit.cursor !== false,
    jobs: Number(args.jobs || edit.jobs || clamp(os.cpus().length - 2, 2, 6)),
  };
  const out = path.resolve(expandHome(outdir));
  const framesDir = path.join(out, 'frames');
  const work = path.resolve(expandHome(args.work || path.join(out, 'work')));
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  for (const f of fs.readdirSync(framesDir)) if (/^\d+\.png$/.test(f)) fs.unlinkSync(path.join(framesDir, f));

  const chrome = new Chrome();
  const t0 = Date.now();
  const segs = [];
  try {
    for (const [k, it] of items.entries()) {
      if (it.intro) segs.push(await introSegment(path.resolve(baseDir, expandHome(it.intro)), work));
      else if (it.endcard) segs.push(await endcardSegment(it.endcard === true ? {} : it.endcard, chrome, work, baseDir, fps));
      else if (it.take) segs.push(await takeSegment(it, baseDir, opts, chrome, k === 0));
      else throw new Error(`edit item ${k}: expected intro, take or endcard`);
    }
  } finally {
    await chrome.close();
  }
  const D = opts.dissolve;
  segs.forEach((s, k) => {
    s.start = k === 0 ? 0 : segs[k - 1].start + segs[k - 1].frames - D;
    if (k > 0 && (s.frames < D || segs[k - 1].frames < D)) throw new Error(`segment ${k} shorter than the ${D}-frame dissolve`);
  });
  const total = segs[segs.length - 1].start + segs[segs.length - 1].frames;
  log(`compose: ${segs.length} sections, ${total} frames (${(total / fps).toFixed(2)} s), captions ${opts.captions ? 'on' : 'off'}, ${opts.jobs} jobs`);

  await runPool(total, opts.jobs, async (j) => {
    const cover = segs.filter((s) => j >= s.start && j < s.start + s.frames);
    let buf;
    if (cover.length === 1) buf = await cover[0].render(j - cover[0].start);
    else {
      const [A, B] = cover;
      const [fa, fb] = await Promise.all([A.render(j - A.start), B.render(j - B.start)]);
      buf = mix(fa, fb, (j - B.start + 1) / (D + 1));
    }
    await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 3 }).toFile(path.join(framesDir, `${pad(j)}.png`));
  });

  const s2 = (f) => Math.round((f / fps) * 1000) / 1000;
  const timeline = {
    fps, width: W, height: H, frames: total, duration_s: s2(total), captions_burned: opts.captions, dissolve_frames: D,
    sections: segs.map((s, k) => {
      const base = { index: k, kind: s.kind, start_frame: s.start, frames: s.frames, start_s: s2(s.start), end_s: s2(s.start + s.frames),
        full_s: s2(k === 0 ? 0 : s.start + D) };
      if (s.kind !== 'take') return { ...base, source: s.source, caption: '', ...(s.headline ? { headline: s.headline, urls: s.urls } : {}) };
      return { ...base, take: s.take, section: s.section, title: s.title, caption: s.caption,
        caption_start_s: s2(s.start + s.capFrom), caption_end_s: s2(s.start + s.capTo),
        src_start_ms: s.src_start_ms, src_end_ms: s.src_end_ms,
        speedups: s.speedups.map((p) => ({ start_s: s2(s.start + p.from), end_s: s2(s.start + p.to), factor: p.factor, label: p.label, src_ms: p.src_ms })),
        marks: s.marks.map((m) => ({ t_s: Math.round((s.start / fps + m.local_ms / 1000) * 1000) / 1000, label: m.label, data: m.data })),
        cursor: s.cursor, warnings: s.warnings };
    }),
  };
  fs.writeFileSync(path.join(out, 'edit-timeline.json'), JSON.stringify(timeline, null, 2) + '\n');
  // Drawn cursor per master frame (output px), for review crops: {frame, section, x, y, page}.
  const ct = segs.flatMap((s) => (s.cursorFrames ?? []).filter((c) => c.x !== null).map((c) => ({ frame: s.start + c.i, section: s.section, x: c.x, y: c.y, page: c.page })));
  if (ct.length) fs.writeFileSync(path.join(out, 'cursor-track.json'), JSON.stringify(ct) + '\n');
  log(`wrote ${total} PNG frames to ${framesDir} and edit-timeline.json in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ---------- synthetic take (self-test fixture) ----------
async function synthTake(dir) {
  fs.mkdirSync(path.join(dir, 'frames', 'p0'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'frames', 'p1'), { recursive: true });
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const END = 23000, POP = [16000, 19000];
  const recs = [];
  for (let t = 0, n = 0; t <= END; t += 22 + Math.floor(rnd() * 18), n++) recs.push({ t, page: 'p0', n });
  for (let t = POP[0] + 120, n = 0; t < POP[1]; t += 24 + Math.floor(rnd() * 14), n++) recs.push({ t, page: 'p1', n });
  recs.sort((x, y) => x.t - y.t);
  const p0svg = (t) => {
    const s = (t / 1000).toFixed(2), x = 200 + ((t / 23000) * 3400) | 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W4}" height="${H4}"><rect width="100%" height="100%" fill="#0d0f12"/>` +
      `<rect x="0" y="0" width="${W4}" height="128" fill="#16181d"/><text x="80" y="84" font-family="Helvetica" font-size="44" fill="#e6e9ef">testnet.nectarlabs.io (synthetic take)</text>` +
      `<rect x="160" y="300" width="1500" height="900" rx="24" fill="#16181d" stroke="#23272f" stroke-width="2"/>` +
      `<text x="220" y="420" font-family="Helvetica" font-size="64" fill="#e6e9ef">NVDAx market</text>` +
      `<text x="220" y="540" font-family="Helvetica" font-size="48" fill="#8f96a3">exit capacity 1,234,567 mock USDC</text>` +
      `<rect x="2480" y="1040" width="720" height="240" rx="20" fill="#12493a" stroke="#16f3a9" stroke-width="4"/>` +
      `<text x="2560" y="1185" font-family="Helvetica" font-size="72" fill="#16f3a9">quote 7 d</text>` +
      `<text x="220" y="1900" font-family="Helvetica" font-size="120" fill="#e6e9ef">t = ${s} s</text>` +
      `<rect x="200" y="2000" width="3440" height="12" rx="6" fill="#202327"/><circle cx="${x}" cy="2006" r="28" fill="#16f3a9"/></svg>`;
  };
  const p1svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="100%" height="100%" fill="#f4f5f7"/>` +
    `<text x="60" y="140" font-family="Helvetica" font-size="56" fill="#141924">Wallet (synthetic)</text>` +
    `<text x="60" y="260" font-family="Helvetica" font-size="36" fill="#5e6778">Approve transaction</text>` +
    `<text x="60" y="360" font-family="Helvetica" font-size="40" fill="#141924">t = ${(t / 1000).toFixed(2)} s</text>` +
    `<rect x="80" y="960" width="640" height="144" rx="20" fill="#15845f"/><text x="290" y="1052" font-family="Helvetica" font-size="52" fill="#fff">Approve</text></svg>`;
  const lines = new Array(recs.length);
  await runPool(recs.length, 6, async (k) => {
    const r = recs[k];
    const file = `frames/${r.page}/${pad(r.n)}.jpg`;
    const svg = r.page === 'p0' ? p0svg(r.t) : p1svg(r.t);
    await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(path.join(dir, file));
    lines[k] = JSON.stringify({ t: r.t, page: r.page, file, w: r.page === 'p0' ? W4 : 800, h: r.page === 'p0' ? H4 : 1200 });
  });
  fs.writeFileSync(path.join(dir, 'frames.jsonl'), lines.join('\n') + '\n');
  const ev = [
    { t: 0, type: 'active', page: 'p0' },
    { t: 0, type: 'section', id: 1, title: 'Market', caption: 'Exit capacity sets the borrowing limit.' },
    { t: 1500, type: 'box', label: 'quote', page: 'p0', x: 1240, y: 520, w: 360, h: 120 },
    { t: 3000, type: 'hold', ms: 1200, label: 'read quote' },
    { t: 5200, type: 'zoom_out' },
    { t: 7900, type: 'section_end', id: 1 },
    { t: 8500, type: 'section', id: 2, title: 'Borrow', caption: 'Borrow with a protected limit.' },
    { t: 9500, type: 'wait_start', label: 'tx confirm' },
    { t: 15500, type: 'wait_end', label: 'tx confirm' },
    { t: 16000, type: 'popup_open', page: 'p1', w: 400, h: 600 },
    { t: 16000, type: 'active', page: 'p1' },
    { t: 16800, type: 'box', label: 'approve', page: 'p1', x: 40, y: 480, w: 320, h: 72 },
    { t: 18800, type: 'mark', label: 'tx', data: 'SYNTHETIC-TX-HASH' },
    { t: 19000, type: 'popup_close', page: 'p1' },
    { t: 19000, type: 'active', page: 'p0' },
    { t: 19000, type: 'zoom_out' },
    { t: 20500, type: 'box', label: 'gauge', page: 'p0', x: 80, y: 150, w: 750, h: 450 },
    { t: 22000, type: 'zoom_out' },
    { t: 23000, type: 'section_end', id: 2 },
  ];
  // WO-35d: post-drawn cursor — a move + click on p0, a move + click on the popup, the cursor back on p0 when it closes.
  const moveEv = (page, m, t0, ms, [x0, y0], [x1, y1]) => {
    const out = [{ t: t0, type: 'motion_start', kind: 'move', page, m }];
    for (let k = 0, n = Math.round(ms / 16); k <= n; k++) {
      const u = easeInOutCubic(k / n);
      out.push({ t: Math.round(t0 + (k * ms) / n), type: 'cursor', page, x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, m });
    }
    return [...out, { t: t0 + ms, type: 'motion_end', kind: 'move', m }];
  };
  ev.push({ t: 0, type: 'cursor_mode', post: true }, { t: 0, type: 'cursor', page: 'p0', x: 1000, y: 600 },
    ...moveEv('p0', 1, 600, 600, [1000, 600], [1250, 560]), { t: 1450, type: 'click', page: 'p0', x: 1250, y: 560 },
    { t: 8500, type: 'cursor_mode', post: true },
    ...moveEv('p1', 2, 17000, 500, [200, 300], [180, 516]), { t: 17700, type: 'click', page: 'p1', x: 180, y: 516 },
    { t: 19000, type: 'cursor', page: 'p0', x: 940, y: 756 });
  ev.sort((x, y) => x.t - y.t);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), ev.map((e) => JSON.stringify(e)).join('\n') + '\n');
  log(`synthetic take: ${recs.length} frames (${recs.filter((r) => r.page === 'p1').length} popup), ${ev.length} events in ${dir}`);
}

async function main() {
  const argv = process.argv.slice(2), args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--captions') args.captions = true;
    else if (a === '--no-captions') args.captions = false;
    else if (a === '--no-cursor') args.cursor = false;
    else if (a === '--jobs') args.jobs = argv[++i];
    else if (a === '--work') args.work = argv[++i];
    else if (a === '--synth') args.synth = argv[++i];
    else args._.push(a);
  }
  if (args.synth) return synthTake(path.resolve(expandHome(args.synth)));
  if (args._.length < 2) {
    console.error('usage: node compose.mjs <edit.json> <outdir> [--captions|--no-captions] [--no-cursor] [--jobs N] [--work dir]\n       node compose.mjs --synth <take dir>');
    process.exit(2);
  }
  await compose(args._[0], args._[1], args);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(tilde(String(e.stack || e))); process.exit(1); });
