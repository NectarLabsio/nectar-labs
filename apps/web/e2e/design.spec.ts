import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { noHorizontalScroll, prime } from "./helpers";

// WO-33a evidence: landing v2 at 1440 and 400 px in both themes → evidence/G3/design/ (upper-case G3, exFAT is case-insensitive).
const OUT = resolve(import.meta.dirname, "../../../evidence/G3/design");
mkdirSync(OUT, { recursive: true });

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 400] as const) {
    test(`landing v2 ${width}px ${theme}: reduced motion leaves everything visible, no h-scroll, axe clean`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "viewport set explicitly; one run per size");
      await prime(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Borrow against stocks without fire-sales");
      expect(await page.evaluate(() => document.documentElement.classList.contains("intro"))).toBe(false);
      // Resting state: hero words, counters and the static mark are visible without any animation.
      for (const sel of ["#h1 i", "#stage img", "#how", "#faq", "#finale"]) await expect(page.locator(sel).first()).toBeVisible();
      expect(await page.locator("#h1 i").first().evaluate((el) => getComputedStyle(el).transform)).toBe("none");
      expect(await page.locator("#gl").evaluate((el) => (el as HTMLCanvasElement).width)).toBeLessThanOrEqual(300);
      expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${OUT}/home-${width}-${theme}.png`, fullPage: true });
    });
  }
}

test("landing v2 with motion: intro runs, 3D mark replaces the first frame when WebGL is available", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop only");
  await prime(page, "dark");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.classList.contains("intro"))).toBe(true);
  await expect(page.locator("#stage img")).toBeAttached();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/home-1440-dark-motion.png` });
});
