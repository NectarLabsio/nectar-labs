// WO-67b: hydrated check of the README "Get test assets" line (read-only, no wallet).
import { chromium } from '/Volumes/T7/nectar-labs/apps/web/node_modules/@playwright/test/index.mjs';
const urls = [
  'https://testnet.nectarlabs.io/borrow',
  'https://nectarlabs.io/',
  'https://nectarlabs.io/about',
  'https://status.nectarlabs.io/',
];
const browser = await chromium.launch({ channel: 'chrome' });
const out = [];
for (const u of urls) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + String(e).slice(0, 160)));
  const resp = await page.goto(u, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const testAssets = await page.locator('[data-testid="test-assets"]').count();
  const connect = await page.locator('[data-testid="test-assets-connect"]').count();
  const text = testAssets ? (await page.locator('[data-testid="test-assets"]').first().innerText()).replace(/\s+/g, ' ') : '';
  const body = await page.locator('body').innerText();
  const mock = (body.match(/Mock assets, no value/g) || []).length;
  if (u.endsWith('/borrow')) {
    await page.locator('[data-testid="test-assets"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: process.argv[2] });
  }
  out.push({ url: u, status: resp?.status(), testAssets, connect, text, mockAssetsNoValue: mock, consoleErrors: errors.length, errors });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
