// WO-34v item 3 (verifier probe): every host measured on production (data-inventory.json from the inventory spec run against the hosted
// URLs) must appear in backticks (<code>) on SITE /legal/privacy; own SITE/APP hosts exempt. Every cookie and storage key measured must
// appear in backticks on SITE /legal/cookies. Same rule as WO-34e2 (host in backticks on the privacy page).
import { readFileSync } from "node:fs";
const SITE = "https://nectarlabs.vercel.app";
const APP = "https://nectarlabs-app.vercel.app";
const inv = JSON.parse(readFileSync(process.argv[2], "utf8"));
const codes = async (path) => {
  const html = await (await fetch(SITE + path)).text();
  return new Set([...html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()));
};
const priv = await codes("/legal/privacy");
const cook = await codes("/legal/cookies");
const own = new Set([new URL(SITE).host, new URL(APP).host]);
const hosts = inv.hosts.map((h) => h.host);
const missingHosts = hosts.filter((h) => !own.has(h) && !priv.has(h));
const keys = [...inv.cookies.map((c) => ({ kind: "cookie", name: c.name, origin: c.domain })), ...inv.storage.map((s) => ({ kind: s.kind, name: s.name, origin: s.origin }))];
const missingKeys = keys.filter((k) => !cook.has(k.name) && !(k.name.startsWith("hot-connector/wallets/") && cook.has("hot-connector/wallets/<wallet id>:<version>") && cook.has(k.name.slice("hot-connector/wallets/".length))));
console.log(JSON.stringify({
  privacyCodeSpans: priv.size, cookiesCodeSpans: cook.size,
  measuredHosts: hosts, exemptOwn: [...own], missingHostsOnPrivacy: missingHosts,
  measuredKeys: keys, missingKeysOnCookies: missingKeys,
  walletsOpened: (inv.wallets ?? []).map((w) => `${w.name}: ${w.reached ?? ""}`), selectorHosts: inv.selectorHosts, cspViolations: inv.cspViolations,
}, null, 2));
process.exit(missingHosts.length || missingKeys.length ? 1 : 0);
