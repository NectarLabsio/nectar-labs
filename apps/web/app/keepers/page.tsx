"use client";
import Link from "next/link";
import { Banner, Card, StatusPill, Table } from "@nectar/ui";
import { bpsToPct, formatUsdE6, type HealthView, type PositionView } from "@nectar/sdk";
import { useChain, useView } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";

interface Row { p: PositionView; h: HealthView | null }

export default function KeepersPage() {
  const { config } = useChain();
  const rows = useView<Row[]>(async (v) => {
    const ps = await v.listPositions(0, 50);
    return Promise.all(ps.map(async (p) => ({ p, h: p.status === "Open" ? await v.getHealth(p.id) : null })));
  }, []);
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Nectar Keepers</span>
        <h1>Operators and triggers</h1>
        <p className="lead">Any keeper may call <code>trigger_preliquidation(position_id)</code> when a position crosses its pre-liquidation LTV. Keeper account: <span className="mono">{config.keeper ?? "pending deployment"}</span>.</p>
      </div>
      <Gate>
        <Banner tone="info" title="Keeper run history arrives with the indexer">Until then this page lists open positions and whether each is triggerable right now, straight from <code>get_health</code>.</Banner>
        {rows.error ? <RpcErrorBanner error={rows.error} onRetry={rows.reload} /> : rows.loading ? <LoadingBlock /> : (
          <Table<Row>
            caption="Positions and trigger status"
            rows={rows.data ?? []}
            rowKey={(r) => r.p.id}
            empty={<Card><p>No positions yet.</p></Card>}
            columns={[
              { key: "id", header: "Position", cell: (r) => <Link className="link" href={`/position/${r.p.id}`}>#{r.p.id}</Link> },
              { key: "c", header: "Asset", cell: (r) => r.p.collateral },
              { key: "d", header: "Debt", align: "right", cell: (r) => formatUsdE6(r.p.debt_usd_e6), sort: (r) => BigInt(r.p.debt_usd_e6) },
              { key: "l", header: "LTV / trigger", align: "right", cell: (r) => (r.h ? `${bpsToPct(r.h.ltv_bps)} / ${bpsToPct(r.h.pre_liq_ltv_bps)}` : "—") },
              { key: "s", header: "Status", cell: (r) => <StatusPill status={r.p.status === "Closed" ? "closed" : r.p.status === "Settling" ? "settling" : r.h?.triggerable ? "at-risk" : "open"} /> },
            ]}
          />
        )}
      </Gate>
    </div>
  );
}
