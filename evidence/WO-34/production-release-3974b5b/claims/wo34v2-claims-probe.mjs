// WO-34v2 item 3 (verifier probe, read-only): landing claims on production, rendered + hydrated in installed Chrome. Never signs.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const SITE = "https://nectarlabs.vercel.app";
const APP = "https://nectarlabs-app.vercel.app";
const OUT = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
const r = {};
await page.goto(SITE + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);
const body = await page.evaluate(() => document.body.innerText);
// accessible text: innerText of a clone with aria-hidden subtrees removed
const a11y = await page.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
  return c.textContent;
});
const raw = await (await fetch(SITE + "/")).text();
const rawText = raw.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "");
const meta = await page.evaluate(() => [...document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]')].map((m) => m.content));
r.digits = {
  innerText: body.includes("0123456789"), innerTextNoWs: body.replace(/\s+/g, "").includes("0123456789"), a11yText: a11y.replace(/\s+/g, "").includes("0123456789"),
  rawHtmlText: rawText.includes("0123456789"), rawHtmlTextNoWs: rawText.replace(/\s+/g, "").includes("0123456789"), meta, metaHit: meta.some((m) => m.includes("0123456789")),
};
const lines = body.split("\n").map((s) => s.trim()).filter(Boolean);
r.baseLines = lines.filter((l) => /\bBase\b/.test(l)).slice(0, 12);
r.localForkCount = (body.match(/local fork/gi) ?? []).length;
r.teeLines = lines.filter((l) => /\bTEE\b/.test(l));
r.teeBad = r.teeLines.filter((l) => /private|confidential|hidden/i.test(l));
r.teeAllVerifiable = r.teeLines.every((l) => /verifiab/i.test(l));
r.privateAnywhere = lines.filter((l) => /\b(private|confidential)\b/i.test(l)).slice(0, 8);
r.exampleLines = lines.filter((l) => /LTV|haircut|liquidat|max LTV|40%|70%|10%|25%/i.test(l)).slice(0, 25);
r.reserveShips = body.includes("until the Reserve ships");
r.landingConsoleErrors = [...errors];
for (const p of ["/feed", "/keepers"]) {
  errors.length = 0;
  await page.goto(APP + p, { waitUntil: "domcontentloaded", timeout: 60000 });
  const loc = page.getByTestId("events-not-indexed").first();
  let visible = false;
  try { await loc.waitFor({ state: "visible", timeout: 30000 }); visible = true; } catch {}
  r[p] = { bannerVisible: visible, bannerText: visible ? (await loc.innerText()).replace(/\s+/g, " ").slice(0, 300) : null, consoleErrors: [...errors] };
  if (p === "/feed" && visible && process.argv[3]) { await loc.scrollIntoViewIfNeeded(); await page.screenshot({ path: process.argv[3] }); }
}
writeFileSync(OUT, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));
await browser.close();
