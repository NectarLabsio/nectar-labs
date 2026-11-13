#!/usr/bin/env node
// WO-35c: the demo take script. Five sections, each one continuous take (scripts/demo/capture: recorder + human + gapcheck), then edit.json for
// compose.mjs. Usage (README.md next to this file):
//   node scripts/demo/takes/take.mjs --mode rehearsal|take [--section 1..5|all] [--sign] [--out dir]
//        dev only: [--profile tmp|<dir>] [--tx <hash>] [--position <id>] [--cmd "<dry-run command>"]
// SAFETY (WO-35c HARD RULES):
// - Nothing is approved, confirmed or signed unless --sign is passed: without it every wallet popup is opened, probed and cancelled, and section 5
//   runs a dry-run command ("echo dry-run"); the real agent command (signs as agent1, spends mock USDC) runs only with --sign.
// - The dedicated profile (~/.nectar/demo-chrome-profile) holds the connected Intear wallet: it is only browsed (no settings, no disconnect, no
//   import). The only clicks outside the app are the wallet's Cancel (or Approve with --sign) and, if asked, the near-connect "Web" choice.
// - Printed paths go through tilde(); key files are never read here (demo-x402.env holds paths and ids only).
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_LAUNCH, defaultTakeDir, startTake, stopTake, tilde } from '../capture/recorder.mjs';
import * as h from '../capture/human.mjs';
import { gapcheckVisual } from '../capture/gapcheck.mjs';

const { chromium } = createRequire('/Volumes/T7/nectar-labs/apps/web/package.json')('@playwright/test');
const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '../../..');
const HOME = homedir();

const APP = 'https://testnet.nectarlabs.io';
const INTRO = '/Volumes/T7/nectar-demo-media/intro/nectar-intro-6s.mp4';
const ENDCARD = { headline: 'Testnet with mock collateral', urls: ['https://nectarlabs.io', 'https://testnet.nectarlabs.io', 'https://docs.nectarlabs.io', 'https://status.nectarlabs.io'] };
const RPC = 'https://test.rpc.fastnear.com';
const NVDAX = 'nvdax-mock.nectar.testnet';
const ACCOUNT = 'demo.nectar.testnet';
const KNOWN_TX = 'De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG'; // first oracle refresher tx (DEMO_SCRIPT step 2): explorer check without --sign
const AGENT_CMD = 'pnpm -s --filter x402 demo:testnet'; // on camera: no localhost, no paths (C4); env comes from demo-x402.env off camera
const DRY_CMD = 'echo dry-run';
const ENV_FILE = join(HOME, '.nectar', 'demo-x402.env');
const ENV_LINES = [
  '# WO-35c section 5 (paths and ids only, no secrets). Read by scripts/demo/capture/terminal/server.mjs --env-file.',
  'X402_URL=http://127.0.0.1:8791/api/feed/export.csv',
  'AGENT1_KEY_PATH=~/.nectar/keys/agent1.json',
  'FEED_MCP_URL=https://feed-production-2f2776c9.up.railway.app/mcp',
];
const LOCK_UNITS = '5';
const BORROW_USD = '100';
const TX_RE = /\b([1-9A-HJ-NP-Za-km-z]{43,44})\b/;

// ---------------------------------------------------------------------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const MODE = opt('--mode');
const SIGN = flag('--sign');
const SECTION = opt('--section', 'all');
// Comma lists (orchestrator, 2026-11-13): `--section 1,2,3,4` runs S1–S4 in one browser (local x402 stays stopped), then `--section 5` after its restart.
if (!['rehearsal', 'take'].includes(MODE) || !(SECTION === 'all' || /^[1-5](,[1-5])*$/.test(SECTION))) {
  console.error('usage: node scripts/demo/takes/take.mjs --mode rehearsal|take [--section 1..5|1,2,3,4|all] [--sign] [--out dir]');
  process.exit(2);
}
const SECTIONS = SECTION === 'all' ? [1, 2, 3, 4, 5] : SECTION.split(',').map(Number);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
const OUT = resolve(opt('--out') ?? defaultTakeDir(`wo35c-${MODE}-${stamp}`));
const PROFILE_ARG = opt('--profile');
const S5_CMD = SIGN ? AGENT_CMD : opt('--cmd', DRY_CMD);
if (!SIGN && /demo:testnet|x402/.test(S5_CMD)) { console.error('take: the agent command signs as agent1; it runs only with --sign'); process.exit(2); }
// WO-35d: takes default to the post-drawn cursor (compose.mjs draws it from the logged samples; no DOM cursor in the frames).
process.env.CURSOR_POST ??= '1';

const log = (...a) => console.log(tilde(a.join(' ')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const explorerTx = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
const rocksTx = (hash) => `https://testnet.near.rocks/tx/${hash}`;
/** mark tx: {hash, explorer (nearblocks, the canonical link), shown (the explorer the take opens, when nearblocks walls this browser)}. */
const txMark = (hash, what) => h.mark('tx', { hash, explorer: explorerTx(hash), ...(state.explorer === 'nearrocks' ? { shown: rocksTx(hash) } : {}), what });

/** Read-only NEAR view call (balances, faucet status, positions). */
async function view(contract, method, args) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query',
    params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') } }) });
  const j = await r.json();
  if (j.error || j.result?.error) throw new Error(`${method}: ${JSON.stringify(j.error ?? j.result.error).slice(0, 160)}`);
  return JSON.parse(Buffer.from(j.result.result).toString());
}

// ---------------------------------------------------------------------------------------------------------------------------- state
const state = { borrowTx: null, newPositionId: null, agentTx: null, explorer: null, results: [] };
let ctx = null;
let page = null;
let term = null;
let tmpProfile = null;
let cur = null; // the running section's report

const report = (k, v) => { cur[k] = v; };
const note = (s) => { cur.notes.push(s); log(`  note: ${s}`); };
const found = (name, ok) => { cur.selectors[name] = ok; if (!ok) log(`  missing: ${name}`); };

/** First visible match of `loc` within `ms`, else null (records the selector as found or missing). */
async function seen(name, loc, ms = 10_000) {
  const ok = await loc.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
  found(name, ok);
  return ok ? loc.first() : null;
}

/** Settle (the page paints smoothly again, so the hold holds a still page), then box + hold. */
async function boxHold(p, label, loc, ms) {
  await h.settle(p, label, { frames: 4 });
  await h.box(p, label, loc);
  await h.hold(ms, label);
}

const PREVIEW = '[data-testid="borrow-outcome"]'; // re-renders from preview_borrow on every typed key
/** After typing into a field that drives the preview: wait until the outcome panel has not changed for 500 ms and frames are smooth. */
const settlePreview = (label) => h.settle(page, label, { selector: PREVIEW, quietMs: 500, timeout: 5000 });

/** Scroll the page to the top with an eased wheel (visible, like a hand), only if it is scrolled. */
async function toTop(p) {
  const y = await p.evaluate(() => scrollY).catch(() => 0);
  if (y > 4) await h.scroll(p, -y);
}

/** Wait until scrollY has not changed for 300 ms (max 2.5 s); returns it. */
async function settleScroll(p) {
  let last = -1, since = Date.now();
  const t0 = Date.now();
  for (;;) {
    const y = Math.round(await p.evaluate(() => scrollY).catch(() => 0));
    if (y !== last) { last = y; since = Date.now(); }
    if (Date.now() - since >= 300 || Date.now() - t0 > 2500) return y;
    await sleep(50);
  }
}

async function settleNav(p, urlPart) {
  await p.waitForURL((u) => u.href.includes(urlPart), { timeout: 20_000 });
  await p.waitForLoadState('load').catch(() => {});
}

/** Off camera: make sure p0 shows `url` (a section run on its own starts where the previous section would have ended). */
async function ensureAt(url, ready) {
  // A dialog still open from the previous section (e.g. a sign modal waiting on a cancelled wallet) is cleared by a reload, off camera.
  const stuck = await page.locator('[role=dialog]').first().isVisible().catch(() => false);
  if (stuck) note('a dialog was still open after the previous section; reloaded off camera');
  if (!page.url().startsWith(url)) await page.goto(url, { waitUntil: 'load' });
  else if (stuck) await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Decline' }).click({ timeout: 1500 }).catch(() => {}); // cookie choice (throwaway profile only)
  if (ready) await ready.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------------------------------------------------------------------- wallet
/** Popup text for the report: title, headings, button labels (never input values). */
async function probePopup(p) {
  return p.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; }
      return true;
    };
    const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return {
      host: location.host, path: location.pathname, title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(txt).filter(Boolean).slice(0, 6),
      buttons: [...document.querySelectorAll('button')].filter(vis).map((b) => `${txt(b) || b.getAttribute('aria-label') || '?'}${b.disabled ? ' (disabled)' : ''}`).slice(0, 12),
    };
  }).catch((e) => ({ error: e.message.split('\n')[0] }));
}

/** Wait (as a take "wait", so the edit may speed it up) until the element at the button's centre is the button itself: the wallet's fading
 *  unlock overlay otherwise swallows the click for a few seconds while the cursor sits still. Returns what covered it, if anything. */
async function waitHittable(p, loc, label) {
  let covered = null;
  await h.wait(label, (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 10_000) {
      const top = await loc.evaluate((b) => {
        const r = b.getBoundingClientRect();
        const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !e || b.contains(e) ? null : `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`;
      }).catch(() => null);
      if (!top) return;
      covered ??= top;
      await sleep(100);
    }
  })());
  return covered;
}

/** Only with --sign. */
async function approve(popup) {
  if (!SIGN) throw new Error('approve() without --sign'); // unreachable by construction; a second fence
  const btn = popup.getByRole('button', { name: 'Approve', exact: true });
  await btn.waitFor({ state: 'visible', timeout: 30_000 });
  await waitHittable(popup, btn, 'wallet ready');
  await h.click(popup, btn, { label: 'wallet approve', timeout: 30_000 }).catch((e) => { if (!popup.isClosed()) throw e; }); // closes itself on approval
}

/**
 * Right after the app's "Open wallet to sign": find the Intear popup (directly, or through the near-connect iframe's "Web" choice), probe it,
 * then Approve only with --sign; without it hold 1.2 s and click Cancel (closing the window if Cancel never shows). Returns true if approved.
 */
async function walletStep(label, openWallet) {
  const before = new Set(ctx.pages());
  const popupP = ctx.waitForEvent('page', { timeout: 30_000 }).catch(() => ctx.pages().find((p) => !before.has(p)) ?? null);
  await openWallet(); // the app's "Open wallet to sign" (registered after the page listener, so a fast popup is not missed)
  let popup = await Promise.race([popupP, sleep(6000).then(() => ctx.pages().find((p) => !before.has(p)) ?? null)]);
  if (!popup) {
    const frame = page.frames().find((f) => /intear|connector/i.test(f.url()));
    report(`${label}_iframe`, frame ? frame.url().replace(/\?.*/, '').slice(0, 80) : 'none');
    if (frame) {
      const web = frame.getByRole('button', { name: /Web/ }).or(frame.getByText(/Web/, { exact: false })).first();
      if (await web.isVisible().catch(() => false)) { await h.click(page, web, { label: 'near-connect web' }); note(`${label}: near-connect iframe asked for "Web" first`); }
    }
    popup = await popupP;
  }
  if (!popup) { note(`${label}: no wallet popup within 30 s`); found(`${label} popup`, false); return false; }
  found(`${label} popup`, true);
  await popup.waitForLoadState('load').catch(() => {});
  const buttons = popup.getByRole('button', { name: /^(Approve|Cancel)$/ });
  await h.wait('wallet loads', buttons.first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {}));
  await popup.waitForTimeout(800).catch(() => {}); // the wallet's unlock overlay fades out once the stored session loads
  await h.settle(popup, 'wallet painted'); // window creation stalls both windows for a few hundred ms: hold until it paints smoothly
  const probe = await probePopup(popup);
  // Read-only: is the wallet's Approve enabled (i.e. would --sign work)? Never clicked here without --sign.
  probe.approve = await popup.getByRole('button', { name: 'Approve', exact: true }).first().evaluate((b) => (b.disabled ? 'disabled' : 'enabled')).catch(() => 'absent');
  report(`${label}_popup`, probe);
  log(`  popup: ${JSON.stringify(probe)}`);
  // The wallet closes its own window right after the click: listen before clicking so the close is not missed.
  const closes = (ms) => (popup.isClosed() ? Promise.resolve() : popup.waitForEvent('close', { timeout: ms }).catch(() => {}));
  if (SIGN) {
    await h.hold(1000, 'read wallet request');
    const closed = closes(60_000);
    await approve(popup);
    await h.wait('wallet closes', closed);
    await h.settle(page, 'wallet closed');
    return true;
  }
  await h.hold(1200, 'read wallet request');
  const cancel = popup.getByRole('button', { name: 'Cancel', exact: true });
  const t0 = Date.now();
  let closed = Promise.resolve();
  if (await cancel.isVisible().catch(() => false)) {
    const cover = await waitHittable(popup, cancel, 'wallet ready');
    if (cover) report(`${label}_covered_by`, cover);
    const t1 = Date.now();
    await h.moveTo(popup, cancel);
    const t2 = Date.now();
    closed = closes(8000);
    await h.click(popup, cancel, { label: 'wallet cancel', timeout: 15_000 }).catch((e) => { if (!popup.isClosed()) throw e; });
    found(`${label} popup Cancel`, true);
    report(`${label}_cancel_ms`, { ready: t1 - t0, move: t2 - t1, click: Date.now() - t2 });
  } else {
    found(`${label} popup Cancel`, false);
  }
  await closed;
  if (!popup.isClosed()) { note(`${label}: popup stayed open after Cancel; closed the window (no approval)`); await popup.close().catch(() => {}); }
  await h.settle(page, 'wallet closed');
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------------- explorer
/** Off camera, once: does nearblocks answer this browser, or does it show a bot wall? Decides which explorer the tab switch opens. */
async function explorerCheck() {
  const p = await ctx.newPage();
  try {
    const r = await p.goto(explorerTx(KNOWN_TX), { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
    await p.waitForTimeout(2500);
    const title = await p.title().catch(() => '');
    const walled = !r || r.status() >= 400 || /just a moment|attention required/i.test(title);
    state.explorer = walled ? 'nearrocks' : 'nearblocks';
    log(`explorer: nearblocks ${walled ? `blocked (HTTP ${r?.status() ?? 'none'}, "${title}")` : 'loads'} → tab switch uses ${state.explorer === 'nearblocks' ? 'testnet.nearblocks.io' : 'testnet.near.rocks'}`);
  } finally { await p.close().catch(() => {}); }
}

/** A visible tab switch to the tx on the explorer (window.open → popup_open + active in the take), then 2 s on the status. */
async function explorerTab(opener, hash) {
  // explorer.testnet.near.org is only a light-themed chooser ("Near Rocks" recommended, "Nearblocks"): when nearblocks walls this browser,
  // go straight to Near Rocks (FastNear's explorer, follows the dark system theme), the chooser's recommended entry.
  const url = state.explorer === 'nearblocks' ? explorerTx(hash) : rocksTx(hash);
  const tabP = ctx.waitForEvent('page', { timeout: 15_000 });
  await opener.evaluate((u) => { window.open(u, '_blank'); }, url);
  const tab = await tabP;
  await h.wait('explorer loads', tab.waitForLoadState('load').catch(() => {}));
  await h.settle(tab, 'explorer painted', { timeout: 3000 });
  if (state.explorer !== 'nearblocks') {
    const card = await seen('explorer tx summary', tab.locator('div.rounded-lg', { has: tab.locator('dl') }).filter({ hasText: hash }), 20_000);
    if (card) { await boxHold(tab, 'tx on explorer', card, 2000); note('Near Rocks shows no "Success" label; the summary card (hash, signer, receiver, block) is held 2 s'); }
  } else {
    const ok = await seen('nearblocks status', tab.getByText(/^Success$/), 20_000);
    if (ok) await boxHold(tab, 'confirmed', ok, 2000);
  }
  h.zoomOut();
  return tab;
}

// ---------------------------------------------------------------------------------------------------------------------------- sections
const CAPTIONS = {
  1: "testnet.nectarlabs.io · Market makers commit quotes for at least 7 days' notice.",
  2: 'Testnet. Mock assets, no value.',
  3: MODE === 'take' ? 'Market closed: weekend limits apply.' : 'Standard protection (rehearsal).',
  4: 'On-chain on NEAR testnet.',
  5: 'A separate agent account borrows on its own: agent1.nectar.testnet.',
};
const TITLES = { 1: 'Market', 2: 'Test assets', 3: 'Borrow', 4: 'Position', 5: 'Agent' };

async function s1() {
  const link = page.locator('a[href$="/feed/NVDAx"]');
  await ensureAt(`${APP}/feed`, link);
  return async () => {
    const hero = page.locator('[data-testid="hero-capacity"]');
    if (await seen('[data-testid=hero-capacity]', hero, 5000)) await h.moveTo(page, hero);
    await h.hold(1300, 'exit capacity, all markets');
    const nv = await seen('/feed NVDAx link', link);
    if (!nv) throw new Error('no NVDAx link on /feed');
    await h.click(page, nv, { label: 'NVDAx market' });
    await h.wait('market loads', settleNav(page, '/feed/NVDAx'));
    const exit = await seen('[data-testid=market-exit]', page.locator('[data-testid="market-exit"]'), 15_000);
    await h.settle(page, 'market painted');
    await h.hold(1000, 'market page');
    if (exit) { await h.moveTo(page, exit); await boxHold(page, 'exit capacity', exit, 1400); }
    const rows = page.locator('[data-testid="market-ladder"] tbody tr');
    const row = await seen('[data-testid=market-ladder] tbody tr', rows);
    if (row) {
      await h.moveTo(page, row);
      await boxHold(page, 'ladder row', row, 1500);
      await h.moveTo(page, rows.nth(1));
      await h.hold(900, 'next quote');
    }
    note('ladder rows have no hover tooltip or notice period; the cursor rests on the first row (caption carries the 7-day notice)');
    h.zoomOut();
    await h.hold(1200, 'market overview');
  };
}

async function s2() {
  await ensureAt(`${APP}/feed/NVDAx`, page.locator('[data-testid="market-exit"]'));
  return async () => {
    const nav = await seen('nav "Borrow"', page.getByRole('link', { name: 'Borrow', exact: true }));
    await h.click(page, nav, { label: 'nav Borrow' });
    await h.wait('borrow loads', settleNav(page, '/borrow'));
    // The app smooth-scrolls /borrow down (~785 px) right after the nav click, past "Get test assets": let it settle, then scroll back up.
    await page.locator('[data-testid="test-assets"]').first().waitFor({ timeout: 15_000 }).catch(() => {});
    await sleep(700);
    const y = await settleScroll(page);
    await h.settle(page, 'borrow painted');
    if (y > 4) { note(`/borrow scrolls itself to y=${y} after the nav click; the take scrolls back to the top (eased)`); await h.hold(500, 'look'); await toTop(page); }
    const wallet = await seen('[data-testid=wallet-button]', page.locator('[data-testid="wallet-button"]'), 15_000);
    const who = wallet ? (await wallet.innerText()).trim() : '';
    report('wallet', who);
    if (who !== ACCOUNT) throw new Error(`wallet shows "${who}", not ${ACCOUNT}`);
    await h.moveTo(page, wallet);
    await boxHold(page, 'wallet account', wallet, 1100);
    h.zoomOut();
    const btn = await seen('[data-testid=test-assets-button]', page.locator('[data-testid="test-assets-button"]'));
    if (!btn) throw new Error('"Get test assets" is not offered');
    await boxHold(page, 'test assets', page.locator('[data-testid="test-assets"]'), 900);
    await h.click(page, btn, { label: 'Get test assets' });
    const modal = page.getByRole('dialog', { name: 'Review: Get test assets' });
    const open = await Promise.race([
      modal.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'modal', () => null),
      page.locator('[data-testid="test-assets-result"], [data-testid="test-assets-error"]').first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'result', () => null),
    ]);
    found('sign modal "Review: Get test assets"', open === 'modal');
    await h.settle(page, 'modal painted');
    if (open !== 'modal') {
      const t = (await page.locator('[data-testid="test-assets-result"], [data-testid="test-assets-error"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      note(`no sign modal: ${t.slice(0, 160)}`);
      return;
    }
    const summary = page.locator('[data-testid="test-assets-summary"]');
    if (await summary.isVisible().catch(() => false)) await boxHold(page, 'mint summary', summary, 1300);
    h.zoomOut();
    const approved = await walletStep('faucet', () => h.click(page, modal.getByRole('button', { name: 'Open wallet to sign' }), { label: 'Open wallet to sign' }));
    const res = page.locator('[data-testid="test-assets-result"], [data-testid="test-assets-error"]').first();
    await h.wait('faucet result', res.waitFor({ state: 'visible', timeout: approved ? 90_000 : 15_000 }).catch(() => {}));
    const text = (await res.innerText().catch(() => '')).replace(/\s+/g, ' ');
    report('faucet_result', text.slice(0, 200));
    if (approved) {
      for (const sym of ['NVDAx', 'USDC']) {
        const line = page.locator(`[data-testid="test-assets-${sym}"]`);
        const m = TX_RE.exec(await line.innerText().catch(() => ''));
        if (m) { txMark(m[1], `faucet ${sym}`); report(`faucet_tx_${sym}`, m[1]); }
      }
      await boxHold(page, 'faucet result', res, 1300);
      await h.wait('balance updates', page.locator('[data-testid="amt-units"]').filter({ hasText: /Balance [1-9]/ }).waitFor({ timeout: 30_000 }).catch(() => {}));
    } else if (text) {
      await boxHold(page, 'faucet result', res, 1000);
    }
    const bal = page.locator('[data-testid="amt-units"]');
    if (await bal.isVisible().catch(() => false)) { await h.moveTo(page, bal); await boxHold(page, 'NVDAx balance', bal, 1300); }
    report('balance_note', (await bal.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60));
    h.zoomOut();
    await h.hold(500, 'end');
  };
}

async function s3() {
  await ensureAt(`${APP}/borrow`, page.locator('[data-testid="amt-units"]'));
  // Off camera: decide the protection now, so the caption matches what the take shows.
  const weekend = page.locator('[data-testid="protection-weekend"]');
  const wkDisabled = await weekend.evaluate((e) => e.disabled === true || e.getAttribute('aria-disabled') === 'true').catch(() => true);
  let want = MODE === 'take' ? 'weekend' : 'standard';
  if (want === 'weekend' && wkDisabled) { want = 'standard'; CAPTIONS[3] = 'Standard protection.'; note('Weekend Shield is disabled now; the take records Standard (the composer shows why)'); }
  report('protection', want);
  return async () => {
    const units = await seen('[data-testid=amt-units] input', page.locator('[data-testid="amt-units"] input:not([type=range])'));
    await h.click(page, units, { label: 'units field' });
    await h.type(page, LOCK_UNITS, { label: 'lock units' });
    await settlePreview('collateral value');
    await h.hold(1000, 'collateral value');
    const borrow = await seen('[data-testid=amt-borrow] input', page.locator('[data-testid="amt-borrow"] input:not([type=range])'));
    await h.click(page, borrow, { label: 'borrow field' });
    await h.type(page, BORROW_USD, { label: 'borrow amount' });
    const limit = page.locator('[data-testid="borrow-limit"]');
    await h.wait('limit from contract', limit.filter({ hasText: /\$/ }).waitFor({ timeout: 20_000 }).catch(() => {}));
    await settlePreview('borrow preview');
    if (await seen('[data-testid=borrow-limit]', limit)) await boxHold(page, 'limit', limit, 1300);
    h.zoomOut();
    const prot = await seen(`[data-testid=protection-${want}]`, page.locator(`[data-testid="protection-${want}"]`));
    if (want === 'standard' && MODE === 'take' && !wkDisabled) note('unexpected: take mode chose Standard');
    if (MODE === 'take' && wkDisabled) await boxHold(page, 'weekend disabled', weekend, 1200);
    await h.click(page, prot, { label: `protection ${want}` });
    const fees = page.locator('[data-testid="preview-fees"]');
    await h.wait('live preview', fees.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}));
    await settlePreview('protection preview');
    found('[data-testid=preview-fees]', await fees.isVisible().catch(() => false));
    const outcome = await seen('[data-testid=borrow-outcome]', page.locator('[data-testid="borrow-outcome"]'));
    if (outcome) await boxHold(page, 'live preview', outcome, 1500);
    if (await fees.isVisible().catch(() => false)) await boxHold(page, 'fees', fees, 1200);
    report('preview', (await outcome?.innerText().catch(() => '') ?? '').replace(/\s+/g, ' ').slice(0, 220));
    const refuse = page.getByText('The contract would refuse this');
    if (await refuse.isVisible().catch(() => false)) note(`preview refuses: ${(await refuse.locator('..').innerText()).replace(/\s+/g, ' ').slice(0, 160)}`);
    h.zoomOut();
    const review = await seen('[data-testid=review-borrow]', page.locator('[data-testid="review-borrow"]'));
    await h.moveTo(page, review);
    if (await review.isDisabled()) {
      const why = (await page.locator('[data-testid="amt-units"], [data-testid="amt-borrow"]').allInnerTexts()).join(' ').replace(/\s+/g, ' ');
      note(`"${(await review.innerText()).trim()}" is disabled (${/More than your balance/.test(why) ? 'More than your balance: 0 mock NVDAx, the faucet was not signed' : why.slice(0, 120)})`);
      await h.hold(1000, 'review disabled');
      return;
    }
    await h.click(page, review, { label: 'Review borrow' });
    const drawer = page.getByRole('dialog', { name: 'Review borrow' });
    await seen('drawer "Review borrow"', drawer);
    await h.settle(page, 'drawer painted');
    const show = await seen('[data-testid=show-wallet-payload]', page.locator('[data-testid="show-wallet-payload"]'));
    await h.click(page, show, { label: 'Show what your wallet signs' });
    const payload = await seen('[data-testid=wallet-payload]', page.locator('[data-testid="wallet-payload"]'));
    if (payload) await boxHold(page, 'what the wallet signs', payload, 1500);
    h.zoomOut();
    const confirm = await seen('[data-testid=confirm-in-wallet]', page.locator('[data-testid="confirm-in-wallet"]'));
    await h.click(page, confirm, { label: 'Confirm in wallet' });
    const modal = page.getByRole('dialog', { name: /^Review: / }).filter({ has: page.getByRole('button', { name: /Open wallet to sign|Waiting for wallet/ }) });
    await seen('sign modal "Review: …"', modal);
    note('the app adds its own sign modal ("Open wallet to sign") between "Confirm in wallet" and the wallet');
    await h.settle(page, 'sign modal painted');
    await h.hold(1000, 'sign modal');
    const approved = await walletStep('borrow', () => h.click(page, modal.getByRole('button', { name: 'Open wallet to sign' }), { label: 'Open wallet to sign' }));
    if (!approved) {
      // Rehearsal: the modal shows the wallet's refusal; close it and the drawer so the page is clean again.
      await page.waitForTimeout(800);
      const err = (await modal.getByRole('alert').innerText().catch(() => '')).trim();
      if (err) report('borrow_after_cancel', err.slice(0, 160));
      if (await modal.isVisible().catch(() => false)) await h.click(page, modal.getByRole('button', { name: 'Cancel', exact: true }), { label: 'modal cancel' });
      if (await drawer.isVisible().catch(() => false)) await h.click(page, drawer.getByRole('button', { name: 'Close', exact: true }), { label: 'drawer close' });
      await h.settle(page, 'drawer closed');
      return;
    }
    const toast = page.locator('.toasts .toast').filter({ hasText: TX_RE });
    await h.wait('tx confirms', toast.first().waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {}));
    const bad = page.locator('.toasts .toast[role=alert]');
    if (await bad.isVisible().catch(() => false)) throw new Error(`borrow failed: ${(await bad.innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
    const m = TX_RE.exec(await toast.first().innerText().catch(() => ''));
    if (!m) throw new Error('no tx hash in the success toast');
    state.borrowTx = m[1];
    report('borrow_tx', m[1]);
    report('toast_title', (await toast.first().locator('.t-title').innerText().catch(() => '')).trim());
    const hash = toast.first().locator('.mono').first();
    await boxHold(page, 'tx hash', (await hash.isVisible().catch(() => false)) ? hash : toast.first(), 1500);
    txMark(m[1], 'borrow');
    h.zoomOut();
    const loanLink = page.locator('[data-testid="view-loan"]');
    await h.wait('position id', loanLink.filter({ hasText: /#\d+/ }).waitFor({ timeout: 20_000 }).catch(() => {}));
    const id = /#(\d+)/.exec(await loanLink.innerText().catch(() => ''))?.[1] ?? null;
    state.newPositionId = id;
    report('position_id', id);
  };
}

async function s4() {
  const viaLoan = Boolean(state.newPositionId) && (await page.locator('[data-testid="view-loan"]').isVisible().catch(() => false));
  if (!viaLoan) {
    let id = opt('--position');
    if (!id) {
      const ps = await view('nectar-core-v2.nectar.testnet', 'list_positions', { from_index: 0, limit: 200 });
      const mine = ps.filter((p) => p.status === 'Open' && p.borrower === ACCOUNT);
      id = (mine.at(-1) ?? ps.filter((p) => p.status === 'Open').at(-1))?.position_id;
    }
    note(`no new loan in this run: stand-in /position/${id} opened off camera (with --sign the take clicks "View loan #<id>")`);
    await ensureAt(`${APP}/position/${id}`, page.locator('#sim'));
  }
  return async () => {
    if (viaLoan) {
      await h.click(page, page.locator('[data-testid="view-loan"]'), { label: 'View loan' });
      await h.wait('position loads', settleNav(page, '/position/'));
    }
    const ring = await seen('ring "Health at the simulated price"', page.getByRole('img', { name: /^Health at the simulated price/ }), 20_000);
    await h.settle(page, 'position painted');
    if (ring) { await h.moveTo(page, ring); await boxHold(page, 'health', ring, 1300); }
    const sim = await seen('#sim', page.locator('#sim'));
    if (sim) {
      await h.box(page, 'price simulator', sim);
      const b = await sim.boundingBox();
      const [v, lo, hi] = await sim.evaluate((e) => [Number(e.value), Number(e.min), Number(e.max)]);
      const frac = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      const thumb = 9; // half the thumb: the browser maps value → x inside [x + thumb, x + w - thumb]
      const x0 = b.x + thumb + frac * (b.width - 2 * thumb), yy = b.y + b.height / 2;
      const x1 = Math.max(b.x + thumb + 4, x0 - (b.width - 2 * thumb) * 0.35);
      // WO-35d: 14 even steps over ~1.2 s, each waiting for a rendered frame (one eased 54-step move piled up re-renders: 450 ms stall).
      await h.drag(page, { x: x0, y: yy }, { x: x1, y: yy }, { steps: 14, ms: 1200 });
      h.mark('drag', { what: 'price simulator', from: Math.round(x0), to: Math.round(x1) });
      report('sim', await sim.getAttribute('aria-valuetext'));
      if (ring) await boxHold(page, 'health at the simulated price', ring, 1300);
    }
    h.zoomOut();
    const hash = state.borrowTx ?? opt('--tx', KNOWN_TX);
    if (!state.borrowTx) note(`no borrow tx in this run: explorer stand-in ${hash.slice(0, 8)}…`);
    await explorerTab(page, hash);
  };
}

function ensureEnvFile() {
  if (existsSync(ENV_FILE)) return;
  writeFileSync(ENV_FILE, `${ENV_LINES.join('\n')}\n`, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
  log('env: wrote ~/.nectar/demo-x402.env (0600; paths and ids only)');
}

async function startTerminal() {
  ensureEnvFile();
  const args = [join(REPO, 'scripts/demo/capture/terminal/server.mjs'), '--port', '0', '--cwd', REPO, '--env-file', ENV_FILE, '--replace', `${REPO}=.`, '--cmd', S5_CMD];
  term = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  term.stderr.on('data', (d) => process.stderr.write(tilde(String(d))));
  return new Promise((ok, bad) => {
    term.stdout.on('data', (d) => { const m = /http:\/\/127\.0\.0\.1:\d+\//.exec(String(d)); if (m) ok(m[0]); });
    term.on('exit', (c) => bad(new Error(`terminal server exited ${c}`)));
  });
}

async function s5() {
  const url = await startTerminal();
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('body:not(.loading)').waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  report('command', S5_CMD);
  return async () => {
    const t = await seen('terminal #term', page.locator('#term'));
    await h.click(page, t, { label: 'terminal' });
    await h.type(page, S5_CMD, { label: 'agent command' });
    await h.press(page, 'Enter');
    const lines = page.locator('#term .line.out');
    const done = page.locator('#term .line').last().locator('.ps'); // a new prompt = the command exited
    await h.wait('agent runs', (async () => {
      await lines.first().waitFor({ timeout: 30_000 });
      await done.waitFor({ timeout: SIGN ? 180_000 : 20_000 });
    })().catch(() => {}));
    const texts = await lines.allInnerTexts();
    const msgs = texts.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    const by = (m) => msgs.find((x) => x.msg === m);
    report('output', SIGN ? msgs.map((m) => `${m.msg}${m.status ? ` ${m.status}` : ''}`).join(', ') : texts.join(' | ').slice(0, 120));
    if (/refused/.test(texts.join(' '))) throw new Error('the terminal refused the typed line');
    const sent = by('borrow_sent');
    if (sent?.tx) { state.agentTx = sent.tx; txMark(sent.tx, 'agent borrow'); }
    const paid = by('paid_fetch');
    if (paid?.transaction) txMark(paid.transaction, 'x402 payment');
    const lineOf = (m) => lines.filter({ hasText: `"msg":"${m}"` }).first();
    if (sent) await boxHold(page, 'agent borrow sent', lineOf('borrow_sent'), 1200);
    if (by('challenge') && by('paid_fetch')) {
      await boxHold(page, '402 challenge', lineOf('challenge'), 1300);
      await boxHold(page, '200 paid fetch', lineOf('paid_fetch'), 1500);
    } else {
      if (SIGN) note('no challenge/paid_fetch lines in the output');
      await boxHold(page, 'output', lines.last(), 1200);
    }
    h.zoomOut();
    const hash = state.agentTx ?? opt('--tx', KNOWN_TX);
    if (!state.agentTx) note(`no agent borrow tx (dry run): explorer stand-in ${hash.slice(0, 8)}…`);
    await explorerTab(page, hash);
  };
}

// ---------------------------------------------------------------------------------------------------------------------------- edit.json
function writeEdit() {
  const sections = [{ intro: INTRO }];
  for (const n of [1, 2, 3, 4, 5]) {
    const dir = join(OUT, `s${n}`);
    if (!existsSync(join(dir, 'take.json')) || !existsSync(join(dir, 'events.jsonl'))) continue;
    const ev = readFileSync(join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const sec = ev.find((e) => e.type === 'section' && Number(e.id) === n);
    if (!sec) continue;
    sections.push({ take: `s${n}`, section: n, caption: sec.caption });
  }
  sections.push({ endcard: ENDCARD });
  const edit = { fps: 30, captions: false, dissolve_frames: 10, sections };
  writeFileSync(join(OUT, 'edit.json'), `${JSON.stringify(edit, null, 2)}\n`);
  return sections.length - 2;
}

// ---------------------------------------------------------------------------------------------------------------------------- main
const RUN = { 1: s1, 2: s2, 3: s3, 4: s4, 5: s5 };

async function runSection(n) {
  cur = { section: n, title: TITLES[n], selectors: {}, notes: [] };
  state.results.push(cur);
  log(`— s${n} ${TITLES[n]}`);
  if (n === 2 && SIGN) {
    const bal = BigInt(await view(NVDAX, 'ft_balance_of', { account_id: ACCOUNT }));
    if (bal >= 5_000_000n) { cur.skipped = `already funded (${bal / 1_000_000n} mock NVDAx): section 2 skipped (WO-35)`; log(`  ${cur.skipped}`); return; }
  }
  const body = await RUN[n](); // off-camera preparation; returns the on-camera part
  const dir = join(OUT, `s${n}`);
  rmSync(dir, { recursive: true, force: true });
  await startTake(ctx, dir, { log: (m) => log(`  ${m}`) });
  const t0 = Date.now();
  let failed = null;
  try {
    h.section(n, TITLES[n], CAPTIONS[n]);
    await body();
    h.sectionEnd(n);
  } catch (e) {
    failed = e instanceof Error ? e.message.split('\n')[0] : String(e);
    h.sectionEnd(n);
  } finally {
    const sum = await stopTake();
    cur.duration_s = Math.round((sum?.duration_ms ?? Date.now() - t0) / 100) / 10;
    cur.frames = sum?.frames;
  }
  // Off camera: close any extra tab (explorer) so the next take starts with p0 only.
  for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
  const g = await gapcheckVisual(dir, { limit: 100, stillLimit: 120 });
  const at = (l) => l.map((x) => `${x.page} ${x.ms} ms @ ${x.from}${x.kind ? ` ${x.kind}` : ''}`);
  cur.gapcheck = { pass: g.pass, post_cursor: g.post, motion_max_ms: g.maxMotion, hold_max_ms: g.maxStill, transition_max_ms: g.maxTransition,
    unchanged_max_ms: g.maxUnchanged, max_gap_ms: g.maxGap, worst_motion: at(g.worstMotion.slice(0, 3)), worst_transition: at(g.worstTransition.slice(0, 3)),
    pages: Object.fromEntries(Object.entries(g.pages).map(([id, s]) => [id, { fps: s.fps, max_gap_ms: s.maxGap }])) };
  if (failed) { cur.error = failed; log(`  STOP s${n}: ${failed}`); }
  log(`  s${n}: ${cur.duration_s} s · gapcheck ${g.pass ? 'PASS' : 'FAIL'} motion ${g.maxMotion} / hold ${g.maxStill} / transition ${g.maxTransition} ms ${JSON.stringify(cur.gapcheck.pages)}`);
  if (failed && MODE === 'take') throw new Error(`section ${n} failed: ${failed}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let profile = join(HOME, '.nectar', 'demo-chrome-profile');
  if (PROFILE_ARG === 'tmp') profile = tmpProfile = mkdtempSync(join(tmpdir(), 'nx-take-profile-'));
  else if (PROFILE_ARG) profile = resolve(PROFILE_ARG);
  log(`take: mode ${MODE} · sections ${SECTIONS.join(',')} · ${SIGN ? 'SIGN (wallet approvals on)' : 'no --sign (every wallet popup is cancelled)'} · ${CAPTURE_LAUNCH.headless ? 'headless' : 'headed'} · profile ${tmpProfile ? 'throwaway' : tilde(profile)} · out ${tilde(OUT)}`);
  ctx = await chromium.launchPersistentContext(profile, { ...CAPTURE_LAUNCH });
  for (const p of ctx.pages().slice(1)) await p.close().catch(() => {});
  page = ctx.pages()[0] ?? (await ctx.newPage());
  await h.installCursor(ctx);
  await explorerCheck(); // also decides the mark's shown URL
  for (const n of SECTIONS) await runSection(n);
}

let exit = 0;
try {
  await main();
} catch (e) {
  log(`take: STOP: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  exit = 1;
} finally {
  await stopTake().catch(() => {});
  await ctx?.close().catch(() => {});
  if (term) term.kill('SIGTERM');
  if (tmpProfile) rmSync(tmpProfile, { recursive: true, force: true });
  if (existsSync(OUT)) {
    const n = writeEdit();
    writeFileSync(join(OUT, 'run.json'), `${JSON.stringify({ mode: MODE, sign: SIGN, sections: SECTIONS, explorer: state.explorer, results: state.results }, null, 2)}\n`);
    log(`take: ${n} section take(s) → ${tilde(join(OUT, 'edit.json'))} · report ${tilde(join(OUT, 'run.json'))}`);
  }
  for (const r of state.results) {
    const miss = Object.entries(r.selectors).filter(([, v]) => !v).map(([k]) => k);
    log(`s${r.section} ${r.title}: ${r.skipped ?? `${r.duration_s ?? '?'} s · gapcheck ${r.gapcheck ? `${r.gapcheck.pass ? 'PASS' : 'FAIL'} motion ${r.gapcheck.motion_max_ms} / hold ${r.gapcheck.hold_max_ms} / transition ${r.gapcheck.transition_max_ms} ms` : 'n/a'} · selectors ${Object.keys(r.selectors).length - miss.length}/${Object.keys(r.selectors).length}${miss.length ? ` (missing: ${miss.join(', ')})` : ''}${r.error ? ` · ERROR ${r.error}` : ''}`}`);
  }
  process.exitCode = exit;
}
