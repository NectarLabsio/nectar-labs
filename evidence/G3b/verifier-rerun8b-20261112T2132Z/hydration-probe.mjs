#!/usr/bin/env node
// G3b run 8b (p): hydration probe (WO-66b). Loads SITE / and STATUS / N times each in Chrome against the hosted `next start`,
// desktop (1280x900, Desktop Chrome) and phone (Pixel 7, 400x860) like playwright.config, and collects console errors + page errors.
// Modes:
//   plain      = the ordered method: fresh context per load, plain page.goto, waitUntil networkidle + 2 s, no throttling, no init script.
//   crawlstyle = supplement only: the crawler's 4 contexts (dark/light x 1440/400) with its localStorage theme + consent init script,
//                loaded in parallel (like a non-polite crawl), waitUntil load + 800 ms, N rounds per URL.
// Usage (from apps/web so @playwright/test resolves): node hydration-probe.mjs <siteUrl> <statusUrl> <out.json> [plain|crawlstyle] [N]
import { chromium, devices } from "@playwright/test";
import { writeFileSync } from "node:fs";

const [, , SITE, STATUS, OUT, MODE = "plain", NS = "10"] = process.argv;
const N = Number(NS);
const HYD = /Minified React error #(418|419|421|422|423|425)|hydrat|did not match|server rendered HTML|server-rendered/i;
const strip = ({ defaultBrowserType, ...d }) => d; // eslint-disable-line no-unused-vars
const VPS = {
  desktop: { ...strip(devices["Desktop Chrome"]), viewport: { width: 1280, height: 900 } },
  phone: { ...strip(devices["Pixel 7"]), viewport: { width: 400, height: 860 } },
};
const CRAWL_VARIANTS = [
  { theme: "dark", width: 1440, height: 900 },
  { theme: "light", width: 1440, height: 900 },
  { theme: "dark", width: 400, height: 860 },
  { theme: "light", width: 400, height: 860 },
];
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const loads = [];

async function loadOnce(url, label, ctxOpts, init, waitUntil, settleMs) {
  const ctx = await browser.newContext(ctxOpts);
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const consoleWarnings = [];
  page.on("console", async (m) => {
    const t = m.type();
    if (t !== "error" && t !== "warning") return;
    const rec = { text: m.text().slice(0, 2000), at: m.location()?.url ? `${m.location().url}:${m.location().lineNumber}:${m.location().columnNumber}` : null };
    if (t === "error") consoleErrors.push(rec);
    else if (HYD.test(rec.text)) consoleWarnings.push(rec);
  });
  page.on("pageerror", (e) => pageErrors.push({ message: String(e.message).slice(0, 2000), stack: String(e.stack ?? "").slice(0, 3000) }));
  const t0 = Date.now();
  let nav = "ok";
  try {
    await page.goto(url, { waitUntil, timeout: 60_000 });
    await page.waitForTimeout(settleMs);
  } catch (e) {
    nav = `navigation: ${String(e.message ?? e).slice(0, 200)}`;
  }
  const ms = Date.now() - t0;
  const htmlTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme") ?? document.documentElement.className).catch(() => null);
  await ctx.close();
  const hydration = [...consoleErrors, ...consoleWarnings].filter((r) => HYD.test(r.text)).map((r) => r.text)
    .concat(pageErrors.filter((p) => HYD.test(p.message)).map((p) => `pageerror: ${p.message}`));
  const rec = { url, label, ms, nav, htmlTheme, consoleErrors, pageErrors, hydrationWarnings: consoleWarnings, hydration };
  loads.push(rec);
  return rec;
}

const targets = [
  ["SITE /", `${SITE.replace(/\/+$/, "")}/`],
  ["STATUS /", `${STATUS.replace(/\/+$/, "")}/`],
];
if (MODE === "plain") {
  for (const [name, url] of targets)
    for (const [vp, opts] of Object.entries(VPS))
      for (let i = 1; i <= N; i++) {
        const r = await loadOnce(url, `${name} ${vp} #${i}`, opts, null, "networkidle", 2000);
        console.log(`${r.label}: ${r.ms} ms nav=${r.nav} consoleErrors=${r.consoleErrors.length} pageErrors=${r.pageErrors.length} hydration=${r.hydration.length}`);
      }
} else {
  const init = {
    fn: (t) => {
      try {
        localStorage.setItem("nectar-theme", t);
        localStorage.setItem("nectar-consent", JSON.stringify({ v: 1, analytics: false, at: Date.now() }));
        localStorage.setItem("theme", t);
      } catch {}
    },
  };
  for (const [name, url] of targets)
    for (let i = 1; i <= N; i++) {
      const rs = await Promise.all(
        CRAWL_VARIANTS.map((v) => loadOnce(url, `${name} ${v.theme}@${v.width} round ${i}`, { viewport: { width: v.width, height: v.height } }, { ...init, arg: v.theme }, "load", 800)),
      );
      for (const r of rs) console.log(`${r.label}: ${r.ms} ms nav=${r.nav} consoleErrors=${r.consoleErrors.length} pageErrors=${r.pageErrors.length} hydration=${r.hydration.length}`);
    }
}
await browser.close();

const sum = (f) => loads.reduce((a, r) => a + f(r), 0);
const byTarget = {};
for (const r of loads) {
  const k = r.label.split(" ").slice(0, 3).join(" ");
  byTarget[k] ??= { loads: 0, hydration: 0, consoleErrors: 0, pageErrors: 0, navFail: 0 };
  byTarget[k].loads++;
  byTarget[k].hydration += r.hydration.length;
  byTarget[k].consoleErrors += r.consoleErrors.length;
  byTarget[k].pageErrors += r.pageErrors.length;
  byTarget[k].navFail += r.nav === "ok" ? 0 : 1;
}
const distinctErrors = [...new Set(loads.flatMap((r) => [...r.consoleErrors.map((c) => c.text.slice(0, 240)), ...r.pageErrors.map((p) => `pageerror: ${p.message.slice(0, 240)}`)]))];
const summary = {
  mode: MODE, n: N, at: new Date().toISOString(), loads: loads.length,
  hydrationErrors: sum((r) => r.hydration.length), loadsWithHydration: loads.filter((r) => r.hydration.length).length,
  consoleErrors: sum((r) => r.consoleErrors.length), pageErrors: sum((r) => r.pageErrors.length), navFailures: loads.filter((r) => r.nav !== "ok").length,
  byTarget, distinctErrors,
};
writeFileSync(OUT, JSON.stringify({ summary, loads }, null, 2));
console.log(`SUMMARY ${JSON.stringify(summary)}`);
process.exit(summary.hydrationErrors > 0 ? 1 : 0);
