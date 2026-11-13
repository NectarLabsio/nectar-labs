// WO-67 verifier probe (A3 + A4): real Chrome, read-only, no wallet connect, no signing.
// A3: SITE / and STATUS / hydrated (networkidle + 4 s) at 1440 and 400 px: console errors, page errors, hydration messages;
//     landing: every hydrated sentence naming "Base" says "local fork"; #chains innerText JS-off == hydrated.
// A4: APP /borrow shows data-testid=test-assets with "Get test assets" + "Mock assets, no value" (no wallet = connect-prompt state);
//     SITE pages and STATUS / show neither.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const SITE = "https://nectarlabs.io", APP = "https://testnet.nectarlabs.io", STATUS = "https://status.nectarlabs.io";
const out = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const res = { at: new Date().toISOString(), a3: [], a4: {}, chains: {} };
const HYD = /hydrat|did not match|#418|#423|#425|server rendered/i;

async function load(url, { width = 1440, js = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: js });
  const page = await ctx.newPage();
  const errs = [], pageErrs = [], hyd = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); if (HYD.test(m.text())) hyd.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => { pageErrs.push(String(e).slice(0, 300)); if (HYD.test(String(e))) hyd.push(String(e).slice(0, 300)); });
  const r = await page.goto(url, { waitUntil: js ? "networkidle" : "load", timeout: 60000 });
  if (js) await page.waitForTimeout(4000);
  return { ctx, page, status: r?.status() ?? null, finalUrl: page.url(), errs, pageErrs, hyd };
}

for (const url of [`${SITE}/`, `${STATUS}/`]) for (const width of [1440, 400]) {
  const l = await load(url, { width });
  const body = await l.page.evaluate(() => document.body.innerText);
  const rec = { url, width, status: l.status, finalUrl: l.finalUrl, consoleErrors: l.errs, pageErrors: l.pageErrs, hydration: l.hyd };
  if (url === `${SITE}/`) {
    const sentences = body.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => /\bBase\b/.test(s));
    rec.baseSentences = sentences; rec.baseWithoutLocalFork = sentences.filter((s) => !/local fork/i.test(s));
  } else {
    rec.h1 = await l.page.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.innerText).join(" | "));
    rec.title = await l.page.title();
  }
  if (url === `${SITE}/` && width === 1440) await l.page.screenshot({ path: `${out}/site-landing-hydrated.png` });
  res.a3.push(rec); await l.ctx.close();
}
{ // #chains server render (JS off) vs hydrated
  const off = await load(`${SITE}/`, { js: false }), on = await load(`${SITE}/`);
  const t = async (p) => p.evaluate(() => (document.querySelector("#chains")?.innerText ?? "").replace(/\s+/g, " ").trim());
  const a = await t(off.page), b = await t(on.page);
  res.chains = { serverText: a.slice(0, 400), hydratedText: b.slice(0, 400), equal: a === b, present: a.length > 0 };
  await off.ctx.close(); await on.ctx.close();
}
{ // A4
  const l = await load(`${APP}/borrow`);
  const ta = l.page.locator('[data-testid="test-assets"]');
  await ta.first().waitFor({ timeout: 15000 }).catch(() => {});
  res.a4.app = { url: `${APP}/borrow`, status: l.status, count: await ta.count(), text: (await ta.count()) ? await ta.first().innerText() : "",
    connectPrompt: await l.page.locator('[data-testid="test-assets-connect"]').count(), consoleErrors: l.errs, pageErrors: l.pageErrs };
  await l.ctx.close();
  res.a4.siteAndStatus = [];
  for (const u of [`${SITE}/`, `${SITE}/about`, `${SITE}/security`, `${SITE}/changelog`, `${SITE}/talk`, `${SITE}/legal/privacy`, `${STATUS}/`]) {
    const s = await load(u);
    const body = await s.page.evaluate(() => document.body.innerText);
    res.a4.siteAndStatus.push({ url: u, finalUrl: s.finalUrl, testAssets: await s.page.locator('[data-testid="test-assets"]').count(),
      getTestAssetsText: /Get test assets/.test(body), mockNoValueText: /Mock assets, no value/.test(body) });
    await s.ctx.close();
  }
}
await browser.close();
writeFileSync(`${out}/probe.json`, JSON.stringify(res, null, 2));
const a3bad = res.a3.reduce((n, r) => n + r.consoleErrors.length + r.pageErrors.length + r.hydration.length, 0);
console.log(`A3 loads ${res.a3.length}, console+page+hydration errors total ${a3bad}`);
for (const r of res.a3) console.log(` ${r.url} @${r.width}: status ${r.status} final ${r.finalUrl} console ${r.consoleErrors.length} page ${r.pageErrors.length} hydration ${r.hydration.length}` +
  (r.baseSentences ? ` | Base sentences ${r.baseSentences.length}, without "local fork" ${r.baseWithoutLocalFork.length}` : ` | h1 "${r.h1}" title "${r.title}"`));
console.log(`#chains present ${res.chains.present}, server == hydrated ${res.chains.equal}`);
console.log(`A4 APP /borrow: test-assets ${res.a4.app.count}, connect prompt ${res.a4.app.connectPrompt}, text "${res.a4.app.text.replace(/\s+/g, " ")}"`);
for (const s of res.a4.siteAndStatus) console.log(` ${s.url} → ${s.finalUrl}: test-assets ${s.testAssets}, "Get test assets" ${s.getTestAssetsText}, "Mock assets, no value" ${s.mockNoValueText}`);
