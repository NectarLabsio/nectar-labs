// WO-34c: purpose, lifetime and owner of every measured host and storage key. Sources were found by grepping apps/web, packages/ui,
// packages/sdk, apps/docs-site and node_modules/@hot-labs/near-connect@0.12.0 (build/NearConnector.js, helpers/storage.js,
// helpers/indexdb.js, SandboxedWallet/executor.js). Anything the table does not know is marked UNCLASSIFIED so a review catches it.

export interface StorageEntry { kind: "localStorage" | "sessionStorage" | "indexedDB"; name: string; origin: string; who: string; purpose: string; lifetime: string; source: string }
export interface HostUse { host: string; types: string[]; pages: string[]; who: string; purpose: string; when: string; directives: string[] }

const NC = "near-connect 0.12.0 (wallet selector library)";
const STORAGE: { re: RegExp; who: string; purpose: string; lifetime: string; source: string }[] = [
  { re: /^nectar-theme$/, who: "our code", purpose: "Remembers dark or light theme", lifetime: "Until you clear site data", source: "packages/ui/src/theme.tsx" },
  { re: /^nectar-consent$/, who: "our code", purpose: "Your cookie/analytics choice ({v, analytics, at})", lifetime: "Until you clear site data", source: "packages/ui/src/ConsentBanner.tsx" },
  { re: /^nectar-wallet-connected$/, who: "our code", purpose: "Flag: reconnect the wallet on the next visit", lifetime: "Set on connect, removed on disconnect", source: "apps/web/lib/wallet/near-connect.ts" },
  { re: /^selected-wallet$/, who: NC, purpose: "Id of the wallet you picked", lifetime: "Set on connect, removed on disconnect", source: "@hot-labs/near-connect build/NearConnector.js" },
  { re: /^debug-wallets$/, who: NC, purpose: "Developer-added wallet manifests (empty unless added)", lifetime: "Until you clear site data", source: "@hot-labs/near-connect build/NearConnector.js" },
  { re: /^hot-connector\/wallets(\/.*)?$/, who: NC, purpose: "Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version>", lifetime: "Until you clear site data (replaced on a new wallet version)", source: "@hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js" },
  { re: /^theme$/, who: "docs (Docusaurus)", purpose: "Docs colour mode", lifetime: "Until you clear site data", source: "@docusaurus/theme-classic colorMode" },
  { re: /^docusaurus\./, who: "docs (Docusaurus)", purpose: "Docs UI state (tabs, announcement bar)", lifetime: "Until you clear site data", source: "@docusaurus/theme-common" },
  { re: /^[a-z0-9-]+(\.[a-z0-9-]+)*:/, who: "the wallet you opened (through near-connect)", purpose: "Wallet's own storage, proxied from its sandboxed frame and prefixed with its wallet id", lifetime: "Until disconnect or you clear site data", source: "@hot-labs/near-connect build/SandboxedWallet/executor.js (storageSpace = manifest.id)" },
];

/** Collapse per-visit random ids (wallet-generated) so one key pattern is one row. */
export const normalizeKey = (name: string): string => name.replace(/[A-Za-z0-9_-]{24,}/g, "<random id>");

export function annotateStorage(e: Pick<StorageEntry, "kind" | "name" | "origin">): StorageEntry {
  const hit = STORAGE.find((s) => s.re.test(e.name));
  return hit ? { ...e, who: hit.who, purpose: hit.purpose, lifetime: hit.lifetime, source: hit.source } : { ...e, who: "UNCLASSIFIED", purpose: "UNCLASSIFIED: review", lifetime: "?", source: "?" };
}

const HOSTS: { re: RegExp; who: string; purpose: string; when: string }[] = [
  { re: /^test\.rpc\.fastnear\.com$/, who: "our code", purpose: "NEAR testnet RPC: contract views, transaction status", when: "App pages that read the contracts; wallet selector" },
  { re: /^rpc\.testnet\.fastnear\.com$/, who: "our code", purpose: "NEAR testnet RPC fallback (@nectar/sdk TESTNET_RPC_FALLBACKS)", when: "App pages that read the contracts" },
  { re: /^storage\.herewallet\.app$|^evm-on-near\.dev$/, who: NC, purpose: "Wallet icons named in the wallet list", when: "After you press Connect wallet" },
  { re: /^mc\.meteorwallet\.app$/, who: "Meteor Wallet (sandboxed frame)", purpose: "Meteor Wallet's own API", when: "Only after you open Meteor Wallet in the selector" },
  { re: /^meteorwallet\.app$/, who: "Meteor Wallet (sandboxed frame)", purpose: "Meteor Wallet images", when: "Only after you open Meteor Wallet in the selector" },
  { re: /^fonts\.cdnfonts\.com$|^rsms\.me$/, who: "Meteor Wallet (sandboxed frame)", purpose: "Meteor Wallet's web fonts (stylesheet + font files)", when: "Only after you open Meteor Wallet in the selector" },
  { re: /^raw\.githubusercontent\.com$|^cdn\.jsdelivr\.net$/, who: NC, purpose: "Wallet list (manifest.json)", when: "After you press Connect wallet" },
];

export function directives(types: string[]): string[] {
  const d = new Set<string>();
  for (const t of types) {
    const base = t.replace("@iframe", "");
    if (base === "script") d.add("script-src");
    else if (base === "stylesheet") d.add("style-src");
    else if (base === "image") d.add("img-src");
    else if (base === "font") d.add("font-src");
    else if (base === "document") d.add("frame-src");
    else if (["fetch", "xhr", "websocket", "eventsource", "other", "ping"].includes(base)) d.add("connect-src");
    else d.add(base);
  }
  return [...d].sort();
}

export function annotateHost(host: string, site: string, app: string): HostUse {
  const self = [new URL(site).host, new URL(app).host];
  const fill = (who: string, purpose: string, when: string): HostUse => ({ host, types: [], pages: [], who, purpose, when, directives: [] });
  let u: HostUse;
  if (self.includes(host)) u = fill("our code", "This site: pages, scripts, styles, fonts, same-origin API routes, docs via the /docs rewrite", "Every page");
  else if (host.endsWith(":")) u = fill("browser", `${host} URL (inline data, no network)`, "Rendering");
  else {
    const hit = HOSTS.find((h) => h.re.test(host));
    u = hit ? fill(hit.who, hit.purpose, hit.when) : fill("the wallet you opened (through near-connect)", "Wallet code, icons or the wallet's own API", "Only after you open a wallet in the selector");
  }
  return u;
}
