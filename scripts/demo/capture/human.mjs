// WO-35a: human-looking input for demo takes. A drawn cursor (CDP screencast never shows the OS cursor), eased curved mouse paths,
// pauses before clicks, varied typing, and the take events the edit needs (box, hold, wait, section…). All events go through recorder.mjs;
// without a running take the helpers still drive the page (rehearsal) and log nothing.
import { performance } from 'node:perf_hooks';
import * as rec from './recorder.mjs';

// In-page cursor, top frame only. Built with DOM APIs (no innerHTML, no <style>) so page CSP / Trusted Types do not block it. It sits in the
// top layer as a manual popover (above modal dialogs and popovers opened later) with z-index max as the fallback. It follows real mousemove
// events; human.mjs also places it explicitly, because mousemove over an iframe never reaches the top document.
const CURSOR_INIT = `(() => {
  if (window.top !== window || document.__nxCursor) return; // per document: window.open(url) reuses the about:blank Window
  document.__nxCursor = 1;
  const NS = 'http://www.w3.org/2000/svg';
  let root = null, ring = null, x = 0, y = 0, shown = false, lastRing = 0, topN = -1;
  const make = () => {
    root = document.createElement('div');
    root.setAttribute('aria-hidden', 'true');
    try { root.popover = 'manual'; } catch (e) {}
    Object.assign(root.style, { inset: 'auto', position: 'fixed', left: '0', top: '0', width: '0', height: '0', margin: '0', padding: '0',
      border: '0', background: 'transparent', overflow: 'visible', pointerEvents: 'none', zIndex: '2147483647', opacity: '0',
      transform: 'translate3d(-200px,-200px,0)', willChange: 'transform', color: 'inherit' });
    ring = document.createElement('div');
    Object.assign(ring.style, { position: 'absolute', left: '-17px', top: '-17px', width: '34px', height: '34px', borderRadius: '50%',
      border: '2px solid rgba(22,243,169,.9)', background: 'rgba(22,243,169,.14)', boxSizing: 'border-box', opacity: '0', pointerEvents: 'none' });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '24'); svg.setAttribute('height', '34'); svg.setAttribute('viewBox', '0 0 24 34');
    Object.assign(svg.style, { position: 'absolute', left: '-3px', top: '-2px', overflow: 'visible', filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,.5))' });
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M3 2 L3 26.5 L8.9 20.9 L12.9 30.2 L16.9 28.5 L13 19.4 L21 19.4 Z');
    path.setAttribute('fill', '#0b0d10'); path.setAttribute('stroke', '#ffffff'); path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    root.append(ring, svg);
  };
  const raise = () => {
    if (!root.hasAttribute('popover')) return;
    try { if (root.matches(':popover-open')) root.hidePopover(); root.showPopover(); } catch (e) { root.removeAttribute('popover'); }
  };
  const mount = () => {
    if (!document.documentElement) return false;
    if (!root) make();
    if (!root.isConnected) { document.documentElement.appendChild(root); raise(); }
    return true;
  };
  const at = (nx, ny) => {
    x = nx; y = ny;
    if (!mount()) return;
    root.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    if (!shown) { shown = true; root.style.opacity = '1'; }
  };
  const ringNow = () => {
    const n = performance.now();
    if (n - lastRing < 150 || !mount()) return;
    lastRing = n;
    ring.animate([{ opacity: 0.95, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.2)' }], { duration: 460, easing: 'cubic-bezier(.2,.7,0,1)' });
  };
  addEventListener('mousemove', (e) => at(e.clientX, e.clientY), { capture: true, passive: true });
  addEventListener('mousedown', ringNow, { capture: true, passive: true });
  addEventListener('pagehide', () => { try { if (shown) sessionStorage.setItem('__nxc', x + ',' + y); } catch (e) {} });
  setInterval(() => {
    if (!mount()) return;
    let n = 0;
    try { n = document.querySelectorAll('dialog:modal, :popover-open').length; } catch (e) {}
    if (n !== topN) { raise(); topN = n; }
  }, 100);
  Object.defineProperty(window, '__nxCursor', { configurable: true, writable: true, value: { at, ring: ringNow, hide: () => { if (root) root.style.opacity = '0'; shown = false; } } });
  try { const s = sessionStorage.getItem('__nxc'); if (s) { const [a, b] = s.split(',').map(Number); const go = () => (mount() ? at(a, b) : setTimeout(go, 16)); go(); } } catch (e) {}
})();`;

const pos = new WeakMap(); // Page → {x, y} last cursor point in CSS px
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // cubic in-out
const r1 = (v) => Math.round(v * 10) / 10;
const isLocator = (t) => t && typeof t.boundingBox === 'function';

function viewport(page) { return page.viewportSize() ?? { width: 1920, height: 1080 }; }
function lastPos(page) {
  if (!pos.has(page)) { const v = viewport(page); pos.set(page, { x: Math.round(v.width * 0.6), y: Math.round(v.height * 0.62) }); }
  return pos.get(page);
}
const place = (page, x, y) => page.evaluate(([px, py]) => window.__nxCursor?.at(px, py), [x, y]).catch(() => {});

function track(page) {
  const { x, y } = lastPos(page);
  place(page, x, y);
  // Re-inject on every document: when window.open(url) reuses the about:blank Window, Chrome does not re-run init scripts for the real page.
  page.on('domcontentloaded', async () => { await page.evaluate(CURSOR_INIT).catch(() => {}); const p = lastPos(page); place(page, p.x, p.y); });
}

/** Draw the cursor + click ring in every page of `context`, including pages (popups) opened later. Call once, before startTake. */
export async function installCursor(context) {
  await context.addInitScript({ content: CURSOR_INIT });
  for (const page of context.pages()) { await page.evaluate(CURSOR_INIT).catch(() => {}); track(page); }
  context.on('page', track);
}

/** Scroll by `dy` CSS px with eased wheel steps at the cursor (a hand on a trackpad, not a jump). */
export async function scroll(page, dy, opts = {}) {
  const dur = opts.ms ?? clamp(380 + Math.abs(dy) * 0.4, 400, 1100);
  const n = Math.max(2, Math.round(dur / (1000 / 60)));
  const t0 = performance.now();
  let done = 0;
  for (let i = 1; i <= n; i++) {
    const want = dy * ease(i / n);
    const wait = t0 + (i * dur) / n - performance.now();
    if (wait > 1) await sleep(wait);
    await page.mouse.wheel(0, want - done);
    done = want;
  }
  await sleep(160);
}

async function ensureInView(page, loc) {
  await loc.waitFor({ state: 'visible', timeout: 10_000 });
  const v = viewport(page);
  let b = await loc.boundingBox();
  if (b && (b.y < 0 || b.y + b.height > v.height)) { // only when actually (partly) off screen; fixed headers stay put
    await scroll(page, b.y + b.height / 2 - v.height * 0.45);
    b = await loc.boundingBox();
    if (b && (b.y < 0 || b.y + b.height > v.height)) { await loc.scrollIntoViewIfNeeded(); b = await loc.boundingBox(); }
  }
  if (!b) throw new Error('moveTo: element has no box');
  return b;
}

async function resolvePoint(page, target) {
  if (!isLocator(target)) return { x: target.x, y: target.y, box: null };
  const b = await ensureInView(page, target);
  const jx = Math.min(b.width * 0.15, 12), jy = Math.min(b.height * 0.15, 5);
  return { x: r1(b.x + b.width / 2 + rnd(-jx, jx)), y: r1(b.y + b.height / 2 + rnd(-jy, jy)), box: b };
}

/** Move the mouse to a locator (near its centre) or a {x,y} point: cubic in-out on a slightly curved path, 300–800 ms by distance, ~60 Hz. */
export async function moveTo(page, target, opts = {}) {
  const to = await resolvePoint(page, target);
  const from = lastPos(page);
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
  if (dist < 2) { await page.mouse.move(to.x, to.y); place(page, to.x, to.y); pos.set(page, { x: to.x, y: to.y }); return to; }
  const dur = opts.ms ?? clamp(300 + dist * 0.3 + rnd(-30, 30), 300, 800);
  const bend = rnd(0.05, 0.14) * (Math.random() < 0.5 ? -1 : 1) * Math.min(dist, 700);
  const cx = from.x + dx / 2 - (dy / dist) * bend, cy = from.y + dy / 2 + (dx / dist) * bend;
  const n = Math.max(2, Math.round(dur / (1000 / 60)));
  const t0 = performance.now();
  for (let i = 1; i <= n; i++) {
    const u = ease(i / n), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    const x = r1(a * from.x + b * cx + c * to.x), y = r1(a * from.y + b * cy + c * to.y);
    const wait = t0 + (i * dur) / n - performance.now();
    if (wait > 1) await sleep(wait);
    await page.mouse.move(x, y);
    place(page, x, y); // pipelined, not awaited: keeps the drawn cursor moving over iframes too
  }
  pos.set(page, { x: to.x, y: to.y });
  return to;
}

/** moveTo + 150–300 ms pause + click (click ring shows). With a locator Playwright's actionability checks still apply. */
export async function click(page, target, opts = {}) {
  const to = await moveTo(page, target, opts);
  await sleep(rnd(150, 300));
  await page.evaluate(() => window.__nxCursor?.ring()).catch(() => {});
  const delay = Math.round(rnd(60, 110));
  if (isLocator(target)) {
    const b = (await target.boundingBox()) ?? to.box;
    const position = { x: clamp(to.x - b.x, 1, Math.max(1, b.width - 1)), y: clamp(to.y - b.y, 1, Math.max(1, b.height - 1)) };
    await target.click({ position, delay, timeout: opts.timeout ?? 10_000 });
  } else {
    await page.mouse.down(); await sleep(delay); await page.mouse.up();
  }
  rec.event('mark', { label: 'click', data: { page: rec.pageId(page), x: to.x, y: to.y, ...(opts.label ? { what: opts.label } : {}) } });
  return to;
}

/** Type into the focused element, one key at a time, 50–120 ms per key (varied). Never fill or paste. Logs the length, not the text. */
export async function type(page, text, opts = {}) {
  rec.event('mark', { label: 'type', data: { page: rec.pageId(page), chars: [...text].length, ...(opts.label ? { what: opts.label } : {}) } });
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(ch === ' ' || /[.,:;/-]/.test(ch) ? rnd(85, 120) : rnd(50, 110));
  }
}

/** A short human pause, then press a key (Enter, Tab…). */
export async function press(page, key) {
  await sleep(rnd(200, 380));
  await page.keyboard.press(key, { delay: Math.round(rnd(40, 90)) });
}

/** A deliberate reading pause (never sped up in the edit). */
export async function hold(ms, label = '') {
  rec.event('hold', { ms, label });
  await sleep(ms);
}

/** Log the element's box (CSS px of that page) as the camera's zoom target. Accepts a locator or {x,y,w,h}. */
export async function box(page, label, target) {
  const b = isLocator(target) ? await target.boundingBox() : { x: target.x, y: target.y, width: target.w ?? target.width, height: target.h ?? target.height };
  if (!b) throw new Error(`box ${label}: element has no box`);
  rec.event('box', { label, page: rec.pageId(page), x: r1(b.x), y: r1(b.y), w: r1(b.width), h: r1(b.height) });
  return b;
}

/** A real wait (tx confirmation…): wait_start/wait_end around a promise or async fn; > 2 s is sped up in the edit. Returns its value. */
export async function wait(label, work) {
  rec.event('wait_start', { label });
  try {
    const v = await (typeof work === 'function' ? work() : work);
    rec.event('wait_end', { label });
    return v;
  } catch (e) {
    rec.event('wait_end', { label, ok: false });
    throw e;
  }
}

export const section = (id, title, caption = '') => rec.event('section', { id, title, caption });
export const sectionEnd = (id) => rec.event('section_end', { id });
export const zoomOut = () => rec.event('zoom_out', {});
export const mark = (label, data = {}) => rec.event('mark', { label, data });
