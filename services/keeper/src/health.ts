// Health and limit maths, integers only (bigint). Mirrors contracts/nectar-core/tests/model.py (v2 = 2.0.0-v7,
// docs/work/interface-v7.md A1/A2/A3); with M = 1e18 and total_debt = 0 it is the v1 maths (interface-p0.md):
//   V_usd_e6 = floor(floor(units * M / 1e18) * price_usd_e6 / 10^decimals)   (M = 1e18 for TokenIncludesMultiplier)
//   ltv_bps  = ceil(debt * 1e4 / V), capped at u32::MAX       (against the borrower)
//   triggerable (maths part) = debt * 1e4 > V * pre_liq_ltv_bps
//   h_c = session_open ? base_haircut_bps : weekend_haircut_bps; D_c = 0 when closed
//   capacity = floor((1e4 - h_c) * (Q + R + D) / 1e4); headroom = max(0, capacity - total_debt)   (A1)
//   B_c = min(floor(max_nectar_ltv_bps * V / 1e4), headroom)
//   static_limit = base_ltv_bps * V / 1e4                      (floor)
//   premium = max(0, borrow - static_limit) * limit_premium_bps / 1e4          (ceil)
//   origination = ceil(borrow * origination_fee_bps / 1e4); net = max(0, borrow - premium - origination)   (A5)
// Naming (C-107/C-108): R = Nectar Reserve (`nectar_reserve_usd_e6`), D = verified DEX depth (`verified_dex_depth_usd_e6`).
// The keeper never acts on these numbers: it acts on the contract's `get_health.triggerable`.
// They are a cross-check (logged on mismatch) and are pinned to contracts/nectar-core/tests/model.csv.

export const BPS = 10_000n;
export const E18 = 10n ** 18n;

/** Returned by `ltvBps` when V == 0 and debt > 0 (u32::MAX). The contract's choice wins at G1. */
export const LTV_INFINITE_BPS = 4_294_967_295n;

function nonNegative(name: string, v: bigint): void {
  if (v < 0n) throw new RangeError(`${name} must be >= 0, got ${v}`);
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError('divisor must be > 0');
  nonNegative('dividend', a);
  return (a + b - 1n) / b;
}

export type PriceKind = 'Underlying' | 'TokenIncludesMultiplier';

/** The multiplier that enters V: M for Underlying, 1e18 for TokenIncludesMultiplier (A3). */
export function effectiveMultiplierE18(priceKind: PriceKind, multiplierE18: bigint): bigint {
  return priceKind === 'TokenIncludesMultiplier' ? E18 : multiplierE18;
}

/** V = floor(floor(units * M / 1e18) * price / 10^decimals). Pass the effective M (see effectiveMultiplierE18). */
export function valueUsdE6(units: bigint, priceUsdE6: bigint, decimals: number, multiplierE18: bigint = E18): bigint {
  nonNegative('units', units);
  nonNegative('price', priceUsdE6);
  nonNegative('multiplier', multiplierE18);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) throw new RangeError('bad decimals');
  return (((units * multiplierE18) / E18) * priceUsdE6) / 10n ** BigInt(decimals);
}

export function ltvBps(debtUsdE6: bigint, valueE6: bigint): bigint {
  nonNegative('debt', debtUsdE6);
  nonNegative('value', valueE6);
  if (valueE6 === 0n) return debtUsdE6 === 0n ? 0n : LTV_INFINITE_BPS;
  const l = ceilDiv(debtUsdE6 * BPS, valueE6);
  return l > LTV_INFINITE_BPS ? LTV_INFINITE_BPS : l;
}

export function isPreLiqBreached(debtUsdE6: bigint, valueE6: bigint, preLiqLtvBps: bigint): boolean {
  nonNegative('debt', debtUsdE6);
  nonNegative('value', valueE6);
  nonNegative('pre_liq_ltv_bps', preLiqLtvBps);
  return debtUsdE6 * BPS > valueE6 * preLiqLtvBps;
}

export interface LimitInput {
  valueE6: bigint;
  sessionOpen: boolean;
  qUsdE6: bigint;
  rUsdE6: bigint;
  dUsdE6: bigint;
  baseHaircutBps: bigint;
  weekendHaircutBps: bigint;
  maxNectarLtvBps: bigint;
  baseLtvBps: bigint;
  /** v2 A1: aggregate debt against this collateral (0 on v1, which has no such field). */
  totalDebtUsdE6?: bigint;
}

export interface LimitResult {
  haircutBps: bigint;
  /** (1e4 - h)(Q + R + D)/1e4 with D = 0 when closed (= v2 `aggregate_capacity_usd_e6`). */
  capacityUsdE6: bigint;
  /** max(0, capacity - total_debt). */
  aggregateHeadroomUsdE6: bigint;
  ltvCapUsdE6: bigint;
  bcUsdE6: bigint;
  staticLimitUsdE6: bigint;
}

export function cramerLimit(i: LimitInput): LimitResult {
  for (const [k, v] of Object.entries(i)) if (typeof v === 'bigint') nonNegative(k, v);
  const haircutBps = i.sessionOpen ? i.baseHaircutBps : i.weekendHaircutBps;
  if (haircutBps > BPS) throw new RangeError('haircut > 100%');
  const d = i.sessionOpen ? i.dUsdE6 : 0n;
  const totalDebt = i.totalDebtUsdE6 ?? 0n;
  const ltvCap = (i.maxNectarLtvBps * i.valueE6) / BPS;
  const capacity = ((BPS - haircutBps) * (i.qUsdE6 + i.rUsdE6 + d)) / BPS;
  const headroom = capacity > totalDebt ? capacity - totalDebt : 0n;
  return {
    haircutBps,
    capacityUsdE6: capacity,
    aggregateHeadroomUsdE6: headroom,
    ltvCapUsdE6: ltvCap,
    bcUsdE6: ltvCap < headroom ? ltvCap : headroom,
    staticLimitUsdE6: (i.baseLtvBps * i.valueE6) / BPS,
  };
}

/** Both limits of A1 plus the pre-liq guard: 0 < borrow <= LTV cap, total_debt + borrow <= capacity, borrow*1e4 <= V*pre_liq. */
export function borrowOk(borrowUsdE6: bigint, lim: LimitResult, totalDebtUsdE6: bigint, valueE6: bigint, preLiqLtvBps: bigint): boolean {
  nonNegative('borrow', borrowUsdE6);
  nonNegative('total_debt', totalDebtUsdE6);
  return (
    borrowUsdE6 > 0n &&
    borrowUsdE6 <= lim.ltvCapUsdE6 &&
    totalDebtUsdE6 + borrowUsdE6 <= lim.capacityUsdE6 &&
    borrowUsdE6 * BPS <= valueE6 * preLiqLtvBps
  );
}

export function originationFeeUsdE6(borrowUsdE6: bigint, originationFeeBps: bigint): bigint {
  nonNegative('borrow', borrowUsdE6);
  nonNegative('origination_fee_bps', originationFeeBps);
  return ceilDiv(borrowUsdE6 * originationFeeBps, BPS);
}

export function netProceedsUsdE6(borrowUsdE6: bigint, premiumUsdE6: bigint, originationUsdE6: bigint): bigint {
  const n = borrowUsdE6 - premiumUsdE6 - originationUsdE6;
  return n > 0n ? n : 0n;
}

/** The collateral state the keeper needs for the limit maths, read from v1 or v2 views. */
export interface CollateralState {
  multiplierE18: bigint;
  priceKind: PriceKind;
  totalDebtUsdE6: bigint;
  sessionOpen: boolean;
}

function bigOr(v: unknown, dflt: bigint): bigint {
  if (typeof v === 'string' && /^[0-9]+$/.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  return dflt;
}

/**
 * Normalises a `get_exit_capacity` / collateral view from v1 or v2. v1 has no multiplier, price kind or aggregate
 * debt (⇒ M = 1e18, Underlying, total_debt = 0) and carries the session as `session_open` (exit capacity) or the
 * owner flag `market_session_open` (collateral config). A missing session fails closed.
 */
export function collateralStateFromView(view: unknown): CollateralState {
  const v = typeof view === 'object' && view !== null ? (view as Record<string, unknown>) : {};
  const session = typeof v.session_open === 'boolean' ? v.session_open : typeof v.market_session_open === 'boolean' ? v.market_session_open : false;
  return {
    multiplierE18: bigOr(v.multiplier_e18, E18),
    priceKind: v.price_kind === 'TokenIncludesMultiplier' ? 'TokenIncludesMultiplier' : 'Underlying',
    totalDebtUsdE6: bigOr(v.total_debt_usd_e6, 0n),
    sessionOpen: session,
  };
}

export function limitPremiumUsdE6(borrowUsdE6: bigint, staticLimitUsdE6: bigint, limitPremiumBps: bigint): bigint {
  nonNegative('borrow', borrowUsdE6);
  nonNegative('static_limit', staticLimitUsdE6);
  nonNegative('limit_premium_bps', limitPremiumBps);
  const above = borrowUsdE6 > staticLimitUsdE6 ? borrowUsdE6 - staticLimitUsdE6 : 0n;
  return ceilDiv(above * limitPremiumBps, BPS);
}
