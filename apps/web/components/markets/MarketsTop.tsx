"use client";
// WO-33b: Main artboard (/feed) — exit-capacity hero, week chart, markets table with chain filter, account dock.
// Every number comes from nectar-core views (packages/sdk); the week chart is a schedule from current values unless the Feed API has history.
import Link from "next/link";
import { useState } from "react";
import tokC from "@nectar/ui/3d/tokC.webp";
import tokA from "@nectar/ui/3d/tokA.webp";
import { ChainMark, Kvr, Legend, Meter, Notice, NxBadge, Panel, Ring, Seg, Sparkline, Stat, Stats, Tip, WeekChart, nyHourOfWeek } from "@nectar/ui";
import { capacityUsdE6, formatUsdE6, healthFactor, flagPriceUsdE6, bpsToPct, sessionStatus, type CollateralView, type ExitCapacity, type HealthView, type PositionView } from "@nectar/sdk";
import { useChain, useFeature, useView, useWallet } from "@/components/AppProvider";
import { useFeedApi } from "@/components/useFeedApi";

export interface MarketRow { c: CollateralView; cap: ExitCapacity; borrowed: bigint }

const num = (v: bigint) => Number(v) / 1e6;
const usd0 = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const big = (v: string | number | bigint | undefined | null) => BigInt(v ?? 0);

/** Exit capacity now and on the other session state, from the cap view and the collateral haircuts. */
export function capacityOf(r: MarketRow, staleS?: number) {
  const isOpen = sessionStatus(r.cap, staleS).open;
  const q = big(r.cap.q_usd_e6);
  const rr = big(r.cap.r_usd_e6);
  const d = big(r.cap.d_usd_e6);
  const dNow = isOpen ? d : 0n;
  const now = r.cap.capacity_usd_e6 ? big(r.cap.capacity_usd_e6) : capacityUsdE6(q, rr, dNow, r.cap.haircut_bps);
  // The current state is the contract's own figure; only the other state is derived from the collateral's haircuts.
  const open = isOpen ? now : capacityUsdE6(q, rr, d, r.c.base_haircut_bps);
  const closed = isOpen ? capacityUsdE6(q, rr, 0n, r.c.weekend_haircut_bps) : now;
  const hair = q + rr + dNow - now;
  const free = r.cap.aggregate_headroom_usd_e6 != null ? big(r.cap.aggregate_headroom_usd_e6) : now > r.borrowed ? now - r.borrowed : 0n;
  return { isOpen, q, r: rr, d: dNow, now, open, closed, hair: hair > 0n ? hair : 0n, free };
}

interface HistoryPoint { observed_at: string; q_usd_e6: string }

export function MarketsHero({ row }: { row: MarketRow }) {
  const { config } = useChain();
  const k = capacityOf(row, config.v7.session_stale_s);
  const open = k.isOpen;
  const hist = useFeedApi<{ history: HistoryPoint[] }>(`api/asset/${encodeURIComponent(row.c.symbol)}?limit=168`);
  const points = (hist.data?.history ?? []).slice().reverse().map((h) => num(big(h.q_usd_e6)));
  const used = k.now > 0n ? Number((row.borrowed * 10_000n) / k.now) / 100 : 0;
  return (
    <Panel as="section" aria-label="Exit capacity" className="nx-hero-grid" data-testid="markets-hero">
      <div className="nx-stack" style={{ gap: 18, minWidth: 0 }}>
        <div className="nx-stack" style={{ gap: 8 }}>
          <span className="nx-k">
            Committed exit capacity, {row.c.symbol}
            <Tip label="What is exit capacity">How much USDC committed buyers, the Reserve and verified DEX depth can pay for collateral after the haircut. Loans are sized against it.</Tip>
          </span>
          <span className="nx-hero" data-testid="hero-capacity">{formatUsdE6(k.now, 0)}</span>
          <div className="nx-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <NxBadge tone={open ? "pos" : "warn"}>{open ? "In session" : "Weekend parameters"}</NxBadge>
            <span className="nx-k">{open ? `Drops to ${formatUsdE6(k.closed, 0)} on weekend parameters (D counts 0, weekend haircut).` : `Returns to ${formatUsdE6(k.open, 0)} when the session reopens.`}</span>
          </div>
        </div>
        <div className="nx-stack" style={{ gap: 12 }}>
          <Meter lg label={`Backing: quotes ${formatUsdE6(k.q, 0)}, Reserve ${formatUsdE6(k.r, 0)}, DEX depth ${formatUsdE6(k.d, 0)}, haircut ${formatUsdE6(k.hair, 0)}`} segments={[{ tone: "q", value: num(k.q) }, { tone: "r", value: num(k.r) }, { tone: "d", value: num(k.d) }, { tone: "h", value: num(k.hair) }]} />
          <Legend items={[{ tone: "q", label: "Quotes", value: formatUsdE6(k.q, 0) }, { tone: "r", label: "Reserve", value: formatUsdE6(k.r, 0) }, { tone: "d", label: "DEX depth", value: formatUsdE6(k.d, 0) }, { tone: "h", label: "Haircut", value: `−${formatUsdE6(k.hair, 0)}` }]} />
        </div>
        <Stats label="Usage" className="nx-hero-stats">
          <Stat label="Borrowed" value={formatUsdE6(row.borrowed, 0)} />
          <Stat label="Free to borrow" value={formatUsdE6(k.free, 0)} tone="pos" />
          <Stat label="Used" value={`${used.toFixed(1)}%`} />
        </Stats>
      </div>
      <div className="nx-stack" style={{ gap: 8, minWidth: 0 }}>
        <WeekChart open={num(k.open)} closed={num(k.closed)} nowH={nyHourOfWeek(new Date())} format={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : usd0(v))} title="This week" />
        <p className="nx-k" data-testid="week-chart-note">
          Schedule from today&apos;s on-chain Q, R, D and haircuts, not recorded history.
          {points.length >= 2 ? null : hist.unconfigured ? " Feed API history is not configured on this deployment." : null}
        </p>
        {points.length >= 2 ? (
          <div className="nx-row" style={{ gap: 10, flexWrap: "wrap" }} data-testid="q-history">
            <span className="nx-k">Committed quotes Q, last {points.length} Feed API samples</span>
            <Sparkline values={points} label={`Committed quotes history, ${points.length} samples`} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

type ChainFilter = "all" | "near" | "sol" | "base";

export function MarketsTable({ rows }: { rows: MarketRow[] }) {
  const [f, setF] = useState<ChainFilter>("all");
  const solOn = useFeature("solana_remote");
  const baseOn = useFeature("base");
  const { config } = useChain();
  const show = (k: ChainFilter) => f === "all" || f === k;
  return (
    <Panel as="section" pad={false} className="nx-tbl-panel" aria-labelledby="mk-h">
      <div className="nx-ph">
        <h2 className="nx-h2" id="mk-h">All markets</h2>
        <Seg<ChainFilter> label="Filter by chain" value={f} onChange={setF} className="nx-chain-seg" options={[{ value: "all", label: "All" }, { value: "near", label: "NEAR" }, { value: "sol", label: "Solana" }, { value: "base", label: "Base" }]} />
      </div>
      <div className="nx-tbl-wrap">
        <table className="nx-tbl" data-testid="markets-table">
          <caption className="sr-only">Markets by chain</caption>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Capacity now</th>
              <th scope="col" className="r">Free to borrow</th>
              <th scope="col" className="r">Max LTV</th>
              <th scope="col">This week</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {show("near")
              ? rows.map((r) => {
                  const k = capacityOf(r, config.v7.session_stale_s);
                  const usedPct = k.now > 0n ? Math.min(100, Number((r.borrowed * 10_000n) / k.now) / 100) : 0;
                  return (
                    <tr key={r.c.symbol} data-chain="near">
                      <td>
                        <Link className="nx-asset" href={`/feed/${encodeURIComponent(r.c.symbol)}`}>
                          <img src={tokC.src} alt="" width={38} height={38} />
                          <span>
                            <b>{r.c.symbol}</b>
                            <span className="sub"><ChainMark chain="near" />NEAR testnet, mock</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="nx-stack nx-gap6" style={{ width: 130 }}>
                          <span className="nx-v">{formatUsdE6(k.now, 0)}</span>
                          <Meter segments={[{ tone: "used", value: usedPct }, { tone: "q", value: 100 - usedPct }]} total={100} />
                        </span>
                      </td>
                      <td className="r"><span className="nx-v nx-pos">{formatUsdE6(k.free, 0)}</span></td>
                      <td className="r"><span className="nx-v">{bpsToPct(r.c.max_nectar_ltv_bps)}</span></td>
                      <td><Sparkline values={[num(k.closed), num(k.open), num(k.closed), num(k.open), num(k.closed)]} label={`${r.c.symbol} capacity schedule`} /></td>
                      <td className="r"><Link className="nx-btn sm" href={`/borrow?c=${encodeURIComponent(r.c.symbol)}`}>Borrow</Link></td>
                    </tr>
                  );
                })
              : null}
            {show("sol") ? (
              <tr className={solOn ? undefined : "muted"} data-chain="sol">
                <td><span className="nx-asset"><span className="nx-ghost-ic" aria-hidden="true">NV</span><span><b>NVDAx</b><span className="sub"><ChainMark chain="sol" />Solana devnet</span></span></span></td>
                <td colSpan={4} style={{ whiteSpace: "normal" }}>
                  <NxBadge tone={solOn ? "info" : "plain"}>{solOn ? "Live on testnet (devnet leg)" : "Not live yet"}</NxBadge>
                  <span className="nx-k" style={{ marginLeft: 10 }}>Collateral stays in a Solana vault; NEAR signs the settlement.</span>
                </td>
                <td className="r">{solOn ? <Link className="nx-btn quiet sm" href="/borrow?chain=solana">Borrow</Link> : null}</td>
              </tr>
            ) : null}
            {show("base") ? (
              <tr className="muted" data-chain="base">
                <td><span className="nx-asset"><span className="nx-ghost-ic" aria-hidden="true">NV</span><span><b>NVDA B20</b><span className="sub"><ChainMark chain="base" />Base</span></span></span></td>
                <td colSpan={4} style={{ whiteSpace: "normal" }}>
                  <NxBadge>Local fork, not live</NxBadge>
                  <span className="nx-k" style={{ marginLeft: 10 }}>Checks the issuer&apos;s transfer policy before any release.{baseOn ? "" : " Switched off on this deployment."}</span>
                </td>
                <td className="r" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function AccountDock({ rows, positions }: { rows: MarketRow[]; positions: PositionView[] }) {
  const { accountId, connect } = useWallet();
  const { config } = useChain();
  const mine = accountId ? positions.filter((p) => p.borrower === accountId && p.status !== "Closed") : [];
  const p = mine[0];
  const h = useView<HealthView | null>(p ? (v) => v.getHealth(p.id) : null, [p?.id]);
  const row = rows.find((r) => r.c.symbol === p?.collateral) ?? rows[0];
  const hv = h.data;
  const hf = hv ? healthFactor(hv.ltv_bps, hv.pre_liq_ltv_bps) : null;
  const flag = hv && row ? flagPriceUsdE6(big(row.cap.oracle_price_usd_e6), hv.ltv_bps, hv.pre_liq_ltv_bps) : null;
  const k = row ? capacityOf(row, config.v7.session_stale_s) : null;
  return (
    <Panel as="aside" title="Your account" titleLevel={2} actions={<Link className="nx-link" href={p ? `/position/${p.id}` : "/borrow"}>{p ? "Manage" : "Borrow"}</Link>} aria-label="Your account" data-testid="account-dock">
      {!accountId ? (
        <>
          <p className="nx-k">Connect a NEAR testnet wallet to see your loans, health and what you can still borrow. Mock collateral.</p>
          <button type="button" className="nx-btn" onClick={connect}>Connect wallet</button>
        </>
      ) : !p ? (
        <p className="nx-k" data-testid="dock-empty">No open loans for {accountId}. {config.collaterals[0] ? `Borrow USDC against mock ${config.collaterals[0].symbol}.` : null}</p>
      ) : (
        <>
          <div className="nx-row" style={{ gap: 18 }}>
            <Ring value={hf} size={72} label={`Health of loan #${p.id}`} />
            <div className="nx-stack" style={{ gap: 4 }}>
              <span className="nx-k">Health of loan #{p.id}</span>
              <span className="nx-mid">{hv ? (hv.triggerable ? "At risk" : hf !== null && hf < 1.2 ? "Tight" : "Safe") : "Reading"}</span>
              {flag !== null ? <span className="nx-k">Flagged below {formatUsdE6(flag)}</span> : null}
            </div>
          </div>
          <div>
            <Kvr k="Collateral value" v={hv ? formatUsdE6(hv.value_usd_e6, 0) : "—"} />
            <Kvr k="Borrowed" v={formatUsdE6(p.debt_usd_e6, 0)} />
            <Kvr k="Open loans" v={String(mine.length)} />
          </div>
          {k && row ? (
            <Notice icon="clock" title={k.isOpen ? "Weekend parameters at the session close" : "Weekend parameters are on"}>
              {k.isOpen ? `Free capacity for new loans drops to about ${formatUsdE6(k.closed > row.borrowed ? k.closed - row.borrowed : 0n, 0)} on weekend parameters.` : `New loans size against ${formatUsdE6(k.closed, 0)} of exit capacity until the session reopens.`}
            </Notice>
          ) : null}
          <Link className="nx-btn quiet" href={`/position/${p.id}`}>Manage loan</Link>
        </>
      )}
    </Panel>
  );
}

export function Promos() {
  return (
    <div className="nx-grid2">
      <Link className="nx-panel nx-pad nx-promo" href="/quote">
        <img src={tokA.src} alt="" width={84} height={84} />
        <span className="nx-stack nx-gap6">
          <span className="nx-mid">Get paid to stand behind a price</span>
          <span className="nx-k">Escrow USDC behind a quote. Borrower premiums fund buyers&apos; commitment fees.</span>
          <span className="nx-link">Commit a quote</span>
        </span>
      </Link>
      <Link className="nx-panel nx-pad nx-promo" href="/agents">
        <span className="ic" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 11l6 5-6 5M17 21h8" /></svg>
        </span>
        <span className="nx-stack nx-gap6">
          <span className="nx-mid">Agents can borrow too</span>
          <span className="nx-k">One MCP call returns the exact transaction to sign.</span>
          <span className="nx-link">Connect an agent</span>
        </span>
      </Link>
    </div>
  );
}
