// WO-35a: human-looking input for demo takes. A drawn cursor (CDP screencast never shows the OS cursor), eased curved mouse paths,
// pauses before clicks, varied typing, and the take events the edit needs (box, hold, wait, section…). All events go through recorder.mjs;
// without a running take the helpers still drive the page (rehearsal) and log nothing.
// WO-35d: every cursor sample sent is logged (`cursor {page,x,y,m}`, `click {page,x,y}`), and page-content motion is bracketed by
// `motion_start/motion_end {kind: move|scroll|drag|type}`. With CURSOR_POST=1 (take.mjs default) no DOM cursor is injected: compose.mjs draws
// the cursor and click ring from those events at output frame times, so it moves at 30 fps whatever the page does. CURSOR_POST=0 (or unset)
// keeps the in-page DOM cursor.
import { performance } from 'node:perf_hooks';
import * as rec from './recorder.mjs';

/** Post-drawn cursor (compose.mjs) instead of the in-page DOM cursor. Read per call, so a script may set it before installCursor. */
export const postCursor = () => process.env.CURSOR_POST === '1';

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

const tracked = new Set(); // pages seen by installCursor (section start logs their cursor position)
const openerOf = new WeakMap(); // popup Page → opener Page
let motionSeq = 0;

function viewport(page) { return page.viewportSize() ?? { width: 1920, height: 1080 }; }

// Where compose.mjs draws a popup over the app frame (placePopup: centred, at most 92 % × 86 % of the frame, never upscaled), in the
// opener's CSS px. Used so the cursor keeps its place on screen when a popup comes to the front or closes.
function popupPlacement(op, page) {
  const ov = viewport(op), v = viewport(page);
  const s = Math.min(1, (ov.width * 0.92) / v.width, (ov.height * 0.86) / v.height);
  return { s, x: (ov.width - v.width * s) / 2, y: (ov.height - v.height * s) / 2 };
}

function lastPos(page) {
  if (!pos.has(page)) {
    const op = openerOf.get(page);
    if (op && pos.has(op) && !op.isClosed()) { // a popup: start where the cursor already is on screen (may lie outside the popup)
      const pl = popupPlacement(op, page), o = pos.get(op);
      pos.set(page, { x: r1((o.x - pl.x) / pl.s), y: r1((o.y - pl.y) / pl.s) });
    } else {
      const v = viewport(page);
      pos.set(page, { x: Math.round(v.width * 0.6), y: Math.round(v.height * 0.62) });
    }
  }
  return pos.get(page);
}
const place = (page, x, y) => page.evaluate(([px, py]) => window.__nxCursor?.at(px, py), [x, y]).catch(() => {});

/** Log a cursor sample (CSS px of `page`) on the running take; `m` = the motion it belongs to (compose interpolates within one motion). */
function logCursor(page, x, y, m = 0, at) {
  const id = rec.takePageId(page);
  if (id) rec.event('cursor', { page: id, x: r1(x), y: r1(y), ...(m ? { m } : {}) }, at ?? undefined);
}
function motionStart(kind, page) {
  const m = ++motionSeq;
  rec.event('motion_start', { kind, page: rec.takePageId(page), m });
  return m;
}
const motionEnd = (kind, m) => rec.event('motion_end', { kind, m });

/** The real mouse stays inside the viewport; the logged (drawn) path may start outside a popup. */
async function mouseTo(page, x, y) {
  const v = viewport(page);
  await page.mouse.move(clamp(x, 0, v.width - 1), clamp(y, 0, v.height - 1));
}

function track(page) {
  if (tracked.has(page)) return;
  tracked.add(page);
  page.opener().then((op) => {
    if (op) openerOf.set(page, op);
    if (!postCursor()) { const p = lastPos(page); place(page, p.x, p.y); }
  }).catch(() => {});
  page.on('close', () => {
    tracked.delete(page);
    // Popup closed: the cursor stays where it was on screen, now over the opener.
    const op = openerOf.get(page);
    if (!op || op.isClosed() || !pos.has(page)) return;
    const pl = popupPlacement(op, page), p = pos.get(page);
    const x = r1(pl.x + p.x * pl.s), y = r1(pl.y + p.y * pl.s);
    pos.set(op, { x, y });
    logCursor(op, x, y);
  });
  if (postCursor()) return;
  // Re-inject on every document: when window.open(url) reuses the about:blank Window, Chrome does not re-run init scripts for the real page.
  page.on('domcontentloaded', async () => { await page.evaluate(CURSOR_INIT).catch(() => {}); const p = lastPos(page); place(page, p.x, p.y); });
}

/** Track every page of `context`, including pages (popups) opened later. Call once, before startTake. With CURSOR_POST=0 this also draws
 *  the in-page DOM cursor + click ring; with CURSOR_POST=1 nothing is injected (compose.mjs draws the cursor from the logged samples). */
export async function installCursor(context) {
  if (!postCursor()) {
    await context.addInitScript({ content: CURSOR_INIT });
    for (const page of context.pages()) await page.evaluate(CURSOR_INIT).catch(() => {});
  }
  for (const page of context.pages()) track(page);
  context.on('page', track);
}

/** Wait for the page to render a frame (double rAF), at most `ms`. */
export const frame = (page, ms = 400) => Promise.race([
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))).catch(() => {}),
  sleep(ms),
]);

/**
 * Wait (logged as a take `wait`, label "settle <label>") until the page paints smoothly again: `frames` consecutive rAF intervals ≤
 * `maxFrameMs`, and, with `selector`, no DOM change inside it for `quietMs` (stable text, e.g. a preview recomputing). At most `timeout`.
 * Use after a click that opens a window/panel, and after typing into a field that drives a preview. Returns {ms, timedOut} or null.
 */
export async function settle(page, label = '', opts = {}) {
  const { selector = null, quietMs = selector ? 350 : 0, frames: n = 6, maxFrameMs = 40, timeout = 4000 } = opts;
  return wait(`settle${label ? ` ${label}` : ''}`, page.evaluate(([sel, quiet, need, maxMs, cap]) => new Promise((resolve) => {
    const t0 = performance.now();
    let lastMut = t0, good = 0, last = t0;
    const root = sel ? document.querySelector(sel) : null;
    const mo = root ? new MutationObserver(() => { lastMut = performance.now(); }) : null;
    mo?.observe(root, { subtree: true, childList: true, characterData: true });
    const tick = (now) => {
      good = now - last <= maxMs ? good + 1 : 0;
      last = now;
      const over = now - t0 > cap;
      if ((good >= need && now - lastMut >= quiet) || over) { mo?.disconnect(); resolve({ ms: Math.round(now - t0), timedOut: over }); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), [selector, quietMs, n, maxFrameMs, timeout]).catch(() => null));
}

/** Scroll by `dy` CSS px with eased wheel steps at the cursor (a hand on a trackpad, not a jump). Logged as motion `scroll`. */
export async function scroll(page, dy, opts = {}) {
  const dur = opts.ms ?? clamp(380 + Math.abs(dy) * 0.4, 400, 1100);
  const n = Math.max(2, Math.round(dur / (1000 / 60)));
  const m = motionStart('scroll', page);
  const t0 = performance.now();
  let done = 0;
  try {
    for (let i = 1; i <= n; i++) {
      const want = dy * ease(i / n);
      const wait = t0 + (i * dur) / n - performance.now();
      if (wait > 1) await sleep(wait);
      await page.mouse.wheel(0, want - done);
      done = want;
    }
    await sleep(160); // smooth scrolling settles after the last wheel step
  } finally {
    motionEnd('scroll', m);
  }
}

async function ensureInView(page, loc) {
  await loc.waitFor({ state: 'visible', timeout: 10_000 });
  const v = viewport(page);
  let b = await loc.boundingBox();
  // In a popup (a small wallet window), a target at least 16 px of which is on screen is used as it is: the point goes in its visible
  // part (Playwright's click then does not scroll either). Scrolling the Intear popup stalls it for ~250 ms mid-scroll (WO-35d measure-2).
  if (b && openerOf.has(page)) {
    const y0 = Math.max(b.y, 2), y1 = Math.min(b.y + b.height, v.height - 2);
    if (y1 - y0 >= 16 && (b.y < 0 || b.y + b.height > v.height)) return { x: b.x, y: y0, width: b.width, height: y1 - y0 };
  }
  if (b && (b.y < 0 || b.y + b.height > v.height)) { // only when actually (partly) off screen; fixed headers stay put
    // WO-35d: partly visible → scroll only as far as needed (short and gentle); far away → bring it to 45 % of the height. Never wheel
    // past the end of its scroller: elastic overscroll bounces on camera (the wallet popup's Cancel sits a few px below the fold).
    const margin = Math.min(48, v.height * 0.08);
    let dy = b.y < v.height && b.y + b.height > v.height ? b.y + b.height - v.height + margin
      : b.y < 0 && b.y + b.height > 0 ? b.y - margin
        : b.y + b.height / 2 - v.height * 0.45;
    const room = await loc.evaluate((el) => {
      for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
        if (/(auto|scroll|overlay)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1) return { up: e.scrollTop, down: e.scrollHeight - e.clientHeight - e.scrollTop };
      }
      const e = document.scrollingElement || document.documentElement;
      return { up: e.scrollTop, down: e.scrollHeight - e.clientHeight - e.scrollTop };
    }).catch(() => null);
    if (room) dy = clamp(dy, -room.up, room.down);
    if (Math.abs(dy) >= 1) await scroll(page, dy);
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

/**
 * Move the mouse to a locator (near its centre) or a {x,y} point: cubic in-out on a slightly curved path, 300–800 ms by distance, ~60 Hz.
 * Logs motion `move` and one `cursor` sample per step at its planned time on the take clock (so a page stall that delays the CDP input
 * does not bend the drawn path; the real mouse catches up).
 */
export async function moveTo(page, target, opts = {}) {
  const to = await resolvePoint(page, target);
  const from = lastPos(page);
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
  if (dist < 2) {
    await mouseTo(page, to.x, to.y);
    if (!postCursor()) place(page, to.x, to.y);
    logCursor(page, to.x, to.y);
    pos.set(page, { x: to.x, y: to.y });
    return to;
  }
  const dur = opts.ms ?? clamp(300 + dist * 0.3 + rnd(-30, 30), 300, 800);
  const bend = rnd(0.05, 0.14) * (Math.random() < 0.5 ? -1 : 1) * Math.min(dist, 700);
  const cx = from.x + dx / 2 - (dy / dist) * bend, cy = from.y + dy / 2 + (dx / dist) * bend;
  const n = Math.max(2, Math.round(dur / (1000 / 60)));
  const m = motionStart('move', page);
  const t0 = performance.now(), T0 = rec.now();
  const at = (i) => (T0 === null ? undefined : Math.round(T0 + (i * dur) / n));
  logCursor(page, from.x, from.y, m, at(0));
  try {
    for (let i = 1; i <= n; i++) {
      const u = ease(i / n), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      const x = r1(a * from.x + b * cx + c * to.x), y = r1(a * from.y + b * cy + c * to.y);
      const wait = t0 + (i * dur) / n - performance.now();
      if (wait > 1) await sleep(wait);
      logCursor(page, x, y, m, at(i));
      await mouseTo(page, x, y);
      if (!postCursor()) place(page, x, y); // pipelined, not awaited: keeps the drawn cursor moving over iframes too
    }
  } finally {
    motionEnd('move', m);
  }
  pos.set(page, { x: to.x, y: to.y });
  return to;
}

/** moveTo + 150–300 ms pause + click (click ring shows). With a locator Playwright's actionability checks still apply. Logs `click`
 *  {page,x,y} at the press (the end of the click minus the press–release delay) and `mark click`. */
export async function click(page, target, opts = {}) {
  const to = await moveTo(page, target, opts);
  await sleep(rnd(150, 300));
  if (!postCursor()) await page.evaluate(() => window.__nxCursor?.ring()).catch(() => {});
  const delay = Math.round(rnd(60, 110));
  let pt = { x: to.x, y: to.y };
  const logClick = () => { const T = rec.now(); const id = rec.takePageId(page); if (id) rec.event('click', { page: id, ...pt }, T === null ? undefined : T - delay); };
  if (isLocator(target)) {
    const b = (await target.boundingBox()) ?? to.box;
    const position = { x: clamp(to.x - b.x, 1, Math.max(1, b.width - 1)), y: clamp(to.y - b.y, 1, Math.max(1, b.height - 1)) };
    const p = { x: r1(b.x + position.x), y: r1(b.y + position.y) };
    if (Math.abs(p.x - pt.x) > 0.5 || Math.abs(p.y - pt.y) > 0.5) { pt = p; pos.set(page, p); logCursor(page, p.x, p.y); } // layout moved: Playwright presses here
    let ok = false;
    try {
      await target.click({ position, delay, timeout: opts.timeout ?? 10_000 });
      ok = true;
    } finally {
      if (ok || page.isClosed()) logClick(); // a wallet window may close itself on the click
    }
  } else {
    await page.mouse.down(); await sleep(delay); await page.mouse.up();
    logClick();
  }
  rec.event('mark', { label: 'click', data: { page: rec.pageId(page), x: pt.x, y: pt.y, ...(opts.label ? { what: opts.label } : {}) } });
  return to;
}

/**
 * Drag from `from` to `to` ({x,y}): moveTo `from`, press, then `steps` sine-eased steps over about `ms`, waiting for the page to render a
 * frame after every step (a heavy re-render per step cannot pile up input), release. Logs motion `drag` and a cursor sample per step.
 */
export async function drag(page, from, to, opts = {}) {
  const steps = opts.steps ?? 14, dur = opts.ms ?? 1200;
  await moveTo(page, from);
  await sleep(opts.pressMs ?? 220);
  const start = lastPos(page);
  const m = motionStart('drag', page);
  try {
    await page.mouse.down();
    logCursor(page, start.x, start.y, m);
    const t0 = performance.now();
    for (let i = 1; i <= steps; i++) {
      const u = 0.5 - 0.5 * Math.cos(Math.PI * (i / steps)); // sine in-out: steps stay even (peak 1.6× the mean)
      const x = r1(start.x + (to.x - start.x) * u), y = r1(start.y + (to.y - start.y) * u);
      const wait = t0 + (i * dur) / steps - performance.now();
      if (wait > 1) await sleep(wait);
      logCursor(page, x, y, m);
      await mouseTo(page, x, y);
      if (!postCursor()) place(page, x, y);
      await frame(page);
    }
    await sleep(60);
    await page.mouse.up();
  } finally {
    motionEnd('drag', m);
  }
  pos.set(page, { x: to.x, y: to.y });
}

/** Type into the focused element, one key at a time, 50–120 ms per key (varied). Never fill or paste. Logs the length, not the text, and
 *  motion `type`. Follow with settle(page, label, {selector}) when the field drives a preview. */
export async function type(page, text, opts = {}) {
  rec.event('mark', { label: 'type', data: { page: rec.pageId(page), chars: [...text].length, ...(opts.label ? { what: opts.label } : {}) } });
  const m = motionStart('type', page);
  try {
    for (const ch of text) {
      await page.keyboard.type(ch);
      await sleep(ch === ' ' || /[.,:;/-]/.test(ch) ? rnd(85, 120) : rnd(50, 110));
    }
  } finally {
    motionEnd('type', m);
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

/** Section start. Also logs `cursor_mode {post}` (compose and gapcheck read it) and where the cursor is on each page of the take. */
export function section(id, title, caption = '') {
  const t = rec.event('section', { id, title, caption });
  rec.event('cursor_mode', { post: postCursor() });
  for (const p of tracked) if (!p.isClosed() && rec.takePageId(p)) { const q = lastPos(p); logCursor(p, q.x, q.y); }
  return t;
}
export const sectionEnd = (id) => rec.event('section_end', { id });
export const zoomOut = () => rec.event('zoom_out', {});
export const mark = (label, data = {}) => rec.event('mark', { label, data });
