"use client";
import { Badge, Banner, Button, Card, Table } from "@nectar/ui";
import { bpsToPct, formatRateE6, type FeedOneClick, type FeedOneClickPair, type FeedOneClickSample } from "@nectar/sdk";
import { LoadingBlock } from "@/components/states";
import { FeedUnconfigured, type FeedApiState } from "@/components/useFeedApi";

/** "0.5×", "1×", "2×" relative to the smallest sample (which the feed takes at 0.5× notional). */
function multiple(s: FeedOneClickSample, smallest: number): string {
  if (!(smallest > 0)) return "—";
  const m = Math.round((s.notional_usd / smallest) * 50) / 100;
  return `${m}×`;
}

function pairLabel(p: FeedOneClickPair): string {
  return p.id.split("-").map((t) => t.toUpperCase()).join(" → ");
}

function asOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Route status for one asset, as sampled by the feed. Nothing is rendered when the feed did not report it. */
export function RouteStatusBadge({ status }: { status: string | null }) {
  if (status === null) return null;
  return status === "no_route" ? (
    <Badge kind="fallback" title="Absent from the 1Click token list (sampled by the Feed API); D is owner-set">no 1Click route</Badge>
  ) : (
    <Badge kind="live" title="Listed in the 1Click token list (sampled by the Feed API)">1Click route · {status}</Badge>
  );
}

function PairCard({ p }: { p: FeedOneClickPair }) {
  const samples = [...p.samples].sort((a, b) => a.notional_usd - b.notional_usd);
  const smallest = samples[0]?.notional_usd ?? 0;
  return (
    <Card
      label={pairLabel(p)}
      actions={p.verified ? <Badge kind="verified">signature verified</Badge> : <Badge kind="unverified">signature not verified</Badge>}
    >
      <Table<FeedOneClickSample>
        caption={`1Click dry quotes for ${pairLabel(p)}`}
        rows={samples}
        rowKey={(s) => String(s.notional_usd)}
        empty={<p className="dim">No samples in this set.</p>}
        columns={[
          { key: "m", header: "Size", cell: (s) => <span className="row"><span>{multiple(s, smallest)}</span> <span className="dim">${s.notional_usd.toLocaleString("en-US")}</span></span> },
          { key: "r", header: "Rate (out per in)", align: "right", cell: (s) => <span className="mono">{formatRateE6(s.rate_e6)}</span> },
          { key: "i", header: "Impact", align: "right", cell: (s) => bpsToPct(s.impact_bps) },
          { key: "w", header: "Worst case (minAmountOut)", align: "right", cell: (s) => bpsToPct(s.worst_impact_bps) },
        ]}
      />
    </Card>
  );
}

/** "1Click reference depth": dry quotes sampled by services/feed (GET /api/oneclick). Never shows a badge the feed did not report. */
export function OneClickPanel({ state }: { state: FeedApiState<FeedOneClick> }) {
  const d = state.data;
  return (
    <section className="stack" aria-labelledby="oneclick-h">
      <h2 id="oneclick-h">1Click reference depth</h2>
      {state.loading ? (
        <LoadingBlock lines={3} />
      ) : state.unconfigured ? (
        <FeedUnconfigured what="1Click reference samples" />
      ) : state.error || !d ? (
        <Banner tone="warn" title="1Click data unavailable" actions={<Button size="sm" onClick={state.reload}>Retry</Button>}>
          The Feed API did not return 1Click samples{state.error ? <>: <span className="mono">{state.error}</span></> : null}. No depth or route status is shown.
        </Banner>
      ) : (
        <>
          <p className="row small">
            <span className="dim">As of</span> <span className="mono">{asOf(d.as_of)}</span>
          </p>
          {d.pairs.length === 0 ? (
            <Card><p>No verified 1Click sample sets yet. The feed drops any set whose quote signature fails to verify.</p></Card>
          ) : (
            d.pairs.map((p) => <PairCard key={p.id} p={p} />)
          )}
          {d.assets.length > 0 ? (
            <dl className="kvs" aria-label="1Click route status by asset">
              {d.assets.map((a) => (
                <div className="kv" key={a.symbol}>
                  <dt>{a.symbol}</dt>
                  <dd style={{ margin: 0 }}><RouteStatusBadge status={a.status} /></dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      )}
      <p className="caption">
        Dry quotes only (<code>dry: true</code>, no deposit) at 0.5×, 1× and 2× of the reference notional. Impact = 1 − rate(n) / rate(0.5×) from amountOut; worst case uses minAmountOut. Reference pairs, not the mock collateral.
      </p>
    </section>
  );
}
