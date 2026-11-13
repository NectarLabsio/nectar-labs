import { expect, test } from "@playwright/test";
import { prime } from "./helpers";

// WO-17 copilot. Without NEAR_AI_API_KEY (H7) the panel shows a neutral "Recorded fixture" notice (WO-93); the recorded fixture runs the full
// verifier and must stay hidden (its Intel quote is a public sample with patched report_data, so DCAP fails).
test.describe("copilot verifier", () => {
  for (const path of ["/console", "/borrow"]) {
    test(`panel on ${path}: key state, fixture checks listed, answer hidden`, async ({ page }) => {
      await prime(page, "dark");
      await page.goto(path);
      const panel = page.locator(".copilot");
      await expect(panel).toBeVisible();
      const ask = panel.getByRole("button", { name: "Ask copilot", exact: true });
      if (!process.env.NEAR_AI_API_KEY) {
        const banner = panel.locator(".banner").filter({ has: page.locator(".b-title", { hasText: /^Recorded fixture$/ }) });
        await expect(banner).toBeVisible({ timeout: 15_000 });
        await expect(banner.locator(".b-title")).toHaveText("Recorded fixture");
        await expect(banner).toHaveClass(/\binfo\b/);
        await expect(banner).toContainText("Live answers are off on this server. The verifier runs on a recorded fixture.");
        await expect(ask).toBeDisabled();
      } else {
        await expect(panel.locator(".b-title", { hasText: /^Recorded fixture$/ })).toHaveCount(0, { timeout: 15_000 });
        await expect(ask).toBeVisible();
      }
      await expect(panel).toContainText("In your browser: EIP-191 signature recovery");
      await expect(panel).toContainText("On this server: the Intel TDX quote (DCAP, via dcap-qvl)");
      await panel.getByRole("button", { name: "Run verifier on recorded fixture" }).click();
      await expect(panel.getByText("unverified — hidden")).toBeVisible({ timeout: 20_000 });
      const checks = panel.getByRole("list", { name: "Verification checks" });
      await expect(checks.getByText(/Signature recovers \(EIP-191\)/)).toBeVisible();
      await expect(checks.locator("li").filter({ hasText: "TDX quote verified" })).toContainText("failed");
      await expect(checks.locator("li").filter({ hasText: "report_data[32..64]" })).toContainText("passed");
      await expect(checks.locator("li").filter({ hasText: "RTMR3" })).toContainText("not run");
      await expect(checks.locator("li").filter({ hasText: "NVIDIA NRAS (JWT signature not verified" })).toContainText("not run");
      await expect(checks.locator("li").filter({ hasText: "model id unverified (F-078)" })).toContainText("not run");
      await expect(panel.getByText(/^Answer hidden:/)).toBeVisible();
      await expect(panel.locator(".copilot-answer")).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
