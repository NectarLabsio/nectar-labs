"use client";
// WO-26b: Shields (PRD §4.9) and Profit-Lock (§4.10) screens. The contract (WO-23a) is authoritative for every figure;
// these components only read its views and build the exact msg the sign modal shows. Copy rule: never "insurance".
import { useEffect, useState } from "react";
import { Badge, Banner, Button, Card, FeeStackList, Field, Kv, type FeeLine } from "@nectar/ui";
import {
  DEFAULT_SHIELD_FEE_BPS,
  MAX_SHIELD_OPENS_PER_DAY,
  PROFIT_LOCK_FEE_BPS,
  SHIELD_MIN_BORROW_USD_E6,
  SHIELD_SIZING_LINE,
  SHIELD_TAGLINE,
  bpsToPct,
  eventShieldWindow,
  formatNewYork,
  formatUnits,
  formatUsdE6,
  formatWindowCountdown,
  nowNs,
  nsToUtc,
  oneClickRouteStatus,
  parseUnits,
  profitLockBlock,
  profitLockSummary,
  shieldOpensLeft,
  shieldReasonText,
  borrowReasonText,
  tx,
  txV2,
  type BorrowPreview,
  type ExitCapacity,
  type FeedOneClick,
  type FeeStackView,
  type HealthView,
  type PositionView,
  type SelfSettlePreview,
  type SessionWindow,
  type ShieldKind,
  type ShieldView,
  type ShieldWindow,
  weekendShieldWindow,
} from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "./AppProvider";
import { LoadingBlock, RpcErrorBanner } from "./states";
import type { FeedApiState } from "./useFeedApi";
import { NVDAX_FAUCET_URL, docsHref } from "@/lib/env";

const tryParse = (s: string, d: number): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, d) : null;
  } catch {
    return null;
  }
};

/** Full-precision units with trailing zeros trimmed (0.116, not 0.11). */
const units = (v: bigint | string, d: number): string => formatUnits(v, d, d).replace(/\.?0+$/, "");

/** Wall clock in seconds, ticking every `ms`. */
export function useNowS(ms = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** The `shield` argument for a card. Event windows use the minute (so the preview is not re-read every second). */
export function shieldWindowFor(kind: ShieldKind, calendar: SessionWindow[] | undefined, eventEndNs: string | undefined, nowS: number): ShieldWindow | null {
  const minuteNs = BigInt(Math.floor(nowS / 60) * 60) * 1_000_000_000n;
  if (kind === "Weekend") return calendar ? weekendShieldWindow(calendar, BigInt(nowS) * 1_000_000_000n) : null;
  return eventShieldWindow(eventEndNs ?? "0", minuteNs);
}

export interface ShieldCardProps {
  kind: ShieldKind;
  symbol: string;
  token: string | null;
  decimals: number;
  units: bigint | null;
  preLiqBps: number;
  cap: ExitCapacity | undefined;
  fees: FeeStackView | undefined;
  window: ShieldWindow | null;
  nowS: number;
  opensToday: number | undefined;
  balance: bigint | undefined;
  onOpened: () => void;
}

/** One Shield preset: amount from $5, window countdown, fee, weekend limit, committed backing, opens left, open → sign modal. */
export function ShieldCard(p: ShieldCardProps) {
  const { config, generation } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const [amountIn, setAmountIn] = useState("");
  const borrow = tryParse(amountIn, 6);
  const feeBps = p.fees ? (p.kind === "Weekend" ? p.fees.shield_weekend_fee_bps : p.fees.shield_event_fee_bps) : null;
  const shield = p.window?.ok ? p.window.input : null;
  const preview = useView<BorrowPreview>(
    shield && p.units && borrow && borrow >= SHIELD_MIN_BORROW_USD_E6 ? (v) => v.previewBorrow(p.symbol, p.units!.toString(), borrow.toString(), null, shield, accountId) : null,
    [p.symbol, p.units?.toString(), borrow?.toString(), shield?.window_end_ns, shield?.kind, accountId],
  );
  const opensLeft = p.opensToday === undefined ? null : shieldOpensLeft(p.opensToday);
  const id = `shield-${p.kind.toLowerCase()}`;
  const endNs = p.window?.ok ? p.window.input.window_end_ns : null;
  const secsLeft = endNs ? Number(BigInt(endNs) / 1_000_000_000n) - p.nowS : null;
  const q = p.cap ? BigInt(p.cap.q_usd_e6) : null;
  const r = p.cap ? BigInt(p.cap.r_usd_e6) : null;
  // Weekend limit for the asset: (1 − h_weekend)(Q + R), D = 0 (a Shield is sized like the session is closed).
  const hW = config.collaterals.find((c) => c.symbol === p.symbol)?.weekend_haircut_bps ?? null;
  const assetWeekend = q !== null && r !== null && hW !== null ? ((10_000n - BigInt(hW)) * (q + r)) / 10_000n : null;
  const amountErr = amountIn && !borrow ? "Enter a positive number" : borrow !== null && borrow < SHIELD_MIN_BORROW_USD_E6 ? "Shields start at $5 on testnet" : null;
  const prev = preview.data;
  const reason = prev && !prev.ok ? (shieldReasonText(prev.reason) ?? borrowReasonText(prev.reason)) : null;
  const shieldFee = prev ? BigInt(prev.shield_fee_usd_e6 ?? prev.premium_usd_e6) : null;
  const origination = prev?.origination_fee_usd_e6 != null ? BigInt(prev.origination_fee_usd_e6) : 0n;
  const total = prev?.total_fees_usd_e6 != null ? BigInt(prev.total_fees_usd_e6) : shieldFee !== null ? shieldFee + origination : null;
  const net = prev?.net_proceeds_usd_e6 != null ? BigInt(prev.net_proceeds_usd_e6) : null;
  const lines: FeeLine[] | null =
    shieldFee !== null ? [
      { label: `${p.kind} Shield fee (${feeBps ?? "?"} bps of the borrow, replaces the limit premium)`, value: formatUsdE6(shieldFee) },
      { label: `Origination (${p.fees?.origination_fee_bps ?? config.v7.origination_fee_bps} bps of the borrow)`, value: formatUsdE6(origination) },
    ] : null;
  const unitsOk = p.units !== null && (p.balance === undefined || p.units <= p.balance);
  const canOpen = Boolean(accountId && p.token && config.core && shield && p.units && unitsOk && borrow && !amountErr && prev?.ok && generation === "v2" && opensLeft !== 0);

  const open = async () => {
    if (!p.token || !config.core || !p.units || !borrow || !shield) return;
    const intent = tx.borrow(p.token, config.core, p.units.toString(), { collateral: p.symbol, borrow_usd_e6: borrow.toString(), pre_liq_ltv_bps: p.preLiqBps, shield });
    const out = await sign(intent, {
      success: `${p.kind} Shield opened`,
      fees: lines && total !== null ? { lines, total: formatUsdE6(total), note: net !== null ? `Deducted from proceeds: you receive ${formatUsdE6(net)}.` : undefined } : undefined,
      summary: (
        <div className="kvs">
          <Kv k="Window ends" v={endNs ? `${formatNewYork(endNs)} · ${nsToUtc(endNs)}` : "—"} />
          <Kv k="Inside the window" v="only committed buyers can settle it" />
        </div>
      ),
    });
    if (out?.ok) {
      setAmountIn("");
      p.onOpened();
    }
  };

  return (
    <Card className="shield-card" label="Shield preset" title={`${p.kind} Shield`} titleLevel={2} data-testid={id} actions={opensLeft !== null ? <Badge kind={opensLeft > 0 ? "info" : "warn"}>{opensLeft} of {MAX_SHIELD_OPENS_PER_DAY} opens left today</Badge> : <Badge kind="neutral">{MAX_SHIELD_OPENS_PER_DAY} opens per day</Badge>}>
      <div className="stack">
        <div>
          <div className="big num" data-testid={`${id}-fee-bps`}>{feeBps !== null ? `${feeBps} bps` : "—"}</div>
          <p className="small dim">flat Shield fee on the borrow, instead of the limit premium</p>
        </div>
        <p className="small">
          {p.kind === "Weekend" ? "From now to the next session open (Monday 09:30 New York time over a weekend), " : "A curator-set window around an event such as earnings, at most 72 h, "}
          {SHIELD_SIZING_LINE}: {SHIELD_TAGLINE}.
        </p>
        <div className="kvs" aria-live="off">
          <Kv k={p.kind === "Weekend" ? "Window ends (next calendar open)" : "Window ends"} v={endNs ? <span data-testid={`${id}-end`}>{formatNewYork(endNs)}</span> : "—"} title={endNs ? nsToUtc(endNs) : undefined} />
          <Kv k="Countdown" v={secsLeft !== null ? <span className="countdown" data-testid={`${id}-countdown`}>{formatWindowCountdown(secsLeft)}</span> : "—"} />
          <Kv k="Weekend limit (asset, (1 − h_weekend)(Q + R))" v={assetWeekend !== null ? <span data-testid={`${id}-weekend-limit`}>{formatUsdE6(assetWeekend)}</span> : "—"} />
          <Kv k="Committed backing (Q, funded quotes)" v={q !== null ? <span data-testid={`${id}-backing`}>{formatUsdE6(q)}</span> : "—"} />
        </div>
        {p.window && !p.window.ok ? <Banner tone="warn" title="Not available now">{p.window.reason}</Banner> : null}
        <Field label={`Amount (${p.kind} Shield)`} inputMode="decimal" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} unit="USDC" hint="From $5 on testnet." error={amountErr ?? undefined} disabled={!p.window?.ok} />
        {!p.units && borrow ? <p className="small dim">Enter collateral units above to preview this Shield.</p> : null}
        {preview.error ? <RpcErrorBanner error={preview.error} onRetry={preview.reload} /> : preview.loading ? <LoadingBlock lines={2} /> : null}
        {reason ? <Banner tone="danger" title="The contract would refuse this Shield">{reason} {prev ? <>Weekend limit B<sub>c</sub> = {formatUsdE6(prev.b_c_usd_e6)}.</> : null}</Banner> : null}
        {prev ? (
          <div className="kvs" aria-live="polite">
            <Kv k="Your weekend limit (contract)" v={<span data-testid={`${id}-your-limit`}>{formatUsdE6(prev.b_c_usd_e6)}</span>} />
          </div>
        ) : null}
        {lines && total !== null ? <FeeStackList lines={lines} total={formatUsdE6(total)} note={net !== null ? `Deducted from proceeds: you receive ${formatUsdE6(net)}.` : undefined} testId={`${id}-fees`} /> : null}
        {opensLeft === 0 ? <Banner tone="warn" title="Daily limit reached">All {MAX_SHIELD_OPENS_PER_DAY} Shield opens for today (UTC) are used; testnet caps them to protect contract storage.</Banner> : null}
        <Button variant="primary" disabled={!canOpen} onClick={open} data-testid={`${id}-open`}>Open {p.kind} Shield</Button>
      </div>
    </Card>
  );
}

/** "Get demo NVDAx": a labelled testnet mock-mint link (no auto-mint) beside the 1Click dry quote mainnet would run. */
export function ZapCard({ symbol, oneclick }: { symbol: string; oneclick: FeedApiState<FeedOneClick> }) {
  const d = oneclick.data;
  const pair = d?.pairs.find((x) => x.verified) ?? d?.pairs[0];
  const s = pair ? [...pair.samples].sort((a, b) => a.notional_usd - b.notional_usd)[1] ?? pair.samples[0] : undefined;
  const route = oneClickRouteStatus(d, symbol);
  const href = NVDAX_FAUCET_URL || docsHref("operations/runbook");
  return (
    <Card label="Zap and borrow" data-testid="zap-card" actions={<Badge kind="mock">testnet</Badge>}>
      <div className="stack">
        <p className="small">On mainnet a 1Click swap would buy the collateral with USDC first, then borrow. Testnet runs only the dry quote (<code>dry: true</code>, never a deposit) and offers mock tokens instead.</p>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="stack-sm" data-testid="zap-dry-quote">
            <span className="label">Dry quote mainnet would run</span>
            {oneclick.loading ? <LoadingBlock lines={1} /> : s && pair ? (
              <p className="small"><span className="mono">{pair.id.toUpperCase()}</span> at ${s.notional_usd.toLocaleString("en-US")}: impact {bpsToPct(s.impact_bps)}, worst case {bpsToPct(s.worst_impact_bps)}{pair.verified ? " · signature verified" : ""}. Reference pair, not the mock collateral{route === "no_route" ? `; ${symbol} has no 1Click route` : ""}.</p>
            ) : (
              <p className="small dim">The Feed API returned no 1Click dry quote{oneclick.unconfigured ? " (indexer not connected)" : ""}.</p>
            )}
          </div>
          <div className="stack-sm">
            <span className="label">Testnet mock mint</span>
            <a className="btn" href={href} target={NVDAX_FAUCET_URL ? "_blank" : undefined} rel={NVDAX_FAUCET_URL ? "noreferrer noopener" : undefined} data-testid="nvdax-faucet">
              Get demo {symbol}
            </a>
            <span className="caption">Testnet mock mint, once per account per hour. Not a real stock token.</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Shield status on a position: window, fee and "committed buyers only" while active; a repay prompt after it ends. */
export function ShieldStatusCard({ shield }: { shield: ShieldView }) {
  return (
    <Card label={`${shield.kind} Shield`} data-testid="position-shield" actions={shield.active ? <Badge kind="weekend">window open</Badge> : <Badge kind="neutral">window ended</Badge>}>
      <div className="kvs">
        <Kv k="Window ends" v={`${formatNewYork(shield.window_end_ns)} · ${nsToUtc(shield.window_end_ns)}`} />
        <Kv k="Shield fee" v={`${shield.fee_bps} bps · ${formatUsdE6(shield.fee_usd_e6)}`} />
        <Kv k="Settlement" v={shield.committed_buyers_only ? "committed buyers only" : "ordinary position"} />
      </div>
      {!shield.active ? <p className="small" style={{ marginTop: 10 }}>The Shield window has ended. The position stays open as an ordinary loan; repay when you are ready.</p> : null}
    </Card>
  );
}

/** Profit-Lock: preview_self_settle → sign modal → self_settle. Disabled with a reason (health < 1, CA pending, no opted-in capacity, cap). */
export function ProfitLockPanel({ pos, health, decimals, onSettled }: { pos: PositionView; health: HealthView | null | undefined; decimals: number; onSettled: () => void }) {
  const { config } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const pv = useView<{ pre: SelfSettlePreview; cap: ExitCapacity | null }>(
    async (v) => {
      const [pre, cap] = await Promise.all([v.previewSelfSettle(pos.id), v.getExitCapacity(pos.collateral).catch(() => null)]);
      return { pre, cap };
    },
    [pos.id, pos.debt_usd_e6],
  );
  const pre = pv.data?.pre;
  const sum = pre ? profitLockSummary(pre) : null;
  const block = profitLockBlock(pre, { triggerable: health?.triggerable === true, caPending: pv.data?.cap?.ca_pending === true });
  const isBorrower = accountId === pos.borrower;
  const can = Boolean(pre?.ok && !block && isBorrower && config.core && pos.status === "Open");
  const disc = sum?.discount_bps != null ? (sum.min_disc_bps === sum.max_disc_bps ? bpsToPct(sum.discount_bps) : `${bpsToPct(sum.discount_bps)} (legs ${bpsToPct(sum.min_disc_bps!)}–${bpsToPct(sum.max_disc_bps!)})`) : "—";
  const lines: FeeLine[] | null = sum && pre ? [
    { label: "Debt repaid", value: formatUsdE6(pre.debt_usd_e6) },
    { label: `Profit-Lock fee (${PROFIT_LOCK_FEE_BPS} bps of the debt, to treasury)`, value: formatUsdE6(sum.fee_usd_e6) },
  ] : null;

  const settle = async () => {
    if (!config.core || !pre || !sum) return;
    const out = await sign(txV2.selfSettle(config.core, pos.id), {
      success: "Profit-Lock settled",
      fees: lines ? { lines, total: formatUsdE6(sum.fill_usd_e6), note: `Paid by committed buyers out of the collateral they buy; you keep ${units(sum.units_kept, decimals)} ${pos.collateral} debt-free.` } : undefined,
      summary: (
        <div className="kvs">
          <Kv k="Units sold to committed buyers" v={`${units(sum.units_sold, decimals)} ${pos.collateral}`} />
          <Kv k="Clearing discount" v={disc} />
          <Kv k="Units you keep" v={`${units(sum.units_kept, decimals)} ${pos.collateral}`} />
        </div>
      ),
    });
    if (out?.ok) onSettled();
  };

  return (
    <Card label="Profit-Lock" data-testid="profit-lock" live={Boolean(pre?.ok)}>
      <div className="stack">
        <p className="small">Close the loan by selling just enough collateral to committed buyers who opted into voluntary fills, at their clearing discount, plus a {PROFIT_LOCK_FEE_BPS} bps fee. You keep the rest debt-free.</p>
        {pv.error ? <RpcErrorBanner error={pv.error} onRetry={pv.reload} /> : pv.loading && !pre ? <LoadingBlock /> : null}
        {sum && pre ? (
          <div className="kvs" aria-live="polite">
            <Kv k="Units sold" v={<span data-testid="pl-units-sold">{pre.ok ? `${units(sum.units_sold, decimals)} ${pos.collateral}` : "—"}</span>} />
            <Kv k="Clearing discount" v={<span data-testid="pl-discount">{pre.ok ? disc : "—"}</span>} />
            <Kv k="Units kept" v={<span data-testid="pl-units-kept">{pre.ok ? `${units(sum.units_kept, decimals)} ${pos.collateral}` : "—"}</span>} />
            <Kv k={`Fee (${PROFIT_LOCK_FEE_BPS} bps)`} v={<span data-testid="pl-fee">{formatUsdE6(sum.fee_usd_e6)}</span>} />
            <Kv k="Daily cap left (asset)" v={<span data-testid="pl-cap-left">{formatUsdE6(sum.daily_cap_left_usd_e6)} of {formatUsdE6(pre.daily_cap_usd_e6)}</span>} />
          </div>
        ) : null}
        {block ? <Banner tone="warn" title="Profit-Lock unavailable" role="status"><span data-testid="pl-reason" data-kind={block.kind}>{block.text}</span></Banner> : null}
        {pre?.ok && !block && !isBorrower ? <p className="small dim">Only the borrower can Profit-Lock this position.</p> : null}
        <Button variant="primary" disabled={!can} onClick={settle} data-testid="pl-settle">Profit-Lock</Button>
        <p className="caption">The next screen shows the exact call, gas and the 1 yoctoNEAR deposit before your wallet opens.</p>
      </div>
    </Card>
  );
}

/** Landing: the Shield fee in bps from `get_fee_stack` on v2; the testnet default otherwise (labelled by the caller). */
export function ShieldFeeBps({ kind }: { kind: ShieldKind }) {
  const { generation } = useChain();
  const f = useView<FeeStackView>(generation === "v2" ? (v) => v.getFeeStack() : null, [generation]);
  const bps = f.data ? (kind === "Weekend" ? f.data.shield_weekend_fee_bps : f.data.shield_event_fee_bps) : DEFAULT_SHIELD_FEE_BPS[kind];
  return <>{bps} bps</>;
}
