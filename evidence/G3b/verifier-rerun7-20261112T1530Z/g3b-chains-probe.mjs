// G3b run 7 (l): WO-35i landing #chains in a HYDRATED real Chrome vs the server HTML; Base sentences say "local fork"; LandingNav "Chains" link consistent.
// Usage (from apps/web so @playwright/test resolves): node g3b-chains-probe.mjs <baseURL> <out.json> <screenshot.png>. Read-only, real testnet RPC, no mocks
// except the localhost-only __NECTAR_E2E_MOCK__ flag pin (same mechanism as e2e/helpers.ts pinFlags).
import { writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const [BASE, OUT, PNG] = process.argv.slice(2);
const norm = (t) => (t ?? "").replace(/\s+/g, " ").trim();
const serverHtml = await (await fetch(`${BASE}/`)).text();
const browser = await chromium.launch({ channel: "chrome" });

// Same sentence split as v7.spec.ts baseSentences, run on a given root (live section or parsed server section).
const sentencesFn = (sec) => {
  if (!sec) return [];
  const texts = [...sec.querySelectorAll("h2, h3, p, li, span")].map((e) => e.textContent ?? "");
  texts.push(...[...sec.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? ""));
  return texts.flatMap((t) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter((x) => /\bBase\b/.test(x));
};

async function run(label, pin, viewport) {
  const ctx = await browser.newContext(viewport === "phone" ? { ...devices["Pixel 7"] } : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  await page.addInitScript(() => localStorage.setItem("nectar-consent", JSON.stringify({ v: 1, analytics: false, at: Date.now() })));
  if (pin) await page.addInitScript((features) => { window.__NECTAR_E2E_MOCK__ = { ...(window.__NECTAR_E2E_MOCK__ ?? {}), features }; }, pin);
  const rpc = [];
  page.on("request", (r) => /fastnear|drpc|rpc/.test(r.url()) && rpc.push((r.postData() ?? "").includes("contract_version") ? "contract_version" : "other"));
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);
  const r = await page.evaluate(({ html, sfSrc }) => {
    const sf = new Function(`return (${sfSrc})`)();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const sSec = doc.querySelector("section#chains");
    const hSec = document.querySelector("section#chains");
    const navLinks = (root) => [...root.querySelectorAll("nav#nav a")].map((a) => `${a.getAttribute("href")}|${a.textContent.trim()}`).filter((x) => x.startsWith("#"));
    return {
      server_section: !!sSec, hydrated_section: !!hSec,
      server_text: sSec ? sSec.textContent : null, hydrated_text: hSec ? hSec.textContent : null,
      server_base: sf(sSec), hydrated_base: sf(hSec),
      server_nav: navLinks(doc), hydrated_nav: navLinks(document),
      hublinks_drawn: !!document.querySelector("#hublinks path"),
      nbase: document.querySelectorAll("#nbase").length,
      hydrated_body: document.body.innerText,
      metas: [...document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]')].map((m) => m.content),
    };
  }, { html: serverHtml, sfSrc: sentencesFn.toString() });
  const eq = norm(r.server_text) === norm(r.hydrated_text);
  const navChainsS = r.server_nav.some((x) => x.startsWith("#chains|"));
  const navChainsH = r.hydrated_nav.some((x) => x.startsWith("#chains|"));
  const badBase = r.hydrated_base.filter((x) => !x.includes("local fork"));
  const res = {
    label, pin: pin ?? "config.yaml (no pin)", viewport,
    hydrated_equals_server: eq, server_section: r.server_section, hydrated_section: r.hydrated_section, hublinks_drawn: r.hublinks_drawn, nbase: r.nbase,
    server_text: norm(r.server_text), hydrated_text: norm(r.hydrated_text),
    hydrated_base_sentences: r.hydrated_base, server_base_sentences: r.server_base, base_without_local_fork: badBase,
    nav_server: r.server_nav, nav_hydrated: r.hydrated_nav,
    nav_consistent: navChainsH === r.hydrated_section && navChainsS === r.server_section,
    rpc_calls: rpc.length, contract_version_calls: rpc.filter((x) => x === "contract_version").length, console_errors: consoleErrors,
  };
  if (!pin && viewport === "desktop") {
    const body = r.hydrated_body;
    const lines = body.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const tee = lines.filter((l) => /\bTEE\b/.test(l));
    res.hydrated_claims = {
      no_0123456789: !body.includes("0123456789") && r.metas.every((m) => !m.includes("0123456789")),
      base_lines_page: lines.filter((l) => /\bBase\b/.test(l)),
      tee_lines: tee, tee_all_verifiable: tee.length > 0 && tee.every((l) => /verifiab/i.test(l)), tee_none_private: tee.every((l) => !/private|confidential/i.test(l)),
      confidential_anywhere: /confidential/i.test(body), no_until_reserve_ships: !/until the Reserve ships/i.test(body),
    };
    if (PNG && r.hydrated_section) await page.locator("section#chains").screenshot({ path: PNG });
  }
  await ctx.close();
  return res;
}

const results = [];
results.push(await run("config", null, "desktop"));
results.push(await run("config", null, "phone"));
for (const pin of [[], ["solana_remote"], ["base"], ["solana_remote", "base"]]) results.push(await run(`pinned[${pin.join("+")}]`, pin, "desktop"));
await browser.close();
writeFileSync(OUT, JSON.stringify(results, null, 2));
for (const x of results) {
  console.log(`${x.label} ${x.viewport}: section server=${x.server_section} hydrated=${x.hydrated_section} equal=${x.hydrated_equals_server} base_sentences=${x.hydrated_base_sentences.length} without_local_fork=${x.base_without_local_fork.length} nav_consistent=${x.nav_consistent} nav_chains_hydrated=${x.nav_hydrated.some((n) => n.startsWith("#chains|"))} nbase=${x.nbase} cv_calls=${x.contract_version_calls} console_err=${x.console_errors.length}`);
}
const cfg = results.filter((x) => x.label === "config");
const pass = cfg.every((x) => x.hydrated_equals_server && x.hydrated_section && x.base_without_local_fork.length === 0 && x.hydrated_base_sentences.length > 0 && x.nav_consistent)
  && results.every((x) => x.base_without_local_fork.length === 0 && x.nav_consistent);
console.log(`(l) hand check: ${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
