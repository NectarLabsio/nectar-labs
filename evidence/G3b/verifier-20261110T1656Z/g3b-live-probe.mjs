import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
for (const r of ["/", "/feed", "/notes", "/reserve", "/borrow"]) {
  await p.goto("http://localhost:3100" + r, { waitUntil: "networkidle" });
  await p.waitForTimeout(6000);
  const t = (await p.innerText("main").catch(() => p.innerText("body"))).replace(/\s+/g, " ");
  const pick = (re) => [...new Set((t.match(re) || []))].slice(0, 6).join(" | ");
  console.log(`== ${r} (${t.length} chars)`);
  console.log("  version:", pick(/2\.0\.0-v7|v2|nectar-core-v2[^ ]*/g));
  console.log("  session:", pick(/(in session|weekend|session (open|closed)|market (open|closed)|Session[^.]{0,30})/gi));
  console.log("  quotes:", pick(/(\d+ (live |committed |active )?quotes?|Quote #?\d+)/gi));
  console.log("  notes:", pick(/(Note #?\d+|\d+ notes?)/gi));
  console.log("  reserve:", pick(/(R_c[^$]{0,20}\$[\d,.]+|Reserve[^$]{0,30}\$[\d,.]+)/g));
  if (r === "/feed") { const qc = await p.locator('[data-testid^="quote-row"], [data-testid="quote-row"], table tbody tr').count(); console.log("  quote rows:", qc); await p.screenshot({ path: process.argv[2], fullPage: true }); }
  if (r === "/feed") console.log("  excerpt:", t.slice(0, 700));
}
await b.close();
