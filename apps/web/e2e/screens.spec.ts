import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";
import { ROUTES, prime } from "./helpers";

// Evidence screenshots: every page, desktop + phone (projects), both themes → evidence/g3/screens/.
const OUT = resolve(import.meta.dirname, "../../../evidence/g3/screens");
mkdirSync(OUT, { recursive: true });

for (const theme of ["dark", "light"] as const) {
  for (const route of ROUTES) {
    test(`screenshot ${route} ${theme}`, async ({ page }, info) => {
      await prime(page, theme);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const name = route === "/" ? "home" : route.slice(1).replace(/\//g, "_");
      await page.screenshot({ path: `${OUT}/${name}-${info.project.name}-${theme}.png`, fullPage: true });
    });
  }
}
