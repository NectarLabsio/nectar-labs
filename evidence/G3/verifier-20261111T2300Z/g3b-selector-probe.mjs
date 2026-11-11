// G3b re-run 3: real near-connect selector, fresh profile, consent banner left visible; every wallet row fully visible?
// Usage: node g3b-selector-probe.mjs <baseURL> <outDir>. Never clicks a wallet, never signs.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const result = {};
for (const [name, opts] of [
  ["desktop", { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } }],
  ["phone", { ...devices["Pixel 7"], viewport: { width: 400, height: 860 } }],
]) {
  const ctx = await browser.newContext(opts); // fresh profile, no storage
  const page = await ctx.newPage();
  const mockFlag = [];
  await page.goto(`${BASE}/borrow`, { waitUntil: "load" });
  mockFlag.push(await page.evaluate(() => typeof window.__NECTAR_E2E_MOCK__));
  const banner = page.getByTestId("consent");
  const bannerVisible = await banner.isVisible().catch(() => false);
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  const items = page.locator(".hot-connector-popup .connect-item");
  await items.first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(2500);
  const bannerStillVisible = await banner.isVisible().catch(() => false);
  const bannerBox = bannerStillVisible ? await banner.boundingBox() : null;
  const n = await items.count();
  const rows = [];
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    const label = ((await it.innerText()).split("\n")[0] ?? "").trim();
    const before = await it.boundingBox();
    await it.scrollIntoViewIfNeeded();
    const box = await it.boundingBox();
    // Hit-test centre + 4 inset corners: the topmost element (through shadow roots) must sit inside the row.
    const hits = await it.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
      const deep = (x, y) => { let e = document.elementFromPoint(x, y); while (e && e.shadowRoot) { const d = e.shadowRoot.elementFromPoint(x, y); if (!d || d === e) break; e = d; } return e; };
      return pts.map(([x, y]) => { const e = deep(x, y); return !!e && (el === e || el.contains(e)); });
    });
    const vp = page.viewportSize();
    const inViewport = !!box && box.y >= 0 && box.x >= 0 && box.y + box.height <= vp.height && box.x + box.width <= vp.width;
    const inViewportNoScroll = !!before && before.y >= 0 && before.y + before.height <= vp.height;
    const overlapsBanner = !!(bannerBox && box && box.y < bannerBox.y + bannerBox.height && box.y + box.height > bannerBox.y && box.x < bannerBox.x + bannerBox.width && box.x + box.width > bannerBox.x);
    rows.push({ label, box, inViewport, inViewportNoScroll, overlapsBanner, hitsInside: hits, fullyVisible: inViewport && !overlapsBanner && hits.every(Boolean) });
  }
  if (name === "phone") {
    await items.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/selector-phone.png` });
  }
  result[name] = { mockType: mockFlag[0], bannerVisibleBeforeConnect: bannerVisible, bannerVisibleWithSelector: bannerStillVisible, bannerBox, walletCount: n, allFullyVisible: rows.every((r) => r.fullyVisible), rows };
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/selector-visibility.json`, JSON.stringify(result, null, 2));
for (const [k, v] of Object.entries(result)) console.log(k, "mock:", v.mockType, "banner:", v.bannerVisibleWithSelector, "wallets:", v.walletCount, "allFullyVisible:", v.allFullyVisible, v.rows.map((r) => `${r.label}${r.fullyVisible ? "" : "(NOT VISIBLE)"}`).join(", "));
