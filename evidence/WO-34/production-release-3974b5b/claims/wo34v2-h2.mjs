// WO-34v2 item 3 follow-up (verifier probe): hydrated "holds the stock" heading on SITE /, and its rendering state.
import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto("https://nectarlabs.vercel.app/", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(3000);
const r = await p.evaluate(() => [...document.querySelectorAll("h2")].filter((h) => /book|stock/.test(h.textContent)).map((h) => {
  const sec = h.closest("section") ?? h;
  return { text: h.textContent, innerText: h.innerText, display: getComputedStyle(h).display, visibility: getComputedStyle(h).visibility,
    height: h.getBoundingClientRect().height, sectionCV: getComputedStyle(sec).contentVisibility, sectionFeature: sec.getAttribute("data-feature"),
    settleNodes: [...document.querySelectorAll("#nsol,#nbase")].map((n) => n.id) };
}));
console.log(JSON.stringify(r, null, 1));
const bodyHasLocalFork = await p.evaluate(() => ({ innerText: /local fork/i.test(document.body.innerText), textContent: /local fork/i.test(document.body.textContent) }));
console.log("local fork in body:", JSON.stringify(bodyHasLocalFork));
await p.locator("h2", { hasText: "holds the stock" }).first().scrollIntoViewIfNeeded().catch(() => {});
await p.waitForTimeout(1500);
console.log("after scroll innerText:", await p.locator("h2", { hasText: "holds the stock" }).first().innerText().catch((e) => "ERR " + e.message.slice(0, 80)));
await b.close();
