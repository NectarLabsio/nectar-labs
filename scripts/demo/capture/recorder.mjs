#!/usr/bin/env node
// WO-35a: raw take recorder. CDP Page.startScreencast per page (JPEG q92, every frame, ≤ 3840×2160), one monotonic take clock, popups
// attached automatically. Writes the shared take format (docs/work/wo-35a-demo-capture-tooling.md, CAPTURE.md):
//   <take>/frames/<page>/<seq:06d>.jpg · <take>/frames.jsonl · <take>/events.jsonl · <take>/take.json
// Library: startTake(context, dir, opts) → Take · event(type, data) · pageId(page) · setActive(page) · stopTake().
// CLI:     node scripts/demo/capture/recorder.mjs selftest [takeDir] [--nth N] [--max WxH]   (throwaway profile, ~20 s, then gapcheck)
import { createWriteStream, mkdirSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
/** Replace the home directory with ~ in anything printed or written to a log. */
export const tilde = (s) => String(s).split(HOME).join('~');
/** Launch options for a take: 1920×1080 viewport, real 2× frames. Headless needs --force-device-scale-factor=2: Playwright's
 *  deviceScaleFactor alone only emulates DPR, and the screencast then stays 1×. Spread into chromium.launchPersistentContext(dir, …). */
export const CAPTURE_LAUNCH = Object.freeze({
  // CAPTURE_HEADED=1 (orchestrator, 2026-11-13): headed Chrome composites on the GPU; compare gapcheck against headless before the takes.
  channel: 'chrome', headless: process.env.CAPTURE_HEADED !== '1', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'dark',
  // Headed takes: keep covered/background windows (app behind the wallet popup, and vice versa) rendering at full rate.
  args: ['--force-device-scale-factor=2', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
/** Default raw-take location: internal disk, outside git (T7 is nearly full). */
export const defaultTakeDir = (name) => join(HOME, '.nectar', 'demo-capture', name);

// Injected into the capture context only (top frames): a 1×1 px element whose opacity animates between 0 and 0.01, so the compositor emits a
// frame every vsync even on a static page (CDP only sends screencast frames on damage). Also records window.open features so a popup can be
// given the size it asked for (Playwright otherwise gives every page the context viewport).
const CAPTURE_INIT = `(() => {
  try {
    if (!window.__nxOpenSpy) {
      window.__nxOpenSpy = 1;
      const open = window.open;
      window.open = function (url, target, features) { try { window.__nxLastOpen = { at: Date.now(), features: String(features || '') }; } catch (e) {} return open.apply(this, arguments); };
    }
  } catch (e) {}
  // Guard on the document, not the window: window.open(url) reuses the initial about:blank Window for the real document.
  if (window.top !== window || document.__nxKeepAlive) return;
  document.__nxKeepAlive = 1;
  let el = null;
  const mount = () => {
    if (window.__nxKeepAliveOff) { if (el) el.remove(); return; }
    const root = document.documentElement;
    if (!root) return void setTimeout(mount, 16);
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', margin: '0', padding: '0', border: '0',
        background: '#000', opacity: '0', pointerEvents: 'none', zIndex: '2147483646', willChange: 'opacity' });
      el.animate([{ opacity: 0 }, { opacity: 0.01 }], { duration: 500, iterations: Infinity, direction: 'alternate' });
    }
    if (!el.isConnected) root.appendChild(el);
    setTimeout(mount, 500);
  };
  mount();
})();`;

/** Width/height of a baseline or progressive JPEG from its SOF marker. */
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function parseOpenSize(features) {
  const w = /(?:^|,)\s*(?:inner)?width\s*=\s*(\d+)/i.exec(features);
  const h = /(?:^|,)\s*(?:inner)?height\s*=\s*(\d+)/i.exec(features);
  return w && h ? { width: Number(w[1]), height: Number(h[1]) } : null;
}

export class Take {
  constructor(context, dir, opts = {}) {
    this.context = context;
    this.dir = resolve(dir);
    this.opts = { quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1, keepAlive: true, fitWindow: true, popupSize: null,
      log: (m) => console.log(m), ...opts };
    this.pages = new Map(); // Page → state
    this.stack = []; // active page ids, top = in front
    this.pending = new Set();
    this.nextId = 0;
    this.lastEventT = 0;
    this.stopped = false;
    this.onPage = (page) => { this.attach(page, false).catch((e) => this.opts.log(`recorder: attach failed: ${tilde(e.message.split('\n')[0])}`)); };
  }

  /** Milliseconds since take start (monotonic). */
  now() { return Math.max(0, Math.round(performance.now() - this.perf0)); }

  async start() {
    mkdirSync(join(this.dir, 'frames'), { recursive: true });
    this.framesOut = createWriteStream(join(this.dir, 'frames.jsonl'));
    this.eventsOut = createWriteStream(join(this.dir, 'events.jsonl'));
    this.perf0 = performance.now();
    this.wall0 = Date.now();
    this.started = new Date(this.wall0).toISOString();
    this.initContent = (this.opts.keepAlive ? '' : 'window.__nxKeepAliveOff = 1;\n') + CAPTURE_INIT;
    this.init = await this.context.addInitScript({ content: this.initContent });
    const existing = this.context.pages();
    if (!existing.length) throw new Error('startTake: the context has no page; open one first');
    for (const page of existing) {
      await page.evaluate(this.initContent).catch(() => {});
      await this.attach(page, true);
    }
    this.context.on('page', this.onPage);
    const first = this.pages.get(existing[0]);
    this.activate(first.id, 0);
    await Promise.race([first.firstFrame, new Promise((r) => setTimeout(r, 5000))]);
    if (!first.frames) this.opts.log('recorder: warning: no frame from p0 within 5 s');
    else if (first.w && first.w < 2 * (first.page.viewportSize()?.width ?? 0)) {
      this.opts.log(`recorder: warning: frames are ${first.w} px wide, not 2× the viewport: launch with CAPTURE_LAUNCH (--force-device-scale-factor=2)`);
    }
    return this;
  }

  async attach(page, initial) {
    if (this.stopped || this.pages.has(page)) return;
    const st = { id: `p${this.nextId++}`, page, initial, seq: 0, lastT: 0, frames: 0, opened: initial, closed: false, session: null,
      fitted: !this.opts.fitWindow, fitting: false, fitTries: 0 };
    st.firstFrame = new Promise((r) => { st.gotFirst = r; });
    this.pages.set(page, st);
    mkdirSync(join(this.dir, 'frames', st.id), { recursive: true });
    page.on('close', () => this.onClose(st));
    // Re-inject per document: when window.open(url) reuses the about:blank Window, Chrome does not re-run init scripts for the real page.
    page.on('domcontentloaded', () => { if (!this.stopped) page.evaluate(this.initContent).catch(() => {}); });
    if (!initial) {
      const size = this.opts.popupSize ?? (await this.requestedSize(page));
      if (size) await page.setViewportSize(size).catch(() => {});
    }
    if (page.isClosed() || this.stopped) return;
    st.session = await this.context.newCDPSession(page);
    st.session.on('Page.screencastFrame', (f) => this.onFrame(st, f));
    await st.session.send('Page.startScreencast', this.screencastParams());
  }

  screencastParams() {
    const { quality, maxWidth, maxHeight, everyNthFrame } = this.opts;
    return { format: 'jpeg', quality, maxWidth, maxHeight, everyNthFrame };
  }

  // The screencast captures the window's view, which in headless Chrome is smaller than the emulated viewport (simulated browser UI:
  // 1920×993 for 1920×1080). Grow the window by the difference, restart the screencast, and drop frames until view = viewport.
  async fit(st, md) {
    if (st.fitting) return;
    st.fitting = true;
    const want = st.page.viewportSize();
    const dw = want ? want.width - Math.round(md.deviceWidth ?? want.width) : 0;
    const dh = want ? want.height - Math.round(md.deviceHeight ?? want.height) : 0;
    if ((!dw && !dh) || st.fitTries >= 3) {
      if (dw || dh) this.opts.log(`recorder: warning: ${st.id} view ${md.deviceWidth}×${md.deviceHeight} ≠ viewport ${want.width}×${want.height}`);
      st.fitted = true;
      st.fitting = false;
      return;
    }
    st.fitTries++;
    try {
      const { windowId, bounds } = await st.session.send('Browser.getWindowForTarget');
      if (bounds.windowState && bounds.windowState !== 'normal') await st.session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await st.session.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + dw, height: bounds.height + dh } });
      await st.session.send('Page.stopScreencast');
      await st.session.send('Page.startScreencast', this.screencastParams());
    } catch (e) {
      this.opts.log(`recorder: warning: cannot fit ${st.id} window: ${e.message.split('\n')[0]}`);
      st.fitted = true;
    }
    st.fitting = false;
  }

  /** Size a popup asked for in window.open(url, name, "width=…,height=…"), read from its opener's frames. */
  async requestedSize(page) {
    const opener = await page.opener().catch(() => null);
    if (!opener) return null;
    let best = null;
    for (const f of opener.frames()) {
      const v = await f.evaluate(() => window.__nxLastOpen || null).catch(() => null);
      if (v && (!best || v.at > best.at)) best = v;
    }
    return best ? parseOpenSize(best.features) : null;
  }

  onFrame(st, f) {
    st.session.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    if (this.stopped || st.closed) return;
    const md = f.metadata ?? {};
    if (!st.fitted) { this.fit(st, md).catch(() => {}); if (!st.fitted) return; }
    const now = this.now();
    // Frame swap time (wall clock, s) mapped onto the take clock; arrival time if absent or implausible.
    let t = md.timestamp ? Math.round(md.timestamp * 1000 - this.wall0) : now;
    if (!(Math.abs(t - now) < 2000)) t = now;
    t = Math.max(t, st.lastT);
    st.lastT = t;
    const buf = Buffer.from(f.data, 'base64');
    const size = jpegSize(buf) ?? { w: Math.round((md.deviceWidth ?? 0) * 2), h: Math.round((md.deviceHeight ?? 0) * 2) };
    const file = `frames/${st.id}/${String(st.seq++).padStart(6, '0')}.jpg`;
    const p = writeFile(join(this.dir, file), buf).catch((e) => this.opts.log(`recorder: write failed ${file}: ${e.code ?? e.message}`));
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
    this.framesOut.write(`${JSON.stringify({ t, page: st.id, file, w: size.w, h: size.h })}\n`);
    st.frames++;
    st.w = size.w;
    if (st.frames === 1) st.gotFirst();
    if (!st.opened) {
      // A popup is "open" from its first frame on, so a reader always has a frame for it once it is active.
      st.opened = true;
      this.event('popup_open', { page: st.id, w: Math.round(md.deviceWidth ?? size.w / 2), h: Math.round(md.deviceHeight ?? size.h / 2) }, t);
      this.activate(st.id, t);
    }
  }

  onClose(st) {
    if (st.closed) return;
    st.closed = true;
    if (this.stopped) return;
    if (!st.initial && st.opened) this.event('popup_close', { page: st.id });
    const wasFront = this.stack[this.stack.length - 1] === st.id;
    this.stack = this.stack.filter((id) => id !== st.id);
    if (wasFront && this.stack.length) this.event('active', { page: this.stack[this.stack.length - 1] });
  }

  activate(id, t) {
    if (this.stack[this.stack.length - 1] === id) return;
    this.stack = this.stack.filter((x) => x !== id);
    this.stack.push(id);
    this.event('active', { page: id }, t);
  }

  /** Mark `page` as the one in front from now on (e.g. after bringToFront on a second tab). */
  setActive(page) { const st = this.pages.get(page); if (st) this.activate(st.id); }

  /** Page id ("p0", "p1", …) of a page in this take. */
  pageId(page) { return this.pages.get(page)?.id ?? null; }

  /** Append {t, type, ...data} to events.jsonl. t is the take clock (ms), never decreasing. Returns t. */
  event(type, data = {}, at) {
    if (this.stopped) return null;
    const t = Math.max(at ?? this.now(), this.lastEventT);
    this.lastEventT = t;
    this.eventsOut.write(`${JSON.stringify({ ...data, t, type })}\n`);
    return t;
  }

  async stop() {
    if (this.stopped) return this.summary;
    const end = this.now();
    this.event('mark', { label: 'take_end', data: {} });
    this.stopped = true;
    this.context.off('page', this.onPage);
    for (const st of this.pages.values()) {
      if (!st.session) continue;
      await st.session.send('Page.stopScreencast').catch(() => {});
      await st.session.detach().catch(() => {});
    }
    await Promise.allSettled([...this.pending]);
    await this.init?.dispose?.().catch?.(() => {});
    for (const st of this.pages.values()) {
      if (!st.page.isClosed()) await st.page.evaluate(() => { window.__nxKeepAliveOff = 1; }).catch(() => {});
    }
    await Promise.all([this.framesOut, this.eventsOut].map((s) => new Promise((r) => s.end(r))));
    const frames = Object.fromEntries([...this.pages.values()].map((st) => [st.id, st.frames]));
    let bytes = 0;
    for (const id of Object.keys(frames)) {
      for (const f of readdirSync(join(this.dir, 'frames', id))) bytes += statSync(join(this.dir, 'frames', id, f)).size;
    }
    this.summary = { version: 1, started: this.started, duration_ms: end, frames, bytes, quality: this.opts.quality,
      max: [this.opts.maxWidth, this.opts.maxHeight], everyNthFrame: this.opts.everyNthFrame };
    await writeFile(join(this.dir, 'take.json'), `${JSON.stringify(this.summary, null, 2)}\n`);
    return this.summary;
  }
}

let current = null;

/** Start recording every page of `context` (and any page it opens later) into `dir`. One take at a time. */
export async function startTake(context, dir, opts = {}) {
  if (current) throw new Error('startTake: a take is already running');
  const take = new Take(context, dir, opts);
  await take.start();
  current = take;
  return take;
}
/** Log an event on the running take (no-op without one, so a rehearsal can run the same script unrecorded). */
export const event = (type, data = {}) => current?.event(type, data) ?? null;
export const pageId = (page) => current?.pageId(page) ?? 'p0';
export const setActive = (page) => current?.setActive(page);
export const currentTake = () => current;
export async function stopTake() {
  const take = current;
  current = null;
  return take ? take.stop() : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Self-test: 20 s take on https://nectarlabs.io + the terminal page (`echo ok`) + a sized popup, throwaway profile, then gapcheck.
async function selftest(argDir, nth, max) {
  const { createRequire } = await import('node:module');
  const { spawn } = await import('node:child_process');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const human = await import('./human.mjs');
  const { gapcheck, printReport } = await import('./gapcheck.mjs');
  const here = fileURLToPath(new URL('.', import.meta.url));
  const { chromium } = createRequire('/Volumes/T7/nectar-labs/apps/web/package.json')('@playwright/test');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const dir = resolve(argDir ?? defaultTakeDir(`selftest-${stamp}`));
  const term = spawn(process.execPath, [join(here, 'terminal', 'server.mjs'), '--port', '0', '--cmd', 'echo ok'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const termUrl = await new Promise((ok, bad) => {
    term.stdout.on('data', (d) => { const m = /http:\/\/127\.0\.0\.1:\d+\//.exec(String(d)); if (m) ok(m[0]); });
    term.on('exit', (c) => bad(new Error(`terminal server exited ${c}`)));
  });
  const profile = mkdtempSync(join(tmpdir(), 'nx-capture-profile-'));
  const ctx = await chromium.launchPersistentContext(profile, { ...CAPTURE_LAUNCH });
  const t0 = Date.now();
  try {
    await human.installCursor(ctx);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('https://nectarlabs.io', { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    await startTake(ctx, dir, { everyNthFrame: nth, maxWidth: max[0], maxHeight: max[1] });
    human.section(1, 'Self-test', 'Capture self-test');
    await human.moveTo(page, { x: 1300, y: 640 });
    const heading = page.locator('h1').first();
    await human.moveTo(page, heading);
    await human.box(page, 'heading', heading);
    await human.hold(1200, 'read heading');
    const link = page.locator('header a:visible, nav a:visible').nth(1);
    await human.moveTo(page, link);
    await human.box(page, 'nav link', link);
    await page.waitForTimeout(600);
    human.zoomOut();
    human.sectionEnd(1);

    human.section(2, 'Terminal', '');
    await page.goto(termUrl, { waitUntil: 'load' });
    await human.click(page, page.locator('#term'));
    await human.type(page, 'echo ok');
    await human.press(page, 'Enter');
    await human.wait('echo ok', page.locator('.out', { hasText: 'ok' }).first().waitFor({ timeout: 10_000 }));
    await human.hold(1000, 'read output');

    const popupP = ctx.waitForEvent('page');
    await page.evaluate((u) => { window.open(u, 'nx-popup', 'popup,width=480,height=640'); }, termUrl);
    const pop = await popupP;
    await pop.waitForLoadState('load');
    await human.moveTo(pop, pop.locator('#term'));
    await human.click(pop, pop.locator('#term'));
    await human.type(pop, 'echo ok');
    await human.press(pop, 'Enter');
    await human.wait('popup echo', pop.locator('.out', { hasText: 'ok' }).first().waitFor({ timeout: 10_000 }));
    const inner = await pop.evaluate(() => [innerWidth, innerHeight]);
    await human.hold(800, 'read popup');
    await pop.close();
    await human.moveTo(page, { x: 960, y: 700 });
    await page.waitForTimeout(Math.max(500, 20_000 - (Date.now() - t0)));
    human.sectionEnd(2);
    const sum = await stopTake();
    const report = gapcheck(dir);
    printReport(report);
    const total = Object.values(sum.frames).reduce((a, b) => a + b, 0);
    console.log(`selftest: take ${tilde(dir)} · ${(sum.duration_ms / 1000).toFixed(1)} s · ${total} frames ${JSON.stringify(sum.frames)} · ` +
      `${(sum.bytes / 1e6).toFixed(1)} MB · everyNthFrame ${nth} · max ${max.join('x')} · popup inner ${inner.join('×')} · ${report.pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = report.pass ? 0 : 1;
  } finally {
    if (current) await stopTake().catch(() => {});
    await ctx.close().catch(() => {});
    term.kill('SIGTERM');
    rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const ni = argv.indexOf('--nth');
  const nth = ni >= 0 ? Number(argv.splice(ni, 2)[1]) : 1;
  const mi = argv.indexOf('--max');
  const max = (mi >= 0 ? argv.splice(mi, 2)[1] : '3840x2160').split('x').map(Number);
  const [cmd, arg] = argv;
  // No top-level await: human.mjs imports this module, and a pending TLA here would deadlock that cycle.
  if (cmd === 'selftest') selftest(arg, nth, max).catch((e) => { console.error(`selftest: ${tilde(e.stack ?? e)}`); process.exitCode = 1; });
  else { console.error('usage: node scripts/demo/capture/recorder.mjs selftest [takeDir] [--nth 1|2|3] [--max 3840x2160]'); process.exitCode = 2; }
}
