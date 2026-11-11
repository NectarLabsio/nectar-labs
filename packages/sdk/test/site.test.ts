import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isProductionEnv, parseConfig, productionGaps, siteConfig } from "../src/config";

const repoYaml = readFileSync(join(__dirname, "..", "..", "config", "config.yaml"), "utf8");

describe("site config (WO-34a)", () => {
  it("reads the repo site section; operator fields stay null until TODO-H-LEGAL", () => {
    const s = siteConfig(parseConfig(repoYaml));
    expect(s.hosted_until).toBe("2026-11-25");
    expect(typeof s.operator === "string" || s.operator === null).toBe(true);
  });

  it("a config without site: loads with every field null", () => {
    const c = parseConfig("accounts: {}\ncollateral: {}\n");
    expect(siteConfig(c)).toEqual({ operator: null, country: null, contact: null, x_handle: null, hosted_until: null });
  });

  it("production guard lists every gap and passes when complete", () => {
    const empty = siteConfig(parseConfig("accounts: {}\ncollateral: {}\nsite: { operator: null, country: '', contact: null }\n"));
    expect(productionGaps(empty, {})).toHaveLength(5);
    const full = siteConfig(parseConfig("accounts: {}\ncollateral: {}\nsite: { operator: Op, country: XX, contact: a@b.c }\n"));
    expect(productionGaps(full, { SITE_URL: "https://s.example", APP_URL: "https://a.example" })).toEqual([]);
    expect(productionGaps(full, { SITE_URL: "https://s.example" })).toEqual(["APP_URL is unset"]);
  });

  it("production is Vercel production or NECTAR_PRODUCTION=1", () => {
    expect(isProductionEnv({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionEnv({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionEnv({ NECTAR_PRODUCTION: "1" })).toBe(true);
    expect(isProductionEnv({})).toBe(false);
  });
});
