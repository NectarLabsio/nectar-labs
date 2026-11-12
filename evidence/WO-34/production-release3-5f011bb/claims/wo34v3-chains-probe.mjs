// WO-34v3 item 1 (verifier probe, read-only): landing #chains — server HTML (JS disabled) vs hydrated Chrome (networkidle + 4 s).
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const SITE = "https://nectarlabs.vercel.app/";
const OUT = process.argv[2];
const norm = (s) => s.replace(/\s+/g, " ").trim();
const sentences = (s) => s.split(/\n+|(?<=[.!?])\s+/).map(norm).filter(Boolean);
const b = await chromium.launch({ channel: "chrome" });

// A: server HTML as rendered with JavaScript off.
const ctxA = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
const pa = await ctxA.newPage();
const resp = await pa.goto(SITE, { waitUntil: "load", timeout: 60000 });
const rawHtml = await resp.text();
const serverText = await pa.locator("#chains").innerText();
const serverTC = norm(await pa.locator("#chains").evaluate((n) => n.textContent));

// B: hydrated.
const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pb = await ctxB.newPage();
const consoleErr = [];
pb.on("console", (m) => { if (m.type() === "error") consoleErr.push({ text: m.text().slice(0, 300), url: m.location()?.url ?? "" }); });
pb.on("pageerror", (e) => consoleErr.push({ text: "pageerror " + e.message.slice(0, 300), url: "" }));
await pb.goto(SITE, { waitUntil: "networkidle", timeout: 90000 });
await pb.waitForTimeout(4000);
await pb.locator("#chains").scrollIntoViewIfNeeded();
await pb.waitForTimeout(500);
const hydText = await pb.locator("#chains").innerText();
const hydTC = norm(await pb.locator("#chains").evaluate((n) => n.textContent));
const parts = await pb.evaluate(() => {
  const c = document.querySelector("#chains");
  const steps = [...c.querySelectorAll("div")].filter((d) => /^0[34] /.test(d.querySelector("span")?.textContent ?? "")).map((d) => d.innerText.replace(/\s+/g, " ").trim());
  return { dataFeature: c.getAttribute("data-feature"), h2: c.querySelector("h2")?.innerText, intro: c.querySelector("p")?.innerText,
    steps34: [...new Set(steps)], settleNodes: [...c.querySelectorAll("[id]")].map((n) => n.id), bodyLocalFork: (document.body.innerText.match(/local fork/gi) ?? []).length };
});
await pb.locator("#chains").screenshot({ path: `${OUT}/chains-hydrated.png` });
const baseSent = sentences(hydText).filter((s) => /\bBase\b/.test(s));
const baseSentServer = sentences(serverText).filter((s) => /\bBase\b/.test(s));
const bodyBase = sentences(await pb.evaluate(() => document.body.innerText)).filter((s) => /\bBase\b/.test(s));
const ours = consoleErr.filter((e) => !/fastnear\.com/.test(e.text + e.url));
const r = {
  capturedUTC: new Date().toISOString(), status: resp.status(),
  equal_innerText: norm(serverText) === norm(hydText), equal_textContent: serverTC === hydTC,
  serverText: norm(serverText), hydratedText: norm(hydText), parts,
  baseSentencesHydrated: baseSent.map((s) => ({ s, localFork: /local fork/i.test(s) })),
  baseSentencesServer: baseSentServer.map((s) => ({ s, localFork: /local fork/i.test(s) })),
  bodyBaseSentencesHydrated: bodyBase.map((s) => ({ s, localFork: /local fork/i.test(s) })),
  rawHtmlHasHeading: /Base Sepolia local fork hold/.test(rawHtml), rawHtmlLocalForkCount: (rawHtml.match(/local fork/g) ?? []).length,
  consoleErrors: consoleErr.length, consoleOurs: ours, consoleThirdParty: consoleErr.length - ours.length,
};
writeFileSync(`${OUT}/chains.json`, JSON.stringify(r, null, 1));
console.log(JSON.stringify({ equal_innerText: r.equal_innerText, equal_textContent: r.equal_textContent, parts, nBaseHyd: baseSent.length,
  baseWithoutLocalFork: r.baseSentencesHydrated.filter((x) => !x.localFork), bodyBaseWithoutLocalFork: r.bodyBaseSentencesHydrated.filter((x) => !x.localFork),
  serverBaseWithoutLocalFork: r.baseSentencesServer.filter((x) => !x.localFork), console: [r.consoleErrors, ours] }, null, 1));
await b.close();
