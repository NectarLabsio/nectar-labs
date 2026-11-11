// Integer limit and health maths mirroring docs/work/interface-p0.md "Encoding".
// Used for instant UI previews and stress scenarios; the contract's `preview_borrow` / `get_health` are authoritative,
// and `contracts/nectar-core/tests/model.csv` is the shared test vector (see test/math.test.ts).
//   V_usd_e6 = units * price_usd_e6 / 10^decimals            (floor: value rounds against the borrower)
//   h_c = base_haircut_bps if session open else weekend_haircut_bps; D_c = 0 when closed
//   B_c = min(max_nectar_ltv_bps*V/1e4, (1e4 - h_c)*(Q_c+R_c+D_c)/1e4)   (floor)
//   static = base_ltv_bps*V/1e4 (floor)
//   premium = max(0, borrow - static) * limit_premium_bps / 1e4      (ceil: rounds against the borrower)

const BPS = 10_000n;

export interface LimitInputs {
  units: bigint;
  price_usd_e6: bigint;
  decimals: number;
  base_ltv_bps: number;
  max_nectar_ltv_bps: number;
  base_haircut_bps: number;
  weekend_haircut_bps: number;
  limit_premium_bps: number;
  session_open: boolean;
  q_usd_e6: bigint;
  r_usd_e6: bigint;
  d_usd_e6: bigint;
}

export interface LimitResult {
  value_usd_e6: bigint;
  haircut_bps: number;
  d_effective_usd_e6: bigint;
  ltv_cap_usd_e6: bigint;
  capacity_cap_usd_e6: bigint;
  b_c_usd_e6: bigint;
  static_limit_usd_e6: bigint;
  /** Which term binds B_c. */
  binding: "ltv" | "capacity";
}

export const pow10 = (d: number): bigint => 10n ** BigInt(d);
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

export function valueUsdE6(units: bigint, price_usd_e6: bigint, decimals: number): bigint {
  return (units * price_usd_e6) / pow10(decimals);
}

export function computeLimit(i: LimitInputs): LimitResult {
  const value = valueUsdE6(i.units, i.price_usd_e6, i.decimals);
  const h = i.session_open ? i.base_haircut_bps : i.weekend_haircut_bps;
  const d = i.session_open ? i.d_usd_e6 : 0n;
  const ltvCap = (BigInt(i.max_nectar_ltv_bps) * value) / BPS;
  const capCap = ((BPS - BigInt(h)) * (i.q_usd_e6 + i.r_usd_e6 + d)) / BPS;
  const bc = min(ltvCap, capCap);
  return {
    value_usd_e6: value,
    haircut_bps: h,
    d_effective_usd_e6: d,
    ltv_cap_usd_e6: ltvCap,
    capacity_cap_usd_e6: capCap,
    b_c_usd_e6: bc,
    static_limit_usd_e6: (BigInt(i.base_ltv_bps) * value) / BPS,
    binding: ltvCap <= capCap ? "ltv" : "capacity",
  };
}

export function premiumUsdE6(borrow_usd_e6: bigint, static_limit_usd_e6: bigint, limit_premium_bps: number): bigint {
  const above = borrow_usd_e6 > static_limit_usd_e6 ? borrow_usd_e6 - static_limit_usd_e6 : 0n;
  return ceilDiv(above * BigInt(limit_premium_bps), BPS);
}

/** Effective limit as bps of collateral value (0 when value is 0). */
export function limitBps(b_c_usd_e6: bigint, value_usd_e6: bigint): number {
  if (value_usd_e6 === 0n) return 0;
  return Number((b_c_usd_e6 * BPS) / value_usd_e6);
}

export interface HealthResult {
  value_usd_e6: bigint;
  ltv_bps: number;
  /** pre_liq_ltv / ltv, as a ratio x 1e4 (>= 1e4 healthy). Infinity-like when debt is 0. */
  health_e4: number;
  triggerable: boolean;
}

/** Position health at a given price. `triggerable` iff debt*1e4 > V*pre_liq_ltv_bps (interface-p0 trigger rule). */
export function health(units: bigint, price_usd_e6: bigint, decimals: number, debt_usd_e6: bigint, pre_liq_ltv_bps: number): HealthResult {
  const v = valueUsdE6(units, price_usd_e6, decimals);
  const ltv = v === 0n ? (debt_usd_e6 > 0n ? 1_000_000 : 0) : Number(ceilDiv(debt_usd_e6 * BPS, v));
  const health_e4 = debt_usd_e6 === 0n ? Number.MAX_SAFE_INTEGER : Number((BigInt(pre_liq_ltv_bps) * v * BPS) / (debt_usd_e6 * BPS));
  return { value_usd_e6: v, ltv_bps: ltv, health_e4, triggerable: debt_usd_e6 * BPS > v * BigInt(pre_liq_ltv_bps) };
}

/** Price after a shock in bps (e.g. -500 for -5 %). */
export function shockPrice(price_usd_e6: bigint, shock_bps: number): bigint {
  return (price_usd_e6 * (BPS + BigInt(shock_bps))) / BPS;
}

/** Oracle freshness rule from interface-p0.md. Ages in seconds. */
export function oracleFresh(age_s: number, session_open: boolean, max_age_s_session: number, max_age_s_closed: number): boolean {
  return age_s <= (session_open ? max_age_s_session : max_age_s_closed);
}

// ---- UI helpers for the v2 app (WO-33b). Inputs are view values; nothing here replaces a contract check.

/** Exit capacity (1 − h)(Q + R + D), USD e6. Pass D = 0 for weekend parameters. */
export function capacityUsdE6(q: bigint, r: bigint, d: bigint, haircut_bps: number): bigint {
  return ((BPS - BigInt(haircut_bps)) * (q + r + d)) / BPS;
}

/** Health factor pre_liq_ltv / ltv as a float for display (Infinity with no debt). */
export function healthFactor(ltv_bps: number, pre_liq_ltv_bps: number): number {
  if (ltv_bps <= 0) return Number.POSITIVE_INFINITY;
  return pre_liq_ltv_bps / ltv_bps;
}

/** Price at which the position reaches its flag line (health 1), scaled from the current price: p · ltv / pre_liq. */
export function flagPriceUsdE6(price_usd_e6: bigint, ltv_bps: number, pre_liq_ltv_bps: number): bigint {
  if (pre_liq_ltv_bps <= 0) return 0n;
  return (price_usd_e6 * BigInt(ltv_bps)) / BigInt(pre_liq_ltv_bps);
}

/** Debt repayment that brings health to `target_e4` (1e4 = health 1.00) at value V; 0 when already there. Rounded up to the cent. */
export function repayToHealthUsdE6(debt_usd_e6: bigint, value_usd_e6: bigint, pre_liq_ltv_bps: number, target_e4 = 10_000): bigint {
  const maxDebt = (value_usd_e6 * BigInt(pre_liq_ltv_bps)) / BigInt(target_e4);
  if (debt_usd_e6 <= maxDebt) return 0n;
  return ceilDiv(debt_usd_e6 - maxDebt, 10_000n) * 10_000n;
}

/** Health (e4, 1e4 = 1.00) after the debt and/or value change. */
export function healthAfterE4(debt_usd_e6: bigint, value_usd_e6: bigint, pre_liq_ltv_bps: number): number {
  if (debt_usd_e6 <= 0n) return Number.MAX_SAFE_INTEGER;
  return Number((value_usd_e6 * BigInt(pre_liq_ltv_bps)) / debt_usd_e6);
}
