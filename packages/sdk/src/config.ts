// Typed view of packages/config/config.yaml (orchestrator-owned). Values still waiting on a gate are "TODO-G<n>".
import { parse } from "yaml";
import { DEFAULT_ORIGINATION_FEE_BPS, DEFAULT_SESSION_STALE_S, parseFeatures, type Features } from "./v7";

export type Pending = `TODO-${string}`;
export type MaybePending<T> = T | Pending;

export function isPending(v: unknown): v is Pending {
  return typeof v === "string" && v.startsWith("TODO-");
}

export interface CollateralYaml {
  symbol: string;
  token: MaybePending<string>;
  decimals: number;
  price_feed_id: MaybePending<string>;
  base_ltv_bps: number;
  max_nectar_ltv_bps: number;
  base_haircut_bps: number;
  weekend_haircut_bps: number;
  limit_premium_bps: number;
  pre_liq_min_bps: number;
  pre_liq_max_bps: number;
  /** v1 only; v2 has no owner session flag. */
  market_session_open?: boolean;
  verified_dex_depth_usd_e6: number;
  /** v1 deploy only (`set_reserve`); v2 ignores it (D-024). */
  nectar_reserve_usd_e6?: number;
  remote_chain: null | { chain_id: string; vault_program: string; mpc_domain_id: number };
}

export interface NectarConfigYaml {
  network: string;
  accounts: {
    owner: MaybePending<string>;
    core: MaybePending<string>;
    usdc_mock: MaybePending<string>;
    nvdax_mock: MaybePending<string>;
    keeper: MaybePending<string>;
    demo: { buyer1: MaybePending<string>; buyer2: MaybePending<string>; borrower1: MaybePending<string> };
  };
  collateral: Record<string, CollateralYaml>;
  quotes: { default_max_discount_bps: number; min_notice_period_s: number; notice_presets_s: number[]; min_quote_usd_e6: number };
  fee_split: { buyers_bps: number; lenders_bps: number; treasury_bps: number };
  keeper_fee_bps: number;
  oracle: { source: string; max_age_s_session: number; max_age_s_closed: number; band_bps: number; max_conf_bps: number; nvda_price_id: MaybePending<string> };
  limits: { max_quotes_per_asset: number; max_quotes_per_settlement: number; gas_reserve_target_near: number };
  v7?: { core_v2?: string; origination_fee_bps?: number; session_stale_s?: number; [k: string]: unknown };
  features?: Record<string, unknown>;
  [k: string]: unknown;
}

/** The subset the browser needs. No secrets live in config.yaml, but keep the surface small anyway. */
export interface PublicConfig {
  network: "testnet";
  core: string | null;
  usdc: string | null;
  owner: string | null;
  keeper: string | null;
  usdcDecimals: number;
  collaterals: Array<{
    key: string;
    symbol: string;
    token: string | null;
    decimals: number;
    base_ltv_bps: number;
    max_nectar_ltv_bps: number;
    base_haircut_bps: number;
    weekend_haircut_bps: number;
    limit_premium_bps: number;
    pre_liq_min_bps: number;
    pre_liq_max_bps: number;
  }>;
  quotes: NectarConfigYaml["quotes"];
  feeSplit: NectarConfigYaml["fee_split"];
  oracle: { source: string; max_age_s_session: number; max_age_s_closed: number; band_bps: number };
  limits: NectarConfigYaml["limits"];
  /** Ids still TODO, e.g. ["accounts.core"]. Non-empty means the deployment gate (G2) has not filled config yet. */
  pending: string[];
  /** `features:` (all false until each module's gate passes). A v7 control also needs a v2 contract (featureOn). */
  features: Features;
  /** v7 parameters the UI shows before the contract answers (the contract stays authoritative). */
  v7: { origination_fee_bps: number; session_stale_s: number; reservation_expiry_s: number; remote_path_prefix: string };
  /** Solana devnet vault (config `solana.vault_program` / `solana.program_id`, `solana.mint`); null while TODO-G7. */
  solana: { cluster: "devnet"; vaultProgram: string | null; mint: string | null; decimals: number };
}

/** Token account → symbol/decimals (collaterals + USDC), for decoding `ft_transfer_call` amounts in the sign modal (R2-06). */
export function tokenTable(c: { usdc: string | null; usdcDecimals: number; collaterals: ReadonlyArray<{ symbol: string; token: string | null; decimals: number }> }): Record<string, { symbol: string; decimals: number; usd?: boolean }> {
  const out: Record<string, { symbol: string; decimals: number; usd?: boolean }> = {};
  for (const col of c.collaterals) if (col.token) out[col.token] = { symbol: col.symbol, decimals: col.decimals };
  if (c.usdc) out[c.usdc] = { symbol: "USDC", decimals: c.usdcDecimals, usd: true };
  return out;
}

/** config.yaml `site:` (WO-34 hosting). Operator fields are Kunal's (TODO-H-LEGAL): null until provided, never guessed. */
export interface SiteConfig {
  operator: string | null;
  country: string | null;
  contact: string | null;
  x_handle: string | null;
  hosted_until: string | null;
}

/** Typed `site:` section; a missing section or a non-string field reads as null (old configs keep loading). */
export function siteConfig(c: NectarConfigYaml): SiteConfig {
  const s = (c.site && typeof c.site === "object" ? c.site : {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 && !isPending(v) ? v.trim() : null);
  return { operator: str(s.operator), country: str(s.country), contact: str(s.contact), x_handle: str(s.x_handle), hosted_until: str(s.hosted_until) };
}

/**
 * Production guard (WO-34a §6): what is missing before a production build may ship. Empty list = ready.
 * `env` needs SITE_URL and APP_URL; `site` needs operator, country and contact.
 */
export function productionGaps(site: SiteConfig, env: Record<string, string | undefined>): string[] {
  const gaps: string[] = [];
  for (const k of ["operator", "country", "contact"] as const) if (!site[k]) gaps.push(`config.yaml site.${k} is null (TODO-H-LEGAL)`);
  for (const k of ["SITE_URL", "APP_URL"] as const) if (!env[k]) gaps.push(`${k} is unset`);
  return gaps;
}

/** True for a production deployment: Vercel production, or NECTAR_PRODUCTION=1 anywhere else. */
export const isProductionEnv = (env: Record<string, string | undefined>): boolean => env.VERCEL_ENV === "production" || env.NECTAR_PRODUCTION === "1";

export function parseConfig(text: string): NectarConfigYaml {
  const c = parse(text) as NectarConfigYaml;
  if (!c || typeof c !== "object" || !c.accounts || !c.collateral) throw new Error("config.yaml: missing accounts/collateral");
  return c;
}

const orNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && !isPending(v) ? v : null);

export function toPublicConfig(c: NectarConfigYaml): PublicConfig {
  const pending: string[] = [];
  const check = (path: string, v: unknown) => {
    if (isPending(v)) pending.push(path);
  };
  check("accounts.core", c.accounts.core);
  check("accounts.usdc_mock", c.accounts.usdc_mock);
  check("accounts.owner", c.accounts.owner);
  return {
    network: "testnet",
    core: orNull(c.accounts.core),
    usdc: orNull(c.accounts.usdc_mock),
    owner: orNull(c.accounts.owner),
    keeper: orNull(c.accounts.keeper),
    usdcDecimals: 6,
    collaterals: Object.entries(c.collateral).map(([key, v]) => {
      check(`collateral.${key}.token`, v.token);
      return {
        key,
        symbol: v.symbol,
        token: orNull(v.token),
        decimals: v.decimals,
        base_ltv_bps: v.base_ltv_bps,
        max_nectar_ltv_bps: v.max_nectar_ltv_bps,
        base_haircut_bps: v.base_haircut_bps,
        weekend_haircut_bps: v.weekend_haircut_bps,
        limit_premium_bps: v.limit_premium_bps,
        pre_liq_min_bps: v.pre_liq_min_bps,
        pre_liq_max_bps: v.pre_liq_max_bps,
      };
    }),
    quotes: c.quotes,
    feeSplit: c.fee_split,
    oracle: { source: c.oracle.source, max_age_s_session: c.oracle.max_age_s_session, max_age_s_closed: c.oracle.max_age_s_closed, band_bps: c.oracle.band_bps },
    limits: c.limits,
    pending,
    features: parseFeatures(c.features),
    v7: {
      origination_fee_bps: typeof c.v7?.origination_fee_bps === "number" ? c.v7.origination_fee_bps : DEFAULT_ORIGINATION_FEE_BPS,
      session_stale_s: typeof c.v7?.session_stale_s === "number" ? c.v7.session_stale_s : DEFAULT_SESSION_STALE_S,
      reservation_expiry_s: typeof c.v7?.reservation_expiry_s === "number" ? c.v7.reservation_expiry_s : 1800,
      remote_path_prefix: remotePrefix(c.v7?.remote_path_prefix),
    },
    solana: solanaConfig(c.solana),
  };
}

function remotePrefix(raw: unknown): string {
  const p = raw && typeof raw === "object" ? (raw as Record<string, unknown>).solana : undefined;
  return typeof p === "string" && p ? p : "solana-devnet/pos/";
}

/** `solana:` block. `vault_program` (interface-v7 §B, deploy.md step 5) wins over the older `program_id` key. */
function solanaConfig(raw: unknown): PublicConfig["solana"] {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    cluster: "devnet",
    vaultProgram: orNull(s.vault_program) ?? orNull(s.program_id),
    mint: orNull(s.mint),
    decimals: typeof s.mint_decimals === "number" ? s.mint_decimals : 6,
  };
}
