// Earn, Portfolio and Curator helpers for the v2 app (WO-33c). Integers only. Inputs are view values; nothing here replaces a contract check.
import { formatUnits, formatUsdE6 } from "./format";
import { healthFactor, pow10, premiumUsdE6 } from "./math";
import type { ReserveNoteView } from "./notes";
import type { Bps, CollateralUpsertInput, CollateralView, HealthView, PositionView, QuoteView, U64 } from "./types";

const BPS = 10_000n;

// ---------------------------------------------------------------- Earn

export const QUOTE_CEILING_STEP_BPS = 25;
export const QUOTE_CEILING_DEFAULT_MAX_BPS = 500;

/** Top of the ceiling slider: the highest 25 bps step strictly below the Reserve discount (the contract refuses a ceiling at or above it). */
export function quoteCeilingMaxBps(reserve_discount_bps: Bps): Bps {
  if (reserve_discount_bps <= 0) return QUOTE_CEILING_DEFAULT_MAX_BPS;
  return Math.max(0, (Math.ceil(reserve_discount_bps / QUOTE_CEILING_STEP_BPS) - 1) * QUOTE_CEILING_STEP_BPS);
}

/** The price a buyer pays at a discount, USD e6. */
export const buysAtUsdE6 = (price_usd_e6: bigint, discount_bps: Bps): bigint => (price_usd_e6 * (BPS - BigInt(discount_bps))) / BPS;

export interface PlacementRow {
  key: string;
  kind: "quote" | "reserve" | "mine";
  quote?: QuoteView;
  size_usd_e6: bigint;
  discount_bps: Bps;
  buys_at_usd_e6: bigint;
}

/**
 * Buy side in settlement order (lib.rs: ascending discount, then oldest), with the Reserve after every quote. A new quote is the
 * youngest, so it goes after quotes at the same ceiling. Quotes in notice no longer back new borrowing and are left out.
 */
export function placementLadder(quotes: QuoteView[], reserve: { usd_e6: bigint; discount_bps: Bps } | null, mine: { usd_e6: bigint; discount_bps: Bps } | null, price_usd_e6: bigint): PlacementRow[] {
  const live = quotes.filter((q) => q.unlock_ns === null && BigInt(q.remaining_usd_e6) > 0n);
  const rows: PlacementRow[] = live
    .slice()
    .sort((a, b) => a.max_discount_bps - b.max_discount_bps || Number(BigInt(a.id) - BigInt(b.id)))
    .map((q) => ({ key: `q-${q.id}`, kind: "quote", quote: q, size_usd_e6: BigInt(q.remaining_usd_e6), discount_bps: q.max_discount_bps, buys_at_usd_e6: buysAtUsdE6(price_usd_e6, q.max_discount_bps) }));
  if (mine && mine.usd_e6 > 0n) {
    const at = rows.findIndex((r) => r.discount_bps > mine.discount_bps);
    const row: PlacementRow = { key: "mine", kind: "mine", size_usd_e6: mine.usd_e6, discount_bps: mine.discount_bps, buys_at_usd_e6: buysAtUsdE6(price_usd_e6, mine.discount_bps) };
    rows.splice(at === -1 ? rows.length : at, 0, row);
  }
  if (reserve && reserve.usd_e6 > 0n && reserve.discount_bps > 0) rows.push({ key: "reserve", kind: "reserve", size_usd_e6: reserve.usd_e6, discount_bps: reserve.discount_bps, buys_at_usd_e6: buysAtUsdE6(price_usd_e6, reserve.discount_bps) });
  return rows;
}

/** Share of buyer fees a new commitment would hold, bps: amount / (Q + R + amount). Fees go pro rata across quotes and the Reserve. */
export function buyerFeeShareBps(amount_usd_e6: bigint, q_usd_e6: bigint, r_usd_e6: bigint): Bps {
  const total = amount_usd_e6 + q_usd_e6 + r_usd_e6;
  return total === 0n ? 0 : Number((amount_usd_e6 * BPS) / total);
}

/**
 * What a new commitment would have earned over the last 7 days. The contract records fees only for the Reserve, whose share of all
 * buyer fees is R / (Q + R), so total buyer fees = fees_7d (Q + R) / R. Null with no Reserve, because nothing was measured. A past figure.
 */
export function weeklyFeesAtShareUsdE6(fees_7d_usd_e6: bigint, q_usd_e6: bigint, r_usd_e6: bigint, amount_usd_e6: bigint): bigint | null {
  if (r_usd_e6 === 0n) return null;
  const total = amount_usd_e6 + q_usd_e6 + r_usd_e6;
  if (total === 0n) return 0n;
  return (fees_7d_usd_e6 * (q_usd_e6 + r_usd_e6) * amount_usd_e6) / (r_usd_e6 * total);
}

/** Units a commitment could buy at its ceiling. */
export function unitsAtCeiling(amount_usd_e6: bigint, price_usd_e6: bigint, discount_bps: Bps, decimals: number): bigint {
  const at = buysAtUsdE6(price_usd_e6, discount_bps);
  return at === 0n ? 0n : (amount_usd_e6 * pow10(decimals)) / at;
}

// ---------------------------------------------------------------- Portfolio

export interface PortfolioLoan {
  position: PositionView;
  /** Null for a closed loan, or when `get_health` did not answer. */
  health: HealthView | null;
}

export interface PortfolioSummary {
  collateral_usd_e6: bigint;
  quotes_usd_e6: bigint;
  reserve_usd_e6: bigint;
  assets_usd_e6: bigint;
  debt_usd_e6: bigint;
  net_usd_e6: bigint;
  fees_usd_e6: bigint;
  /** The open loan with the lowest health. Null with no open debt. */
  worst: { id: U64; health: number } | null;
}

/** Net value: collateral at the oracle price, quote escrow and Reserve deposits, minus debt. Claimable fees are shown apart. */
export function portfolioSummary(loans: PortfolioLoan[], quotes: QuoteView[], reserve: ReserveNoteView[]): PortfolioSummary {
  let collateral = 0n;
  let debt = 0n;
  let worst: PortfolioSummary["worst"] = null;
  for (const { position: p, health: h } of loans) {
    if (p.status === "Closed") continue;
    debt += BigInt(p.debt_usd_e6);
    if (!h) continue;
    collateral += BigInt(h.value_usd_e6);
    if (BigInt(p.debt_usd_e6) === 0n) continue;
    const f = healthFactor(h.ltv_bps, h.pre_liq_ltv_bps);
    if (!worst || f < worst.health) worst = { id: p.id, health: f };
  }
  const quotesUsd = quotes.reduce((a, q) => a + BigInt(q.remaining_usd_e6), 0n);
  const reserveUsd = reserve.filter((n) => !n.note.exited).reduce((a, n) => a + BigInt(n.value_usd_e6), 0n);
  const fees = quotes.reduce((a, q) => a + BigInt(q.claimable_fees_usd_e6 ?? "0"), 0n) + reserve.filter((n) => !n.note.exited).reduce((a, n) => a + BigInt(n.claimable_fees_usd_e6), 0n);
  const assets = collateral + quotesUsd + reserveUsd;
  return { collateral_usd_e6: collateral, quotes_usd_e6: quotesUsd, reserve_usd_e6: reserveUsd, assets_usd_e6: assets, debt_usd_e6: debt, net_usd_e6: assets - debt, fees_usd_e6: fees, worst };
}

export interface ActivityRow {
  key: string;
  at_ns: U64;
  kind: "loan" | "reserve" | "quote";
  href: string;
  title: string;
  detail: string;
  amount: string;
}

/** Newest first, from what the contract still stores (`opened_ns`, `created_ns`). Later repayments and fills are events, which the views do not return. */
export function portfolioActivity(loans: PositionView[], quotes: QuoteView[], reserve: ReserveNoteView[], decimalsOf: (symbol: string) => number): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const p of loans) {
    const units = BigInt(p.units) > 0n ? p.units : (p.remote?.units ?? "0");
    const what = BigInt(units) > 0n ? ` with ${formatUnits(units, decimalsOf(p.collateral))} ${p.collateral}` : ` on ${p.collateral}`;
    rows.push({
      key: `p-${p.id}`,
      at_ns: p.opened_ns,
      kind: "loan",
      href: `/position/${p.id}`,
      title: `Opened loan #${p.id}${what}`,
      detail: `${p.shield ? `${p.shield.kind} Shield fee` : "premium"} ${formatUsdE6(p.premium_usd_e6 ?? "0")}, ${p.status === "Closed" ? "now closed" : `debt now ${formatUsdE6(p.debt_usd_e6)}`}`,
      amount: p.status === "Closed" ? "closed" : formatUsdE6(p.debt_usd_e6),
    });
  }
  for (const q of quotes)
    if (q.created_ns) rows.push({ key: `q-${q.id}`, at_ns: q.created_ns, kind: "quote", href: `/quote/${q.id}`, title: `Funded quote #${q.id} on ${q.collateral}`, detail: `ceiling ${(q.max_discount_bps / 100).toFixed(2)}%, ${formatUsdE6(q.remaining_usd_e6)} left`, amount: formatUsdE6(q.committed_usd_e6) });
  for (const n of reserve)
    rows.push({ key: n.note.note_id, at_ns: n.note.created_ns, kind: "reserve", href: `/note/${encodeURIComponent(n.note.note_id)}`, title: `Deposited to the ${n.note.collateral} Reserve`, detail: `Reserve Note ${n.note.note_id} minted`, amount: formatUsdE6(n.note.deposited_usd_e6) });
  return rows.sort((a, b) => (BigInt(b.at_ns) > BigInt(a.at_ns) ? 1 : BigInt(b.at_ns) < BigInt(a.at_ns) ? -1 : 0));
}

// ---------------------------------------------------------------- Curator what-if

export interface WhatIfParams {
  base_haircut_bps: Bps;
  weekend_haircut_bps: Bps;
  max_nectar_ltv_bps: Bps;
  limit_premium_bps: Bps;
}

export const WHAT_IF_KEYS = ["base_haircut_bps", "weekend_haircut_bps", "max_nectar_ltv_bps", "limit_premium_bps"] as const;

export interface WhatIfMarket {
  q_usd_e6: bigint;
  r_usd_e6: bigint;
  /** Verified DEX depth, counted only in session. */
  d_usd_e6: bigint;
  debt_usd_e6: bigint;
  base_ltv_bps: Bps;
  /** Value of the example loan's collateral. */
  example_value_usd_e6: bigint;
  example_borrow_usd_e6: bigint;
}

export interface WhatIfImpact {
  session_exit_usd_e6: bigint;
  closed_exit_usd_e6: bigint;
  /** Exit capacity minus open debt; negative when loans exceed it. */
  session_free_usd_e6: bigint;
  closed_free_usd_e6: bigint;
  /** A new loan on the example collateral on weekend parameters: min(LTV cap, capacity left). */
  weekend_limit_usd_e6: bigint;
  premium_example_usd_e6: bigint;
}

/** Same terms as B_c in math.ts, evaluated for proposed parameters. */
export function whatIfImpact(p: WhatIfParams, m: WhatIfMarket): WhatIfImpact {
  const session = ((BPS - BigInt(p.base_haircut_bps)) * (m.q_usd_e6 + m.r_usd_e6 + m.d_usd_e6)) / BPS;
  const closed = ((BPS - BigInt(p.weekend_haircut_bps)) * (m.q_usd_e6 + m.r_usd_e6)) / BPS;
  const closedFree = closed - m.debt_usd_e6;
  const cap = (BigInt(p.max_nectar_ltv_bps) * m.example_value_usd_e6) / BPS;
  const free = closedFree > 0n ? closedFree : 0n;
  const staticLimit = (BigInt(m.base_ltv_bps) * m.example_value_usd_e6) / BPS;
  return {
    session_exit_usd_e6: session,
    closed_exit_usd_e6: closed,
    session_free_usd_e6: session - m.debt_usd_e6,
    closed_free_usd_e6: closedFree,
    weekend_limit_usd_e6: cap < free ? cap : free,
    premium_example_usd_e6: premiumUsdE6(m.example_borrow_usd_e6, staticLimit, p.limit_premium_bps),
  };
}

export const whatIfDiff = (from: WhatIfParams, to: WhatIfParams): Array<{ field: keyof WhatIfParams; from: Bps; to: Bps }> => WHAT_IF_KEYS.filter((k) => from[k] !== to[k]).map((k) => ({ field: k, from: from[k], to: to[k] }));

/** The full `upsert_collateral` input for a parameter change: every other field is the stored value, including `remote_chain`, which the contract overwrites. */
export function upsertFromView(c: CollateralView, p: WhatIfParams): CollateralUpsertInput {
  return {
    symbol: c.symbol,
    token: c.token,
    decimals: c.decimals,
    price_feed_id: c.price_feed_id,
    base_ltv_bps: c.base_ltv_bps,
    max_nectar_ltv_bps: p.max_nectar_ltv_bps,
    base_haircut_bps: p.base_haircut_bps,
    weekend_haircut_bps: p.weekend_haircut_bps,
    limit_premium_bps: p.limit_premium_bps,
    pre_liq_min_bps: c.pre_liq_min_bps,
    pre_liq_max_bps: c.pre_liq_max_bps,
    verified_dex_depth_usd_e6: c.verified_dex_depth_usd_e6,
    remote_chain: c.remote_chain ?? null,
    price_kind: c.price_kind ?? null,
  };
}

// ---------------------------------------------------------------- Evidence (docs/EVIDENCE.md summary table)

export type EvidenceState = "pass" | "fail" | "pending";
export interface EvidenceRow {
  label: string;
  state: EvidenceState;
  /** "local fork" when the gate passed on a fork rather than the public testnet. */
  qualifier: string | null;
}

/** One row per `{label, gate}`; `gate` is the exact start of the first table cell. A gate with no row is pending. */
export function parseEvidenceRows(md: string, wanted: ReadonlyArray<{ label: string; gate: string }>): EvidenceRow[] {
  const lines = md.split("\n").filter((l) => l.startsWith("|"));
  return wanted.map(({ label, gate }) => {
    const hit = lines.find((l) => l.slice(1).trim().startsWith(gate));
    const status = hit?.split("|")[2]?.trim() ?? "";
    return { label, state: /^PASS/.test(status) ? "pass" : /^FAIL/.test(status) ? "fail" : "pending", qualifier: /local fork/i.test(status) ? "local fork" : null };
  });
}
