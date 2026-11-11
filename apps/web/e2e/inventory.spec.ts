import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { TESTNET_RPC_FALLBACKS } from "@nectar/sdk";
import { annotateHost, annotateStorage, directives, normalizeKey, type HostUse, type StorageEntry } from "./inventory-annotations";

// WO-34c data inventory. Opt-in project `inventory` (needs network; not in the default run). Real Chrome, fresh profile per test:
//   SITE_URL=http://site.localhost:3741 APP_URL=http://app.localhost:3741 DOCS_ORIGIN=http://localhost:3742 npx next build
//   node scripts/serve-docs.mjs --port 3742 &   SITE_URL=… APP_URL=… DOCS_ORIGIN=… npx next start -p 3741 &
//   E2E_INVENTORY=1 INV_SITE=http://site.localhost:3741 INV_APP=http://app.localhost:3741 PW_CHANNEL=chrome \
//     npx playwright test --project=inventory
// Writes content/data-inventory.json + .md. Also fails on any CSP violation in the console (the CSP check of WO-34c §2).
// WO-34f: a second pass opens EVERY wallet the real selector lists, one per fresh profile, up to the point where it would ask to
// connect or sign (never signs, never types). Per wallet it records the hosts its frame (and any window it opens) contacts, its
// storage keys and CSP violations. INV_BYPASS_CSP=1 = discovery mode (CSP off, to see every host a wallet wants before listing it).
const SITE = (process.env.INV_SITE ?? "http://site.localhost:3741").replace(/\/$/, "");
const APP = (process.env.INV_APP ?? "http://app.localhost:3741").replace(/\/$/, "");
const OUT = resolve(import.meta.dirname, "../content");

const LANDING = ["/", "/about", "/security", "/status", "/changelog", "/brand", "/talk", "/legal/privacy", "/legal/cookies", "/legal/terms", "/legal/disclaimers"];
const APP_ROUTES = ["/feed", "/feed/NVDAx", "/borrow", "/shield", "/quote/new", "/quote/0", "/reserve", "/notes", "/note/0", "/position/0", "/console", "/agents", "/keepers", "/docs/", "/docs/start/quick-start", "/docs/security/audits"];
const COMBOS = [
  { theme: "dark", consent: "accept" },
  { theme: "light", consent: "decline" },
  { theme: "light", consent: "accept" },
  { theme: "dark", consent: "decline" },
] as const;

interface PageRecord { url: string; status: number | null; hosts: Record<string, string[]>; combo: string }
const pages: PageRecord[] = [];
const violations: { page: string; text: string }[] = [];
const violationsAll = violations;
const storage = new Map<string, StorageEntry>();
const cookies = new Map<string, { name: string; domain: string; expires: number; httpOnly: boolean; sameSite: string }>();
let walletPicked = "";
const BYPASS = process.env.INV_BYPASS_CSP === "1";
interface WalletRecord { name: string; reached: string; hosts: Record<string, string[]>; windows: { url: string; hosts: string[] }[]; storage: string[]; violations: string[] }
const walletRuns: WalletRecord[] = [];
let selectorHosts: string[] = [];
/** host|request type pairs the selector alone produced; a wallet keeps a host when it adds a new type (evm-on-near.dev: icon vs executor fetch). */
const selectorSeen = new Set<string>();

function hostOf(u: string): string {
  if (!/^https?:|^wss?:/.test(u)) return `${u.split(":")[0]}:`;
  const x = new URL(u);
  return x.host;
}

async function visit(page: Page, url: string, combo: string, act?: (p: Page) => Promise<void>): Promise<void> {
  const hosts: Record<string, Set<string>> = {};
  const onReq = (r: { url(): string; resourceType(): string; frame(): { parentFrame(): unknown } }) => {
    let inFrame = false;
    try {
      inFrame = !!r.frame().parentFrame();
    } catch {
      /* service worker / detached */
    }
    (hosts[hostOf(r.url())] ??= new Set()).add(`${r.resourceType()}${inFrame ? "@iframe" : ""}`);
  };
  page.on("request", onReq);
  let status: number | null = null;
  try {
    const res = await page.goto(url, { waitUntil: "load" });
    status = res?.status() ?? null;
    await page.waitForTimeout(1500);
    if (act) await act(page);
  } finally {
    page.off("request", onReq);
  }
  pages.push({ url: act ? `${url} (wallet selector + ${walletPicked || "wallet"} iframe)` : url, status, combo, hosts: Object.fromEntries(Object.entries(hosts).map(([h, s]) => [h, [...s].sort()])) });
}

async function chooseConsent(page: Page, choice: "accept" | "decline") {
  const banner = page.getByTestId("consent");
  if (!(await banner.isVisible().catch(() => false))) return;
  if (choice === "accept") await banner.getByRole("button").first().click();
  else await page.getByTestId("consent-decline").click();
  await expect(banner).toBeHidden();
}

async function openWallet(page: Page) {
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  const popup = page.locator(".hot-connector-popup .connect-item");
  await expect(popup.first()).toBeVisible({ timeout: 20_000 });
  const names = await popup.allInnerTexts();
  const prefer = ["Meteor", "Intear", "MyNearWallet", "HOT"];
  const idx = Math.max(0, names.findIndex((n) => prefer.some((p) => n.includes(p))));
  walletPicked = names[idx]?.split("\n")[0]?.trim() ?? "";
  await popup.nth(idx).click();
  // The sandboxed wallet runs in a srcdoc iframe near-connect appends to <body>. Do not sign: wait for it, then leave.
  await expect(page.locator(".hot-connector-popup iframe").first()).toBeAttached({ timeout: 30_000 });
  await page.waitForTimeout(4000);
}

/** Opens the real selector on /borrow in a fresh profile; returns the listed wallet names and the hosts the selector alone contacts. */
async function listWallets(browser: Browser): Promise<string[]> {
  const ctx = await browser.newContext({ bypassCSP: BYPASS });
  const page = await ctx.newPage();
  const hosts = new Set<string>();
  ctx.on("request", (r) => {
    hosts.add(hostOf(r.url()));
    let inFrame = false;
    try {
      inFrame = !!r.frame().parentFrame();
    } catch {
      /* detached */
    }
    selectorSeen.add(`${hostOf(r.url())}|${r.resourceType()}${inFrame ? "@iframe" : ""}`);
  });
  await page.goto(`${APP}/borrow`, { waitUntil: "load" });
  await chooseConsent(page, "decline");
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  const items = page.locator(".hot-connector-popup .connect-item");
  await expect(items.first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  const names = (await items.allInnerTexts()).map((n) => n.split("\n")[0]!.trim());
  selectorHosts = [...hosts].sort();
  await ctx.close();
  return names;
}

/** One wallet, fresh profile: click it in the selector, wait for its frame or window, record, leave. Never signs or types. */
async function openOneWallet(browser: Browser, idx: number, name: string): Promise<WalletRecord> {
  const ctx = await browser.newContext({ bypassCSP: BYPASS });
  const page = await ctx.newPage();
  const hosts: Record<string, Set<string>> = {};
  const windows: { url: string; hosts: Set<string>; page: Page }[] = [];
  const violations: string[] = [];
  ctx.on("request", (r) => {
    let owner: Page | null = null;
    try {
      owner = r.frame().page();
    } catch {
      owner = null;
    }
    if (owner && owner !== page) {
      const w = windows.find((x) => x.page === owner);
      w?.hosts.add(hostOf(r.url()));
      return;
    }
    let inFrame = false;
    try {
      inFrame = !!r.frame().parentFrame();
    } catch {
      /* detached */
    }
    (hosts[hostOf(r.url())] ??= new Set()).add(`${r.resourceType()}${inFrame ? "@iframe" : ""}`);
  });
  ctx.on("page", (p) => {
    if (p === page) return;
    const w = { url: "", hosts: new Set<string>(), page: p };
    windows.push(w);
    p.on("framenavigated", (f) => {
      if (f === p.mainFrame() && f.url() !== "about:blank") w.url = f.url();
    });
  });
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (load|connect|frame|execute|apply)/i.test(t)) violations.push(t.slice(0, 300));
  });
  let reached = "";
  try {
    await page.goto(`${APP}/borrow`, { waitUntil: "load" });
    await chooseConsent(page, "decline");
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    const items = page.locator(".hot-connector-popup .connect-item");
    await expect(items.first()).toBeVisible({ timeout: 20_000 });
    await items.nth(idx).click();
    // A sandboxed wallet appends a srcdoc iframe; some open their own window; an extension wallet may only say "not installed".
    const frame = page.locator(".hot-connector-popup iframe").first();
    await Promise.race([frame.waitFor({ state: "attached", timeout: 30_000 }).catch(() => undefined), ctx.waitForEvent("page", { timeout: 30_000 }).catch(() => undefined)]);
    await page.waitForTimeout(8000);
    const iframes = await page.locator(".hot-connector-popup iframe").count();
    // What the wallet shows at the point it would ask to connect: the text of its frame(s), else the selector popup.
    const texts: string[] = [];
    for (const f of page.frames()) if (f !== page.mainFrame()) texts.push(await f.locator("body").innerText({ timeout: 2000 }).catch(() => ""));
    texts.push(await page.locator(".hot-connector-popup").last().innerText({ timeout: 2000 }).catch(() => ""));
    const popupText = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).join(" / ").slice(0, 140);
    for (const w of windows) if (!w.url) w.url = w.page.url();
    reached = [iframes ? `sandboxed frame loaded (${iframes})` : "no sandboxed frame", windows.length ? `opened ${windows.length} window(s)` : "", popupText ? `shows: "${popupText}"` : ""].filter(Boolean).join("; ");
    walletPicked = name;
    await dumpStorage(page);
  } catch (e) {
    reached = `error: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`;
  }
  const keys = await page
    .evaluate(() => [...Object.keys(localStorage).map((k) => `localStorage ${k}`), ...Object.keys(sessionStorage).map((k) => `sessionStorage ${k}`)])
    .catch(() => [] as string[]);
  for (const w of windows) await w.page.close().catch(() => undefined);
  await ctx.close();
  for (const v of violations) violationsAll.push({ page: `${APP}/borrow (${name})`, text: v });
  return {
    name,
    reached,
    hosts: Object.fromEntries(
      Object.entries(hosts)
        .map(([h, t]) => [h, [...t].filter((x) => !selectorSeen.has(`${h}|${x}`)).sort()] as const)
        .filter(([, t]) => t.length),
    ),
    windows: windows.map((w) => ({ url: w.url.replace(/[?#].*$/, ""), hosts: [...w.hosts].sort() })),
    storage: [...new Set(keys.map(normalizeKey))].sort(),
    violations,
  };
}

async function dumpStorage(page: Page): Promise<void> {
  const dump = await page.evaluate(async () => {
    const idb: { db: string; store: string; keys: string[] }[] = [];
    for (const d of (await indexedDB.databases?.()) ?? []) {
      if (!d.name) continue;
      const db = await new Promise<IDBDatabase>((ok, no) => {
        const r = indexedDB.open(d.name!);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => no(r.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const keys = await new Promise<IDBValidKey[]>((ok) => {
          const q = db.transaction(store).objectStore(store).getAllKeys();
          q.onsuccess = () => ok(q.result);
          q.onerror = () => ok([]);
        });
        idb.push({ db: d.name, store, keys: keys.map(String) });
      }
      db.close();
    }
    return { origin: location.origin, local: Object.keys(localStorage), session: Object.keys(sessionStorage), idb };
  });
  const add = (kind: StorageEntry["kind"], rawName: string) => {
    const name = normalizeKey(rawName);
    const k = `${kind}|${dump.origin}|${name}`;
    if (!storage.has(k)) storage.set(k, annotateStorage({ kind, name, origin: dump.origin }));
  };
  dump.local.forEach((n) => add("localStorage", n));
  dump.session.forEach((n) => add("sessionStorage", n));
  for (const s of dump.idb) {
    add("indexedDB", `${s.db}/${s.store}`);
    s.keys.forEach((key) => add("indexedDB", `${s.db}/${s.store}/${key}`));
  }
}

test.describe("data inventory (opt-in, network)", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(process.env.E2E_INVENTORY !== "1", "opt-in: E2E_INVENTORY=1 with hosted next start + docs server (see header)");
  test.setTimeout(15 * 60_000);

  for (const c of COMBOS) {
    test(`every route, both hosts: ${c.theme} theme, consent ${c.consent}`, async ({ page, context }) => {
      const combo = `${c.theme}/${c.consent}`;
      // Theme is pinned through the same key the theme toggle writes (only when unset, so nothing else is pre-seeded).
      await page.addInitScript((t) => {
        if (location.hostname.endsWith("localhost") && !localStorage.getItem("nectar-theme")) localStorage.setItem("nectar-theme", t);
      }, c.theme);
      page.on("console", (m) => {
        const t = m.text();
        if (/Content Security Policy|Refused to (load|connect|frame|execute|apply)/i.test(t)) violations.push({ page: page.url(), text: t.slice(0, 400) });
      });
      for (const [base, routes] of [[SITE, LANDING], [APP, APP_ROUTES]] as const) {
        let first = true;
        for (const r of routes) {
          await visit(page, `${base}${r}`, combo);
          if (first) {
            await chooseConsent(page, c.consent);
            first = false;
          }
        }
      }
      await visit(page, `${APP}/borrow`, combo, openWallet);
      await page.goto(`${SITE}/`);
      await dumpStorage(page);
      await page.goto(`${APP}/feed`);
      await dumpStorage(page);
      for (const k of await context.cookies()) cookies.set(`${k.domain}|${k.name}`, { name: k.name, domain: k.domain, expires: k.expires, httpOnly: k.httpOnly, sameSite: k.sameSite });
    });
  }

  test("every wallet the selector lists, one by one (fresh profile each, no signing)", async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    const names = await listWallets(browser);
    expect(names.length, "the real selector lists wallets").toBeGreaterThan(0);
    for (const [i, name] of names.entries()) walletRuns.push(await openOneWallet(browser, i, name));
  });

  test.afterAll(() => {
    if (!pages.length && !walletRuns.length) return;
    const byHost = new Map<string, HostUse>();
    for (const w of walletRuns) pages.push({ url: `${APP}/borrow (wallet selector + ${w.name})`, status: 200, combo: "dark/decline", hosts: w.hosts });
    for (const p of pages) {
      for (const [h, types] of Object.entries(p.hosts)) {
        const u = byHost.get(h) ?? annotateHost(h, SITE, APP, walletRuns.filter((w) => w.hosts[h]).map((w) => w.name));
        for (const t of types) if (!u.types.includes(t)) u.types.push(t);
        const path = p.url.replace(/^https?:\/\/[^/]+/, "");
        const where = `${new URL(p.url.split(" ")[0]!).host}${path}`;
        if (!u.pages.includes(where)) u.pages.push(where);
        u.directives = directives(u.types);
        byHost.set(h, u);
      }
    }
    // WO-34g: the non-FastNEAR RPC fallbacks are reached only while FastNEAR refuses, so a healthy run may not see them. They are
    // in connect-src, so they are listed as declared rather than dropped.
    for (const url of TESTNET_RPC_FALLBACKS) {
      const h = new URL(url).host;
      if (byHost.has(h)) continue;
      const u = annotateHost(h, SITE, APP);
      byHost.set(h, { ...u, types: ["fetch"], pages: ["(declared: not reached in this run, FastNEAR answered)"], directives: directives(["fetch"]) });
    }
    const report = {
      generated: new Date().toISOString(),
      how: "apps/web/e2e/inventory.spec.ts (real Chrome, fresh profile per combo, hosted mode, docs via the /docs rewrite)",
      site: SITE,
      app: APP,
      combos: COMBOS.map((c) => `${c.theme}/${c.consent}`),
      walletOpened: walletPicked,
      cspBypassed: BYPASS,
      selectorHosts,
      wallets: walletRuns,
      hosts: [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host)),
      cookies: [...cookies.values()],
      storage: [...storage.values()].sort((a, b) => `${a.kind}${a.origin}${a.name}`.localeCompare(`${b.kind}${b.origin}${b.name}`)),
      cspViolations: violations,
      pages,
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "data-inventory.json"), `${JSON.stringify(report, null, 2)}\n`);
    const esc = (s: string) => s.replace(/\|/g, "\\|");
    const md = [
      "# Data inventory (measured)",
      "",
      `Generated ${report.generated} by \`apps/web/e2e/inventory.spec.ts\`: real Chrome, a fresh profile per run, every route on both hosts`,
      `(SITE ${SITE}, APP ${APP}, docs through APP /docs), dark and light theme, consent accepted and declined, and the near-connect`,
      `wallet selector opened on /borrow with one wallet's sandboxed iframe (${walletPicked || "n/a"}), not signed. Analytics are off`,
      "(no analytics id is set), so accepting consent loads nothing extra. The privacy and cookie pages are written from this table.",
      "",
      "## Hosts the browser contacts",
      "",
      "| Host | Request types | Who | Purpose | When | CSP directive |",
      "| --- | --- | --- | --- | --- | --- |",
      ...report.hosts.map((h) => `| ${esc(h.host)} | ${h.types.join(", ")} | ${esc(h.who)} | ${esc(h.purpose)} | ${esc(h.when)} | ${h.directives.join(", ")} |`),
      "",
      "## Cookies",
      "",
      ...(report.cookies.length
        ? ["| Name | Domain | Expires | HttpOnly | SameSite |", "| --- | --- | --- | --- | --- |", ...report.cookies.map((k) => `| ${k.name} | ${k.domain} | ${k.expires < 0 ? "session" : new Date(k.expires * 1000).toISOString()} | ${k.httpOnly} | ${k.sameSite} |`)]
        : ["None. No page, wallet selector or wallet frame set a cookie in any run."]),
      "",
      "## Browser storage",
      "",
      "| Kind | Origin | Key | Who sets it | Purpose | Lifetime | Source |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...report.storage.map((s) => `| ${s.kind} | ${s.origin} | \`${esc(s.name)}\` | ${esc(s.who)} | ${esc(s.purpose)} | ${esc(s.lifetime)} | ${esc(s.source)} |`),
      "",
      "## Wallets in the selector (one by one, fresh profile each, not signed)",
      "",
      `The selector alone contacts: ${selectorHosts.join(", ")}. Per wallet below: what it adds after you pick it. The wallet list is near-connect's`,
      "manifest, fetched unpinned at runtime, so a manifest change can add a wallet or a host before this table is re-measured.",
      "",
      "| Wallet | Reached | Hosts its frame contacts (request types) | Windows it opens (not under our CSP) | Storage keys on our origin | CSP violations |",
      "| --- | --- | --- | --- | --- | --- |",
      ...walletRuns.map((w) => `| ${esc(w.name)} | ${esc(w.reached)} | ${Object.entries(w.hosts).map(([h, t]) => `${h} (${t.join(", ")})`).join("<br>") || "none beyond the selector"} | ${w.windows.map((x) => `${x.url || "(blank)"}${x.hosts.length ? ` → ${x.hosts.join(", ")}` : ""}`).join("<br>") || "none"} | ${w.storage.map((k) => `\`${esc(k)}\``).join("<br>") || "none"} | ${w.violations.length} |`),
      "",
      `## CSP violations in the console: ${violations.length}`,
      "",
      ...violations.map((v) => `- ${v.page}: ${esc(v.text)}`),
      "",
    ].join("\n");
    writeFileSync(resolve(OUT, "data-inventory.md"), md);
  });

  test("zero CSP violations across the inventory runs", () => {
    expect(pages.length, "inventory runs recorded pages").toBeGreaterThan(0);
    test.skip(BYPASS, "discovery mode: CSP bypassed");
    expect(violations).toEqual([]);
  });
});
