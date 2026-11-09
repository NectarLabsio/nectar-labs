"use client";
import Link from "next/link";
import { Badge, Card, FormulaBlock, Table } from "@nectar/ui";
import { bpsToPct, computeLimit, formatUsdE6, type CollateralView, type ExitCapacity } from "@nectar/sdk";
import { useChain, useView } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { CramerFormula, FORMULA_TERMS } from "@/components/Formula";

interface Row { c: CollateralView; cap: ExitCapacity }

export default function FeedPage() {
  const { config } = useChain();
  const rows = useView<Row[]>(async (v) => {
    const cs = await v.listCollaterals(0, 50);
    return Promise.all(cs.map(async (c) => ({ c, cap: await v.getExitCapacity(c.symbol) })));
  }, []);
  const first = rows.data?.[0];
  const firstCfg = config.collaterals[0];
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
          {rows.error ? (
            <RpcErrorBanner error={rows.error} onRetry={rows.reload} />
          ) : rows.loading ? (
            <LoadingBlock lines={4} />
          ) : (
            <Table<Row>
              caption="Exit capacity per collateral"
              rows={rows.data ?? []}
              rowKey={(r) => r.c.symbol}
              empty={<Card><p>No collateral listed yet. The owner adds assets with <code>upsert_collateral</code>.</p></Card>}
              columns={[
                { key: "sym", header: "Asset", cell: (r) => <span className="row">{r.c.symbol} <Badge kind="mock">mock</Badge></span>, sort: (r) => r.c.symbol },
                { key: "q", header: "Committed Q", align: "right", cell: (r) => formatUsdE6(r.cap.q_usd_e6, 0), sort: (r) => BigInt(r.cap.q_usd_e6) },
                { key: "d", header: "DEX depth D", align: "right", cell: (r) => formatUsdE6(r.cap.d_usd_e6, 0) },
                { key: "r", header: "Reserve R", align: "right", cell: (r) => formatUsdE6(r.cap.r_usd_e6, 0) },
                { key: "h", header: "Haircut", align: "right", cell: (r) => bpsToPct(r.cap.haircut_bps) },
                { key: "s", header: "Session", cell: (r) => <Badge kind={r.cap.session_open ? "live" : "warn"}>{r.cap.session_open ? "open" : "closed"}</Badge> },
                { key: "o", header: "Oracle", cell: (r) => <Badge kind={r.cap.oracle_fresh ? "good" : "stale"}>{r.cap.oracle_fresh ? `fresh · ${r.cap.oracle_age_s}s` : `stale · ${r.cap.oracle_age_s}s`}</Badge> },
                { key: "l", header: "Effective limit", align: "right", cell: (r) => <b>{bpsToPct(r.cap.limit_bps_effective)}</b>, sort: (r) => r.cap.limit_bps_effective },
                { key: "a", header: "", cell: (r) => <Link className="link" href={`/borrow?c=${encodeURIComponent(r.c.symbol)}`}>Borrow</Link> },
              ]}
            />
          )}
          <p className="caption">Owner oracle on testnet (disclosed). No 1Click route exists for NVDAx today (F-063). 7-day history arrives with the indexer.</p>
        </Gate>
      </div>
    </div>
  );
}
