import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs=[]; p.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,160)); });
for (const r of ["/feed", "/notes", "/reserve", "/"]) {
  await p.goto("http://localhost:3100" + r, { waitUntil: "networkidle" });
  await p.waitForTimeout(15000);
  const t = (await p.innerText("body")).replace(/\s+/g, " ");
  console.log(`== ${r}\n${r==="/feed"? t.slice(600,2400) : r==="/"? (t.match(/.{0,200}(Committed quotes|IN SESSION|WEEKEND).{0,300}/)||[""])[0] : t.slice(0,1400)}`);
}
console.log("console errors:", errs.slice(0,8));
await b.close();
