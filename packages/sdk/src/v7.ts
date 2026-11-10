// v7 helpers shared by web, services and tests (interface-v7.md §A). Integers only.
//   session (v2)  = contract `session_open` + `session_reason`
//   session (v1)  = owner flag `market_session_open` (→ get_exit_capacity.session_open) ∧ oracle age ≤ session_stale_s (WO-20)
//   origination   = ceil(borrow · origination_fee_bps / 1e4); half to a registered referrer (interface-v7 §A5)
//   net proceeds  = borrow − limit premium − origination fee
//   V (Underlying) = units · M / 1e18 · price / 10^decimals; M ignored for TokenIncludesMultiplier (§A3)
import type { BorrowPreview, ContractGeneration, ExitCapacity, PriceKind, SessionReason, SessionWindow } from "./types";
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

/** "1.02" → 1.02e18 (at most 18 decimals, exact; never rounded). Throws on anything else. */
export function parseMultiplierE18(s: string): bigint {
  const m = /^(0|[1-9]\d{0,20})(?:\.(\d{1,18}))?$/.exec(s.trim());
  if (!m) throw new Error(`multiplier must be a decimal number with at most 18 decimals, got ${JSON.stringify(s)}`);
  return BigInt(m[1] ?? "0") * E18 + BigInt((m[2] ?? "").padEnd(18, "0"));
}

/** `set_multiplier` cap (§A3): new · 1e4 ≤ old · 10500, i.e. new ≤ floor(old · 10500 / 1e4) (contract math::within_increase_bound). */
export const MULTIPLIER_STEP_MAX_BPS = 500;
export function maxSetMultiplierE18(old_e18: bigint): bigint {
  return (old_e18 * (BPS + BigInt(MULTIPLIER_STEP_MAX_BPS))) / BPS;
}

/** Why `set_multiplier(new)` would be refused, or null. Mirrors the contract's checks (§A3). */
export function setMultiplierRefusal(old_e18: bigint, new_e18: bigint, caPending: boolean): string | null {
  if (caPending) return "A corporate action is pending; apply it first.";
  if (new_e18 < old_e18) return "A decrease goes through announce_corporate_action.";
  if (new_e18 > maxSetMultiplierE18(old_e18)) return `At most +5% per call (≤ ${formatMultiplierE18(maxSetMultiplierE18(old_e18))}); larger changes go through a corporate action.`;
  return null;
}

/** `announce_corporate_action` needs effective_ns ≥ now + 3600 s (§A3). */
export const CA_MIN_NOTICE_S = 3600;
export function announceRefusal(new_e18: bigint, effective_ns: bigint, now_ns: bigint): string | null {
  if (new_e18 <= 0n) return "Multiplier must be > 0.";
  if (effective_ns < now_ns + BigInt(CA_MIN_NOTICE_S) * 1_000_000_000n) return "Effective time must be at least 1 h from now.";
  return null;
}

/** `apply_corporate_action` (anyone) works once now ≥ ca_effective_ns while ca_pending. */
export function canApplyCorporateAction(caPending: boolean | undefined, ca_effective_ns: string | undefined, now_ns: bigint): boolean {
  return caPending === true && ca_effective_ns != null && now_ns >= BigInt(ca_effective_ns);
}

// ---------------------------------------------------------------- session calendar (§A2)

export interface CalendarStatus {
  windows: number;
  /** The window containing `now`, if any. */
  current: SessionWindow | null;
  /** The first window opening after `now`, if any. */
  next: SessionWindow | null;
  first: SessionWindow | null;
  last: SessionWindow | null;
  /** True when the last window has closed (the calendar needs a refill). */
  exhausted: boolean;
}

/** Where `now` sits in a sorted `[open, close)` calendar. The contract decides the session; this is display only. */
export function calendarStatus(windows: SessionWindow[], now_ns: bigint): CalendarStatus {
  let current: SessionWindow | null = null;
  let next: SessionWindow | null = null;
  for (const w of windows) {
    const o = BigInt(w[0]);
    const c = BigInt(w[1]);
    if (o <= now_ns && now_ns < c) current = w;
    if (o > now_ns) {
      next = w;
      break;
    }
  }
  const last = windows.length ? windows[windows.length - 1]! : null;
  return { windows: windows.length, current, next, first: windows[0] ?? null, last, exhausted: last !== null && BigInt(last[1]) <= now_ns };
}

/** U64 ns → ISO UTC minute ("2026-11-10 14:30 UTC"). */
export function nsToUtc(ns: string | bigint): string {
  const ms = Number(BigInt(ns) / 1_000_000n);
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export const nowNs = (): bigint => BigInt(Date.now()) * 1_000_000n;

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
