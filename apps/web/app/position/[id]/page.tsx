"use client";
// WO-33b: Position artboard. Status (open / at risk / settling / closed) from get_position + get_health; price simulator from the
// health view; Repay and Profit-Lock (Add collateral is omitted: nectar-core has no add-collateral call). DI-1: when the
// Profit-Lock fill exceeds the voluntary-fill cap left today (preview_self_settle), offer "Repay $X first" pre-filled.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import tokC from "@nectar/ui/3d/tokC.webp";
import { AmountBox, Coin, Kvr, Notice, NxBadge, Panel, Ring, Stat, Stats, TabBar, tabPanelProps } from "@nectar/ui";
import {
  bpsToPct,
  flagPriceUsdE6,
  formatUnits,
  formatUsdE6,
  healthAfterE4,
  healthFactor,
  parseUnits,
  positionNoteId,
  profitLockFill,
  profitLockRepayFirstUsdE6,
  profitLockSummary,
  repayToHealthUsdE6,
  tx,
  type HealthView,
  type PositionView,
  type SelfSettlePreview,
  type ShieldView,
} from "@nectar/sdk";
import { useChain, useFeature, useSign, useView, useWallet } from "@/components/AppProvider";
import { DepositSourceBadge, RemoteDeposit, RemoteOpenCard, RemoteRelease, RemoteStatusBadge, ReservationCard, isRemote } from "@/components/remote/RemoteFlow";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { ProfitLockPanel, ShieldStatusCard } from "@/components/Shields";
import { NoteLink } from "@/components/Notes";

type Tab = "repay" | "pl";
const big = (v: string | number | bigint | null | undefined) => BigInt(v ?? 0);
const fmtH = (e4: number) => (e4 >= Number.MAX_SAFE_INTEGER ? "n/a" : (e4 / 10_000).toFixed(2));

export default function PositionPage() {
  const { id } = useParams<{ id: string }>();
  const { config } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const notesOn = useFeature("notes");
  const solanaOn = useFeature("solana_remote");
  const shieldsOn = useFeature("shields");
  const profitLockOn = useFeature("profit_lock");
  const p = useView<{ pos: PositionView | null; h: HealthView | null }>(async (v) => {
    const pos = await v.getPosition(id);
    return { pos, h: pos && pos.status !== "Closed" ? await v.getHealth(id) : null };
  }, [id]);
  const sh = useView<ShieldView | null>(shieldsOn ? (v) => v.getShield(id) : null, [id, shieldsOn]);
  const pos = p.data?.pos;
  const h = p.data?.h;
  const plOn = Boolean(profitLockOn && pos && pos.status === "Open" && big(pos.debt_usd_e6) > 0n);
  const pl = useView<SelfSettlePreview>(plOn ? (v) => v.previewSelfSettle(id) : null, [id, plOn, pos?.debt_usd_e6]);
  const [loadedAt, setLoadedAt] = useState(0);
  useEffect(() => {
    if (p.data !== undefined) setLoadedAt(Date.now());
  }, [p.data]);
  const [tab, setTab] = useState<Tab>("repay");
  const [amt, setAmt] = useState("");
  const [sim, setSim] = useState<number | null>(null);
  const col = config.collaterals.find((c) => c.symbol === pos?.collateral);
  const dec = col?.decimals ?? 6;

  let amount: bigint | null = null;
  try {
    amount = amt.trim() ? parseUnits(amt, 6) : null;
  } catch {
    amount = null;
  }
  const remote = solanaOn && isRemote(pos) ? pos : null;
  const canRepay = Boolean(pos && pos.status === "Open" && accountId === pos.borrower && (!remote || (remote.remote.status === "Open" && big(remote.debt_usd_e6) > 0n)));
  const repay = async () => {
    if (!config.usdc || !config.core || !pos || !amount) return;
    const out = await sign(tx.repay(config.usdc, config.core, amount.toString(), pos.id), { success: "Repaid", next: <Link className="link" href="/feed">Next: check your account on Markets</Link> });
    if (out?.ok) setAmt("");
    p.reload();
  };

  const debt = pos ? big(pos.debt_usd_e6) : 0n;
  const units = pos ? big(pos.units) : 0n;
  const value = h ? big(h.value_usd_e6) : 0n;
  const preLiq = pos?.pre_liq_ltv_bps ?? 7500;
  // Effective price per whole unit (includes any multiplier), from the health view.
  const priceE6 = units > 0n ? (value * 10n ** BigInt(dec)) / units : 0n;
  const oracle = Number(priceE6) / 1e6;
  const flag = h && debt > 0n ? flagPriceUsdE6(priceE6, h.ltv_bps, preLiq) : 0n;
  const flagN = Number(flag) / 1e6;
  const caution = flagN * 1.2;
  const simP = sim ?? oracle;
  const simValue = BigInt(Math.round(simP * 1e6)) * units / 10n ** BigInt(dec);
  const simE4 = healthAfterE4(debt, simValue, preLiq);
  const simLtv = simValue > 0n ? Number((debt * 10_000n) / simValue) : 0;
  const lo = Math.max(0.01, Math.floor(Math.min(oracle * 0.4, flagN * 0.8 || oracle * 0.4)));
  const hi = Math.ceil(Math.max(oracle * 1.4, lo + 1));
  const L = (x: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo || 1)) * 100));
  const runway = debt > 0n ? `linear-gradient(90deg, color-mix(in srgb, var(--danger) 55%, transparent) 0 ${L(flagN).toFixed(1)}%, color-mix(in srgb, var(--warn-bar) 55%, transparent) ${L(flagN).toFixed(1)}% ${L(caution).toFixed(1)}%, color-mix(in srgb, var(--accent) 45%, transparent) ${L(caution).toFixed(1)}% 100%)` : "var(--raise)";
  const risk = Boolean(h?.triggerable);
  const status = !pos ? "" : pos.status === "Closed" ? "Closed" : pos.status === "Settling" ? "Settling" : risk ? "At risk" : "Open";
  const statusTone = status === "Open" ? "pos" : status === "At risk" ? "neg" : status === "Settling" ? "warn" : "plain";
  const fixRisk = h && risk ? repayToHealthUsdE6(debt, value, preLiq) : 0n;
  const rep = amount !== null && amount > debt ? debt : amount ?? 0n;
  const nd = debt - rep;
  const repE4 = healthAfterE4(nd, value, preLiq);
  // DI-1: cap left today from preview_self_settle; the fill is debt · (1 + fee).
  const plSum = pl.data ? profitLockSummary(pl.data) : null;
  const plFill = pl.data ? big(pl.data.fill_usd_e6) || profitLockFill(debt).fill_usd_e6 : null;
  const repayFirst = plSum && plFill !== null && plFill > plSum.daily_cap_left_usd_e6 ? profitLockRepayFirstUsdE6(debt, plSum.daily_cap_left_usd_e6) : 0n;
  const tabs = [{ id: "repay" as const, label: "Repay" }, ...(plOn && (!remote || remote.remote.status === "Open") ? [{ id: "pl" as const, label: "Profit-Lock" }] : [])];
  const preset = (x: bigint) => {
    setTab("repay");
    setAmt(formatUnits(x, 6, 2).replace(/,/g, ""));
  };

  return (
    <div className="nx-page">
      <Gate>
        {p.error ? <RpcErrorBanner error={p.error} onRetry={p.reload} /> : p.loading && !p.data ? <LoadingBlock /> : !pos ? (
          <Panel title={`Loan #${id}`} titleLevel={2}><p className="nx-k" data-testid="position-empty">No position with id {id}. Positions are numbered from 0 on nectar-core; open one from <Link className="nx-link" href="/borrow">Borrow</Link>.</p></Panel>
        ) : (
          <>
            <div className="nx-head-row">
              <div className="nx-stack" style={{ gap: 12 }}>
                <nav className="nx-crumb" aria-label="Breadcrumb">{notesOn ? <Link href="/notes">Portfolio</Link> : <Link href="/feed">Markets</Link>}<span aria-hidden="true">/</span><span className="nx-head" aria-current="page">Loan #{pos.id}</span></nav>
                <div className="nx-row" style={{ gap: 16 }}>
                  <img src={tokC.src} alt="" width={60} height={60} />
                  <div className="nx-stack" style={{ gap: 6 }}>
                    <div className="nx-row" style={{ gap: 10, flexWrap: "wrap" }}>
                      <h1 className="nx-title">Loan #{pos.id}</h1>
                      <NxBadge tone={statusTone} data-testid="position-status" data-status={status}>{status}</NxBadge>
                      {remote ? <><RemoteStatusBadge status={remote.remote.status} /><DepositSourceBadge source={remote.remote.source} /></> : null}
                    </div>
                    <span className="nx-k">{formatUnits(pos.units, dec)} {pos.collateral} (mock) on {remote ? "Solana devnet, settled by NEAR testnet" : "NEAR testnet"}. {sh.data ? `${sh.data.kind} Shield` : "Standard loan"}, flag line {bpsToPct(preLiq)} LTV.</span>
                  </div>
                </div>
              </div>
              <NoteLink tokenId={positionNoteId(pos.id)} />
            </div>

            {risk ? (
              <Notice tone="neg" icon="warn" title={`Health is below 1 at ${formatUsdE6(priceE6)}`} testId="risk-notice" live action={canRepay && fixRisk > 0n ? <button type="button" className="nx-btn sm" onClick={() => preset(fixRisk)}>Repay {formatUsdE6(fixRisk)}</button> : undefined}>
                Any keeper can flag this loan now. Repaying {formatUsdE6(fixRisk)} brings it back to 1.00; more gives you room.
              </Notice>
            ) : null}
            {pos.status === "Settling" ? (
              <Notice busy title="Settling with committed buyers" testId="settling-notice" live>
                A keeper flagged this loan; committed buyers are filling it in discount order. The Note cannot be transferred until this finishes.
              </Notice>
            ) : null}

            {pos.status === "Closed" ? (
              <Panel title="Closed" titleLevel={2} data-testid="position-closed">
                <p className="nx-k">This loan has no debt left: it was repaid or settled. Per-buyer settlement rows appear in the <Link className="nx-link" href="/feed#settlements-h">settlement history</Link> once the Feed indexer records the <code>settled_near</code> event.</p>
              </Panel>
            ) : (
              <div className="nx-split">
                <Panel as="section" aria-label="Health" style={{ gap: 22 }}>
                  <div className="nx-ph"><h2 className="nx-h2">Health</h2><span className="nx-k">oracle {h ? formatUsdE6(priceE6) : "—"}{h && !h.oracle_fresh ? " (stale)" : ""}</span></div>
                  <div className="nx-row" style={{ gap: 28, flexWrap: "wrap" }}>
                    <Ring value={debt > 0n ? simE4 / 10_000 : null} label="Health at the simulated price" word={debt === 0n ? "no debt" : simE4 >= 12_000 ? "comfortable" : simE4 >= 10_000 ? "tight" : "would settle"} />
                    <Stats label="At the simulated price" className="nx-grow">
                      <Stat label="At price" value={formatUsdE6(BigInt(Math.round(simP * 1e6)))} size="mid" />
                      <Stat label="LTV" value={debt > 0n ? bpsToPct(simLtv) : "0 %"} size="mid" />
                      <Stat label="To the flag line" value={debt > 0n && simP > 0 ? `${((flagN / simP - 1) * 100).toFixed(1)}%` : "n/a"} size="mid" tone={simP > caution ? "pos" : simP > flagN ? "warn" : "neg"} />
                    </Stats>
                  </div>
                  {h && debt > 0n ? (
                    <div className="nx-stack" style={{ gap: 10 }}>
                      <div className="nx-ph"><label className="nx-strong" htmlFor="sim">Simulate the {pos.collateral} price</label><button type="button" className="nx-link" onClick={() => setSim(null)}>Reset to oracle</button></div>
                      <div className="nx-runway">
                        <span className="mk flag" style={{ left: `${L(flagN)}%` }}>flag {formatUsdE6(flag)}</span>
                        <span className="mk now" style={{ left: `${L(oracle)}%` }} aria-hidden="true">oracle</span>
                        <input id="sim" className="nx-range" type="range" min={lo} max={hi} step={(hi - lo) / 400} value={simP} aria-valuetext={`${formatUsdE6(BigInt(Math.round(simP * 1e6)))}, health ${fmtH(simE4)}`} onChange={(e) => setSim(Number(e.target.value))} style={{ ["--track" as string]: runway }} />
                      </div>
                      <div className="nx-ticks" aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map((t) => <span key={t}>${Math.round(lo + (hi - lo) * t)}</span>)}</div>
                      <div className="nx-legend"><span><i style={{ background: "var(--danger)" }} />settles to committed buyers</span><span><i style={{ background: "var(--warn-bar)" }} />health 1.0 to 1.2</span><span><i className="nx-c-q" />comfortable</span></div>
                    </div>
                  ) : null}
                </Panel>

                <div className="nx-stack" style={{ gap: 20 }}>
                  {remote && (remote.remote.status === "AwaitingDeposit" || remote.remote.status === "Expired") ? (
                    <>
                      <ReservationCard pos={remote} />
                      <RemoteDeposit pos={remote} onChanged={p.reload} loadedAt={loadedAt} />
                    </>
                  ) : remote && remote.remote.status !== "Open" ? (
                    <RemoteRelease pos={remote} onChanged={p.reload} />
                  ) : remote && !canRepay ? (
                    <>
                      <RemoteOpenCard pos={remote} />
                      <RemoteRelease pos={remote} onChanged={p.reload} />
                    </>
                  ) : (
                    <Panel as="section" aria-label="Actions" style={{ gap: 18 }}>
                      <TabBar<Tab> label="Loan actions" idBase="pa" tabs={tabs} value={tab} onChange={setTab} />
                      {tab === "repay" ? (
                        <div {...tabPanelProps("pa", "repay")} className="nx-stack" style={{ gap: 16 }}>
                          {canRepay ? (
                            <>
                              <AmountBox label="You repay" note={`Debt ${formatUsdE6(debt)}`} token={<><Coin />USDC</>} input={{ value: amt, onChange: (e) => setAmt(e.target.value), placeholder: "0" }} error={amt && !amount ? "Enter a positive number" : null}
                                helper="Any excess over the debt is returned." quick={[{ label: "25%", onClick: () => preset(debt / 4n) }, { label: "50%", onClick: () => preset(debt / 2n) }, { label: "All", onClick: () => preset(debt) }]} testId="amt-repay" />
                              <div>
                                <Kvr k="Health after" v={<><span className="nx-dim">{h ? fmtH(Math.round(healthFactor(h.ltv_bps, preLiq) * 10_000)) : "—"}</span> → <span className={repE4 >= 12_000 ? "nx-pos" : "nx-warn"}>{nd > 0n ? fmtH(repE4) : "closed"}</span></>} />
                                <Kvr k="Flag price after" v={nd > 0n && h ? formatUsdE6(flagPriceUsdE6(priceE6, Number((nd * 10_000n) / (value || 1n)), preLiq)) : "none"} />
                                <Kvr k="Debt after" v={formatUsdE6(nd)} testId="debt-after" />
                              </div>
                              <button type="button" className="nx-btn lg" disabled={!amount} onClick={repay} data-testid="repay-submit">Repay {formatUsdE6(rep)}</button>
                              {remote ? <p className="nx-k">After the debt is fully repaid, request the release here and withdraw on Solana.</p> : null}
                            </>
                          ) : (
                            <p className="nx-k">{pos.status !== "Open" ? `Unavailable while ${status.toLowerCase()}.` : accountId ? "Only the borrower can repay from this page." : "Connect the borrower's wallet to repay."}</p>
                          )}
                        </div>
                      ) : (
                        <div {...tabPanelProps("pa", "pl")} className="nx-stack" style={{ gap: 16 }}>
                          {repayFirst > 0n && plSum ? (
                            <Notice icon="info" testId="pl-cap-notice" action={canRepay ? <button type="button" className="nx-link" onClick={() => preset(repayFirst)} data-testid="pl-repay-first">Repay {formatUsdE6(repayFirst)} first</button> : undefined}>
                              This needs <b className="nx-head num">{formatUsdE6(plFill ?? 0n)}</b> of voluntary fills; {pos.collateral} allows <b className="nx-head num">{formatUsdE6(plSum.daily_cap_left_usd_e6)}</b> more today.
                            </Notice>
                          ) : null}
                          <ProfitLockPanel pos={pos} health={h} decimals={dec} onSettled={p.reload} />
                        </div>
                      )}
                    </Panel>
                  )}
                  {sh.data ? <ShieldStatusCard shield={sh.data} /> : null}
                </div>
              </div>
            )}

            <Panel as="section" aria-label="Loan details">
              <Stats label="Loan details">
                <Stat label="Debt" value={formatUsdE6(debt)} size="mid" />
                <Stat label="Collateral" value={`${formatUnits(pos.units, dec)} ${pos.collateral}${h ? `, ${formatUsdE6(value)}` : ""}`} size="mid" />
                <Stat label="Flag price" value={flag > 0n ? formatUsdE6(flag) : "none"} size="mid" />
                <Stat label="Pre-liquidation LTV" value={bpsToPct(preLiq)} size="mid" />
                <Stat label="Oracle" value={h ? (h.oracle_fresh ? "fresh" : "stale") : "—"} size="mid" />
              </Stats>
              <p className="nx-k">Borrower <span className="nx-head">{pos.borrower}</span>. Mock collateral on testnet.</p>
            </Panel>
          </>
        )}
      </Gate>
    </div>
  );
}
