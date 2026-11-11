import { loadConfig } from "@nectar/sdk/config-node";
import { isProductionEnv, productionGaps, siteConfig, toPublicConfig, type PublicConfig, type SiteConfig } from "@nectar/sdk";

let cached: PublicConfig | null = null;
let cachedSite: SiteConfig | null = null;

/** packages/config/config.yaml, read on the server (build or request) and passed to the client as plain data. */
export function getPublicConfig(): PublicConfig {
  if (!cached) cached = toPublicConfig(loadConfig(process.cwd()));
  return cached;
}

/** config.yaml `site:` (operator fields, TODO-H-LEGAL). Server only. */
export function getSiteConfig(): SiteConfig {
  if (!cachedSite) cachedSite = siteConfig(loadConfig(process.cwd()));
  return cachedSite;
}

/**
 * WO-34a §6: a production build (VERCEL_ENV=production or NECTAR_PRODUCTION=1) fails while an operator field is null or
 * SITE_URL / APP_URL are unset, so no page ships a blank operator. Called from the root layout at module load, which every
 * prerendered page evaluates during `next build`. No-op everywhere else (local mode, previews).
 */
export function assertProductionReady(env: Record<string, string | undefined> = process.env): void {
  if (!isProductionEnv(env)) return;
  const gaps = productionGaps(getSiteConfig(), env);
  if (gaps.length) throw new Error(`Production build refused (WO-34a guard): ${gaps.join("; ")}`);
}
