// WO-87 verifier probe (items 2 + 3): system Chrome, read-only, no wallet connect, no claim, no signing.
// 6 pages x {1440, 400} px, networkidle + 4 s: footer innerText (rendered DOM), old-brand strings in body/footer text,
// console errors, page errors, hydration messages, failed requests. One element screenshot (SITE / footer @1440).
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const HYD = /hydrat|did not match|#418|#423|#425|server rendered/i;
const OLD = /Nectar Network product|2026 Nectar Network/i;
const PAGES = [
  { url: "https://nectarlabs.io/", web: true, errs: true },
  { url: "https://testnet.nectarlabs.io/borrow", web: true, errs: true },
  { url: "https://testnet.nectarlabs.io/feed", web: true, errs: false },
  { url: "https://status.nectarlabs.io/", web: true, errs: true },
  { url: "https://docs.nectarlabs.io/", web: false, errs: true },
  { url: "https://docs.nectarlabs.io/project/team", web: false, errs: false },
];
const res = { at: new Date().toISOString(), chrome: browser.version(), loads: [] };
let fails = 0;
for (const p of PAGES) for (const width of [1440, 400]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errs = [], pageErrs = [], hyd = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); if (HYD.test(m.text())) hyd.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => { pageErrs.push(String(e).slice(0, 300)); if (HYD.test(String(e))) hyd.push(String(e).slice(0, 300)); });
  page.on("requestfailed", (r) => failed.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ""}`));
  const r = await page.goto(p.url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(4000);
  const footer = page.locator("footer").last();
  await footer.scrollIntoViewIfNeeded().catch(() => {});
  const footerText = (await footer.count()) ? (await footer.innerText()).replace(/\s+/g, " ") : "";
  const bodyText = await page.evaluate(() => document.body.innerText);
  const html = await page.content();
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const rec = {
    url: p.url, width, status: r?.status() ?? null, finalUrl: page.url(), theme,
    footerHasProductLine: footerText.includes("A Nectar Labs product · testnet · mock collateral"),
    footerHasCopyright: footerText.includes("© 2026 Nectar Labs"),
    copyrightLine: (footerText.match(/© 2026 Nectar Labs[^©]{0,70}/) ?? [""])[0],
    oldInBodyText: (bodyText.match(new RegExp(OLD, "gi")) ?? []).length,
    oldInHydratedHtml: (html.match(new RegExp(OLD, "gi")) ?? []).length,
    consoleErrors: errs, pageErrors: pageErrs, hydration: hyd, failedRequests: failed,
  };
  const footerOk = p.web ? rec.footerHasProductLine && rec.footerHasCopyright : rec.footerHasCopyright && footerText.includes("testnet software · mock collateral");
  rec.footerOk = footerOk;
  const errN = errs.length + pageErrs.length + hyd.length;
  if (!footerOk || rec.oldInBodyText || rec.oldInHydratedHtml || (p.errs && errN)) fails++;
  if (p.url === "https://nectarlabs.io/" && width === 1440) await footer.screenshot({ path: `${out}/site-footer-hydrated.png` });
  res.loads.push(rec);
  console.log(`${p.url} @${width}: status ${rec.status}, theme ${theme}, footer product line ${rec.footerHasProductLine}, copyright ${rec.footerHasCopyright} ("${rec.copyrightLine.trim()}"), old-brand body ${rec.oldInBodyText} html ${rec.oldInHydratedHtml}, console errors ${errs.length}, page errors ${pageErrs.length}, hydration ${hyd.length}, failed requests ${failed.length}${p.errs ? "" : " (errors not in criterion)"} → ${footerOk ? "footer ok" : "FOOTER MISSING"}`);
  for (const e of [...errs, ...pageErrs, ...failed]) console.log(`    ${e}`);
  await ctx.close();
}
// theme mechanism check for Lighthouse: web follows prefers-color-scheme; docs follows ?docusaurus-theme (respectPrefersColorScheme false).
const themes = [];
for (const [url, scheme] of [["https://nectarlabs.io/", "dark"], ["https://nectarlabs.io/", "light"], ["https://testnet.nectarlabs.io/borrow", "dark"], ["https://testnet.nectarlabs.io/borrow", "light"], ["https://docs.nectarlabs.io/", "light"], ["https://docs.nectarlabs.io/?docusaurus-theme=light", "dark"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => ({ dataTheme: document.documentElement.getAttribute("data-theme"), bg: getComputedStyle(document.body).backgroundColor }));
  themes.push({ url, scheme, ...t });
  console.log(`theme: ${url} prefers=${scheme} → data-theme ${t.dataTheme}, body bg ${t.bg}`);
  await ctx.close();
}
res.themes = themes;
await browser.close();
writeFileSync(`${out}/probe.json`, JSON.stringify(res, null, 2));
console.log(`pages failing a criterion (footer / old brand / errors on the 4 error pages): ${fails}`);
process.exit(fails ? 1 : 0);
