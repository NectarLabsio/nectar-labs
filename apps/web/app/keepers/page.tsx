"use client";
import Link from "next/link";
import { Badge, Card, StatusPill, Table, TxLink } from "@nectar/ui";
import { bpsToPct, formatUsdE6, type FeedHealth, type FeedSettlement, type FeedSettlements, type HealthView, type PositionView } from "@nectar/sdk";
import { useChain, useView } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { EventsNotIndexed, FeedApiNotice, eventsUnindexed, useFeedApi } from "@/components/useFeedApi";
import { txUrl } from "@/lib/env";

interface Row { p: PositionView; h: HealthView | null }

const SNIPPET = `# Run a keeper (testnet). Function-call key only: trigger_preliquidation, relay_settlement_result.
cp .env.example .env            # KEEPER_ACCOUNT_ID, KEEPER_KEY_PATH (0600 file under ~/.nectar/)
pnpm install
pnpm --filter keeper start      # polls get_health, calls trigger_preliquidation(position_id)`;

export default function KeepersPage() {
  const { config } = useChain();
  const rows = useView<Row[]>(async (v) => {
    const ps = await v.listPositions(0, 50);
    return Promise.all(ps.map(async (p) => ({ p, h: p.status === "Open" ? await v.getHealth(p.id) : null })));
  }, []);
  const triggers = useFeedApi<FeedSettlements>("api/settlements?limit=20");
  const health = useFeedApi<FeedHealth>("healthz");
  const unindexed = eventsUnindexed(health.data);
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Nectar Keepers</span>
        <h1>Operators and triggers</h1>
        <p className="lead">Any keeper may call <code>trigger_preliquidation(position_id)</code> when a position crosses its pre-liquidation LTV. Keeper account: <span className="mono">{config.keeper ?? "pending deployment"}</span>.</p>
      </div>
      <div className="stack-lg">
        <section className="stack" aria-labelledby="triggers-h">
          <h2 id="triggers-h" className="row">
            Last triggers{" "}
            {health.data ? <Badge kind={health.data.ok ? "live" : "stale"}>{health.data.ok ? `indexer live · block ${health.data.last_block_seen ?? "—"}` : "indexer stale"}</Badge> : null}
          </h2>
          {unindexed ? <EventsNotIndexed what="past keeper triggers" /> : null}
          <FeedApiNotice state={triggers} what="Keeper triggers" />
          {triggers.loading ? <LoadingBlock lines={3} /> : triggers.data ? (
            <Table<FeedSettlement>
              caption={unindexed ? "Triggers observed through views since this host started" : "Recent triggers and settlements from the Feed API"}
              rows={triggers.data.items}
              rowKey={(s) => `${s.position_id}-${s.quote_id ?? "v"}-${s.block_height ?? s.observed_at}`}
              empty={unindexed ? <p className="small" data-testid="triggers-views-empty">None observed through views since this host started.</p> : <Card><p>No triggers yet.</p></Card>}
              columns={[
                { key: "p", header: "Position", cell: (s) => <Link className="link" href={`/position/${s.position_id}`}>#{s.position_id}</Link> },
                { key: "k", header: "Keeper", cell: (s) => <span className="mono">{s.keeper ?? config.keeper ?? "—"}</span> },
                { key: "d", header: "disc_bps", align: "right", cell: (s) => s.disc_bps ?? "—" },
                { key: "t", header: "Tx", cell: (s) => (s.tx_hash ? <TxLink href={txUrl(s.tx_hash)}>{s.tx_hash.slice(0, 8)}…</TxLink> : s.status ?? "—") },
                { key: "at", header: "Seen", cell: (s) => new Date(s.observed_at).toISOString().slice(0, 16).replace("T", " ") },
              ]}
            />
          ) : null}
        </section>
        <Gate>
          <h2>Positions and trigger status</h2>
          {rows.error ? <RpcErrorBanner error={rows.error} onRetry={rows.reload} /> : rows.loading ? <LoadingBlock /> : (
            <Table<Row>
              caption="Positions and trigger status, from get_health"
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
        <Card label="Run a keeper">
          <pre className="codeblock mono">{SNIPPET}</pre>
          <p className="caption">Keeper keys are function-call keys; a full-access key is refused at startup. Testnet only.</p>
        </Card>
      </div>
    </div>
  );
}
