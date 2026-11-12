import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ALL_FEATURES, PENDING_MSG, TESTNET_PENDING, config, pinFlags, prime } from "./helpers";

// WO-20 / WO-26f: v7 P0 delta on a mocked v1 contract and a mocked v2 view fixture. Flag state is pinned per test (pinFlags), never
// read from config.yaml: flag-off hides every v7 control; flag-on shows it on v2 only (a v1 contract keeps it hidden).

const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const CORE = config.accounts.core;

const V1_VERSION = "nectar-core 0.1.0 p2";
const V1_VIEWS = { contract_version: V1_VERSION, get_config: { ...(FIXTURE.get_config as object), contract_version: V1_VERSION } };

/** Answer nectar-core view calls from the v2 fixture (optionally overridden); everything else goes to the real testnet RPC. */
async function mockV2(page: Page, override: Record<string, unknown> = {}) {
  const views = { ...FIXTURE, ...override };
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

function copyRules(text: string) {
  expect(text).not.toContain("insurance");
  expect(text).not.toContain("without liquidations");
  expect(text).not.toContain("hackathon");
  expect(text).toContain("testnet");
  expect(text).toContain("mock collateral");
}

test.describe("landing v7", () => {
  test("flags off: hero, live card, how it works, FAQ, footer; no module sections; copy rules", async ({ page }) => {
    await prime(page, "dark");
    await pinFlags(page, []);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Borrow against stocks without fire-sales" })).toBeVisible();
    await expect(page.getByTestId("live-limit-card")).toBeVisible();
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("[data-feature]")).toHaveCount(0);
    copyRules((await page.locator("body").innerText()).toLowerCase());
    // Review 2: privacy claims scoped to what holds in this build (R2-01, R2-02).
    const body = await page.locator("body").innerText();
    expect(body).toContain("We never join wallet addresses to IP addresses in logs we control.");
    expect(body).toContain("operator-set demo parameters (published in the docs)");
    expect(body).not.toMatch(/private parameters are read inside a TEE|reads private market-maker parameters|never joined to IPs/);
  });

  test("flags on: every module section renders with its data-feature tag; copy rules still hold", async ({ page }) => {
    await prime(page, "dark");
    await pinFlags(page, ALL_FEATURES);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Borrow against stocks without fire-sales" })).toBeVisible();
    // Landing v2 (WO-33a): the Shield role is #borrow, remote chains are #chains, the agent channel is a block inside #code.
    for (const [id, tag] of [["borrow", "shields"], ["reserve", "reserve"], ["spend", "pay_to"], ["notes", "notes"], ["chains", "solana_remote"]] as const) {
      await expect(page.locator(`section#${id}`)).toHaveAttribute("data-feature", tag);
    }
    for (const f of ["pay_to", "profit_lock", "solana_remote", "base", "x402", "agent_skill"] as const) await expect(page.locator(`div[data-feature="${f}"]`)).toHaveCount(1);
    await expect(page.locator("#code div[data-feature=\"agent_skill\"]")).toHaveCount(1);
    await expect(page.locator("#faq")).toBeVisible();
    copyRules((await page.locator("body").innerText()).toLowerCase());
  });

  test("one flag on: only that module renders", async ({ page }) => {
    await prime(page, "dark");
    await pinFlags(page, ["reserve"]);
    await page.goto("/");
    await expect(page.locator("section#reserve")).toBeVisible();
    await expect(page.locator("[data-feature]")).toHaveCount(1);
  });

  test("live card shows in-session vs weekend parameters from testnet", async ({ page }) => {
    test.skip(TESTNET_PENDING, PENDING_MSG);
    await prime(page, "dark");
    await page.goto("/");
    await expect(page.getByTestId("limit-in-session")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("limit-weekend")).toContainText("Weekend parameters");
    await expect(page.getByTestId("live-limit-card").getByTestId("session-badge")).toBeVisible();
  });
});

test.describe("v1 path (mocked v1 contract, every flag on)", () => {
  test.skip(TESTNET_PENDING, PENDING_MSG);
  // All flags on: a v1 contract must still hide every v7 control (featureOn needs v2).
  test.beforeEach(async ({ page }) => {
    await prime(page, "dark");
    await pinFlags(page, ALL_FEATURES);
    await mockV2(page, V1_VIEWS);
  });

  test("feed equation card: live terms, canonical labels, session badge; no v2 aggregate rows", async ({ page }) => {
    await page.goto("/feed");
    const card = page.getByTestId("equation-card");
    await expect(card.getByTestId("eq-q")).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("Nectar Reserve");
    await expect(card).toContainText("verified DEX depth");
    await expect(card.getByTestId("eq-h")).toContainText("bps");
    await expect(card.getByTestId("eq-total-debt")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /Uplift/ })).toHaveCount(1);
    const badge = page.getByRole("table", { name: /exit capacity/i }).getByTestId("session-badge").first();
    await expect(badge).toContainText(/In session|Weekend parameters/);
    await expect(page.getByTestId("multiplier-line")).toHaveCount(0);
  });

  test("borrow: fee stack with total, no v7 controls even with ?ref=", async ({ page }) => {
    await page.goto(`/borrow?ref=agent1.nectar.testnet`);
    await page.getByLabel("You lock").fill("1");
    await page.getByLabel("You borrow").fill("10");
    const fees = page.getByTestId("preview-fees");
    await expect(fees).toBeVisible({ timeout: 20_000 });
    await expect(fees).toContainText("Limit premium");
    await expect(fees).toContainText("the v1 contract charges none");
    await expect(page.getByTestId("preview-fees-total")).toContainText("$");
    await expect(page.getByTestId("pay-to")).toHaveCount(0);
    await expect(page.getByTestId("referrer")).toHaveCount(0);
    await expect(page.getByTestId("session-badge").first()).toBeVisible();
  });
});

test.describe("v2 path (mocked view fixture), flags off", () => {
  test.skip(TESTNET_PENDING, PENDING_MSG);
  test.beforeEach(async ({ page }) => {
    await prime(page, "dark");
    await pinFlags(page, []);
    await mockV2(page);
  });

  test("feed shows total debt, aggregate headroom and the contract's session reason", async ({ page }) => {
    await page.goto("/feed");
    const card = page.getByTestId("equation-card");
    await expect(card.getByTestId("eq-total-debt")).toHaveText("$1,200", { timeout: 20_000 });
    await expect(card.getByTestId("eq-headroom")).toHaveText("$1,687");
    await expect(card.getByTestId("session-badge")).toHaveAttribute("data-reason", "forced_closed");
    await expect(card.getByTestId("session-badge")).toContainText("Weekend parameters");
    await expect(card.getByTestId("session-badge")).toContainText("forced closed");
    // features.multiplier is pinned off: no multiplier line even though M = 1.02 on the fixture.
    await expect(page.getByTestId("multiplier-line")).toHaveCount(0);
  });

  test("borrow uses the contract fee stack; pay_to and referrer stay hidden while their flags are off", async ({ page }) => {
    await page.goto("/borrow?ref=agent1.nectar.testnet");
    await page.getByLabel("You lock").fill("1");
    await page.getByLabel("You borrow").fill("10");
    const fees = page.getByTestId("preview-fees");
    await expect(fees).toContainText("Origination (30 bps of the borrow)", { timeout: 20_000 });
    await expect(page.getByTestId("preview-fees-total")).toHaveText("$0.03");
    await expect(fees).toContainText("you receive $9.97");
    await expect(page.getByText("Aggregate headroom")).toBeVisible();
    await expect(page.getByTestId("pay-to")).toHaveCount(0);
    await expect(page.getByTestId("referrer")).toHaveCount(0);
  });
});

test.describe("v2 path (mocked view fixture), flags on", () => {
  test.skip(TESTNET_PENDING, PENDING_MSG);
  test.beforeEach(async ({ page }) => {
    await prime(page, "dark");
    await pinFlags(page, ALL_FEATURES);
    await mockV2(page);
  });

  test("feed shows the multiplier line (M = 1.02 on the fixture)", async ({ page }) => {
    await page.goto("/feed");
    await expect(page.getByTestId("equation-card").getByTestId("eq-total-debt")).toHaveText("$1,200", { timeout: 20_000 });
    await expect(page.getByTestId("multiplier-line").first()).toBeVisible();
  });

  test("borrow shows pay_to and the referrer from ?ref=", async ({ page }) => {
    await page.goto("/borrow?ref=agent1.nectar.testnet");
    await expect(page.getByTestId("pay-to")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("referrer")).toBeVisible();
  });
});

// WO-35i: the #chains section made one claim in the server HTML and another after hydration, and named Base without "local fork".
const norm = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();

/** Every sentence in #chains (text and aria-labels) that names Base as a word. */
function baseSentences(page: Page): Promise<string[]> {
  return page.locator("section#chains").evaluate((sec) => {
    const texts = [...sec.querySelectorAll("h2, h3, p, li, span")].map((e) => e.textContent ?? "");
    texts.push(...[...sec.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? ""));
    return texts.flatMap((t) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter((x) => /\bBase\b/.test(x));
  });
}

test.describe("landing #chains: same claims before and after hydration; Base always says local fork", () => {
  test("config flags (no pin), v2 contract: hydrated #chains text equals the server HTML", async ({ page, request }) => {
    const serverHtml = await (await request.get("/")).text();
    await prime(page, "dark");
    await mockV2(page);
    // useFeature flipped the heading once contract_version came back as v2; wait for that read before comparing.
    const versionRead = page.waitForResponse((r) => /fastnear/.test(r.url()) && (r.request().postData() ?? "").includes("contract_version"));
    await page.goto("/");
    await versionRead;
    await page.waitForLoadState("networkidle");
    const server = await page.evaluate((html) => {
      const sec = new DOMParser().parseFromString(html, "text/html").querySelector("section#chains");
      return sec ? sec.textContent : null;
    }, serverHtml);
    const chains = page.locator("section#chains");
    if (server === null) {
      await expect(chains).toHaveCount(0);
      return;
    }
    await expect(page.locator("#hublinks path").first()).toBeAttached(); // drawn in an effect: the section has hydrated
    const hydrated = await chains.evaluate((el) => el.textContent);
    console.log(`#chains server  : ${norm(server).slice(0, 160)}…\n#chains hydrated: ${norm(hydrated).slice(0, 160)}…`);
    expect(norm(hydrated)).toBe(norm(server));
    expect(norm(server)).toContain("local fork");
    const named = await baseSentences(page);
    console.log(`#chains Base sentences (${named.length}):\n  ${named.join("\n  ")}`);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((x) => !x.includes("local fork"))).toEqual([]);
  });

  for (const on of [["solana_remote"], ["base"], ["solana_remote", "base"]] as const) {
    test(`pinned ${on.join(" + ")}: every #chains sentence that names Base says local fork`, async ({ page }) => {
      await prime(page, "dark");
      await pinFlags(page, on);
      await page.goto("/");
      await expect(page.locator("section#chains")).toBeVisible();
      const named = await baseSentences(page);
      expect(named.length).toBeGreaterThan(0);
      expect(named.filter((x) => !x.includes("local fork"))).toEqual([]);
      await expect(page.locator("#nbase")).toHaveCount((on as readonly string[]).includes("base") ? 1 : 0);
    });
  }
});
