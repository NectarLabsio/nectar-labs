"use client";
import Link from "next/link";
import { Badge, Card, Table, TxLink } from "@nectar/ui";
import {
  bpsToPct,
  exitGapUsdE6,
  formatUsdE6,
  safeHttpsUrl,
  E18,
  valueUsdE6WithMultiplier,
  type CollateralView,
  type ExitCapacity,
  oneClickRouteStatus,
  type FeedOneClick,
  type FeedSettlement,
  type FeedSettlements,
  type QuoterConfigView,
} from "@nectar/sdk";
import { useChain, useView } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { EquationCard } from "@/components/EquationCard";
import { SessionBadge } from "@/components/Session";
import { OracleBadge, optionalView, pricingLabel } from "@/components/OracleBadge";
import { FeedApiNotice, useFeedApi } from "@/components/useFeedApi";
import { OneClickPanel, RouteStatusBadge } from "@/components/OneClickPanel";
import { txUrl } from "@/lib/env";

interface Row { c: CollateralView; cap: ExitCapacity; atStake: bigint; gap: bigint; upliftBps: number; upliftUsd: bigint }
interface Data { rows: Row[]; quoter: QuoterConfigView | null }

export default function FeedPage() {
  const { config } = useChain();
  const data = useView<Data>(async (v) => {
    const [cs, ps, quoter] = await Promise.all([v.listCollaterals(0, 50), v.listPositions(0, 200), optionalView(v.getQuoterConfig())]);
    const rows = await Promise.all(
      cs.map(async (c) => {
        const cap = await v.getExitCapacity(c.symbol);
        const units = ps.filter((p) => p.collateral === c.symbol && p.status !== "Closed").reduce((a, p) => a + BigInt(p.units), 0n);
        const atStake = valueUsdE6WithMultiplier(units, BigInt(cap.oracle_price_usd_e6), c.decimals, cap.multiplier_e18 ? BigInt(cap.multiplier_e18) : E18, cap.price_kind);
        const upliftBps = Math.max(0, cap.limit_bps_effective - c.base_ltv_bps);
        return { c, cap, atStake, gap: exitGapUsdE6(atStake, cap), upliftBps, upliftUsd: (atStake * BigInt(upliftBps)) / 10_000n };
      }),
    );
    return { rows, quoter };
  }, []);
  const settlements = useFeedApi<FeedSettlements>("api/settlements?limit=20");
  const oneclick = useFeedApi<FeedOneClick>("api/oneclick");
  const first = data.data?.rows[0];
  const firstCfg = config.collaterals.find((c) => c.symbol === first?.c.symbol) ?? config.collaterals[0];
  const pricing = pricingLabel(data.data?.quoter);
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Nectar Feed</span>
        <h1>Exit capacity by market</h1>
        <p className="lead">Committed quotes, the Nectar Reserve and verified DEX depth per collateral, and the limit they support. Read from nectar-core on NEAR testnet.</p>
      </div>
      <div className="stack-lg">
        <EquationCard symbol={first?.c.symbol} cap={first?.cap} col={firstCfg} />
        <Gate>
          {data.error ? (
            <RpcErrorBanner error={data.error} onRetry={data.reload} />
          ) : data.loading ? (
            <LoadingBlock lines={4} />
          ) : (
            <>
              <p className="row small">
                <span className="dim">Settlement pricing:</span> <Badge kind={pricing.live ? "live" : "fallback"}>{pricing.text}</Badge>
              </p>
              <Table<Row>
                caption="Exit capacity per collateral"
                rows={data.data?.rows ?? []}
                rowKey={(r) => r.c.symbol}
                empty={<Card><p>No collateral listed yet. The owner adds assets with <code>upsert_collateral</code>.</p></Card>}
                columns={[
                  { key: "sym", header: "Asset", cell: (r) => <span className="row">{r.c.symbol} <Badge kind="mock">mock</Badge></span>, sort: (r) => r.c.symbol },
                  { key: "at", header: "At stake", align: "right", cell: (r) => formatUsdE6(r.atStake, 0), sort: (r) => r.atStake },
                  { key: "q", header: "Committed Q", align: "right", cell: (r) => formatUsdE6(r.cap.q_usd_e6, 0), sort: (r) => BigInt(r.cap.q_usd_e6) },
                  { key: "r", header: "Nectar Reserve R", align: "right", cell: (r) => formatUsdE6(r.cap.r_usd_e6, 0) },
                  {
                    key: "d",
                    header: "Verified DEX depth D",
                    align: "right",
                    cell: (r) => (
                      <span className="stack-sm">
                        {formatUsdE6(r.cap.d_usd_e6, 0)}
                        <RouteStatusBadge status={oneClickRouteStatus(oneclick.data, r.c.symbol)} />
                      </span>
                    ),
                  },
                  { key: "g", header: "Exit gap", align: "right", cell: (r) => formatUsdE6(r.gap, 0), sort: (r) => r.gap },
                  { key: "u", header: "Uplift", align: "right", cell: (r) => `+${bpsToPct(r.upliftBps)} · ${formatUsdE6(r.upliftUsd, 0)}`, sort: (r) => r.upliftBps },
                  { key: "h", header: "Haircut", align: "right", cell: (r) => bpsToPct(r.cap.haircut_bps) },
                  { key: "s", header: "Session", cell: (r) => <SessionBadge cap={r.cap} /> },
                  { key: "o", header: "Oracle", cell: (r) => <OracleBadge cap={r.cap} /> },
                  { key: "l", header: "Effective limit", align: "right", cell: (r) => <b>{bpsToPct(r.cap.limit_bps_effective)}</b>, sort: (r) => r.cap.limit_bps_effective },
                  { key: "a", header: "", cell: (r) => <Link className="link" href={`/borrow?c=${encodeURIComponent(r.c.symbol)}`}>Borrow</Link> },
                ]}
              />
            </>
          )}
          <p className="caption">
            Exit gap = collateral at stake − (Q + R + D). Uplift (limit uplift) = effective limit − static base LTV. Weekend parameters: D counts 0 and the weekend haircut applies. Owner oracle on testnet unless a Pyth source is set (disclosed); mock collateral.
          </p>
        </Gate>
        <OneClickPanel state={oneclick} />
        <section className="stack" aria-labelledby="settlements-h">
          <h2 id="settlements-h">Settlement history</h2>
          <FeedApiNotice state={settlements} what="Settlements" />
          {settlements.loading ? (
            <LoadingBlock lines={3} />
          ) : settlements.data ? (
            <Table<FeedSettlement>
              caption="Recent pre-liquidation settlements"
              rows={settlements.data.items}
              rowKey={(s) => `${s.position_id}-${s.quote_id ?? "v"}-${s.block_height ?? s.observed_at}`}
              empty={<Card><p>No settlements yet. A keeper triggers one when a position crosses its pre-liquidation LTV.</p></Card>}
              columns={[
                { key: "p", header: "Position", cell: (s) => <Link className="link" href={`/position/${s.position_id}`}>#{s.position_id}</Link> },
                { key: "q", header: "Quote", cell: (s) => (s.quote_id ? `#${s.quote_id}` : "—") },
                { key: "d", header: "disc_bps", align: "right", cell: (s) => (s.disc_bps ?? "—"), sort: (s) => s.disc_bps ?? -1 },
                { key: "r", header: "Repaid", align: "right", cell: (s) => (s.repay_usd_e6 ? formatUsdE6(s.repay_usd_e6) : "—") },
                {
                  key: "pr",
                  header: "Pricing",
                  cell: (s) => (s.quoter === "result" ? <Badge kind="verified">quoter</Badge> : s.quoter === "fallback" ? <Badge kind="warn">quoter fallback</Badge> : <Badge kind="fallback">static</Badge>),
                },
                {
                  key: "ol",
                  header: "OutLayer",
                  cell: (s) => {
                    const u = safeHttpsUrl(s.outlayer_execution_url);
                    return u ? <a className="link" href={u} target="_blank" rel="noreferrer noopener">execution</a> : <span className="dim">—</span>;
                  },
                },
                { key: "t", header: "Tx", cell: (s) => (s.tx_hash ? <TxLink href={txUrl(s.tx_hash)}>{s.tx_hash.slice(0, 8)}…</TxLink> : s.status ?? "—") },
                { key: "at", header: "Seen", cell: (s) => new Date(s.observed_at).toISOString().slice(0, 16).replace("T", " ") },
              ]}
            />
          ) : null}
          <p className="caption">OutLayer execution links appear only when the Feed API reports one for that settlement.</p>
        </section>
      </div>
    </div>
  );
}
