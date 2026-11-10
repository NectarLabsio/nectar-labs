import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-26a: /agents and the /console v7 owner controls against mocked nectar-core v2 views (e2e/fixtures/v2-views.json).
// The NEAR "wallet" is the localhost-only E2E mock (lib/wallet/e2e-mock.ts): it records intents and never signs anything.

const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const CORE = config.accounts.core;
const OWNER = "nectar.testnet";

async function setup(page: Page, opts: { account?: string; views?: Record<string, unknown> } = {}) {
  await prime(page, "dark");
  if (opts.account) {
    await page.addInitScript((acct) => {
      window.__NECTAR_E2E_MOCK__ = { near: { accountId: acct } };
    }, opts.account);
  }
  const views = { ...FIXTURE, ...(opts.views ?? {}) };
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string } } | null;
    const p = body?.params;
    if (p?.request_type === "call_function" && p.account_id === CORE && p.method_name && p.method_name in views) {
      const bytes = Array.from(Buffer.from(JSON.stringify(views[p.method_name])));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result: { result: bytes, logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }),
      });
    }
    return route.continue();
  });
}

async function axeClean(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

const calls = (page: Page) => page.evaluate(() => window.__NECTAR_E2E_CALLS__ ?? []);

test.describe("/agents", () => {
  test("install snippets, labelled example, x402 not run yet, referral stats on v2", async ({ page }) => {
    await setup(page, { account: "agent1.nectar.testnet" });
    await page.goto("/agents");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Let an agent open the loan");
    await expect(page.getByTestId("mcp-stdio-cmd")).toContainText("pnpm -s --filter feed mcp");
    await page.getByRole("tab", { name: "HTTP" }).click();
    await expect(page.getByTestId("mcp-http")).toContainText("http://127.0.0.1:8789/mcp");
    const ex = page.getByTestId("agents-example");
    await expect(ex.getByText("example", { exact: true })).toBeVisible();
    await expect(page.getByTestId("example-input")).toContainText('"borrow_usd": "10"');
    await expect(page.getByTestId("example-call")).toContainText('"method": "ft_transfer_call"');
    await expect(page.getByTestId("example-call")).toContainText('"deposit": "1"');
    const x = page.getByTestId("agents-x402");
    await expect(x.getByText("not run on testnet yet", { exact: true })).toBeVisible();
    await expect(x.getByText("Not run on testnet yet", { exact: true })).toBeVisible();
    await expect(x).toContainText("0.01 mock USDC");
    const ref = page.getByTestId("agents-referrals");
    await expect(ref.getByLabel("Referrer account")).toHaveValue("agent1.nectar.testnet", { timeout: 20_000 });
    await expect(ref.getByTestId("ref-registered")).toHaveText("registered", { timeout: 20_000 });
    await expect(ref.getByTestId("ref-claimable")).toHaveText("$0.15 mock USDC");
    // features.referrals / pay_to are false: no withdraw control yet.
    await expect(ref.getByRole("button", { name: "Withdraw claimable USDC" })).toHaveCount(0);
    const text = (await page.locator("main").innerText()).toLowerCase();
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toContain("hackathon");
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await axeClean(page);
  });

  test("v1 contract: referral stats explain that v2 is needed", async ({ page }) => {
    await setup(page, { views: { contract_version: "nectar-core 0.1.0 p2", get_config: { ...(FIXTURE.get_config as object), contract_version: "nectar-core 0.1.0 p2" } } });
    await page.goto("/agents");
    await expect(page.getByText("Referrals need nectar-core v2")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("/console v7 controls (v2)", () => {
  test("owner: multiplier, corporate action, session, referrers, remote — each write opens the sign modal", async ({ page }) => {
    const now = BigInt(Date.now()) * 1_000_000n;
    const h = 3_600n * 1_000_000_000n;
    await setup(page, { account: OWNER, views: { get_session_calendar: [[String(now - h), String(now + h)], [String(now + 20n * h), String(now + 26n * h)]] } });
    await page.goto("/console");
    const mult = page.getByTestId("v7-multiplier");
    await expect(mult.getByTestId("v7-multiplier-value")).toHaveText("1.02", { timeout: 20_000 });
    const sess = page.getByTestId("v7-session");
    await expect(sess.getByTestId("v7-calendar-count")).toHaveText("2 / 600");
    await expect(sess.getByTestId("v7-calendar-current")).not.toHaveText("none");
    await expect(sess.getByTestId("v7-forced")).toHaveText("yes");
    await expect(page.getByTestId("v7-origination")).toHaveText("30 bps of the borrow");
    await expect(page.getByTestId("v7-remote")).toContainText("allowed (keeper-attested)");

    // set_multiplier: > +5% refused inline; 1.05 previewed and signed through the modal.
    const setBox = page.getByTestId("v7-set-multiplier");
    await setBox.getByLabel("New multiplier").fill("1.08");
    await expect(setBox.getByRole("alert")).toContainText("+5%");
    await setBox.getByLabel("New multiplier").fill("1.05");
    await setBox.getByRole("button", { name: "Set multiplier" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-args")).toContainText('"multiplier_e18": "1050000000000000000"');
    await expect(modal.getByTestId("sign-gas")).toHaveText("30 TGas");
    await expect(modal.getByTestId("sign-deposit")).toBeVisible();
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal).toHaveCount(0);
    expect((await calls(page)).map((c) => c.methodName)).toContain("set_multiplier");

    // announce: needs >= 1 h notice.
    const ann = page.getByTestId("v7-announce");
    await ann.getByLabel("Multiplier after the action").fill("2");
    await ann.getByLabel(/Effective in/).fill("0.5");
    await expect(ann.getByRole("alert")).toContainText("1 h");
    await ann.getByLabel(/Effective in/).fill("2");
    await ann.getByRole("button", { name: "Announce corporate action" }).click();
    await expect(page.getByRole("dialog").getByTestId("sign-args")).toContainText('"multiplier_e18": "2000000000000000000"');
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

    // session: clear forced close.
    await page.getByTestId("v7-clear-forced").getByRole("button", { name: "Clear forced close" }).click();
    await expect(page.getByRole("dialog").getByTestId("sign-args")).toContainText('"closed": false');
    await page.getByRole("dialog").getByRole("button", { name: "Open wallet to sign" }).click();

    // referrers: is_referrer → only unregister makes sense.
    const refs = page.getByTestId("v7-referrers");
    await refs.getByLabel("Referrer account").fill("agent1.nectar.testnet");
    await expect(refs.getByText("Registered", { exact: true })).toBeVisible();
    await expect(page.getByTestId("v7-register").getByRole("button")).toBeDisabled();
    await page.getByTestId("v7-unregister").getByRole("button", { name: "Unregister referrer" }).click();
    await expect(page.getByRole("dialog").getByTestId("sign-args")).toContainText('"account_id": "agent1.nectar.testnet"');
    await page.getByRole("dialog").getByRole("button", { name: "Open wallet to sign" }).click();

    // remote: keeper attestation toggle and vault_read validation (gas 10–100).
    await page.getByTestId("v7-attest").getByRole("button", { name: "Disallow keeper attestation" }).click();
    await expect(page.getByRole("dialog").getByTestId("sign-args")).toContainText('"allow": false');
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    const vr = page.getByTestId("v7-vault-read");
    await vr.getByLabel("OutLayer project id").fill("nectar.testnet/vault-read");
    await vr.getByLabel("vault_read version key").fill("k1");
    await vr.getByLabel(/Deposit per read/).fill("5");
    await vr.getByLabel(/vault_read gas/).fill("101");
    await expect(vr.getByRole("alert")).toContainText("gas_tgas");

    const made = (await calls(page)).map((c) => c.methodName);
    expect(made).toEqual(["set_multiplier", "force_session_closed", "unregister_referrer"]);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await axeClean(page);
  });

  test("non-owner: read-only, apply works for anyone once effective", async ({ page }) => {
    const past = String(BigInt(Date.now() - 60_000) * 1_000_000n);
    const cap = { ...(FIXTURE.get_exit_capacity as object), ca_pending: true, ca_effective_ns: past };
    await setup(page, { account: "borrower1.nectar.testnet", views: { get_exit_capacity: cap, get_session_calendar: [] } });
    await page.goto("/console");
    await expect(page.getByTestId("v7-ca-pending")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("v7-session")).toContainText("No calendar loaded");
    await expect(page.getByTestId("v7-force-closed").getByRole("button")).toBeDisabled();
    await expect(page.getByTestId("v7-attest").getByRole("button")).toBeDisabled();
    await page.getByTestId("v7-apply").getByRole("button", { name: "Apply corporate action" }).click();
    await expect(page.getByRole("dialog").getByTestId("sign-args")).toContainText('"symbol": "NVDAx"');
    await page.getByRole("dialog").getByRole("button", { name: "Open wallet to sign" }).click();
    expect((await calls(page)).map((c) => c.methodName)).toEqual(["apply_corporate_action"]);
    await axeClean(page);
  });
});
