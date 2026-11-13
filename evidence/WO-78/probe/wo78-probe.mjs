// WO-78 verifier probe (item 3): real Chrome, read-only, no wallet connect, no claim, no signing.
// APP /borrow and SITE / hydrated (networkidle + 4 s) at 1440 and 400 px: console errors, page errors, hydration messages, failed requests.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const HYD = /hydrat|did not match|#418|#423|#425|server rendered/i;
const res = { at: new Date().toISOString(), chrome: browser.version(), loads: [] };
for (const url of ["https://testnet.nectarlabs.io/borrow", "https://nectarlabs.io/"]) for (const width of [1440, 400]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errs = [], pageErrs = [], hyd = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); if (HYD.test(m.text())) hyd.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => { pageErrs.push(String(e).slice(0, 300)); if (HYD.test(String(e))) hyd.push(String(e).slice(0, 300)); });
  page.on("requestfailed", (r) => failed.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ""}`));
  const r = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(4000);
  const rec = { url, width, status: r?.status() ?? null, finalUrl: page.url(), consoleErrors: errs, pageErrors: pageErrs, hydration: hyd, failedRequests: failed };
  if (url.includes("/borrow")) {
    const ta = page.getByTestId("test-assets");
    rec.testAssetsText = (await ta.count()) ? (await ta.first().innerText()).replace(/\s+/g, " ").slice(0, 200) : null;
    if (width === 1440) await page.screenshot({ path: `${out}/app-borrow-hydrated.png` });
  } else {
    rec.h1 = await page.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.innerText).join(" | "));
  }
  res.loads.push(rec);
  console.log(`${url} @${width}: status ${rec.status}, console errors ${errs.length}, page errors ${pageErrs.length}, hydration ${hyd.length}, failed requests ${failed.length}${rec.testAssetsText ? `, test-assets: "${rec.testAssetsText}"` : ""}${rec.h1 ? `, h1: "${rec.h1}"` : ""}`);
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/probe.json`, JSON.stringify(res, null, 2));
const bad = res.loads.reduce((n, l) => n + l.consoleErrors.length + l.pageErrors.length + l.hydration.length, 0);
console.log(`total console+page+hydration errors: ${bad}`);
process.exit(bad ? 1 : 0);
