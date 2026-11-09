"use client";
import Link from "next/link";
import { Badge, Card, FormulaBlock, Table, TxLink } from "@nectar/ui";
import {
  bpsToPct,
  computeLimit,
  exitGapUsdE6,
  formatUsdE6,
  safeHttpsUrl,
  valueUsdE6,
  type CollateralView,
  type ExitCapacity,
  type FeedSettlement,
  type FeedSettlements,
  type QuoterConfigView,
} from "@nectar/sdk";
import { useChain, useView } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { CramerFormula, FORMULA_TERMS } from "@/components/Formula";
import { NO_1CLICK_ROUTE, OracleBadge, optionalView, pricingLabel } from "@/components/OracleBadge";
import { FeedApiNotice, useFeedApi } from "@/components/useFeedApi";
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
        const atStake = valueUsdE6(units, BigInt(cap.oracle_price_usd_e6), c.decimals);
        const upliftBps = Math.max(0, cap.limit_bps_effective - c.base_ltv_bps);
        return { c, cap, atStake, gap: exitGapUsdE6(atStake, cap), upliftBps, upliftUsd: (atStake * BigInt(upliftBps)) / 10_000n };
      }),
    );
    return { rows, quoter };
  }, []);
  const settlements = useFeedApi<FeedSettlements>("api/settlements?limit=20");
  const first = data.data?.rows[0];
  const firstCfg = config.collaterals[0];
  const pricing = pricingLabel(data.data?.quoter);
  let live: React.ReactNode = null;
  if (first) {
    const cap = first.cap;
    const r = computeLimit({
      units: 10n ** BigInt(first.c.decimals),
      price_usd_e6: BigInt(cap.oracle_price_usd_e6),
      decimals: first.c.decimals,
      base_ltv_bps: first.c.base_ltv_bps,
      max_nectar_ltv_bps: first.c.max_nectar_ltv_bps,
      base_haircut_bps: first.c.base_haircut_bps,
      weekend_haircut_bps: first.c.weekend_haircut_bps,
      limit_premium_bps: first.c.limit_premium_bps,
      session_open: cap.session_open,
      q_usd_e6: BigInt(cap.q_usd_e6),
      r_usd_e6: BigInt(cap.r_usd_e6),
      d_usd_e6: BigInt(cap.d_usd_e6),
    });
    live = (
      <>
        {first.c.symbol}: capacity term = (1 − {bpsToPct(r.haircut_bps)}) · ({formatUsdE6(cap.q_usd_e6, 0)} + {formatUsdE6(cap.r_usd_e6, 0)} + {formatUsdE6(r.d_effective_usd_e6, 0)}) ={" "}
        {formatUsdE6(r.capacity_cap_usd_e6, 0)} · LTV cap {bpsToPct(first.c.max_nectar_ltv_bps)} of V<sub>c</sub> · effective limit {bpsToPct(cap.limit_bps_effective)}
      </>
    );
  }
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Nectar Feed</span>
        <h1>Exit capacity by market</h1>
        <p className="lead">Committed bids, DEX depth and reserve per collateral, and the limit they support. Read live from nectar-core on NEAR testnet.</p>
      </div>
      <div className="stack-lg">
        <Card label="Cramér limit (PRD §4.2)" tone="tint">
          <FormulaBlock formula={<CramerFormula />} live={live} caption={firstCfg ? `Config: LTV ${bpsToPct(firstCfg.max_nectar_ltv_bps)}, haircut ${bpsToPct(firstCfg.base_haircut_bps)} in session / ${bpsToPct(firstCfg.weekend_haircut_bps)} closed, base ${bpsToPct(firstCfg.base_ltv_bps)}.` : undefined} />
          <dl className="kvs" style={{ marginTop: 12 }}>
            {FORMULA_TERMS.map(([k, v], i) => (
              <div className="kv" key={i}><dt>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>
            ))}
          </dl>
        </Card>
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
                  { key: "r", header: "Reserve R", align: "right", cell: (r) => formatUsdE6(r.cap.r_usd_e6, 0) },
                  {
                    key: "d",
                    header: "DEX depth D",
                    align: "right",
                    cell: (r) => (
                      <span className="stack-sm">
                        {formatUsdE6(r.cap.d_usd_e6, 0)}
                        {NO_1CLICK_ROUTE.has(r.c.symbol) ? <Badge kind="fallback" title="No 1Click route for this asset (F-063); D is owner-set">no 1Click route</Badge> : null}
                      </span>
                    ),
                  },
                  { key: "g", header: "Exit gap", align: "right", cell: (r) => formatUsdE6(r.gap, 0), sort: (r) => r.gap },
                  { key: "u", header: "Uplift", align: "right", cell: (r) => `+${bpsToPct(r.upliftBps)} · ${formatUsdE6(r.upliftUsd, 0)}`, sort: (r) => r.upliftBps },
                  { key: "h", header: "Haircut", align: "right", cell: (r) => bpsToPct(r.cap.haircut_bps) },
                  { key: "s", header: "Session", cell: (r) => <Badge kind={r.cap.session_open ? "live" : "warn"}>{r.cap.session_open ? "open" : "closed"}</Badge> },
                  { key: "o", header: "Oracle", cell: (r) => <OracleBadge cap={r.cap} /> },
                  { key: "l", header: "Effective limit", align: "right", cell: (r) => <b>{bpsToPct(r.cap.limit_bps_effective)}</b>, sort: (r) => r.cap.limit_bps_effective },
                  { key: "a", header: "", cell: (r) => <Link className="link" href={`/borrow?c=${encodeURIComponent(r.c.symbol)}`}>Borrow</Link> },
                ]}
              />
            </>
          )}
          <p className="caption">
            Exit gap = collateral at stake − (Q + R + D). Uplift = effective limit − static base LTV. Owner oracle on testnet unless a Pyth source is set (disclosed); mock collateral.
          </p>
        </Gate>
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
