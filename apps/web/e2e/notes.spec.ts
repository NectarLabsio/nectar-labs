import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-26c: /notes, /note/[id], Note links and /reserve against mocked v2 views (fixtures/notes.json, built from the contract SVG
// template by scripts/build-notes-fixture.ts) and the localhost-only E2E mock wallet. window.__NECTAR_E2E_MOCK__ pins the flag
// state per test (default notes + reserve on, everything else off; `features: []` = all off), independent of config.yaml. Reserve views use the merged WO-23b shapes (types.rs). Nothing signs on testnet.

const V2 = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
interface NotesFx {
  owner: string;
  nft_token_svg: Record<string, string>;
  nft_tokens: Array<{ token_id: string; owner_id: string }>;
  nft_transfer_locked: Record<string, boolean>;
  get_quote_3: Record<string, unknown>;
  get_reserve: Record<string, unknown>;
  get_reserve_note: Record<string, { note: Record<string, unknown> } & Record<string, unknown>>;
}
const FX = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/notes.json"), "utf8")) as NotesFx;
const CORE = config.accounts.core;
const USDC = config.accounts.usdc_mock;
const OWNER = FX.owner;
const NOW = BigInt(Date.now()) * 1_000_000n;
const IN_2H = (NOW + 2n * 3600n * 1_000_000_000n).toString();
const EVIL = FX.nft_token_svg["q-3"]!.replace("</svg>", "<script>alert(1)</script></svg>");
const EXISTING = new Set([OWNER, "alice.testnet", "someone.testnet"]);

interface Opts { features?: string[]; tokens?: Array<{ token_id: string; owner_id: string }>; account?: string; theme?: "dark" | "light"; reserve?: Record<string, unknown> }

async function setup(page: Page, o: Opts = {}) {
  await prime(page, o.theme ?? "dark");
  await page.addInitScript(
    ({ features, account }) => {
      window.__NECTAR_E2E_MOCK__ = { features, near: { accountId: account } } as typeof window.__NECTAR_E2E_MOCK__;
    },
    { features: o.features ?? ["notes", "reserve"], account: o.account ?? OWNER },
  );
  const tokens = o.tokens ?? FX.nft_tokens;
  const svgFor = (id: string) => (id === "q-9" ? EVIL : (FX.nft_token_svg[id] ?? FX.nft_token_svg[id.startsWith("q-") ? "q-3" : "p-7"]));
  const views = (method: string, args: Record<string, unknown>): unknown => {
    const tid = String(args.token_id ?? args.note_id ?? "");
    switch (method) {
      case "nft_supply_for_owner":
        return String(tokens.length);
      case "nft_tokens_for_owner": {
        const from = Number(args.from_index ?? 0);
        return tokens.slice(from, from + Math.min(Number(args.limit ?? 20), 20));
      }
      case "nft_token":
        return tokens.find((t) => t.token_id === tid) ?? (tid === "q-9" ? { token_id: "q-9", owner_id: OWNER } : null);
      case "nft_token_svg":
        return svgFor(tid);
      case "nft_transfer_locked":
        return FX.nft_transfer_locked[tid] === true;
      case "get_quote":
        return { ...FX.get_quote_3, quote_id: String(args.quote_id) };
      case "get_position":
        return { position_id: String(args.position_id), borrower: OWNER, collateral: "NVDAx", units: "2000000", debt_usd_e6: "10000000", pre_liq_ltv_bps: 7500, opened_ns: NOW.toString(), status: "Open", remote: null };
      case "get_health":
        return { value_usd_e6: "178000000", debt_usd_e6: "10000000", ltv_bps: 561, pre_liq_ltv_bps: 7500, triggerable: false, oracle_fresh: true };
      case "get_shield":
        return null;
      case "get_reserve":
        return o.reserve ?? FX.get_reserve;
      case "get_reserve_note": {
        const n = FX.get_reserve_note[tid];
        return n ? { ...n, note: { ...n.note, unlock_ns: n.note.unlock_ns === "NOTICE_IN_2H" ? IN_2H : n.note.unlock_ns } } : null;
      }
      default:
        return method in V2 ? V2[method] : undefined;
    }
  };
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string; args_base64?: string } } | null;
    const p = body?.params;
    // R2-09: view_account answers with the shapes observed on test.rpc.fastnear.com (2026-11-11); unknown names → UNKNOWN_ACCOUNT.
    if (p?.request_type === "view_account" && p.account_id) {
      const id = p.account_id;
      const payload = EXISTING.has(id)
        ? { result: { amount: "1000000000000000000000000", locked: "0", code_hash: "11111111111111111111111111111111", storage_usage: 182, storage_paid_at: 0, block_height: 1, block_hash: "x" } }
        : { error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: { requested_account_id: id } }, code: -32000, message: "Server error", data: `account ${id} does not exist while viewing` } };
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, ...payload }) });
    }
    if (p?.request_type !== "call_function" || !p.method_name) return route.continue();
    const args = p.args_base64 ? (JSON.parse(Buffer.from(p.args_base64, "base64").toString("utf8") || "{}") as Record<string, unknown>) : {};
    const v = p.method_name === "ft_balance_of" ? "1000000000000" : p.account_id === CORE ? views(p.method_name, args) : undefined;
    if (v === undefined) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result: { result: Array.from(Buffer.from(JSON.stringify(v))), logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }),
    });
  });
}

const calls = (page: Page) => page.evaluate(() => window.__NECTAR_E2E_CALLS__ ?? []);

async function axeClean(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

async function copyRules(page: Page) {
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toContain("hackathon");
  expect(text).toContain("testnet");
}

test.describe("/notes (mocked v2, notes on)", () => {
  test("grid of live SVG thumbnails as <img> data URIs; type chips filter; nav link; a11y; no h-scroll", async ({ page }) => {
    await setup(page);
    await page.goto("/notes");
    await page.getByRole("tab", { name: /^Notes/ }).click();
    const grid = page.getByTestId("notes-grid");
    await expect(grid.locator(".note-card")).toHaveCount(5, { timeout: 20_000 });
    await expect(page.getByTestId("notes-total")).toHaveText("5 Notes");
    const img = page.getByTestId("note-img-p-7");
    await expect(img).toBeVisible();
    expect(await img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    await expect(img).toHaveAttribute("alt", /Loan Note p-7/);
    expect(await page.locator(".note-card svg").count()).toBe(0);
    await page.getByRole("button", { name: "LOAN", exact: true }).click();
    await expect(grid.locator(".note-card")).toHaveCount(2);
    await page.getByRole("button", { name: "RESERVE", exact: true }).click();
    await expect(grid.locator(".note-card")).toHaveCount(2);
    await page.getByRole("button", { name: "QUOTE", exact: true }).click();
    await expect(grid.locator(".note-card")).toHaveCount(1);
    await expect(page.locator("a[href=\"/notes\"]").first()).toBeAttached();
    await expect(page.locator("a[href=\"/reserve\"]").first()).toBeAttached();
    await copyRules(page);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await axeClean(page);
  });

  test("pages of 20", async ({ page }) => {
    const many = Array.from({ length: 25 }, (_, i) => ({ token_id: `q-${100 + i}`, owner_id: OWNER }));
    await setup(page, { tokens: many });
    await page.goto("/notes?tab=notes");
    await expect(page.getByTestId("notes-grid").locator(".note-card")).toHaveCount(20, { timeout: 20_000 });
    await expect(page.getByTestId("notes-page")).toHaveText("Page 1 of 2");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByTestId("notes-grid").locator(".note-card")).toHaveCount(5);
    await expect(page.getByTestId("notes-page")).toHaveText("Page 2 of 2");
  });

  test("empty account", async ({ page }) => {
    await setup(page, { tokens: [] });
    await page.goto("/notes?tab=notes");
    await expect(page.getByTestId("notes-empty")).toBeVisible({ timeout: 20_000 });
  });

  test("flags off: Portfolio still works, its Notes tab says so; no Notes or Reserve links", async ({ page }) => {
    await setup(page, { features: [] });
    await page.goto("/notes?tab=notes");
    await expect(page.getByText("Position Notes are not enabled on this deployment")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portfolio");
    await expect(page.getByRole("link", { name: "Position Notes" })).toHaveCount(0);
    await expect(page.locator("a[href=\"/reserve\"]")).toHaveCount(0);
    await page.goto("/reserve");
    await expect(page.getByText("Reserve deposits are not enabled on this deployment")).toBeVisible({ timeout: 20_000 });
    await page.goto("/position/7");
    await expect(page.getByText("Pre-liquidation LTV")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("note-link")).toHaveCount(0);
  });
});

test.describe("/note/[id] (mocked v2)", () => {
  test("loan note: svg, owner, history fallback, share link; transfer → sign modal (nft_transfer, 1 yocto, 50 TGas) → recorded", async ({ page }) => {
    await setup(page);
    await page.goto("/note/p-7");
    await expect(page.getByTestId("note-svg")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("note-owner")).toHaveText(OWNER);
    await expect(page.getByTestId("note-history-empty")).toContainText("History not indexed yet");
    const share = page.getByTestId("note-share");
    await expect(share).toHaveText("Share to X");
    const href = new URL((await share.getAttribute("href"))!);
    expect(href.hostname).toBe("x.com");
    expect(href.pathname).toBe("/intent/tweet");
    expect(href.searchParams.get("text")).toContain("mock collateral");
    await expect(page.getByTestId("note-transfer")).toBeDisabled();
    await expect(page.getByTestId("note-transfer-reason")).toHaveText("Enter the receiving NEAR account.");
    await page.getByLabel("Receiver (NEAR account)").fill("alice.testnet");
    await expect(page.getByTestId("note-receiver-ok")).toHaveText("alice.testnet exists on NEAR testnet.", { timeout: 20_000 });
    await expect(page.getByTestId("note-transfer-reason")).toHaveText("Type the receiving account again to confirm.");
    await page.getByLabel("Type the receiver again").fill("alice.testnet");
    await page.getByTestId("note-transfer").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Review: Transfer Note");
    await expect(modal.getByTestId("sign-args")).toContainText('"token_id": "p-7"');
    await expect(modal.getByTestId("sign-args")).toContainText('"receiver_id": "alice.testnet"');
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
    await expect(modal.getByTestId("sign-gas")).toHaveText("50 TGas");
    await copyRules(page);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal).toHaveCount(0);
    const c = await calls(page);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ receiverId: CORE, methodName: "nft_transfer", args: { receiver_id: "alice.testnet", token_id: "p-7" } });
    await axeClean(page);
  });

  test("review 2 (R2-09): a receiver that does not exist is refused; an implicit account needs no lookup; retype must match", async ({ page }) => {
    await setup(page);
    await page.goto("/note/q-3");
    await expect(page.getByTestId("note-owner")).toHaveText(OWNER, { timeout: 20_000 });
    await page.getByLabel("Receiver (NEAR account)").fill("alise.testnet");
    await page.getByLabel("Type the receiver again").fill("alise.testnet");
    await expect(page.getByTestId("note-transfer-reason")).toContainText("No account alise.testnet exists on NEAR testnet", { timeout: 20_000 });
    await expect(page.getByTestId("note-transfer")).toBeDisabled();
    const hex = "ab".repeat(32);
    await page.getByLabel("Receiver (NEAR account)").fill(hex);
    await expect(page.getByTestId("note-transfer-reason")).toHaveText("Type the receiving account again to confirm.");
    await page.getByLabel("Type the receiver again").fill(hex);
    await expect(page.getByTestId("note-transfer")).toBeEnabled();
    await page.getByTestId("note-transfer").click();
    await expect(page.getByRole("dialog").getByTestId("sign-args")).toContainText(`"receiver_id": "${hex}"`);
    await axeClean(page);
  });

  test("locked note: transfer disabled with the reason", async ({ page }) => {
    await setup(page);
    await page.goto("/note/p-8");
    await expect(page.getByTestId("note-lock")).toHaveText("locked (settlement in flight)", { timeout: 20_000 });
    await expect(page.getByTestId("note-transfer")).toBeDisabled();
    await expect(page.getByTestId("note-transfer-reason")).toContainText("settlement that references this Note is in flight");
  });

  test("not the owner: transfer disabled, no recipient card", async ({ page }) => {
    await setup(page, { account: "someone.testnet" });
    await page.goto("/note/q-3");
    await expect(page.getByTestId("note-transfer-reason")).toHaveText("Only the Note's owner can transfer it.", { timeout: 20_000 });
    await expect(page.getByTestId("note-remote-recipient")).toHaveCount(0);
  });

  test("quote note owned by the viewer: set_quote_remote_recipient with 1 yocto", async ({ page }) => {
    await setup(page);
    await page.goto("/note/q-3");
    const card = page.getByTestId("note-remote-recipient");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByLabel("Solana address").fill("not-an-address-0OIl");
    await expect(card.getByText("Not a Solana address (base58)")).toBeVisible();
    await card.getByLabel("Solana address").fill("So11111111111111111111111111111111111111112");
    await page.getByTestId("note-remote-set").click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-args")).toContainText('"recipient": "So11111111111111111111111111111111111111112"');
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    const c = await calls(page);
    expect(c[0]).toMatchObject({ methodName: "set_quote_remote_recipient", args: { quote_id: "3", recipient: "So11111111111111111111111111111111111111112" } });
  });

  test("an SVG that fails the allow-list is not rendered; a bad id is refused", async ({ page }) => {
    await setup(page);
    await page.goto("/note/q-9");
    await expect(page.getByTestId("note-svg-rejected")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("img[data-testid=note-svg]")).toHaveCount(0);
    await page.goto("/note/zzz");
    await expect(page.getByText("Not a Note id")).toBeVisible({ timeout: 20_000 });
  });

  test("position and quote pages link their Notes", async ({ page }) => {
    await setup(page);
    await page.goto("/position/7");
    await expect(page.getByTestId("note-link")).toHaveText("View Loan Note p-7", { timeout: 20_000 });
    await expect(page.getByTestId("note-link")).toHaveAttribute("href", "/note/p-7");
    await page.goto("/quote/3");
    await expect(page.getByTestId("note-link")).toHaveText("View Quote Note q-3", { timeout: 20_000 });
  });
});

test.describe("/reserve (mocked v2 views, contract shapes)", () => {
  test("R_c, realised fee APR, notes with countdown; $10 minimum; join → JoinNectarReserve msg; give notice", async ({ page }) => {
    await setup(page);
    await page.goto("/reserve");
    await expect(page.getByTestId("reserve-rc")).toHaveText("$25.40", { timeout: 20_000 });
    await expect(page.getByTestId("reserve-apr")).toHaveText("4.12 %");
    await expect(page.getByText("Realised fee APR (trailing 7 days)")).toBeVisible();
    await expect(page.getByTestId("reserve-in-notice")).toHaveText("$10.10");
    await expect(page.getByTestId("reserve-notice-period")).toHaveText("7 days");
    await expect(page.getByTestId("reserve-note-r-NVDAx-1-state")).toHaveText("active");
    await expect(page.getByTestId("reserve-note-r-NVDAx-1-units")).toHaveText("0.0125 NVDAx");
    await expect(page.getByTestId("reserve-note-r-NVDAx-2-state")).toHaveText(/^notice ends in (0[12]h \d\dm \d\ds|02h 00m 00s)$/);
    await copyRules(page);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await axeClean(page);
    await page.getByLabel("You deposit").fill("9.99");
    await expect(page.getByText("The Reserve takes at least $10.00")).toBeVisible();
    await expect(page.getByTestId("reserve-join")).toBeDisabled();
    await page.getByLabel("You deposit").fill("25");
    await page.getByTestId("reserve-join").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Review: Join the Nectar Reserve");
    await expect(modal.getByTestId("sign-msg")).toContainText('"JoinNectarReserve"');
    await expect(modal.getByTestId("sign-msg")).toContainText('"collateral": "NVDAx"');
    await expect(modal.getByTestId("sign-gas")).toHaveText("100 TGas");
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal).toHaveCount(0);
    await page.getByTestId("reserve-note-r-NVDAx-1-notice").click();
    await expect(page.getByRole("dialog").getByTestId("sign-args")).toContainText('"note_id": "r-NVDAx-1"');
    await page.getByRole("dialog").getByRole("button", { name: "Open wallet to sign" }).click();
    const c = await calls(page);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ receiverId: USDC, methodName: "ft_transfer_call", args: { receiver_id: CORE, amount: "25000000" } });
    expect(JSON.parse(String(c[0]!.args.msg))).toEqual({ JoinNectarReserve: { collateral: "NVDAx" } });
    expect(c[1]).toMatchObject({ receiverId: CORE, methodName: "initiate_reserve_exit", args: { note_id: "r-NVDAx-1" } });
  });
});

test.describe("/reserve states (contract shapes)", () => {
  test("disabled Reserve (discount_bps 0) refuses deposits before the wallet; empty pool shows no APR", async ({ page }) => {
    await setup(page, { reserve: { ...(V2.get_reserve as Record<string, unknown>), discount_bps: 0 }, tokens: [] });
    await page.goto("/reserve");
    await expect(page.getByTestId("reserve-disabled")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("reserve-none")).toBeVisible();
    await expect(page.getByTestId("reserve-apr")).toHaveText("no active deposits");
    await page.getByLabel("You deposit").fill("25");
    await expect(page.getByTestId("reserve-join")).toBeDisabled();
    await expect(page.getByTestId("reserve-notes-empty")).toBeVisible();
    expect(await calls(page)).toHaveLength(0);
  });
});

// Evidence screenshots (not committed): NOTES_SCREENS=1 writes evidence/wo-26c/<page>-<project>-<theme>.png.
test.describe("notes screenshots", () => {
  test.skip(!process.env.NOTES_SCREENS, "set NOTES_SCREENS=1 to capture evidence screenshots");
  for (const theme of ["dark", "light"] as const) {
    test(`capture ${theme}`, async ({ page }, info) => {
      await setup(page, { theme });
      for (const [name, path, ready] of [["notes", "/notes?tab=notes", "note-img-p-7"], ["note", "/note/p-7", "note-svg"], ["reserve", "/reserve", "reserve-rc"]] as const) {
        await page.goto(path);
        await expect(page.getByTestId(ready)).toBeVisible({ timeout: 20_000 });
        await page.screenshot({ path: resolve(import.meta.dirname, `../../../evidence/wo-26c/${name}-${info.project.name}-${theme}.png`), fullPage: true });
      }
    });
  }
});
