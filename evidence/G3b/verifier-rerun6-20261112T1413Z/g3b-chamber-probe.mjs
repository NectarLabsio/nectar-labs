// G3b run 6 (i): landing worked example (chamber) after hydration, each of the 4 states. Usage: node g3b-chamber-probe.mjs <baseURL>
// Reduced motion → the phase buttons switch state directly (Landing.tsx Chamber.pick). Read-only.
import { chromium } from "@playwright/test";

const BASE = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: "load" });
const out = [];
for (const k of [0, 1, 2, 3]) {
  await page.locator(`button[data-ph="${k}"]`).click();
  await page.waitForTimeout(400);
  const badge = (await page.locator("#ibadge").textContent())?.trim();
  const hl = (await page.locator("#lh").textContent())?.trim();
  const inst = (await page.locator("#inst").innerText()).replace(/\s+/g, " ");
  out.push({ phase: k, badge, haircut: hl, pcts: [...new Set(inst.match(/\d+(?:\.\d+)?%/g) ?? [])], inst: inst.slice(0, 400) });
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
