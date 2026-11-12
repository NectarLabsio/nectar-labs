// G3b run 8 (m) by-hand claims probe on a local `next start` (no mocks, real testnet RPC, consent declined).
// Usage (from apps/web): node g3b-claims-probe.mjs <baseURL> <out.json> [screenshot.png]
// Checks: Base sentences say "local fork of Base Sepolia" with JS off and hydrated (same #chains text); Reserve card = live get_reserve
// r_usd_e6; chamber R = live get_exit_capacity r_usd_e6; LTV/haircut shown = live get_collateral (and config.yaml); counters plain in server
// HTML (no 0123456789, no reels), hydrated reels aria-hidden. Read-only, never signs.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.argv[2];
const OUT = process.argv[3];
const SHOT = process.argv[4];
const CORE = "nectar-core-v2.nectar.testnet";
const RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"];
async function view(method, args) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: CORE, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }) });
      const j = await r.json();
      if (j.result?.result) return { rpc: url, block_height: j.result.block_height, value: JSON.parse(Buffer.from(j.result.result).toString("utf8")) };
    } catch {}
  }
  return { rpc: null, value: null };
}
const pct = (bps) => `${Number((bps / 100).toFixed(2))}%`;
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const res = { base: BASE, at: new Date().toISOString(), checks: [] };
const ok = (name, pass, detail) => res.checks.push({ name, pass: !!pass, detail });

const col = await view("get_collateral", { symbol: "NVDAx" });
const rsv = await view("get_reserve", { symbol: "NVDAx" });
const cap = await view("get_exit_capacity", { symbol: "NVDAx" });
const C = col.value ?? {};
res.live = { rpc: col.rpc, block: col.block_height, get_collateral: { base_ltv_bps: C.base_ltv_bps, max_nectar_ltv_bps: C.max_nectar_ltv_bps, base_haircut_bps: C.base_haircut_bps, weekend_haircut_bps: C.weekend_haircut_bps }, get_reserve: rsv.value, get_exit_capacity_r_usd_e6: cap.value?.r_usd_e6 };

const baseSentences = (page) => page.locator("main, body").first().evaluate((root) => {
  const texts = [...root.querySelectorAll("h1, h2, h3, p, li, span, small, summary, dd")].map((e) => e.textContent ?? "");
  texts.push(...[...root.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? ""));
  return [...new Set(texts.flatMap((t) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter((x) => /\bBase\b/.test(x)))];
});
const consent = (ctx) => ctx.addInitScript(() => { try { localStorage.setItem("nectar-consent", JSON.stringify({ v: 1, analytics: false, at: Date.now() })); } catch {} });

const browser = await chromium.launch({ channel: "chrome" });
// 1. Server render (JS off).
const rawHtml = await (await fetch(`${BASE}/`)).text();
ok("server HTML: no 0123456789 anywhere in the raw HTML", !rawHtml.includes("0123456789"));
ok("server HTML text: no 0123456789", !rawHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, "").includes("0123456789"));
const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
const rp = await off.newPage();
await rp.goto(`${BASE}/`);
const serverChains = (await rp.locator("section#chains").count()) ? norm(await rp.locator("section#chains").innerText()) : null;
const serverBase = await baseSentences(rp);
const rolls = await rp.locator("[data-roll]").evaluateAll((els) => els.map((e) => ({ id: e.id, roll: e.getAttribute("data-roll"), text: (e.textContent ?? "").replace(/\s+/g, " ").trim(), visible: !!(e.offsetWidth || e.offsetHeight) })));
const serverReels = await rp.locator("[data-reels]").count();
const serverText = norm(await rp.locator("body").innerText());
await off.close();
res.server = { chains: serverChains, baseSentences: serverBase, rolls, reels: serverReels };
ok("JS off: #chains present", serverChains !== null);
ok("JS off: names Base settlement as a local fork of Base Sepolia", serverChains?.includes("Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia."));
ok("JS off: every Base sentence says local fork", serverBase.length > 0 && serverBase.every((x) => x.includes("local fork")), serverBase.filter((x) => !x.includes("local fork")));
ok("JS off: >= 3 counters, each plain text = data-roll", rolls.length >= 3 && rolls.every((r) => r.text === r.roll), rolls);
ok("JS off: no reel nodes", serverReels === 0, serverReels);
ok("JS off: no 85%/12%/400 bps parameter text", !/\b85%|\b12%|400 bps|1200 \/ 400/.test(serverText), (serverText.match(/.{0,40}(\b85%|\b12%|400 bps).{0,20}/g) ?? []));

// 2. Hydrated, real RPC.
const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
await consent(ctx);
const page = await ctx.newPage();
const rpcMethods = new Set();
const errors = [];
page.on("request", (r) => { if (r.method() === "POST") { try { const b = r.postDataJSON(); const m = b?.params?.method_name; if (m) rpcMethods.add(`${new URL(r.url()).host}:${m}`); } catch {} } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForTimeout(6000);
const hydChains = (await page.locator("section#chains").count()) ? norm(await page.locator("section#chains").innerText()) : null;
const hydBase = await baseSentences(page);
const rUsd = rsv.value ? `$${(Number(rsv.value.r_usd_e6) / 1e6).toFixed(2)}` : null;
const shownR = norm(await page.getByTestId("landing-reserve-r").textContent().catch(() => null));
const shownDisc = norm(await page.getByTestId("landing-reserve-discount").textContent().catch(() => null));
const shownNotice = norm(await page.getByTestId("landing-reserve-notice").textContent().catch(() => null));
const how = norm(await page.locator("#how").innerText());
const capR = cap.value ? Number(BigInt(cap.value.r_usd_e6) / 1_000_000n) : null;
const btn = page.locator("#how").getByRole("button", { name: /Committed quotes raise the ceiling/ });
await btn.click();
await page.waitForTimeout(500);
const lh = norm(await page.locator("#lh").textContent());
const lr = norm(await page.locator("#lr").textContent());
const panA = norm(await page.locator("#pan-a").textContent());
const reels = await page.locator("[data-roll]").evaluateAll((els) => els.map((e) => ({ id: e.id, roll: e.getAttribute("data-roll"), reelsAriaHidden: [...e.querySelectorAll("[data-reels]")].map((r) => r.getAttribute("aria-hidden")), plain: (e.querySelector(":scope > span:not([data-reels])")?.textContent ?? "").replace(/\s+/g, " ").trim() })));
const hydText = norm(await page.locator("body").innerText());
if (SHOT) await page.locator("#how").screenshot({ path: SHOT });
await browser.close();
res.hydrated = { chains: hydChains, baseSentences: hydBase, reserve: { shownR, shownDisc, shownNotice }, chamber: { lh, lr }, howExcerpt: how.slice(0, 1200), panAExcerpt: panA.slice(0, 600), reels, rpcMethods: [...rpcMethods], consoleErrors: errors };
ok("hydrated #chains text == server #chains text", hydChains !== null && hydChains === serverChains);
ok("hydrated: every Base sentence says local fork", hydBase.length > 0 && hydBase.every((x) => x.includes("local fork")), hydBase.filter((x) => !x.includes("local fork")));
ok("Reserve card amount = live get_reserve r_usd_e6", rUsd !== null && shownR === rUsd, `shown ${shownR}, live ${rUsd} (r_usd_e6 ${rsv.value?.r_usd_e6})`);
ok("Reserve card discount = live get_reserve discount_bps", rsv.value && shownDisc === `After all quotes, at ${rsv.value.discount_bps} bps`, shownDisc);
ok("#how prose names the Reserve as deployed = live amount", rsv.value && how.includes(`the Reserve as deployed holds $${Number(rsv.value.r_usd_e6) / 1e6}`));
ok("chamber R (#lr) = live get_exit_capacity r_usd_e6", capR !== null && lr === `$${capR}`, `shown ${lr}, live $${capR}`);
ok("LTV shown = live get_collateral (static 40%, cap 70%)", how.includes(`A static lender stops at ${pct(C.base_ltv_bps)}.`) && how.includes(`reach the deployed ${pct(C.max_nectar_ltv_bps)} cap`), `${pct(C.base_ltv_bps)} / ${pct(C.max_nectar_ltv_bps)}`);
ok("haircut shown = live get_collateral (10% in session #lh, 25% weekend)", lh === pct(C.base_haircut_bps) && how.includes(`haircut widens to ${pct(C.weekend_haircut_bps)}`), `#lh ${lh}; ${pct(C.base_haircut_bps)} / ${pct(C.weekend_haircut_bps)}`);
ok("code panel carries the live bps", panA.includes(`// ${C.weekend_haircut_bps} / ${C.base_haircut_bps} on testnet`) && panA.includes(`// ${pct(C.max_nectar_ltv_bps)} on testnet`));
ok("hydrated: every counter's reels aria-hidden, plain value readable", reels.length >= 3 && reels.every((r) => r.reelsAriaHidden.length > 0 && r.reelsAriaHidden.every((a) => a === "true") && r.plain === r.roll), reels);
ok("hydrated innerText: no 0123456789", !hydText.includes("0123456789"));
ok("hydrated: no 85%/12%/400 bps parameter text, Reserve not called absent", !/\b85%|\b12%|400 bps|1200 \/ 400|Reserve[^.]{0,40}(absent|not deployed|not live)/.test(hydText));
res.pass = res.checks.every((c) => c.pass);
writeFileSync(OUT, JSON.stringify(res, null, 2));
for (const c of res.checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : ` — ${JSON.stringify(c.detail).slice(0, 300)}`}`);
console.log(`rpc methods seen: ${[...rpcMethods].join(", ")}`);
console.log(res.pass ? "CLAIMS PROBE PASS" : "CLAIMS PROBE FAIL");
process.exitCode = res.pass ? 0 : 1;
