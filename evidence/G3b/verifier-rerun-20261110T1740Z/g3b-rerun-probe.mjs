import { chromium } from "@playwright/test";
const BASE = "http://localhost:3100";
const RPC = "https://test.rpc.fastnear.com";
const CORE = process.argv[2];
async function rpcView(method, args) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: CORE, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }) });
  const j = await r.json(); return JSON.parse(Buffer.from(j.result.result).toString());
}
const pick = (c) => ({ session_open: c.session_open, session_reason: c.session_reason, oracle_age_s: c.oracle_age_s, haircut_bps: c.haircut_bps, q: c.q_usd_e6, r: c.r_usd_e6, debt: c.total_debt_usd_e6, cap: c.capacity_usd_e6 });
for (let i = 0; i < 3; i++) {
  const r = await fetch(BASE + "/api/feed");
  const j = await r.json();
  console.log(`[${new Date().toISOString()}] GET /api/feed #${i+1} HTTP ${r.status} cache-control=${r.headers.get("cache-control")} as_of=${j.as_of} age_s=${j.age_s} stale=${j.stale} core=${j.core}`);
  for (const a of j.assets ?? []) console.log(`   ${a.symbol}: ${JSON.stringify(pick(a.capacity))}`);
  const chain = await rpcView("get_exit_capacity", { symbol: "NVDAx" });
  console.log(`   RPC get_exit_capacity NVDAx: ${JSON.stringify(pick(chain))}`);
  if (i < 2) await new Promise((s) => setTimeout(s, 7000));
}
const fu = await fetch(BASE + "/api/indexer/api/oneclick").catch(e => ({ status: "ERR " + e.message }));
console.log(`GET /api/indexer/api/oneclick HTTP ${fu.status}`, fu.text ? (await fu.text()).slice(0, 200) : "");
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
const bad = []; const errs = [];
p.on("response", (r) => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`); });
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
await p.goto(BASE + "/feed", { waitUntil: "networkidle" });
await p.waitForTimeout(15000);
const t = (await p.innerText("body")).replace(/\s+/g, " ");
console.log("/feed 'Feed indexer not configured':", t.includes("Feed indexer not configured"), "| 'Feed API not configured':", t.includes("Feed API not configured"));
console.log("/feed excerpt:", (t.match(/.{0,160}(not configured).{0,200}/) || [""])[0]);
console.log("/feed session/Qc excerpt:", (t.match(/.{0,120}(Committed quotes|Qc).{0,200}/) || [""])[0]);
console.log("5xx responses on /feed:", bad.length, bad.slice(0, 5));
console.log("console errors on /feed:", errs.length, errs.slice(0, 5));
await p.screenshot({ path: process.argv[3], fullPage: false });
await b.close();
