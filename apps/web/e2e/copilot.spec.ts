import { expect, test } from "@playwright/test";
import { prime } from "./helpers";

// WO-17 copilot. Without NEAR_AI_API_KEY (H7) the panel says "Key missing"; the recorded fixture runs the full
// verifier and must stay hidden (its Intel quote is a public sample with patched report_data, so DCAP fails).
test.describe("copilot verifier", () => {
  for (const path of ["/console", "/borrow"]) {
    test(`panel on ${path}: key state, fixture checks listed, answer hidden`, async ({ page }) => {
      await prime(page, "dark");
      await page.goto(path);
      const panel = page.locator(".copilot");
      await expect(panel).toBeVisible();
      await expect(panel.getByText(/Key missing|Ask copilot/).first()).toBeVisible({ timeout: 15_000 });
      await panel.getByRole("button", { name: "Run verifier on recorded fixture" }).click();
      await expect(panel.getByText("unverified — hidden")).toBeVisible({ timeout: 20_000 });
      const checks = panel.getByRole("list", { name: "Verification checks" });
      await expect(checks.getByText(/Signature recovers \(EIP-191\)/)).toBeVisible();
      await expect(checks.locator("li").filter({ hasText: "TDX quote verified" })).toContainText("failed");
      await expect(checks.locator("li").filter({ hasText: "report_data[32..64]" })).toContainText("passed");
      await expect(checks.locator("li").filter({ hasText: "RTMR3" })).toContainText("not run");
      await expect(panel.getByText(/^Answer hidden:/)).toBeVisible();
      await expect(panel.locator(".copilot-answer")).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
