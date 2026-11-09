"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Kv, StatusPill, type PositionPill } from "@nectar/ui";
import { bpsToPct, formatUnits, formatUsdE6, parseUnits, tx, type HealthView, type PositionView } from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";

export default function PositionPage() {
  const { id } = useParams<{ id: string }>();
  const { config } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const p = useView<{ pos: PositionView | null; h: HealthView | null }>(async (v) => {
    const pos = await v.getPosition(id);
    return { pos, h: pos && pos.status !== "Closed" ? await v.getHealth(id) : null };
  }, [id]);
  const [amt, setAmt] = useState("");
  const pos = p.data?.pos;
  const h = p.data?.h;
  const col = config.collaterals.find((c) => c.symbol === pos?.collateral);
  const pill: PositionPill = !pos ? "open" : pos.status === "Closed" ? "closed" : pos.status === "Settling" ? "settling" : h?.triggerable ? "at-risk" : "open";
  let amount: bigint | null = null;
  try {
    amount = amt.trim() ? parseUnits(amt, 6) : null;
  } catch {
    amount = null;
  }
  const repay = async () => {
    if (!config.usdc || !config.core || !pos || !amount) return;
    await sign(tx.repay(config.usdc, config.core, amount.toString(), pos.id), { success: "Repaid" });
    p.reload();
  };
  return (
    <div className="page wrap">
      <div className="page-head"><span className="label">Position</span><h1>Position #{id}</h1></div>
      <Gate>
        {p.error ? <RpcErrorBanner error={p.error} onRetry={p.reload} /> : p.loading ? <LoadingBlock /> : !pos ? <Card><p>No position with id {id}.</p></Card> : (
          <div className="grid-2">
            <Card label={`${pos.collateral} · mock`} actions={<StatusPill status={pill} />}>
              <div className="kvs" aria-live="polite">
                <Kv k="Borrower" v={pos.borrower} />
                <Kv k="Collateral" v={`${formatUnits(pos.units, col?.decimals ?? 6)} ${pos.collateral}`} />
                <Kv k="Debt" v={formatUsdE6(pos.debt_usd_e6)} />
                <Kv k="Value" v={h ? formatUsdE6(h.value_usd_e6) : "—"} />
                <Kv k="LTV" v={h ? bpsToPct(h.ltv_bps) : "—"} />
                <Kv k="Pre-liquidation LTV" v={bpsToPct(pos.pre_liq_ltv_bps)} />
                <Kv k="Oracle" v={h ? (h.oracle_fresh ? "fresh" : "stale") : "—"} />
              </div>
            </Card>
            {pos.status === "Open" && accountId === pos.borrower ? (
              <Card label="Repay">
                <div className="stack">
                  <Field label="Amount" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} unit="USDC" hint="Any excess over the debt is returned." error={amt && !amount ? "Enter a positive number" : undefined} />
                  <Button variant="primary" disabled={!amount} onClick={repay}>Repay</Button>
                </div>
              </Card>
            ) : <Card label="Settlement"><p className="small">Settlement waterfall details appear here once the indexer records <code>settled_near</code> events for this position.</p></Card>}
          </div>
        )}
      </Gate>
    </div>
  );
}
