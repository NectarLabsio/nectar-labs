// v7 helpers shared by web, services and tests (interface-v7.md §A). Integers only.
//   session (v2)  = contract `session_open` + `session_reason`
//   session (v1)  = owner flag `market_session_open` (→ get_exit_capacity.session_open) ∧ oracle age ≤ session_stale_s (WO-20)
//   origination   = ceil(borrow · origination_fee_bps / 1e4); half to a registered referrer (interface-v7 §A5)
//   net proceeds  = borrow − limit premium − origination fee
//   V (Underlying) = units · M / 1e18 · price / 10^decimals; M ignored for TokenIncludesMultiplier (§A3)
import type { BorrowPreview, ContractGeneration, ExitCapacity, PriceKind, SessionReason } from "./types";
import { pow10 } from "./math";

const BPS = 10_000n;
export const E18 = 10n ** 18n;
export const DEFAULT_SESSION_STALE_S = 900;
export const DEFAULT_ORIGINATION_FEE_BPS = 30;

// ---------------------------------------------------------------- feature flags (packages/config/config.yaml `features:`)

export const FEATURE_NAMES = [
  "weekend_guard",
  "multiplier",
  "pay_to",
  "referrals",
  "shields",
  "profit_lock",
  "notes",
  "reserve",
  "agent_skill",
  "x402",
  "solana_remote",
  "base",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export type Features = Record<FeatureName, boolean>;

/** Missing or non-boolean entries are off. */
export function parseFeatures(raw: unknown): Features {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(FEATURE_NAMES.map((n) => [n, src[n] === true])) as Features;
}

/** A v7 control renders only when the connected contract is v2 **and** its flag is on (WO-20). */
export function featureOn(features: Features, generation: ContractGeneration | null, name: FeatureName): boolean {
  return generation === "v2" && features[name] === true;
}

// ---------------------------------------------------------------- session badge

export interface SessionStatus {
  open: boolean;
  reason: SessionReason;
  /** "contract": v2 `session_reason`; "derived-v1": owner flag + oracle age. */
  source: "contract" | "derived-v1";
}

export function sessionStatus(cap: Pick<ExitCapacity, "session_open" | "oracle_age_s" | "session_reason">, staleS = DEFAULT_SESSION_STALE_S): SessionStatus {
  if (cap.session_reason) return { open: cap.session_open && cap.session_reason === "open", reason: cap.session_reason, source: "contract" };
  if (!cap.session_open) return { open: false, reason: "no_calendar", source: "derived-v1" };
  if (Number(cap.oracle_age_s) > staleS) return { open: false, reason: "stale_price", source: "derived-v1" };
  return { open: true, reason: "open", source: "derived-v1" };
}

export function sessionHeadline(s: SessionStatus): "In session" | "Weekend parameters" {
  return s.open ? "In session" : "Weekend parameters";
}

/** The reason in words. v1 has no calendar: a closed v1 session is the owner flag. */
export function sessionReasonText(s: SessionStatus): string {
  if (s.source === "derived-v1") {
    if (s.reason === "open") return "owner session flag open, price fresh (v1)";
    if (s.reason === "stale_price") return "stale price (> 15 min)";
    return "no calendar on v1 · owner session flag closed";
  }
  switch (s.reason) {
    case "open":
      return "calendar window open, price fresh";
    case "no_calendar":
      return "no calendar loaded";
    case "outside_hours":
      return "calendar · outside NYSE hours";
    case "stale_price":
      return "stale price (> 15 min)";
    case "forced_closed":
      return "forced closed";
  }
}

// ---------------------------------------------------------------- multiplier

export function multiplierIsOne(m_e18: string | bigint | null | undefined): boolean {
  return m_e18 == null || BigInt(m_e18) === E18;
}

/** 1.02e18 → "1.02" (up to 6 decimals, trailing zeros trimmed). */
export function formatMultiplierE18(m_e18: string | bigint): string {
  const m = BigInt(m_e18);
  const whole = m / E18;
  const frac = ((m % E18) / 10n ** 12n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function multiplierLine(symbol: string, m_e18: string | bigint): string {
  return `1 ${symbol} = ${formatMultiplierE18(m_e18)} shares after corporate actions`;
}

/** Collateral value with the §A3 multiplier (floor). */
export function valueUsdE6WithMultiplier(units: bigint, price_usd_e6: bigint, decimals: number, multiplier_e18: bigint, kind: PriceKind = "Underlying"): bigint {
  const m = kind === "TokenIncludesMultiplier" ? E18 : multiplier_e18;
  return (units * m * price_usd_e6) / (E18 * pow10(decimals));
}

// ---------------------------------------------------------------- aggregate capacity (§A1)

/** (1 − h)(Q + R + D) and the headroom left after total debt. Uses the contract's fields when present. */
export function aggregateCapacity(cap: ExitCapacity): { capacity_usd_e6: bigint; total_debt_usd_e6: bigint | null; headroom_usd_e6: bigint | null } {
  const d = cap.session_open ? BigInt(cap.d_usd_e6) : 0n;
  const computed = ((BPS - BigInt(cap.haircut_bps)) * (BigInt(cap.q_usd_e6) + BigInt(cap.r_usd_e6) + d)) / BPS;
  const capacity = cap.aggregate_capacity_usd_e6 != null ? BigInt(cap.aggregate_capacity_usd_e6) : cap.capacity_usd_e6 != null ? BigInt(cap.capacity_usd_e6) : computed;
  const debt = cap.total_debt_usd_e6 != null ? BigInt(cap.total_debt_usd_e6) : null;
  const headroom = cap.aggregate_headroom_usd_e6 != null ? BigInt(cap.aggregate_headroom_usd_e6) : debt != null ? (capacity > debt ? capacity - debt : 0n) : null;
  return { capacity_usd_e6: capacity, total_debt_usd_e6: debt, headroom_usd_e6: headroom };
}

// ---------------------------------------------------------------- fee stack (§A5, PRD §4.11)

export interface FeeStack {
  premium_usd_e6: bigint;
  origination_usd_e6: bigint;
  /** Part of the origination fee, not on top of it. */
  referrer_share_usd_e6: bigint;
  total_usd_e6: bigint;
  net_usd_e6: bigint;
  origination_bps: number;
  /** "contract": every figure from v2 preview_borrow; "local": v1 preview + local origination maths. */
  source: "contract" | "local";
}

export const originationFeeUsdE6 = (borrow_usd_e6: bigint, bps: number): bigint => (borrow_usd_e6 * BigInt(bps) + BPS - 1n) / BPS;

export function feeStack(
  borrow_usd_e6: bigint,
  preview: BorrowPreview,
  opts: { generation: ContractGeneration | null; originationFeeBps?: number; referrer?: string | null },
): FeeStack {
  const premium = BigInt(preview.premium_usd_e6);
  const bps = opts.generation === "v2" ? (opts.originationFeeBps ?? DEFAULT_ORIGINATION_FEE_BPS) : 0;
  if (preview.origination_fee_usd_e6 != null && preview.total_fees_usd_e6 != null && preview.net_proceeds_usd_e6 != null) {
    return {
      premium_usd_e6: premium,
      origination_usd_e6: BigInt(preview.origination_fee_usd_e6),
      referrer_share_usd_e6: BigInt(preview.referrer_share_usd_e6 ?? "0"),
      total_usd_e6: BigInt(preview.total_fees_usd_e6),
      net_usd_e6: BigInt(preview.net_proceeds_usd_e6),
      origination_bps: bps,
      source: "contract",
    };
  }
  const orig = bps > 0 ? originationFeeUsdE6(borrow_usd_e6, bps) : 0n;
  const ref = opts.referrer && orig > 0n ? orig / 2n : 0n;
  const total = premium + orig;
  return { premium_usd_e6: premium, origination_usd_e6: orig, referrer_share_usd_e6: ref, total_usd_e6: total, net_usd_e6: borrow_usd_e6 > total ? borrow_usd_e6 - total : 0n, origination_bps: bps, source: "local" };
}

/** Human text for the v2 preview_borrow `reason` codes (v1 reasons pass through). */
export function borrowReasonText(reason: string | null | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case "aggregate_limit":
      return "The asset's total debt would exceed (1 − h)(Q + R + D): no headroom left for this amount.";
    case "ca_pending":
      return "A corporate action is pending; new borrows are refused until it is applied. Repay still works.";
    case "referrer_is_borrower":
      return "The referrer cannot be the borrower.";
    default:
      return reason;
  }
}
