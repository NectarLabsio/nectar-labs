// G9 run 10 (WO-97 step 3): production /borrow shows the copilot "Recorded fixture" notice.
// System Chrome headless via the clone's CAPTURE_LAUNCH (scripts/demo/capture/recorder.mjs); throwaway profile in /tmp; read-only page load.
// Usage: node borrow-copilot.mjs <clone> <screenshot.png>
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [clone, shot] = process.argv.slice(2);
const req = createRequire(join(clone, 'apps/web/package.json'));
const { chromium } = req('@playwright/test');
const { CAPTURE_LAUNCH } = await import(pathToFileURL(join(clone, 'scripts/demo/capture/recorder.mjs')).href);
const profile = mkdtempSync(join(tmpdir(), 'g9r10-chrome-'));
console.log('launch', JSON.stringify({ channel: CAPTURE_LAUNCH.channel, headless: CAPTURE_LAUNCH.headless, viewport: CAPTURE_LAUNCH.viewport }));
const ctx = await chromium.launchPersistentContext(profile, { ...CAPTURE_LAUNCH });
const page = ctx.pages()[0] ?? (await ctx.newPage());
console.log('browser', ctx.browser()?.version() ?? '(persistent context)');
const resp = await page.goto('https://testnet.nectarlabs.io/borrow', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('status', resp?.status(), 'url', page.url(), 'at', new Date().toISOString());
const notice = page.getByText('Recorded fixture', { exact: true }).first();
let ok = false;
try { await notice.waitFor({ state: 'visible', timeout: 45000 }); ok = true; } catch (e) { console.log('notice wait failed:', String(e).slice(0, 200)); }
const card = page.locator('.copilot').first();
console.log('copilot card count', await page.locator('.copilot').count());
if (ok) {
  const banner = notice.locator('xpath=ancestor::*[contains(@class,"banner") or @role="status" or @role="alert"][1]');
  const txt = (await banner.count()) ? await banner.innerText() : await notice.locator('xpath=..').innerText();
  console.log('notice text:', JSON.stringify(txt.replace(/\s+/g, ' ').trim()));
}
console.log('"Key missing" present:', await page.getByText(/key missing/i).count());
console.log('fixture button:', await page.getByRole('button', { name: 'Run verifier on recorded fixture' }).count());
if (await card.count()) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: shot, scale: 'css' }); console.log('screenshot', shot); }
console.log('RESULT', ok ? 'notice visible' : 'notice NOT visible');
await ctx.close();
process.exit(ok ? 0 : 1);
