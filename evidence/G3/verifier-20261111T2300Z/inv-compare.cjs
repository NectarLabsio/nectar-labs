// node inv-compare.cjs <committed.json> <measured.json> <privacy.md>
const fs = require("fs");
const [a, b, priv] = process.argv.slice(2);
const local = (h) => /localhost/.test(h);
function hostsOf(j) {
  const s = new Set();
  for (const h of j.hosts ?? []) s.add(h.host);
  for (const h of j.selectorHosts ?? []) s.add(h);
  for (const w of j.wallets ?? []) {
    for (const h of Object.keys(w.hosts ?? {})) s.add(h);
    for (const win of w.windows ?? []) for (const h of win.hosts ?? []) s.add(h);
  }
  return [...s].filter((h) => !local(h)).sort();
}
const A = JSON.parse(fs.readFileSync(a, "utf8"));
const B = JSON.parse(fs.readFileSync(b, "utf8"));
const ha = hostsOf(A), hb = hostsOf(B);
console.log("committed third-party hosts:", ha.length, "measured:", hb.length);
console.log("only committed:", ha.filter((h) => !hb.includes(h)));
console.log("only measured:", hb.filter((h) => !ha.includes(h)));
console.log("measured cspBypassed:", B.cspBypassed, "cspViolations:", JSON.stringify(B.cspViolations).slice(0, 300));
console.log("measured wallets:", (B.wallets ?? []).map((w) => `${w.name} [${w.reached}] viol=${(w.violations ?? []).length}`).join("; "));
const p = fs.readFileSync(priv, "utf8");
const ticks = new Set([...p.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
const missing = hb.filter((h) => !ticks.has(h));
console.log("measured hosts not in backticks in privacy.md:", missing);
