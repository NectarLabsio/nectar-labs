import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
  // R2-01: the claim is scoped to our own logs, names the RPC providers, and mentions the wallet connector's storage.
  await expect(page.getByTestId("consent")).toContainText("We never join wallet addresses to IP addresses in logs we control.");
  await expect(page.getByTestId("consent")).toContainText("NEAR and Solana RPC providers, which see your IP and the accounts you query");
  await expect(page.getByTestId("consent")).toContainText("the wallet connector keeps its own session storage");
  await expect(page.getByTestId("consent")).not.toContainText("never joined to IPs");
  await page.getByTestId("consent-decline").click();
  await expect(page.getByTestId("consent")).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(document.getElementById("ga-src")))).toBe(false);
});

// WO-51: the banner never sits under or over the wallet selector. near-connect appends `div.hot-connector-popup` to <body>,
// shows and hides it through inline `display`, then removes it; the real selector needs the network, so this replays that
// lifecycle offline. The class name is read from the installed build so a near-connect upgrade that renames it fails here.
test("consent banner steps aside while the wallet selector or a modal is open", async ({ page }) => {
  const popupJs = readFileSync(createRequire(import.meta.url).resolve("@hot-labs/near-connect/build/popups/Popup.js"), "utf8");
  expect(popupJs, "near-connect popup root class").toContain("hot-connector-popup");
  await page.goto("/borrow");
  const banner = page.getByTestId("consent");
  await expect(banner).toBeVisible();
  await page.evaluate(() => {
    const root = document.createElement("div");
    root.className = "nfake hot-connector-popup";
    root.id = "fake-wallet-popup";
    root.style.display = "none";
    document.body.append(root);
  });
  await expect(banner, "a created but hidden popup leaves the banner alone").toBeVisible();
  await page.evaluate(() => (document.getElementById("fake-wallet-popup")!.style.display = "block"));
  await expect(banner).toBeHidden();
  await page.evaluate(() => (document.getElementById("fake-wallet-popup")!.style.display = "none"));
  await expect(banner).toBeVisible();
  await page.evaluate(() => (document.getElementById("fake-wallet-popup")!.style.display = "block"));
  await expect(banner).toBeHidden();
  await page.evaluate(() => document.getElementById("fake-wallet-popup")!.remove());
  await expect(banner).toBeVisible();
  // Our own sign modals and drawers (aria-modal) get the same treatment.
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "fake-modal";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.textContent = "Review";
    document.querySelector("main")!.append(d);
  });
  await expect(banner).toBeHidden();
  await page.evaluate(() => document.getElementById("fake-modal")!.remove());
  await expect(banner).toBeVisible();
  await page.getByTestId("consent-decline").click();
  await expect(banner).toHaveCount(0);
});

test("theme toggle switches data-theme", async ({ page }) => {
  await prime(page, "dark");
  await page.goto("/");
  await page.locator("footer").getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
