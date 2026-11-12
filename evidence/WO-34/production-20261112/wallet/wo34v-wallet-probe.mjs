// WO-34v item 5 (verifier probe, not product code): on production APP /borrow open the real near-connect selector at 1440 and 400 px,
// check every wallet row is fully inside the viewport and is the topmost element at its centre (clickable), and hover/trial-click the
// first row without clicking through. Never signs. One screenshot (400 px) to evidence.
import { chromium } from "@playwright/test";
const APP = "https://nectarlabs-app.vercel.app";
const SHOT = process.argv[2];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = [];
for (const vp of [{ width: 1440, height: 900 }, { width: 400, height: 860 }]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  await page.goto(`${APP}/borrow`, { waitUntil: "load" });
  const banner = page.getByTestId("consent");
  if (await banner.isVisible().catch(() => false)) await page.getByTestId("consent-decline").click();
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  const items = page.locator(".hot-connector-popup .connect-item");
  await items.first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1500);
  const rows = await items.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {
        name: el.innerText.split("\n")[0].trim(),
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        fullyInViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0 && r.height > 0,
        topmostAtCentre: !!top && (top === el || el.contains(top)),
      };
    }),
  );
  let trial = "n/a";
  try {
    await items.first().click({ trial: true, timeout: 5000 });
    trial = "ok (actionable: visible, stable, receives events)";
  } catch (e) {
    trial = `FAILED ${String(e.message).split("\n")[0]}`;
  }
  if (vp.width === 400 && SHOT) await page.screenshot({ path: SHOT });
  out.push({ viewport: `${vp.width}x${vp.height}`, rowCount: rows.length, rows, firstRowTrialClick: trial, consoleErrors: errors });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
