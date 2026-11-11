import { chromium } from "@playwright/test";
const BASE = "http://localhost:3100";
const ROUTES = ["/", "/feed", "/feed/NVDAx", "/borrow", "/shield", "/position/10", "/notes", "/quote", "/reserve", "/console", "/agents"];
const b = await chromium.launch({ channel: "chrome" });
let fail = 0;
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, colorScheme: theme, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on("response", (r) => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`); });
  for (const r of ROUTES) {
    const resp = await p.goto(BASE + r, { waitUntil: "load" });
    await p.waitForTimeout(2500);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: window.innerWidth,
      dt: document.documentElement.getAttribute("data-theme"), bg: getComputedStyle(document.body).backgroundColor,
      wide: [...document.querySelectorAll("body *")].filter(e => { const x = e.getBoundingClientRect(); return x.right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map(e => e.tagName + "." + (e.className?.toString?.() ?? "").slice(0, 40)) }));
    const ok = m.sw <= m.cw;
    if (!ok) fail++;
    console.log(`${theme}\t${r}\tHTTP ${resp?.status()}\tscrollW=${m.sw}\tclientW=${m.cw}\tnoHScroll=${ok}\tdata-theme=${m.dt}\tbody-bg=${m.bg}${ok ? "" : "\toverflow=" + m.wide.join(",")}`);
    if (theme === "dark" && r === "/borrow") await p.screenshot({ path: process.argv[2], fullPage: false });
  }
  console.log(`${theme} 5xx: ${errs.length} ${errs.slice(0, 3).join(" ")}`);
  await ctx.close();
}
await b.close();
console.log(fail ? `FAIL: ${fail} route/theme pairs scroll horizontally at 400px` : "OK: no horizontal scroll at 400px on any route/theme");
process.exit(fail ? 1 : 0);
