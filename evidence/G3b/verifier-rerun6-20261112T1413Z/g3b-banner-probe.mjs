// G3b run 6 (i): event-history banner with a views-mode Feed vs no Feed. Usage: node g3b-banner-probe.mjs <withFeedBase> <noFeedBase> <out.json>
// Read-only: opens pages, never connects a wallet, never signs.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [WITH, WITHOUT, OUT] = process.argv.slice(2);
const TITLE = "Event history isn't indexed on this host";
const browser = await chromium.launch({ channel: "chrome" });
const res = {};
async function probe(label, base) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const r = {};
  for (const route of ["/feed", "/keepers", "/status"]) {
    await page.goto(base + route, { waitUntil: "load" });
    const o = {};
    if (route === "/status") {
      try {
        const dd = page.getByTestId("feed-events");
        await dd.waitFor({ state: "visible", timeout: 20_000 });
        o.feedEvents = (await dd.textContent())?.trim();
      } catch { o.feedEvents = null; }
    } else {
      let vis = false;
      try { await page.getByText(TITLE).first().waitFor({ state: "visible", timeout: label === "withFeed" ? 25_000 : 8_000 }); vis = true; } catch {}
      o.banner = vis;
      o.bannerCount = await page.getByTestId("events-not-indexed").count();
      if (route === "/feed") {
        o.settlementsViewsEmpty = await page.getByTestId("settlements-views-empty").count();
        o.notConfigured = await page.getByText("Feed indexer not configured").count();
      }
    }
    r[route] = o;
  }
  await ctx.close();
  res[label] = r;
}
await probe("withFeed", WITH);
await probe("noFeed", WITHOUT);
await browser.close();
writeFileSync(OUT, `${JSON.stringify(res, null, 2)}\n`);
console.log(JSON.stringify(res));
