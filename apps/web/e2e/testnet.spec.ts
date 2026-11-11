import { expect, test } from "@playwright/test";
import { PENDING_MSG, TESTNET_PENDING, config, prime } from "./helpers";

// Read-only flows against NEAR testnet, plus one write (borrow) signed with the demo borrower key from env.
test.describe("testnet read-only", () => {
  test.skip(TESTNET_PENDING, PENDING_MSG);

  test("feed lists NVDAx with live capacity", async ({ page }) => {
    await prime(page, "dark");
    await page.goto("/feed");
    await expect(page.getByRole("table", { name: /exit capacity/i })).toBeVisible();
    await expect(page.getByText("NVDAx").first()).toBeVisible();
  });

  test("api health answers from the contract", async ({ request }) => {
    const r = await request.get("/api/health");
    const j = (await r.json()) as { ok: boolean; core: string };
    expect(j.ok).toBe(true);
    expect(j.core).toBe(config.accounts.core);
  });
});

test.describe("testnet write: borrow with demo key", () => {
  const id = process.env.NECTAR_E2E_BORROWER_ID ?? config.accounts.demo.borrower1;
  const key = process.env.NECTAR_E2E_BORROWER_KEY;
  test.skip(TESTNET_PENDING, PENDING_MSG);
  test.skip(!key || process.env.NEXT_PUBLIC_E2E_KEY_ADAPTER !== "1", "needs NECTAR_E2E_BORROWER_KEY and a build with NEXT_PUBLIC_E2E_KEY_ADAPTER=1");

  test("sign modal shows msg, gas, deposit; borrow lands", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one write per run");
    await prime(page, "dark");
    await page.addInitScript(([a, k]) => {
      (window as unknown as { __NECTAR_E2E__: unknown }).__NECTAR_E2E__ = { accountId: a, privateKey: k };
    }, [id, key!] as const);
    await page.goto("/borrow");
    await page.getByLabel("You lock").fill("1");
    await page.getByLabel("You borrow").fill("10");
    await expect(page.getByTestId("preview-fees")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("review-borrow").click();
    await page.getByTestId("confirm-in-wallet").click();
    await expect(page.getByTestId("sign-msg")).toContainText('"LockCollateralAndBorrow"');
    await expect(page.getByTestId("sign-gas")).toContainText("TGas");
    await expect(page.getByTestId("sign-deposit")).toContainText("1 yoctoNEAR");
    await expect(page.getByTestId("sign-fees-total")).toContainText("$");
    await page.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByText("Position opened")).toBeVisible({ timeout: 60_000 });
  });
});
