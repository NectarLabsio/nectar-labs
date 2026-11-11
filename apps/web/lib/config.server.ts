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

/**
 * WO-34b §7: content guard for the operator-facing pages (about, legal/*, security, talk). In a production build any page text
 * that still holds a `TODO-H` marker, or any null operator field, stops the build. Local mode and previews: no-op, the pages
 * show their "not configured in this build" text instead.
 */
export function guardContent(page: string, text: string, env: Record<string, string | undefined> = process.env): void {
  if (!isProductionEnv(env)) return;
  const site = getSiteConfig();
  const nulls = (["operator", "country", "contact"] as const).filter((k) => !site[k]);
  const problems = [...(text.includes("TODO-H") ? ["contains a TODO-H marker"] : []), ...nulls.map((k) => `site.${k} is null`)];
  if (problems.length) throw new Error(`Production build refused (WO-34b content guard) on ${page}: ${problems.join("; ")}`);
}

/** Server-only env flag (H-KEYS): true once the keeper runs on hosting instead of the operator's machine. Default false. */
export const keeperHosted = (env: Record<string, string | undefined> = process.env): boolean => /^(1|true|yes)$/i.test(env.KEEPER_HOSTED ?? "");
