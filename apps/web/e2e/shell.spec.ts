import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ROUTES, noHorizontalScroll, prime } from "./helpers";

// Runs with or without deployed contracts: every page must render a real state (data, empty, loading or "not deployed").
for (const theme of ["dark", "light"] as const) {
  for (const route of ROUTES) {
    test(`${route} renders in ${theme}, no horizontal scroll, axe clean`, async ({ page }, info) => {
      await prime(page, theme);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const external: string[] = [];
      page.on("request", (r) => {
        const u = new URL(r.url());
        if (u.hostname !== "localhost" && !u.hostname.endsWith("fastnear.com")) external.push(u.hostname);
      });
      await page.goto(route);
      await expect(page.locator("main#main")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByText(/hackathon/i)).toHaveCount(0);
      expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.length}`), `axe on ${route} (${info.project.name})`).toEqual([]);
      expect(external, "no external requests except RPC before consent").toEqual([]);
    });
  }
}

test("consent banner is shown by default and analytics stay off", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("consent")).toBeVisible();
  await page.getByTestId("consent-decline").click();
  await expect(page.getByTestId("consent")).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(document.getElementById("ga-src")))).toBe(false);
});

test("theme toggle switches data-theme", async ({ page }) => {
  await prime(page, "dark");
  await page.goto("/");
  await page.locator("footer").getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
