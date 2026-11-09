// Typed view of packages/config/config.yaml (orchestrator-owned). Values still waiting on a gate are "TODO-G<n>".
import { parse } from "yaml";

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
  market_session_open: boolean;
  verified_dex_depth_usd_e6: number;
  nectar_reserve_usd_e6: number;
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
}

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
  };
}
