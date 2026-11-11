import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { annotateHost, annotateStorage, directives, type HostUse, type StorageEntry } from "./inventory-annotations";

// WO-34c data inventory. Opt-in project `inventory` (needs network; not in the default run). Real Chrome, fresh profile per test:
//   SITE_URL=http://site.localhost:3741 APP_URL=http://app.localhost:3741 DOCS_ORIGIN=http://localhost:3742 npx next build
//   node scripts/serve-docs.mjs --port 3742 &   SITE_URL=… APP_URL=… DOCS_ORIGIN=… npx next start -p 3741 &
//   E2E_INVENTORY=1 INV_SITE=http://site.localhost:3741 INV_APP=http://app.localhost:3741 PW_CHANNEL=chrome \
//     npx playwright test --project=inventory
// Writes content/data-inventory.json + .md. Also fails on any CSP violation in the console (the CSP check of WO-34c §2).
const SITE = (process.env.INV_SITE ?? "http://site.localhost:3741").replace(/\/$/, "");
const APP = (process.env.INV_APP ?? "http://app.localhost:3741").replace(/\/$/, "");
const OUT = resolve(import.meta.dirname, "../content");

const LANDING = ["/", "/about", "/security", "/status", "/changelog", "/brand", "/talk", "/legal/privacy", "/legal/cookies", "/legal/terms", "/legal/disclaimers"];
const APP_ROUTES = ["/feed", "/feed/NVDAx", "/borrow", "/shield", "/quote/new", "/quote/0", "/reserve", "/notes", "/note/0", "/position/0", "/console", "/agents", "/keepers", "/docs/", "/docs/start/quickstart", "/docs/legal/privacy"];
const COMBOS = [
  { theme: "dark", consent: "accept" },
  { theme: "light", consent: "decline" },
  { theme: "light", consent: "accept" },
  { theme: "dark", consent: "decline" },
] as const;

interface PageRecord { url: string; status: number | null; hosts: Record<string, string[]>; combo: string }
const pages: PageRecord[] = [];
const violations: { page: string; text: string }[] = [];
const storage = new Map<string, StorageEntry>();
const cookies = new Map<string, { name: string; domain: string; expires: number; httpOnly: boolean; sameSite: string }>();
let walletPicked = "";

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
  const add = (kind: StorageEntry["kind"], name: string) => {
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

  test.afterAll(() => {
    if (!pages.length) return;
    const byHost = new Map<string, HostUse>();
    for (const p of pages) {
      for (const [h, types] of Object.entries(p.hosts)) {
        const u = byHost.get(h) ?? annotateHost(h, SITE, APP);
        for (const t of types) if (!u.types.includes(t)) u.types.push(t);
        const path = p.url.replace(/^https?:\/\/[^/]+/, "");
        const where = `${new URL(p.url.split(" ")[0]!).host}${path}`;
        if (!u.pages.includes(where)) u.pages.push(where);
        u.directives = directives(u.types);
        byHost.set(h, u);
      }
    }
    const report = {
      generated: new Date().toISOString(),
      how: "apps/web/e2e/inventory.spec.ts (real Chrome, fresh profile per combo, hosted mode, docs via the /docs rewrite)",
      site: SITE,
      app: APP,
      combos: COMBOS.map((c) => `${c.theme}/${c.consent}`),
      walletOpened: walletPicked,
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
      `## CSP violations in the console: ${violations.length}`,
      "",
      ...violations.map((v) => `- ${v.page}: ${esc(v.text)}`),
      "",
    ].join("\n");
    writeFileSync(resolve(OUT, "data-inventory.md"), md);
  });

  test("zero CSP violations across the inventory runs", () => {
    expect(pages.length, "inventory runs recorded pages").toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
