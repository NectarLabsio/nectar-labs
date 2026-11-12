import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { expect, test, type Page } from "@playwright/test";
import { config, pinFlags, prime } from "./helpers";

// WO-62a: landing claims. B1 Base says "local fork of Base Sepolia" in the server HTML and after hydration; B2/B3 Reserve and parameters
// equal the deployed values (evidence/claims fixture = config.yaml collaterals), no 85%; B4 counters are plain text until hydration.
const ROOT = resolve(import.meta.dirname, "../../..");
const DEPLOYED = JSON.parse(readFileSync(resolve(ROOT, "evidence/claims/deployed-params-20261112T192755Z.json"), "utf8")) as {
  get_collateral: { value: { base_ltv_bps: number; max_nectar_ltv_bps: number; base_haircut_bps: number; weekend_haircut_bps: number } };
  get_reserve: { value: Record<string, string | number> };
  get_exit_capacity: { value: Record<string, unknown> };
};
const COL = DEPLOYED.get_collateral.value;
const CFG = (parse(readFileSync(resolve(ROOT, "packages/config/config.yaml"), "utf8")) as { collateral: Record<string, Record<string, number>> }).collateral.nvdax!;
const CORE = config.accounts.core;
const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

/** Answer get_reserve / get_exit_capacity with the deployed-params fixture (the chain read as recorded). */
async function deployedViews(page: Page) {
  const views: Record<string, unknown> = { get_reserve: DEPLOYED.get_reserve.value, get_exit_capacity: DEPLOYED.get_exit_capacity.value };
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const p = (req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string } } | null)?.params;
    if (p?.request_type === "call_function" && p.account_id === CORE && p.method_name && p.method_name in views) {
      const id = (req.postDataJSON() as { id: unknown }).id;
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id, result: { result: Array.from(Buffer.from(JSON.stringify(views[p.method_name]))), logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }) });
    }
    return route.continue();
  });
}

/** Every sentence on the page (text and aria-labels) that names Base as a word. */
function baseSentences(page: Page): Promise<string[]> {
  return page.locator("main, body").first().evaluate((root) => {
    const texts = [...root.querySelectorAll("h1, h2, h3, p, li, span, small, summary, dd")].map((e) => e.textContent ?? "");
    texts.push(...[...root.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? ""));
    return texts.flatMap((t) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter((x) => /\bBase\b/.test(x));
  });
}

test.describe("WO-62a B1: Base settlement ran on a local fork of Base Sepolia", () => {
  test("config flags: server HTML (JS off) and hydrated text say the same, and say local fork", async ({ browser, page }) => {
    const off = await browser.newContext({ javaScriptEnabled: false });
    const raw = await off.newPage();
    await raw.goto("/");
    const server = await raw.locator("section#chains").count() ? await raw.locator("section#chains").innerText() : null;
    const serverBase = await baseSentences(raw);
    await off.close();
    await prime(page, "dark");
    await page.goto("/");
    if (server === null) return expect(page.locator("section#chains")).toHaveCount(0);
    await expect(page.locator("#hublinks path").first()).toBeAttached();
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(norm(await page.locator("section#chains").innerText())).toBe(norm(server));
    expect(server).toContain("Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia.");
    expect(serverBase.length).toBeGreaterThan(0);
    expect(serverBase.filter((x) => !x.includes("local fork"))).toEqual([]);
    expect((await baseSentences(page)).filter((x) => !x.includes("local fork"))).toEqual([]);
  });

  test("base flag on: heading, steps 03/04, card, chip and FAQ all say local fork of Base Sepolia", async ({ page }) => {
    await prime(page, "dark");
    await pinFlags(page, ["solana_remote", "base"]);
    await page.goto("/");
    await expect(page.locator("#nbase")).toContainText("Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia");
    await expect(page.locator("section#chains h2")).toContainText("a local fork of Base Sepolia");
    await expect(page.locator("#settle")).toContainText("on a local fork of Base Sepolia, not on Base Sepolia");
    await expect(page.locator("#faq")).toContainText("Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia.");
    const named = await baseSentences(page);
    expect(named.filter((x) => !x.includes("local fork"))).toEqual([]);
  });
});

test.describe("WO-62a B2/B3: deployed parameters and the Reserve as read", () => {
  test("config = deployed fixture; chamber, code and Reserve card show the deployed values; no 85%", async ({ page }) => {
    for (const k of ["base_ltv_bps", "max_nectar_ltv_bps", "base_haircut_bps", "weekend_haircut_bps"] as const) expect(CFG[k]).toBe(COL[k]);
    await prime(page, "dark");
    await pinFlags(page, ["reserve"]);
    await deployedViews(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const r = DEPLOYED.get_reserve.value;
    const rUsd = `$${(Number(r.r_usd_e6) / 1e6).toFixed(2)}`;
    await expect(page.getByTestId("landing-reserve-r")).toHaveText(rUsd, { timeout: 20_000 });
    await expect(page.getByTestId("landing-reserve-discount")).toHaveText(`After all quotes, at ${r.discount_bps} bps`);
    await expect(page.getByTestId("landing-reserve-notice")).toHaveText("7 days");
    const how = page.locator("#how");
    await expect(how).toContainText(`the Reserve as deployed holds $${Number(r.r_usd_e6) / 1e6}`);
    await expect(how).toContainText("quotes $80,000 and DEX depth $12,000 are example figures");
    await expect(how).toContainText(`reach the deployed ${pct(COL.max_nectar_ltv_bps)} cap`);
    await expect(how).toContainText(`A static lender stops at ${pct(COL.base_ltv_bps)}.`);
    await expect(how).toContainText(`haircut widens to ${pct(COL.weekend_haircut_bps)}`);
    await how.getByRole("button", { name: /Committed quotes raise the ceiling/ }).click();
    await expect(page.locator("#lh")).toHaveText(pct(COL.base_haircut_bps));
    await expect(page.locator("#lr")).toHaveText(`$${Number(r.r_usd_e6) / 1e6}`);
    await expect(page.locator("#pan-a")).toContainText(`// ${COL.weekend_haircut_bps} / ${COL.base_haircut_bps} on testnet`);
    await expect(page.locator("#pan-a")).toContainText(`// ${pct(COL.max_nectar_ltv_bps)} on testnet`);
    const body = await page.locator("body").innerText();
    expect(body.match(/.{0,40}(\b85%|\b12%|400 bps|1200 \/ 400|Reserve[^.]{0,40}(absent|not deployed|not live)).{0,20}/g) ?? []).toEqual([]);
  });
});

test.describe("WO-62a B4: counters are plain text until hydration", () => {
  test("JS off: final values as plain text, no reel nodes, no 0123456789", async ({ browser, request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toContain("0123456789");
    expect(html.replace(/<[^>]+>/g, "").replace(/\s+/g, "")).not.toContain("0123456789");
    const off = await browser.newContext({ javaScriptEnabled: false });
    const page = await off.newPage();
    await page.goto("/");
    const rolls = page.locator("[data-roll]");
    expect(await rolls.count()).toBeGreaterThanOrEqual(3);
    for (const el of await rolls.all()) {
      const v = await el.getAttribute("data-roll");
      await expect(el).toHaveText(v!);
      await expect(el).toBeVisible();
    }
    await expect(page.locator("[data-reels]")).toHaveCount(0);
    await off.close();
  });

  test("hydrated: reels sit in an aria-hidden wrapper; the value stays readable", async ({ page }) => {
    await prime(page, "dark");
    await page.goto("/");
    const rolls = page.locator("[data-roll]");
    await expect(page.locator("[data-reels]").first()).toBeAttached();
    const n = await rolls.count();
    expect(n).toBeGreaterThanOrEqual(3);
    await expect(page.locator("[data-reels]")).toHaveCount(n);
    for (const el of await rolls.all()) {
      await expect(el.locator("[data-reels]")).toHaveAttribute("aria-hidden", "true");
      expect(norm(await el.evaluate((e) => (e.querySelector(":scope > span:not([data-reels])")?.textContent ?? "")))).toBe(await el.getAttribute("data-roll"));
    }
  });
});

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
