"use client";
// WO-33c: Market artboard. Who stands behind one asset (buy-side ladder in settlement order), how its limit is built, parameters, activity.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import tokC from "@nectar/ui/3d/tokC.webp";
import { ChainMark, Donut, Kvr, Ladder, NxBadge, Panel, Seg, Stat, Stats, type LadderRow } from "@nectar/ui";
import {
  bpsToPct,
  capacityUsdE6,
  formatUnits,
  formatUsdE6,
  placementLadder,
  portfolioActivity,
  sessionStatus,
  unitsAtCeiling,
  type CollateralView,
  type ExitCapacity,
  type FeeStackView,
  type PositionView,
  type QuoteView,
  type ReserveView,
} from "@nectar/sdk";
import { useChain, useFeature, useView } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { OracleBadge, optionalView } from "@/components/OracleBadge";

type View = "open" | "closed";
interface Data { c: CollateralView | null; cap: ExitCapacity | null; quotes: QuoteView[]; r: ReserveView | null; fees: FeeStackView | null; positions: PositionView[] }

const big = (v: string | number | bigint | null | undefined) => BigInt(v ?? 0);
const num = (v: bigint) => Number(v) / 1e6;
const pct2 = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export default function MarketPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol);
  const { config, generation } = useChain();
  const reserveOn = useFeature("reserve");
  const v2 = generation === "v2";
  const data = useView<Data>(
    async (v) => {
      const c = await v.getCollateral(symbol);
      if (!c) return { c: null, cap: null, quotes: [], r: null, fees: null, positions: [] };
      const [cap, quotes, r, fees, positions] = await Promise.all([v.getExitCapacity(symbol), v.listQuotes(symbol, 0, config.limits.max_quotes_per_asset), reserveOn ? v.getReserve(symbol) : Promise.resolve(null), v2 ? optionalView(v.getFeeStack(symbol)) : Promise.resolve(null), v.listAllPositions()]);
      return { c, cap, quotes, r, fees, positions: positions.filter((p) => p.collateral === symbol) };
    },
    [symbol, reserveOn, v2],
  );
  const [picked, setPicked] = useState<View | null>(null);
  const d = data.data;
  return (
    <div className="nx-page">
      <nav className="nx-crumb" aria-label="Breadcrumb"><Link href="/feed">Markets</Link><span aria-hidden="true">/</span><span className="nx-head" aria-current="page">{symbol}</span></nav>
      <Gate>
        {data.error ? <RpcErrorBanner error={data.error} onRetry={data.reload} /> : !d ? <LoadingBlock /> : !d.c || !d.cap ? (
          <>
            <h1 className="nx-title">{symbol}</h1>
            <Panel as="section" aria-label="Unknown market"><p className="nx-k" data-testid="market-empty">No market for {symbol} on this deployment. <Link className="nx-link" href="/feed">See all markets</Link>.</p></Panel>
          </>
        ) : (
          <Market d={{ ...d, c: d.c, cap: d.cap }} picked={picked} setPicked={setPicked} />
        )}
      </Gate>
    </div>
  );
}

function Market({ d, picked, setPicked }: { d: Data & { c: CollateralView; cap: ExitCapacity }; picked: View | null; setPicked: (v: View) => void }) {
  const { config } = useChain();
  const { c, cap } = d;
  const open = sessionStatus(cap, config.v7.session_stale_s).open;
  const view: View = picked ?? (open ? "open" : "closed");
  const price = big(cap.oracle_price_usd_e6);
  const q = big(cap.q_usd_e6);
  const r = big(cap.r_usd_e6);
  const depth = big(c.verified_dex_depth_usd_e6);
  const debt = big(cap.total_debt_usd_e6);
  const exitNow = cap.capacity_usd_e6 ? big(cap.capacity_usd_e6) : capacityUsdE6(q, r, open ? depth : 0n, cap.haircut_bps);
  const free = cap.aggregate_headroom_usd_e6 != null ? big(cap.aggregate_headroom_usd_e6) : exitNow > debt ? exitNow - debt : 0n;

  const ladder = placementLadder(d.quotes, d.r ? { usd_e6: r, discount_bps: d.r.discount_bps } : null, null, price);
  let cum = 0n;
  const rows: LadderRow[] = ladder.map((l) => {
    const units = unitsAtCeiling(l.size_usd_e6, price, l.discount_bps, c.decimals);
    cum += units;
    return {
      key: l.key,
      discount: pct2(l.discount_bps),
      buysAt: formatUsdE6(l.buys_at_usd_e6),
      source: l.kind === "reserve" ? "Nectar Reserve, pooled" : `quote q-${l.quote!.id}, ${l.quote!.buyer}`,
      amount: num(l.size_usd_e6),
      amountText: formatUsdE6(l.size_usd_e6, 0),
      units: formatUnits(units, c.decimals),
      cumulative: formatUnits(cum, c.decimals),
      kind: l.kind === "reserve" ? "r" : "q",
    };
  });
  const top = ladder[ladder.length - 1]?.discount_bps ?? 0;
  const committed = ladder.reduce((a, l) => a + l.size_usd_e6, 0n);
  const dexRow: LadderRow = { key: "dex", discount: "market", buysAt: "DEX depth, verified", source: "", amount: num(open ? depth : 0n), amountText: formatUsdE6(open ? depth : 0n, 0), units: "", cumulative: "", kind: "d", muted: true, note: open ? "counted in limits; testnet settles with quotes" : "counts as zero while the market is closed" };

  const vo = view === "open";
  const vD = vo ? depth : 0n;
  const vH = vo ? c.base_haircut_bps : c.weekend_haircut_bps;
  const back = q + r + vD;
  const vExit = capacityUsdE6(q, r, vD, vH);
  const vFree = vExit - debt;
  const decimalsOf = () => c.decimals;
  const activity = portfolioActivity(d.positions, d.quotes, [], decimalsOf).slice(0, 6);
  const daily = c.max_voluntary_fill_usd_e6_per_day;
  return (
    <>
      <div className="nx-head-row">
        <div className="nx-row nx-gap18">
          <img src={tokC.src} alt="" width={72} height={72} />
          <div className="nx-stack nx-gap6">
            <div className="nx-row nx-wrap">
              <h1 className="nx-title">{c.symbol}</h1>
              <NxBadge><ChainMark chain="near" />NEAR testnet</NxBadge>
              <NxBadge tone="warn">Mock collateral</NxBadge>
            </div>
            <div className="nx-row nx-wrap">
              <span className="nx-big nx-num" data-testid="market-price">{formatUsdE6(price)}</span>
              <OracleBadge cap={cap} />
            </div>
          </div>
        </div>
        <div className="nx-row nx-wrap">
          <Link className="nx-btn line" href="/quote">Commit a quote</Link>
          <Link className="nx-btn" href={`/borrow?c=${encodeURIComponent(c.symbol)}`}>Borrow</Link>
        </div>
      </div>

      <Panel as="section" aria-label="Key numbers">
        <Stats label="Key numbers">
          <Stat label="Exit capacity" size="mid" value={<span data-testid="market-exit">{formatUsdE6(exitNow, 0)}</span>} />
          <Stat label="Borrowed" size="mid" value={formatUsdE6(debt, 0)} />
          <Stat label="Free to borrow" size="mid" tone="pos" value={<span data-testid="market-free">{formatUsdE6(free, 0)}</span>} />
          <Stat label="Max LTV per loan" size="mid" value={bpsToPct(c.max_nectar_ltv_bps)} />
          <Stat label="Haircut now" size="mid" value={bpsToPct(cap.haircut_bps)} />
        </Stats>
      </Panel>

      <div className="nx-split">
        <Panel as="section" aria-label="Committed buyers" style={{ gap: 20 }}>
          <div className="nx-ph"><h2 className="nx-h2">Who stands behind {c.symbol}</h2><span className="nx-k">ordered by discount, the order settlement uses</span></div>
          {rows.length === 0 ? (
            <p className="nx-k" data-testid="market-no-buyers">No committed buyers yet. <Link className="nx-link" href="/quote">Commit the first quote</Link>.</p>
          ) : (
            <>
              <div className="nx-row nx-gap14 nx-wrap">
                <span className="nx-hero" data-testid="market-units">{formatUnits(cum, c.decimals)}</span>
                <span className="nx-stack">
                  <span className="nx-strong">{c.symbol} can be sold to committed buyers now</span>
                  <span className="nx-k">at no more than {pct2(top)} below the oracle price, about {formatUsdE6(committed, 0)}</span>
                </span>
              </div>
              <div data-testid="market-ladder"><Ladder rows={[...rows, dexRow]} caption={`Buy-side ladder for ${c.symbol}`} /></div>
            </>
          )}
        </Panel>

        <Panel as="section" aria-label="Limit composition" style={{ gap: 18 }}>
          <div className="nx-ph"><h2 className="nx-h2">How the limit is built</h2></div>
          <Seg<View> label="Market state" value={view} onChange={setPicked} options={[{ value: "open", label: "In session" }, { value: "closed", label: "Closed or Shield" }]} />
          <Donut centerLabel="backing" centerValue={formatUsdE6(back, 0)} segments={[{ key: "q", label: "Quotes", value: num(q), valueText: formatUsdE6(q, 0), tone: "q" }, { key: "r", label: "Reserve", value: num(r), valueText: formatUsdE6(r, 0), tone: "r" }, { key: "d", label: "DEX depth", value: num(vD), valueText: formatUsdE6(vD, 0), tone: "d" }]} />
          <div className="nx-code" style={{ whiteSpace: "normal" }} data-testid="market-formula">
            <div><span className="nx-dim">backing</span> {formatUsdE6(back, 0)} × (1 − {pct2(vH)}) = <b className="nx-pos">{formatUsdE6(vExit, 0)}</b> exit capacity</div>
            <div><span className="nx-dim">minus</span> {formatUsdE6(debt, 0)} borrowed = <b className="nx-pos">{formatUsdE6(vFree, 0)}</b> free</div>
            <div><span className="nx-dim">and each loan</span> ≤ {bpsToPct(c.max_nectar_ltv_bps)} of its own collateral</div>
          </div>
        </Panel>
      </div>

      <div className="nx-grid2">
        <Panel as="section" aria-label="Parameters" title="Parameters" actions={<Link className="nx-link" href="/console">Curator view</Link>}>
          <div>
            <Kvr k="Static limit without Nectar" v={bpsToPct(c.base_ltv_bps)} />
            <Kvr k="Limit premium above static" v={pct2(c.limit_premium_bps)} />
            <Kvr k="Weekend Shield" v={d.fees ? `${d.fees.shield_weekend_fee_bps} bps flat` : "—"} />
            <Kvr k="Event Shield" v={d.fees ? `${d.fees.shield_event_fee_bps} bps, ${c.shield && c.shield.event_window_end_ns !== "0" ? "window set" : "no window set"}` : "—"} />
            <Kvr k="Flag line, chosen at open" v={`${bpsToPct(c.pre_liq_min_bps)} to ${bpsToPct(c.pre_liq_max_bps)} LTV`} />
            <Kvr k="Reserve discount" v={d.r && d.r.discount_bps > 0 ? pct2(d.r.discount_bps) : "not set"} />
            <Kvr k="Profit-Lock fills per day" v={daily ? formatUsdE6(daily, 0) : "off"} />
          </div>
        </Panel>
        <Panel as="section" aria-label="Activity" title="Activity" actions={<span className="nx-k">from contract state</span>}>
          {activity.length === 0 ? (
            <p className="nx-k" data-testid="market-activity-empty">No loans or quotes on {c.symbol} yet.</p>
          ) : (
            <div data-testid="market-activity">
              {activity.map((a) => (
                <Link key={a.key} className="nx-actrow" href={a.href}>
                  <span className="nx-row nx-gap12" style={{ minWidth: 0 }}>
                    <span className="nx-ghost-ic" aria-hidden="true">{a.kind === "loan" ? "↓" : "Q"}</span>
                    <span className="nx-stack"><span className="nx-head">{a.title}</span><span className="nx-k">{a.detail}</span></span>
                  </span>
                  <b>{a.amount}</b>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
