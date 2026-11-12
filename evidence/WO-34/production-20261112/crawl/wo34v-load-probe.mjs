// WO-34v (verifier probe): the crawl saw page.goto(SITE /) time out at 1440 px (both themes). Re-load SITE / 3x at 1440 and 1x at 400,
// fresh context each, 60 s cap; record time to DOMContentLoaded / load and any requests still pending when load fires or at the cap.
import { chromium } from "@playwright/test";
const URL_ = process.argv[2] ?? "https://nectarlabs.vercel.app/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const runs = [];
for (const [i, w] of [[1, 1440], [2, 1440], [3, 1440], [4, 400]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  const pending = new Map();
  const failed = [];
  page.on("request", (r) => pending.set(r, r.url()));
  page.on("requestfinished", (r) => pending.delete(r));
  page.on("requestfailed", (r) => { pending.delete(r); failed.push(`${r.url().slice(0, 100)} ${r.failure()?.errorText}`); });
  const t0 = Date.now();
  let dcl = null, load = null, err = null;
  page.once("domcontentloaded", () => (dcl = Date.now() - t0));
  try {
    await page.goto(URL_, { waitUntil: "load", timeout: 60_000 });
    load = Date.now() - t0;
  } catch (e) {
    err = String(e.message).split("\n")[0];
  }
  runs.push({ run: i, width: w, dclMs: dcl, loadMs: load, err, pendingAtEnd: [...pending.values()].map((u) => u.slice(0, 120)), failed });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ url: URL_, at: new Date().toISOString(), runs }, null, 2));
