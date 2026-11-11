"use client";
// WO-33c: Portfolio artboard. Net value, weekend outlook, tabs Loans / Deposits / Notes / Activity. Every figure from nectar-core views.
import Link from "next/link";
import { useEffect, useState } from "react";
import tokC from "@nectar/ui/3d/tokC.webp";
import { Legend, Meter, Notice, NxBadge, Panel, Ring, Stat, Stats, TabBar, Tip, tabPanelProps } from "@nectar/ui";
import {
  bpsToPct,
  calendarStatus,
  flagPriceUsdE6,
  formatNewYork,
  formatUnits,
  formatUsdE6,
  healthFactor,
  nowNs,
  nsToUtc,
  portfolioActivity,
  portfolioSummary,
  sessionStatus,
  type ExitCapacity,
  type NectarViews,
  type PortfolioLoan,
  type QuoteView,
  type ReserveNoteView,
  type ReserveView,
  type SessionWindow,
} from "@nectar/sdk";
import { useChain, useFeature, useView, useWallet } from "@/components/AppProvider";
import { FaucetLink, Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useBalance } from "@/components/useBalance";
import { NotesTab } from "@/components/portfolio/NotesTab";
import { ReserveNoteRow, reserveNoteIds } from "@/components/earn/ReserveNotes";

type Tab = "loans" | "deposits" | "notes" | "activity";
const TAB_IDS: readonly Tab[] = ["loans", "deposits", "notes", "activity"];
const big = (v: string | number | bigint | null | undefined) => BigInt(v ?? 0);
const num = (v: bigint) => Number(v) / 1e6;

interface Data {
  loans: PortfolioLoan[];
  quotes: QuoteView[];
  reserve: ReserveNoteView[];
  pools: Record<string, ReserveView>;
  caps: Record<string, ExitCapacity>;
  calendar: SessionWindow[];
  noteTotal: number | null;
  /** B_c on the collateral still in the wallet. */
  limit: bigint;
}

/** /notes: the connected account's whole book. Works with Position Notes off; only the Notes tab needs them. */
export default function PortfolioPage() {
  const { config, generation } = useChain();
  const { accountId } = useWallet();
  const notesOn = useFeature("notes");
  const reserveOn = useFeature("reserve");
  const v2 = generation === "v2";
  const col = config.collaterals[0];
  const symbols = config.collaterals.map((c) => c.symbol);
  const walletCol = useBalance(col?.token ?? null);
  const walletUsdc = useBalance(config.usdc);
  const units = walletCol.data;

  const load = async (v: NectarViews): Promise<Data> => {
    const id = accountId!;
    const [all, caps, quoteLists, calendar, noteTotal, noteIds, pools] = await Promise.all([
      v.listAllPositions(),
      Promise.all(symbols.map((s) => v.getExitCapacity(s))),
      Promise.all(symbols.map((s) => v.listQuotes(s, 0, config.limits.max_quotes_per_asset))),
      v2 ? v.getFullSessionCalendar().catch(() => []) : Promise.resolve([] as SessionWindow[]),
      notesOn ? v.nftSupplyForOwner(id).then(Number) : Promise.resolve(null),
      reserveOn ? reserveNoteIds(v, id) : Promise.resolve([] as string[]),
      reserveOn ? Promise.all(symbols.map((s) => v.getReserve(s))) : Promise.resolve([] as ReserveView[]),
    ]);
    const mine = all.filter((p) => p.borrower === id);
    // A single unreadable loan shows "—" rather than failing the whole page.
    const loans = await Promise.all(mine.map(async (position) => ({ position, health: position.status === "Closed" ? null : await v.getHealth(position.id).catch(() => null) })));
    const reserve = (await Promise.all(noteIds.map((n) => v.getReserveNote(n)))).filter((n): n is ReserveNoteView => n !== null);
    const preview = units && units > 0n && col ? await v.previewBorrow(col.symbol, units.toString(), "1000000").catch(() => null) : null;
    return {
      loans,
      quotes: quoteLists.flat().filter((q) => q.buyer === id),
      reserve,
      pools: Object.fromEntries(pools.map((p) => [p.symbol, p])),
      caps: Object.fromEntries(symbols.map((s, i) => [s, caps[i]!])),
      calendar,
      noteTotal,
      limit: preview ? big(preview.b_c_usd_e6) : 0n,
    };
  };
  const data = useView<Data>(accountId ? load : null, [accountId, notesOn, reserveOn, v2, units?.toString()]);
  const [tab, setTab] = useState<Tab>("loans");
  // `?tab=notes` deep-links a tab; read after mount so the first render matches the server.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (TAB_IDS as readonly string[]).includes(t)) setTab(t as Tab);
  }, []);

  const d = data.data;
  const open = d?.loans.filter((l) => l.position.status !== "Closed") ?? [];
  const summary = d ? portfolioSummary(d.loans, d.quotes, d.reserve) : null;
  const deposits = d ? d.quotes.length + d.reserve.filter((n) => !n.note.exited).length : 0;
  const decimalsOf = (s: string) => config.collaterals.find((c) => c.symbol === s)?.decimals ?? 6;
  const noFunds = walletCol.data === 0n && walletUsdc.data === 0n;

  return (
    <div className="nx-page">
      <div className="nx-head-row">
        <div className="nx-row nx-gap18">
          <span className="nx-avatar lg" aria-hidden="true" />
          <div className="nx-stack nx-gap6">
            <h1 className="nx-title">Portfolio</h1>
            <span className="nx-k" data-testid="portfolio-account">{accountId ?? "No wallet connected"}</span>
          </div>
        </div>
        <div className="nx-row">
          <Link className="nx-btn line" href="/quote">Deposit</Link>
          <Link className="nx-btn" href="/borrow">Borrow</Link>
        </div>
      </div>
      <Gate wallet action="see your portfolio">
        {!accountId ? null : data.error ? (
          <RpcErrorBanner error={data.error} onRetry={data.reload} />
        ) : !d || !summary ? (
          <LoadingBlock />
        ) : (
          <div className="nx-stack" style={{ gap: 28 }}>
            <Panel as="section" aria-label="Summary" className="nx-hero-grid">
              <div className="nx-stack nx-gap14">
                <span className="nx-k">
                  Net value
                  <Tip label="How net value is counted">Collateral at the oracle price, quote escrow and Reserve deposits, minus what you owe. Mock collateral on testnet.</Tip>
                </span>
                <span className="nx-hero" data-testid="net-value">{formatUsdE6(summary.net_usd_e6, 0)}</span>
                <div className="nx-stack nx-gap6">
                  <Meter lg label={`Assets ${formatUsdE6(summary.assets_usd_e6, 0)}, debt ${formatUsdE6(summary.debt_usd_e6, 0)}`} segments={[{ tone: "q", value: num(summary.assets_usd_e6) }, { tone: "used", value: num(summary.debt_usd_e6) }]} />
                  <Legend items={[{ tone: "q", label: "Assets", value: <span data-testid="assets">{formatUsdE6(summary.assets_usd_e6, 0)}</span> }, { tone: "used", label: "Debt", value: <span data-testid="debt">{formatUsdE6(summary.debt_usd_e6, 0)}</span> }]} />
                </div>
              </div>
              <Stats label="Account">
                <Stat label="Health" size="mid" value={summary.worst ? <span className="nx-row nx-gap6"><Ring value={summary.worst.health} size={34} label="Lowest loan health" /><span data-testid="portfolio-health">{summary.worst.health.toFixed(2)}</span></span> : "n/a"} />
                <Stat label={<>Can still borrow<Tip label="How this is counted">The limit on {col?.symbol ?? "collateral"} still in your wallet. A new loan locks it; open loans cannot be drawn further.</Tip></>} size="mid" tone="pos" value={<span data-testid="can-borrow">{formatUsdE6(d.limit, 0)}</span>} />
                <Stat label="Fees earned" size="mid" value={<span data-testid="fees-earned">{formatUsdE6(summary.fees_usd_e6)}</span>} />
              </Stats>
            </Panel>

            <WeekendOutlook d={d} worst={summary.worst} decimalsOf={decimalsOf} />

            <section className="nx-stack nx-gap18" aria-label="Holdings">
              <TabBar<Tab>
                label="Holdings"
                idBase="pf"
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "loans", label: "Loans", count: open.length },
                  { id: "deposits", label: "Deposits", count: deposits },
                  { id: "notes", label: "Notes", ...(d.noteTotal !== null ? { count: d.noteTotal } : {}) },
                  { id: "activity", label: "Activity" },
                ]}
              />
              <div {...tabPanelProps("pf", tab)} className="nx-tabpanel">
                {tab === "loans" ? <Loans open={open} decimalsOf={decimalsOf} noFunds={noFunds} symbol={col?.symbol ?? "collateral"} /> : null}
                {tab === "deposits" ? <Deposits d={d} decimalsOf={decimalsOf} reserveOn={reserveOn} onChanged={data.reload} /> : null}
                {tab === "notes" ? <NotesTab /> : null}
                {tab === "activity" ? <Activity d={d} decimalsOf={decimalsOf} /> : null}
              </div>
            </section>
          </div>
        )}
      </Gate>
    </div>
  );
}

function WeekendOutlook({ d, worst, decimalsOf }: { d: Data; worst: { id: string; health: number } | null; decimalsOf: (s: string) => number }) {
  const { config } = useChain();
  const sym = config.collaterals[0]?.symbol ?? "";
  const cap = d.caps[sym];
  if (!cap) return null;
  const openNow = sessionStatus(cap, config.v7.session_stale_s).open;
  const cal = calendarStatus(d.calendar, nowNs());
  const when = openNow ? (cal.current ? `From ${formatNewYork(cal.current[1])} limits use weekend values.` : "When the session closes, limits use weekend values.") : `Weekend values apply${cal.next ? ` until ${formatNewYork(cal.next[0])}` : " until the session reopens"}.`;
  const loan = worst ? d.loans.find((l) => l.position.id === worst.id) : null;
  if (!loan?.health || !worst) {
    return <Notice tone="pos" icon="check" title="Nothing to do for the weekend" testId="weekend-outlook">{when} You have no open debt.</Notice>;
  }
  const h = loan.health;
  const units = big(loan.position.units);
  const price = units > 0n ? (big(h.value_usd_e6) * 10n ** BigInt(decimalsOf(loan.position.collateral))) / units : 0n;
  const flag = flagPriceUsdE6(price, h.ltv_bps, h.pre_liq_ltv_bps);
  const tight = worst.health < 1.2;
  return (
    <Notice
      tone={h.triggerable ? "neg" : tight ? "warn" : "pos"}
      icon={tight || h.triggerable ? "warn" : "check"}
      title={h.triggerable ? "A loan is below its flag line" : tight ? "A loan is close to its flag line" : "Ready for the weekend"}
      testId="weekend-outlook"
      action={<Link className="nx-btn quiet sm" href={`/position/${loan.position.id}`}>Simulate a drop</Link>}
    >
      {when} Loan #{loan.position.id} has a health of {worst.health.toFixed(2)} and is flagged only below {formatUsdE6(flag)}. {tight || h.triggerable ? "Repaying part of it gives you room." : "Nothing to do."}
    </Notice>
  );
}

function Loans({ open, decimalsOf, noFunds, symbol }: { open: PortfolioLoan[]; decimalsOf: (s: string) => number; noFunds: boolean; symbol: string }) {
  if (open.length === 0)
    return (
      <>
        <Panel as="section" aria-label="No open loans">
          <p className="nx-k" data-testid="loans-empty">No open loans. <Link className="nx-link" href="/borrow">Borrow against mock {symbol}</Link>; each loan appears here with its health.</p>
        </Panel>
        {noFunds ? <FaucetLink token={`${symbol} (mock)`} /> : null}
      </>
    );
  return (
    <>
      {open.map(({ position: p, health: h }) => {
        const f = h ? healthFactor(h.ltv_bps, h.pre_liq_ltv_bps) : null;
        const status = p.status === "Settling" ? "Settling" : h?.triggerable ? "At risk" : "Open";
        const remote = p.remote?.chain_id === "solana-devnet" ? "Solana devnet" : p.remote?.chain_id === "base-sepolia" ? "Base (local fork)" : "NEAR testnet";
        const units = big(p.units) > 0n ? p.units : (p.remote?.reserved_units ?? "0");
        return (
          <Panel key={p.id} as="article" className="nx-holding" aria-label={`Loan ${p.id}`} data-testid={`loan-${p.id}`}>
            <span className="nx-asset">
              <img src={tokC.src} alt="" width={38} height={38} />
              <span>
                <b>Loan #{p.id}</b>
                <span className="sub">{formatUnits(units, decimalsOf(p.collateral))} {p.collateral} on {remote}</span>
              </span>
            </span>
            <div className="nx-stack nx-gap4"><span className="nx-k">Debt</span><span className="nx-v">{formatUsdE6(p.debt_usd_e6)}</span></div>
            <div className="nx-stack nx-gap6">
              <span className="nx-k">{h ? `LTV ${bpsToPct(h.ltv_bps)} of ${bpsToPct(h.pre_liq_ltv_bps)} flag line` : "LTV not read"}</span>
              <span className="nx-flagbar">
                <span className="nx-meter nx-block"><i className="nx-c-q" style={{ width: `${h ? Math.min(100, h.ltv_bps / 100) : 0}%` }} /></span>
                {h ? <i style={{ left: `${Math.min(100, h.pre_liq_ltv_bps / 100)}%` }} aria-hidden="true" /> : null}
              </span>
            </div>
            <div className="nx-row nx-gap12">
              <Ring value={f} size={40} label={`Health of loan ${p.id}`} />
              <span className="nx-stack nx-gap4">
                <span className="nx-v">{f !== null && Number.isFinite(f) ? f.toFixed(2) : "n/a"}</span>
                <NxBadge tone={status === "Open" ? "pos" : status === "At risk" ? "neg" : "warn"} data-testid={`loan-${p.id}-status`}>{status}</NxBadge>
              </span>
            </div>
            <div className="nx-row nx-gap6">
              <Link className="nx-btn quiet sm" href={`/position/${p.id}`} aria-label={`Repay loan ${p.id}`}>Repay</Link>
              <Link className="nx-btn sm" href={`/position/${p.id}`} aria-label={`Manage loan ${p.id}`}>Manage</Link>
            </div>
          </Panel>
        );
      })}
    </>
  );
}

function Deposits({ d, decimalsOf, reserveOn, onChanged }: { d: Data; decimalsOf: (s: string) => number; reserveOn: boolean; onChanged: () => void }) {
  const notes = d.reserve.filter((n) => !n.note.exited);
  if (d.quotes.length === 0 && notes.length === 0)
    return (
      <Panel as="section" aria-label="No deposits">
        <p className="nx-k" data-testid="deposits-empty">No deposits yet. <Link className="nx-link" href="/quote">Commit a quote</Link>{reserveOn ? <> or <Link className="nx-link" href="/reserve">join the Reserve</Link></> : null} to earn a share of borrower premiums.</p>
      </Panel>
    );
  return (
    <>
      {d.quotes.map((q) => (
        <Panel key={q.id} as="article" className="nx-holding" aria-label={`Quote ${q.id}`} data-testid={`deposit-q-${q.id}`}>
          <span className="nx-asset">
            <span className="nx-ghost-ic" aria-hidden="true">Q</span>
            <span><b>Quote #{q.id}</b><span className="sub">{q.collateral}, ceiling {bpsToPct(q.max_discount_bps)}</span></span>
          </span>
          <div className="nx-stack nx-gap4"><span className="nx-k">Remaining</span><span className="nx-v">{formatUsdE6(q.remaining_usd_e6)}</span></div>
          <div className="nx-stack nx-gap4"><span className="nx-k">State</span><span className="nx-v">{q.unlock_ns ? `in notice, unlocks ${nsToUtc(q.unlock_ns)}` : "committed"}</span></div>
          <div className="nx-stack nx-gap4"><span className="nx-k">Fees to claim</span><span className="nx-v nx-pos">{formatUsdE6(q.claimable_fees_usd_e6 ?? "0")}</span></div>
          <div className="nx-row nx-gap6"><Link className="nx-btn sm" href={`/quote/${q.id}`} aria-label={`Manage quote ${q.id}`}>Manage</Link></div>
        </Panel>
      ))}
      {notes.map((n) => {
        const pool = d.pools[n.note.collateral];
        const share = pool && big(pool.shares) > 0n ? Number((big(n.note.shares) * 10_000n) / big(pool.shares)) : 0;
        return <ReserveNoteRow key={n.note.note_id} id={n.note.note_id} decimals={decimalsOf(n.note.collateral)} share={share} onChanged={onChanged} layout="holding" />;
      })}
    </>
  );
}

function Activity({ d, decimalsOf }: { d: Data; decimalsOf: (s: string) => number }) {
  const rows = portfolioActivity(d.loans.map((l) => l.position), d.quotes, d.reserve, decimalsOf);
  return (
    <Panel as="section" aria-label="Activity" data-testid="activity">
      {rows.length === 0 ? (
        <p className="nx-k" data-testid="activity-empty">No activity for this account yet.</p>
      ) : (
        <div>
          {rows.map((r) => (
            <Link key={r.key} className="nx-actrow" href={r.href} data-testid={`activity-${r.key}`}>
              <span className="nx-row nx-gap12" style={{ minWidth: 0 }}>
                <span className="nx-ghost-ic" aria-hidden="true">{r.kind === "loan" ? "↓" : r.kind === "reserve" ? "R" : "Q"}</span>
                <span className="nx-stack">
                  <span className="nx-head">{r.title}</span>
                  <span className="nx-k">{r.detail} · {nsToUtc(r.at_ns)}</span>
                </span>
              </span>
              <b>{r.amount}</b>
            </Link>
          ))}
        </div>
      )}
      <p className="nx-k">One row per loan, quote and Reserve Note, from what the contract stores. Repayments and fills are events, which the views do not return.</p>
    </Panel>
  );
}
