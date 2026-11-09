"use client";
import { useMemo, useState } from "react";
import { Banner, Button, Card, Field, Kv, SelectField } from "@nectar/ui";
import { bpsToPct, computeLimit, formatUnits, formatUsdE6, health, parseUnits, premiumUsdE6, shockPrice, tx, type BorrowPreview, type ExitCapacity } from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { FaucetLink, Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useBalance } from "@/components/useBalance";
import { CopilotPanel } from "@/components/CopilotPanel";

const tryParse = (s: string, d: number): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, d) : null;
  } catch {
    return null;
  }
};

export default function BorrowPage() {
  const { config } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const [key, setKey] = useState(config.collaterals[0]?.key ?? "");
  const col = config.collaterals.find((c) => c.key === key) ?? config.collaterals[0];
  const [unitsIn, setUnitsIn] = useState("");
  const [borrowIn, setBorrowIn] = useState("");
  const [preLiq, setPreLiq] = useState(col ? Math.round((col.pre_liq_min_bps + col.pre_liq_max_bps) / 2) : 7500);
  const units = col ? tryParse(unitsIn, col.decimals) : null;
  const borrow = tryParse(borrowIn, 6);
  const cap = useView<ExitCapacity>(col ? (v) => v.getExitCapacity(col.symbol) : null, [col?.symbol]);
  const preview = useView<BorrowPreview>(col && units && borrow ? (v) => v.previewBorrow(col.symbol, units.toString(), borrow.toString()) : null, [col?.symbol, units?.toString(), borrow?.toString()]);
  const bal = useBalance(col?.token ?? null);

  const local = useMemo(() => {
    if (!col || !cap.data || !units) return null;
    const price = BigInt(cap.data.oracle_price_usd_e6);
    const lim = computeLimit({ ...col, units, price_usd_e6: price, session_open: cap.data.session_open, q_usd_e6: BigInt(cap.data.q_usd_e6), r_usd_e6: BigInt(cap.data.r_usd_e6), d_usd_e6: BigInt(cap.data.d_usd_e6) });
    const prem = borrow ? premiumUsdE6(borrow, lim.static_limit_usd_e6, col.limit_premium_bps) : 0n;
    const shocks = [0, -500, -1000, -2000].map((s) => ({ s, h: borrow ? health(units, shockPrice(price, s), col.decimals, borrow, preLiq) : null }));
    return { lim, prem, shocks };
  }, [col, cap.data, units, borrow, preLiq]);

  const preLiqErr = col && (preLiq < col.pre_liq_min_bps || preLiq > col.pre_liq_max_bps) ? `Between ${bpsToPct(col.pre_liq_min_bps)} and ${bpsToPct(col.pre_liq_max_bps)}` : null;
  const canSign = Boolean(accountId && col?.token && config.core && units && borrow && preview.data?.ok && !preLiqErr && bal.data !== undefined && units <= bal.data);

  const submit = async () => {
    if (!col?.token || !config.core || !units || !borrow) return;
    await sign(tx.borrow(col.token, config.core, units.toString(), { collateral: col.symbol, borrow_usd_e6: borrow.toString(), pre_liq_ltv_bps: preLiq }), {
      success: "Position opened",
      summary: preview.data ? <div className="kvs"><Kv k="Premium (deducted from proceeds)" v={formatUsdE6(preview.data.premium_usd_e6)} /><Kv k="You receive" v={formatUsdE6(borrow - BigInt(preview.data.premium_usd_e6))} /></div> : null,
    });
    bal.reload();
  };

  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Console · Borrow</span>
        <h1>Borrow against mock NVDAx</h1>
        <p className="lead">Lock collateral, borrow USDC up to the Cramér limit. The amount above the static limit carries the limit premium, taken up front from proceeds.</p>
      </div>
      <Gate wallet action="borrow" blockOnPause>
        <div className="grid-2">
          <Card label="Position">
            <div className="stack">
              {config.collaterals.length > 1 ? <SelectField label="Collateral" value={key} onChange={setKey} options={config.collaterals.map((c) => ({ value: c.key, label: `${c.symbol} (mock)` }))} /> : null}
              <Field label={`Collateral units (${col?.symbol ?? ""})`} inputMode="decimal" value={unitsIn} onChange={(e) => setUnitsIn(e.target.value)} unit={col?.symbol}
                hint={bal.data !== undefined && col ? `Balance ${formatUnits(bal.data, col.decimals)} ${col.symbol}` : undefined}
                error={unitsIn && !units ? "Enter a positive number" : units && bal.data !== undefined && units > bal.data ? "More than your balance" : undefined} />
              <Field label="Borrow" inputMode="decimal" value={borrowIn} onChange={(e) => setBorrowIn(e.target.value)} unit="USDC" error={borrowIn && !borrow ? "Enter a positive number" : undefined} />
              <Field label="Pre-liquidation LTV" type="number" value={preLiq} onChange={(e) => setPreLiq(Number(e.target.value))} unit="bps" error={preLiqErr ?? undefined}
                hint="Keepers may trigger settlement when debt / value rises above this." />
              {accountId && bal.data === 0n && col ? <FaucetLink token={`${col.symbol} (mock)`} /> : null}
              <Button variant="primary" disabled={!canSign} onClick={submit}>Lock collateral and borrow</Button>
            </div>
          </Card>
          <Card label="Preview" live={Boolean(preview.data)}>
            {cap.error ? <RpcErrorBanner error={cap.error} onRetry={cap.reload} /> : cap.loading ? <LoadingBlock /> : null}
            {!units || !borrow ? <p className="dim">Enter units and an amount to see the limit, premium and health.</p> : null}
            {preview.error ? <RpcErrorBanner error={preview.error} onRetry={preview.reload} /> : null}
            {preview.data && !preview.data.ok ? <Banner tone="danger" title="Over the limit">{preview.data.reason ?? "Borrow exceeds B_c or the pool."} Limit B<sub>c</sub> = {formatUsdE6(preview.data.b_c_usd_e6)}.</Banner> : null}
            {preview.data ? (
              <div className="kvs" aria-live="polite">
                <Kv k="Limit B_c (contract)" v={formatUsdE6(preview.data.b_c_usd_e6)} />
                <Kv k="Static limit" v={formatUsdE6(preview.data.static_limit_usd_e6)} />
                <Kv k="Premium" v={`${formatUsdE6(preview.data.premium_usd_e6)} (${col ? bpsToPct(col.limit_premium_bps) : ""} above static)`} />
                {local ? <Kv k="Binding term" v={local.lim.binding === "ltv" ? "LTV ceiling" : "committed capacity"} /> : null}
              </div>
            ) : null}
            {local?.shocks[0]?.h ? (
              <div className="stack-sm" style={{ marginTop: 14 }}>
                <span className="label">Health under price shocks</span>
                {local.shocks.map(({ s, h }) => (
                  <Kv key={s} k={s === 0 ? "Now" : `${s / 100} %`} v={h ? <span className={h.triggerable ? "danger-text" : undefined}>LTV {bpsToPct(h.ltv_bps)}{h.triggerable ? " · keeper may act" : ""}</span> : "—"} />
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      </Gate>
      <CopilotPanel />
    </div>
  );
}
