import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { Page } from "@playwright/test";

export const ROUTES = ["/", "/feed", "/borrow", "/quote/new", "/quote/0", "/position/0", "/console", "/agents", "/keepers", "/talk", "/security", "/legal/privacy", "/legal/terms", "/docs"] as const;

interface Cfg { accounts: { core: string; usdc_mock: string; demo: { borrower1: string } }; collateral: Record<string, { token: string }> }
export const config = parse(readFileSync(resolve(import.meta.dirname, "../../../packages/config/config.yaml"), "utf8")) as Cfg;
export const pending = (v: string | undefined) => !v || v.startsWith("TODO-");
export const TESTNET_PENDING = pending(config.accounts.core) || pending(config.accounts.usdc_mock);
export const PENDING_MSG = "nectar-core ids are TODO-G2 in packages/config/config.yaml; testnet specs run after the deployment gate (G2).";

/** Decline consent and pin a theme before the page script runs. */
export async function prime(page: Page, theme: "dark" | "light") {
  await page.addInitScript((t) => {
    localStorage.setItem("nectar-consent", JSON.stringify({ v: 1, analytics: false, at: Date.now() }));
    localStorage.setItem("nectar-theme", t);
  }, theme);
}

export async function noHorizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
