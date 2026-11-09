// Health and limit maths, integers only (bigint). Mirrors docs/work/interface-p0.md "Encoding":
//   V_usd_e6 = units * price_usd_e6 / 10^decimals            (floor: against the borrower)
//   ltv_bps  = debt * 1e4 / V                                  (ceil: against the borrower)
//   triggerable (maths part) = debt * 1e4 > V * pre_liq_ltv_bps
//   h_c = session_open ? base_haircut_bps : weekend_haircut_bps; D_c = 0 when closed
//   B_c = min(max_nectar_ltv_bps * V / 1e4, (1e4 - h_c) * (Q + R + D) / 1e4)   (each term floor)
//   static_limit = base_ltv_bps * V / 1e4                      (floor)
//   premium = max(0, borrow - static_limit) * limit_premium_bps / 1e4          (ceil)
// The keeper never acts on these numbers: it acts on the contract's `get_health.triggerable`.
// They are a cross-check (logged on mismatch) and are pinned to contracts/nectar-core/tests/model.csv.

export const BPS = 10_000n;

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

export function valueUsdE6(units: bigint, priceUsdE6: bigint, decimals: number): bigint {
  nonNegative('units', units);
  nonNegative('price', priceUsdE6);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) throw new RangeError('bad decimals');
  return (units * priceUsdE6) / 10n ** BigInt(decimals);
}

export function ltvBps(debtUsdE6: bigint, valueE6: bigint): bigint {
  nonNegative('debt', debtUsdE6);
  nonNegative('value', valueE6);
  if (valueE6 === 0n) return debtUsdE6 === 0n ? 0n : LTV_INFINITE_BPS;
  return ceilDiv(debtUsdE6 * BPS, valueE6);
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
}

export interface LimitResult {
  haircutBps: bigint;
  bcUsdE6: bigint;
  staticLimitUsdE6: bigint;
}

export function cramerLimit(i: LimitInput): LimitResult {
  for (const [k, v] of Object.entries(i)) if (typeof v === 'bigint') nonNegative(k, v);
  const haircutBps = i.sessionOpen ? i.baseHaircutBps : i.weekendHaircutBps;
  if (haircutBps > BPS) throw new RangeError('haircut > 100%');
  const d = i.sessionOpen ? i.dUsdE6 : 0n;
  const ltvCap = (i.maxNectarLtvBps * i.valueE6) / BPS;
  const exitCap = ((BPS - haircutBps) * (i.qUsdE6 + i.rUsdE6 + d)) / BPS;
  return {
    haircutBps,
    bcUsdE6: ltvCap < exitCap ? ltvCap : exitCap,
    staticLimitUsdE6: (i.baseLtvBps * i.valueE6) / BPS,
  };
}

export function limitPremiumUsdE6(borrowUsdE6: bigint, staticLimitUsdE6: bigint, limitPremiumBps: bigint): bigint {
  nonNegative('borrow', borrowUsdE6);
  nonNegative('static_limit', staticLimitUsdE6);
  nonNegative('limit_premium_bps', limitPremiumBps);
  const above = borrowUsdE6 > staticLimitUsdE6 ? borrowUsdE6 - staticLimitUsdE6 : 0n;
  return ceilDiv(above * limitPremiumBps, BPS);
}
