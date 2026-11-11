// Shields and Profit-Lock helpers (WO-23a contract, PRD §4.9, §4.10). Integers only; the contract stays authoritative.
//   weekend window_end_ns = the first calendar open strictly after now (contract math::next_window_open), ≤ 65.5 h away
//   event   window_end_ns = min(curator event_window_end_ns, now + 72 h)
//   shield fee            = ceil(borrow · fee_bps / 1e4)          (math::shield_fee)
//   profit-lock fee       = ceil(debt · 50 / 1e4), fill = debt + fee (math::profit_lock_fill)
import type { SelfSettlePreview, SessionWindow, ShieldInput, ShieldKind } from "./types";

const BPS = 10_000n;
const S = 1_000_000_000n;

/** Testnet minimum Shield borrow ($5). PROD: $50 plus a NEP-145 storage deposit (PRD §4.9). */
export const SHIELD_MIN_BORROW_USD_E6 = 5_000_000n;
export const MAX_SHIELD_OPENS_PER_DAY = 5;
export const SHIELD_WEEKEND_MAX_NS = 235_800n * S;
export const SHIELD_EVENT_MAX_NS = 259_200n * S;
export const PROFIT_LOCK_FEE_BPS = 50;
export const DEFAULT_SHIELD_FEE_BPS: Record<ShieldKind, number> = { Weekend: 15, Event: 25 };

/** Copy rule (PRD §4.9, §12.1): a Shield is never described as insurance. */
export const SHIELD_TAGLINE = "a weekend-safe limit with committed buyers behind it";
export const SHIELD_SIZING_LINE = "sized at the weekend limit even while the market is open";

export const shieldFeeUsdE6 = (borrow_usd_e6: bigint, fee_bps: number): bigint => (borrow_usd_e6 * BigInt(fee_bps) + BPS - 1n) / BPS;

export function profitLockFill(debt_usd_e6: bigint, fee_bps = PROFIT_LOCK_FEE_BPS): { fee_usd_e6: bigint; fill_usd_e6: bigint } {
  const fee = (debt_usd_e6 * BigInt(fee_bps) + BPS - 1n) / BPS;
  return { fee_usd_e6: fee, fill_usd_e6: debt_usd_e6 + fee };
}

/** The first window open strictly after `now` (mirror of contract `math::next_window_open`). */
export function nextWindowOpen(windows: SessionWindow[], now_ns: bigint): bigint | null {
  for (const w of windows) {
    const o = BigInt(w[0]);
    if (o > now_ns) return o;
  }
  return null;
}

export type ShieldWindow = { ok: true; input: ShieldInput; ends_in_s: number } | { ok: false; reason: string; ends_in_s: number | null };

/** The `shield` argument for a Weekend Shield opened now, or why the contract would refuse it. */
export function weekendShieldWindow(windows: SessionWindow[], now_ns: bigint): ShieldWindow {
  const next = nextWindowOpen(windows, now_ns);
  if (next === null) return { ok: false, reason: "No upcoming session in the contract calendar.", ends_in_s: null };
  const len = next - now_ns;
  const ends_in_s = Number(len / S);
  if (len > SHIELD_WEEKEND_MAX_NS) return { ok: false, reason: "The next session open is more than 65.5 h away.", ends_in_s };
  return { ok: true, input: { kind: "Weekend", window_end_ns: next.toString() }, ends_in_s };
}

/** The `shield` argument for an Event Shield opened now, or why the contract would refuse it. */
export function eventShieldWindow(event_window_end_ns: string | bigint | null | undefined, now_ns: bigint): ShieldWindow {
  const ev = event_window_end_ns == null ? 0n : BigInt(event_window_end_ns);
  if (ev <= now_ns) return { ok: false, reason: "No event window is set by the curator for this asset.", ends_in_s: null };
  const cap = now_ns + SHIELD_EVENT_MAX_NS;
  const end = ev < cap ? ev : cap;
  return { ok: true, input: { kind: "Event", window_end_ns: end.toString() }, ends_in_s: Number((end - now_ns) / S) };
}

export function shieldOpensLeft(opens_today: number | null | undefined): number {
  return Math.max(0, MAX_SHIELD_OPENS_PER_DAY - (opens_today ?? 0));
}

/** "2d 03h 04m 05s" / "03h 04m 05s" / "04m 05s"; never negative. */
export function formatWindowCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${p(h)}h ${p(m)}m ${p(sec)}s`;
  if (h > 0) return `${p(h)}h ${p(m)}m ${p(sec)}s`;
  return `${p(m)}m ${p(sec)}s`;
}

/** "Mon 09:30 New York" (display; the contract compares nanoseconds). */
export function formatNewYork(ns: string | bigint): string {
  const d = new Date(Number(BigInt(ns) / 1_000_000n));
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${f.format(d)} New York`;
}

/** Human text for the contract's Shield refusals (shields.rs ERR_*). */
export function shieldReasonText(reason: string | null | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case "shield below minimum":
      return "Shields start at $5 on testnet.";
    case "shield window ended":
      return "The window has already ended; reload for the next one.";
    case "no next session":
      return "No upcoming session in the contract calendar.";
    case "weekend shield must end at the next session open":
      return "The calendar changed; reload to pick up the next session open.";
    case "weekend shield above 65.5 h":
      return "The next session open is more than 65.5 h away.";
    case "no event window":
      return "No event window is set by the curator for this asset.";
    case "event shield ends after the event window":
      return "The window ends after the curator's event window.";
    case "event shield above 72 h":
      return "Event Shields last at most 72 h.";
    case "shield daily limit":
      return `You have used all ${MAX_SHIELD_OPENS_PER_DAY} Shield opens for today (UTC).`;
    default:
      return null;
  }
}

/** Human text for `preview_self_settle.reason` (shields.rs plan_self_settle). */
export function selfSettleReasonText(reason: string | null | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case "health below 1":
      return "Health is below 1: the position is at its pre-liquidation line, so committed buyers settle it instead.";
    case "ca_pending":
      return "A corporate action is pending; Profit-Lock reopens once it is applied.";
    case "no voluntary capacity":
      return "No committed buyer has opted into voluntary fills with enough capacity for this loan.";
    case "voluntary daily cap":
      return "Today's Profit-Lock cap for this asset is used up; it resets at 00:00 UTC.";
    case "collateral below Q_repaid":
      return "The collateral would not cover the debt plus fee at the buyers' discount.";
    case "oracle stale":
      return "The price is stale; Profit-Lock waits for a fresh oracle update.";
    case "paused":
      return "The protocol is paused.";
    case "position not open":
    case "remote position not open":
      return "The position is not open.";
    case "nothing to repay":
      return "There is no debt to repay.";
    default:
      return reason;
  }
}

export interface ProfitLockSummary {
  units_sold: bigint;
  units_kept: bigint;
  fee_usd_e6: bigint;
  fill_usd_e6: bigint;
  /** Fill-weighted clearing discount across legs (bps), floor; null with no legs. */
  discount_bps: number | null;
  min_disc_bps: number | null;
  max_disc_bps: number | null;
  daily_cap_left_usd_e6: bigint;
}

export function profitLockSummary(p: SelfSettlePreview): ProfitLockSummary {
  let fillSum = 0n;
  let weighted = 0n;
  let min: number | null = null;
  let max: number | null = null;
  for (const l of p.legs) {
    const f = BigInt(l.fill_usd_e6);
    fillSum += f;
    weighted += f * BigInt(l.disc_bps);
    min = min === null ? l.disc_bps : Math.min(min, l.disc_bps);
    max = max === null ? l.disc_bps : Math.max(max, l.disc_bps);
  }
  const cap = BigInt(p.daily_cap_usd_e6);
  const used = BigInt(p.daily_used_usd_e6);
  return {
    units_sold: BigInt(p.units_repaid),
    units_kept: BigInt(p.units_kept),
    fee_usd_e6: BigInt(p.fee_usd_e6),
    fill_usd_e6: BigInt(p.fill_usd_e6),
    discount_bps: fillSum > 0n ? Number(weighted / fillSum) : null,
    min_disc_bps: min,
    max_disc_bps: max,
    daily_cap_left_usd_e6: cap > used ? cap - used : 0n,
  };
}

export type ProfitLockBlock = "health" | "ca_pending" | "no_capacity" | "daily_cap" | "other";

/** Why the Profit-Lock button is disabled, or null. Local checks (health, CA) run before the contract's reason. */
export function profitLockBlock(p: SelfSettlePreview | null | undefined, opts: { triggerable?: boolean; caPending?: boolean }): { kind: ProfitLockBlock; text: string } | null {
  if (opts.triggerable) return { kind: "health", text: selfSettleReasonText("health below 1")! };
  if (opts.caPending) return { kind: "ca_pending", text: selfSettleReasonText("ca_pending")! };
  if (!p) return null;
  if (p.ok) return null;
  const r = p.reason ?? "";
  const kind: ProfitLockBlock = r === "health below 1" ? "health" : r === "ca_pending" ? "ca_pending" : r === "no voluntary capacity" ? "no_capacity" : r === "voluntary daily cap" ? "daily_cap" : "other";
  return { kind, text: selfSettleReasonText(r) ?? "Profit-Lock is not available for this position." };
}

/**
 * DI-1 "Repay $X first": the Profit-Lock fill is debt · (1 + fee). When it exceeds the asset's voluntary-fill cap left today,
 * repaying `debt − capLeft / (1 + fee)` (rounded up to the cent) brings the fill under the cap. 0 when it already fits.
 */
export function profitLockRepayFirstUsdE6(debt_usd_e6: bigint, cap_left_usd_e6: bigint, fee_bps = PROFIT_LOCK_FEE_BPS): bigint {
  const { fill_usd_e6 } = profitLockFill(debt_usd_e6, fee_bps);
  if (fill_usd_e6 <= cap_left_usd_e6) return 0n;
  const maxDebt = (cap_left_usd_e6 * BPS) / (BPS + BigInt(fee_bps));
  return ((debt_usd_e6 - maxDebt + 9_999n) / 10_000n) * 10_000n;
}
