import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-34b: site pages in local mode (no SITE_URL / APP_URL, config.yaml site.* null). Axe both themes, 400 px on the phone project.
const PAGES = ["/about", "/status", "/changelog", "/brand", "/talk", "/security"] as const;

for (const theme of ["dark", "light"] as const) {
  for (const route of PAGES) {
    test(`${route} (${theme}): h1, axe clean, no horizontal scroll`, async ({ page }, info) => {
      await prime(page, theme);
      await page.goto(route);
      await expect(page.locator("main h1")).toHaveCount(1);
      expect(await noHorizontalScroll(page), `h-scroll on ${route} (${info.project.name})`).toBeLessThanOrEqual(0);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
}

test.describe("content", () => {
  test.beforeEach(async ({ page }) => prime(page, "dark"));

  test("/about says what it is and that no operator is configured locally", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText(/testnet software/)).toBeVisible();
    await expect(page.getByTestId("operator-missing")).toHaveText("Operator not configured in this build.");
  });

  test("/talk has no form and shows the local contact text", async ({ page }) => {
    await page.goto("/talk");
    await expect(page.locator("main form")).toHaveCount(0);
    await expect(page.getByTestId("contact-missing")).toHaveText("Contact not configured in this build");
  });

  test("/status shows live checks, the hosted split, contract ids and the gate table with its source", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByTestId("settlement-when")).toContainText("while the operator's keeper is online");
    await expect(page.getByTestId("status-local")).toBeVisible();
    await expect(page.getByTestId("status-ids")).toContainText(config.accounts.core);
    await expect(page.getByText("Source: docs/EVIDENCE.md", { exact: false })).toBeVisible();
    await expect(page.getByTestId("status-gates").locator("tbody tr").first()).toBeVisible();
    await expect(page.getByTestId("status-app")).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
    await expect(page.getByTestId("status-feed")).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
  });

  test("/changelog lists tagged groups without branding", async ({ page }) => {
    await page.goto("/changelog");
    const body = page.locator("main");
    await expect(body.getByTestId("changelog").or(body.getByTestId("changelog-nogit"))).toBeVisible();
    expect(await body.innerText()).not.toMatch(/hackathon/i);
  });

  test("/brand links real files", async ({ page, request }) => {
    await page.goto("/brand");
    const links = page.getByTestId("brand-files").getByRole("link");
    expect(await links.count()).toBeGreaterThanOrEqual(5);
    for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) expect((await request.get(href)).status(), href).toBe(200);
  });

  test("/security renders SECURITY.md and the reporting contact", async ({ page }) => {
    await page.goto("/security");
    await expect(page.getByTestId("security-md")).toContainText("Reporting a vulnerability");
    await expect(page.getByTestId("security-contact-missing")).toBeVisible();
  });

  test("footer links the new pages; no whitepaper link; landing worked example labelled", async ({ page }) => {
    await page.goto("/");
    const foot = page.getByRole("navigation", { name: "Footer" });
    for (const name of ["About", "Status", "Changelog", "Brand assets", "Security", "Talk to us"]) await expect(foot.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /whitepaper/i })).toHaveCount(0);
    await expect(page.getByText("Example", { exact: true }).first()).toBeVisible();
  });
});
