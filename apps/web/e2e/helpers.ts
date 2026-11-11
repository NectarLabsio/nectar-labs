import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { Page } from "@playwright/test";

export const ROUTES = ["/", "/feed", "/feed/NVDAx", "/borrow", "/shield", "/quote", "/quote/new", "/quote/0", "/reserve", "/notes", "/position/0", "/console", "/agents", "/keepers", "/talk", "/security", "/legal/privacy", "/legal/terms", "/docs"] as const;

interface Cfg { accounts: { core: string; usdc_mock: string; demo: { borrower1: string } }; collateral: Record<string, { token: string }> }
export const config = parse(readFileSync(resolve(import.meta.dirname, "../../../packages/config/config.yaml"), "utf8")) as Cfg;
export const pending = (v: string | undefined) => !v || v.startsWith("TODO-");
export const TESTNET_PENDING = pending(config.accounts.core) || pending(config.accounts.usdc_mock);
export const PENDING_MSG = "nectar-core ids are TODO-G2 in packages/config/config.yaml; testnet specs run after the deployment gate (G2).";

/** Every `features.*` flag (packages/sdk FEATURE_NAMES). Specs pin flag state with `pinFlags`, never read it from config.yaml. */
export const ALL_FEATURES = ["weekend_guard", "multiplier", "pay_to", "referrals", "shields", "profit_lock", "notes", "reserve", "agent_skill", "x402", "solana_remote", "base"] as const;
export type Flag = (typeof ALL_FEATURES)[number];

/**
 * Pin the flag state for this page via the localhost-only `window.__NECTAR_E2E_MOCK__` (lib/e2e-mock.ts): exactly `on` are true,
 * every other flag is false, whatever config.yaml says. Merges with any mock fields an earlier init script set (wallet, vault ids).
 */
export async function pinFlags(page: Page, on: readonly Flag[]) {
  await page.addInitScript((features) => {
    const w = window as unknown as { __NECTAR_E2E_MOCK__?: Record<string, unknown> };
    w.__NECTAR_E2E_MOCK__ = { ...(w.__NECTAR_E2E_MOCK__ ?? {}), features };
  }, [...on]);
}

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
