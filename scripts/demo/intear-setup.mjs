#!/usr/bin/env node
// WO-35 / H-DEMO-WALLET (Kunal 2026-11-13): import demo.nectar.testnet into the Intear web wallet in the dedicated Chrome profile and connect it to
// the testnet app, without the recovery phrase ever reaching stdout, a log, a screenshot or the transcript.
// - The phrase is read here from ~/.nectar/keys/demo.nectar.testnet.json and typed into the page; it is never printed.
// - Every printed string passes redact(): each phrase word, the private key and the generated password become "•••".
// - No screenshots, traces or video. Probe output = URL, title, headings, button/link labels, input types/placeholders (never values).
// - An Intear password (if asked) is generated once and stored at ~/.nectar/keys/demo-intear-password (0600); never printed.
// Usage: node scripts/demo/intear-setup.mjs <step> [<step> ...]
//   open:<url> · click:<visible text> · role:<role>=<name> · seed · password · press:<key> · wait:<ms> · page:<n|last> · probe · pages
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const req = createRequire('/Volumes/T7/nectar-labs/apps/web/package.json');
const { chromium } = req('@playwright/test');

const HOME = homedir();
// INTEAR_PROFILE / INTEAR_KEY_FILE (orchestrator, WO-74 check): a throwaway account in a throwaway profile; defaults = the demo account and profile.
const PROFILE = process.env.INTEAR_PROFILE || join(HOME, '.nectar', 'demo-chrome-profile');
const KEY = JSON.parse(readFileSync(process.env.INTEAR_KEY_FILE || join(HOME, '.nectar', 'keys', 'demo.nectar.testnet.json'), 'utf8'));
const WORDS = String(KEY.seed_phrase).trim().split(/\s+/);
if (WORDS.length !== 12 && WORDS.length !== 24) throw new Error(`unexpected phrase length ${WORDS.length}`);
const PW_FILE = join(HOME, '.nectar', 'keys', 'demo-intear-password');
const secrets = () => [String(KEY.private_key), ...(existsSync(PW_FILE) ? [readFileSync(PW_FILE, 'utf8').trim()] : [])].filter((s) => s.length > 3);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function redact(text) {
  let t = String(text);
  for (const s of secrets()) t = t.split(s).join('•••');
  for (const w of WORDS) t = t.replace(new RegExp(`\\b${esc(w)}\\b`, 'gi'), '•••');
  return t.replace(new RegExp(esc(HOME), 'g'), '~');
}
const out = (...a) => console.log(redact(a.join(' ')));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
});
let page = ctx.pages()[0] ?? (await ctx.newPage());
ctx.on('page', (p) => { out(`[new page] ${p.url()}`); });

async function settle(p, ms = 1500) {
  // A wallet popup closes itself after approval: fall back to the first open page instead of failing.
  if (p.isClosed()) { page = ctx.pages()[0]; out('[popup closed] back to page 0'); await page.waitForTimeout(ms); return; }
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  await p.waitForTimeout(ms).catch(async () => { page = ctx.pages()[0]; out('[popup closed] back to page 0'); await page.waitForTimeout(ms); });
}

async function probe(p) {
  const info = await p.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const q = (sel) => [...document.querySelectorAll(sel)].filter(vis);
    return {
      url: location.href,
      title: document.title,
      headings: q('h1,h2,h3,[role=heading]').map(txt).filter(Boolean).slice(0, 12),
      buttons: q('button,[role=button],input[type=submit]').map((b) => `${txt(b) || b.getAttribute('aria-label') || b.value || '?'}${b.disabled || b.getAttribute('aria-disabled') === 'true' ? ' (disabled)' : ''}`).slice(0, 30),
      links: q('a').map(txt).filter(Boolean).slice(0, 20),
      inputs: q('input,textarea,[contenteditable=true]').filter((i) => !['hidden', 'submit'].includes(i.type)).map((i) => `${i.tagName.toLowerCase()}[${i.type || ''}] ph="${(i.placeholder || '').slice(0, 40)}" aria="${(i.getAttribute('aria-label') || '').slice(0, 40)}" filled=${(i.value || i.textContent || '').length > 0}`).slice(0, 30),
      checks: q('input[type=checkbox],[role=checkbox]').map((c) => `${(c.closest('label') ? txt(c.closest('label')) : c.getAttribute('aria-label')) || '?'} checked=${c.checked ?? c.getAttribute('aria-checked')}`),
      alerts: q('[role=alert],[role=status],.error,.toast').map(txt).filter(Boolean).slice(0, 6),
      texts: q('p,small,label,li').map(txt).filter((t) => t && t.length < 90).slice(0, 25),
      near_error: q('button').filter((b) => /report error/i.test(b.innerText || '')).map((b) => { let el = b; for (let i = 0; i < 3 && el.parentElement; i++) el = el.parentElement; return (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300); }),
      frames: [...document.querySelectorAll('iframe')].map((f) => f.src.slice(0, 80)),
    };
  });
  out(`— url: ${info.url}\n  title: ${info.title}`);
  for (const k of ['headings', 'buttons', 'links', 'inputs', 'checks', 'alerts', 'texts', 'near_error', 'frames']) if (info[k].length) out(`  ${k}: ${info[k].join(' | ')}`);
}

async function typeSeed(p) {
  // Only plain text word fields: the unlock form's password box is visible on the same screen and must never receive a word.
  const fields = p.locator('input[type=text]:visible');
  const n = await fields.count();
  if (n !== WORDS.length) throw new Error(`seed: expected ${WORDS.length} text fields, found ${n}; not typing`);
  // Slow enough that Intear's per-field autocomplete never drops or replaces a keystroke ("Invalid seed phrase" at 25 ms on one phrase).
  for (let i = 0; i < WORDS.length; i++) { await fields.nth(i).click(); await fields.nth(i).fill(''); await p.keyboard.type(WORDS[i], { delay: 70 }); await p.waitForTimeout(200); }
  out(`seed: typed ${WORDS.length} words into ${n} text fields`);
}

async function fillPassword(p) {
  if (!existsSync(PW_FILE)) { writeFileSync(PW_FILE, randomBytes(18).toString('base64url') + '\n', { mode: 0o600 }); chmodSync(PW_FILE, 0o600); out('password: generated ~/.nectar/keys/demo-intear-password (0600)'); }
  const pw = readFileSync(PW_FILE, 'utf8').trim();
  const fields = p.locator('input[type=password]:visible');
  const n = await fields.count();
  if (n === 0) throw new Error('password: no visible password field');
  for (let i = 0; i < n; i++) { await fields.nth(i).click(); await p.keyboard.type(pw, { delay: 20 }); }
  out(`password: filled ${n} field(s)`);
}

try {
  for (const step of process.argv.slice(2)) {
    const [cmd, ...rest] = step.split(':');
    const arg = rest.join(':');
    out(`> ${cmd}${arg ? ' ' + arg : ''}`);
    if (cmd === 'open') { await page.goto(arg, { waitUntil: 'domcontentloaded' }); await settle(page, 2500); }
    else if (cmd === 'click') { await page.getByRole('button', { name: arg }).or(page.getByRole('link', { name: arg })).or(page.getByText(arg, { exact: true })).first().click({ timeout: 10_000 }); await settle(page); }
    else if (cmd === 'waitbtn') { const [name, ms] = arg.split('|'); await page.getByRole('button', { name }).first().waitFor({ timeout: Number(ms || 60000) }); await page.getByRole('button', { name }).first().click(); await settle(page); }
    else if (cmd === 'role') { const [role, name] = arg.split('='); await page.getByRole(role, { name }).first().click({ timeout: 10_000 }); await settle(page); }
    else if (cmd === 'seed') { await typeSeed(page); await settle(page, 800); }
    else if (cmd === 'privkey') {
      // Intear "Private Key" import: the one plain text field (never the unlock password box). The key is redacted from all output.
      const f = page.locator('input[type=text]:visible');
      if ((await f.count()) !== 1) throw new Error(`privkey: expected 1 text field, found ${await f.count()}`);
      await f.first().click(); await page.keyboard.type(String(KEY.private_key), { delay: 15 }); out('privkey: typed into 1 text field'); await settle(page, 800);
    }
    else if (cmd === 'checkbox') { await page.locator('input[type=checkbox]:visible').nth(Number(arg)).check({ timeout: 10_000 }); await settle(page, 300); }
    else if (cmd === 'password') { await fillPassword(page); await settle(page, 500); }
    else if (cmd === 'press') { await page.keyboard.press(arg); await settle(page); }
    else if (cmd === 'wait') { if (page.isClosed()) { page = ctx.pages()[0]; out('[popup closed] back to page 0'); } await page.waitForTimeout(Number(arg)).catch(async () => { page = ctx.pages()[0]; out('[popup closed] back to page 0'); await page.waitForTimeout(Number(arg)); }); }
    else if (cmd === 'page') { const ps = ctx.pages(); page = arg === 'last' ? ps[ps.length - 1] : ps[Number(arg)]; await page.bringToFront(); await settle(page, 800); }
    else if (cmd === 'pages') { ctx.pages().forEach((p, i) => out(`  page ${i}: ${p.url()}`)); }
    else if (cmd === 'probe') { await probe(page); }
    else if (cmd === 'seltext') { out(`  text ${arg}: ${(await page.locator(arg).first().innerText({ timeout: 10_000 })).replace(/\s+/g, ' ').slice(0, 160)}`); }
    else if (cmd === 'fillsel') { const [sel, val] = arg.split('|'); await page.locator(sel).first().fill(val, { timeout: 10_000 }); await settle(page, 800); }
    else if (cmd === 'enabled') { const b = page.getByRole('button', { name: arg }).first(); out(`  button "${arg}": ${(await b.isEnabled({ timeout: 10_000 })) ? 'enabled' : 'disabled'}`); }
    else if (cmd === 'frames') {
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const b = await f.locator('button:visible,[role=button]:visible,a:visible').allInnerTexts().catch(() => []);
        const t = await f.locator('h1:visible,h2:visible,p:visible').allInnerTexts().catch(() => []);
        const body = await f.locator('body').innerText({ timeout: 3000 }).catch(() => '');
        out(`  frame ${f.url().slice(0, 90)}\n    buttons: ${b.map((x) => x.replace(/\s+/g, ' ').slice(0, 60)).join(' | ')}\n    text: ${t.map((x) => x.replace(/\s+/g, ' ').slice(0, 80)).join(' | ')}\n    body: ${body.replace(/\s+/g, ' ').slice(0, 400)}`);
      }
    }
    else if (cmd === 'fclick') {
      const [furl, text] = arg.split('|');
      const f = page.frames().find((x) => x.url().includes(furl));
      if (!f) throw new Error(`fclick: no frame matching ${furl}`);
      await f.getByRole('button', { name: text }).or(f.getByText(text, { exact: true })).first().click({ timeout: 10_000 });
      await settle(page, 1500);
    }
    else if (cmd === 'html') {
      const h = await page.evaluate(() => ({ cls: document.documentElement.className, theme: document.documentElement.getAttribute('data-theme'), scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor, ls: Object.keys(localStorage).filter((k) => /theme|cookie|consent|wallet|near/i.test(k)) }));
      out(`  html: class="${h.cls}" data-theme=${h.theme} color-scheme=${h.scheme} body-bg=${h.bg} localStorage keys=[${h.ls.join(', ')}]`);
    }
    else throw new Error(`unknown step ${cmd}`);
  }
} catch (e) {
  out(`STOP: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  await probe(page).catch(() => {});
  process.exitCode = 1;
} finally {
  await ctx.close();
}
