"use client";
import { Badge, Button, Skeleton, Stat } from "@nectar/ui";
import { aggregateCapacity, bpsToPct, formatUsdE6, sessionHeadline, sessionReasonText, sessionStatus, type CollateralView, type ExitCapacity } from "@nectar/sdk";
import { useChain, useView } from "./AppProvider";
import { SessionBadge } from "./Session";

const BPS = 10_000n;

/** Stat tiles on the landing page. Read from get_exit_capacity / list_quotes when deployed; otherwise says so. */
export function LandingStats() {
  const { deployed, config } = useChain();
  const sym = config.collaterals[0]?.symbol ?? "NVDAx";
  const cap = useView<ExitCapacity>((v) => v.getExitCapacity(sym), [sym]);
  const quotes = useView((v) => v.listQuotes(sym, 0, 64), [sym]);
  const pending = !deployed;
  const err = cap.error || quotes.error;
  const note = pending ? "awaiting testnet deployment" : err ? "RPC error, retry later" : `${sym} · NEAR testnet`;
  const live = Boolean(cap.data);
  const base = config.collaterals[0]?.base_ltv_bps ?? 0;
  const s = cap.data ? sessionStatus(cap.data, config.v7.session_stale_s) : null;
  return (
    <div className="stats" aria-live="polite">
      <div className="wrap">
        <Stat label="Committed quotes" value={live ? formatUsdE6(cap.data!.q_usd_e6, 0) : "—"} delta={note} loading={cap.loading} />
        <Stat
          label="Effective limit"
          value={live ? bpsToPct(cap.data!.limit_bps_effective) : "—"}
          delta={live ? `static ${bpsToPct(base)} → ${bpsToPct(cap.data!.limit_bps_effective)} LTV` : note}
          deltaUp={live}
          loading={cap.loading}
        />
        <Stat label="Quotes" value={quotes.data ? String(quotes.data.length) : "—"} delta={quotes.data ? "funded, including those giving notice" : note} loading={quotes.loading} />
        <Stat label="Market session" value={s ? sessionHeadline(s) : "—"} delta={s && cap.data ? `haircut ${bpsToPct(cap.data.haircut_bps)} · ${sessionReasonText(s)}` : note} loading={cap.loading} />
      </div>
    </div>
  );
}

interface LimitData {
  cap: ExitCapacity;
  col: CollateralView | null;
}

/**
 * Hero card: in-session vs weekend parameters for the first collateral, from testnet views.
 * In session: h = base haircut, D counts. Weekend: h = weekend haircut, D = 0 (PRD §4.7).
 */
export function LiveLimitCard() {
  const { deployed, config } = useChain();
  const cfg = config.collaterals[0];
  const sym = cfg?.symbol ?? "NVDAx";
  const d = useView<LimitData>(async (v) => {
    const [cap, col] = await Promise.all([v.getExitCapacity(sym), v.getCollateral(sym).catch(() => null)]);
    return { cap, col };
  }, [sym]);

  const head = (
    <div className="row between">
      <span className="label">{sym} · mock collateral · NEAR testnet</span>
      {d.data ? <SessionBadge cap={d.data.cap} compact /> : <Badge kind="mock">testnet</Badge>}
    </div>
  );

  if (!deployed || d.error) {
    return (
      <div className="card limitcard" role="group" aria-label={`Limit parameters for ${sym}`} data-testid="live-limit-card">
        {head}
        <p className="small">{!deployed ? "The limit card reads nectar-core once it is deployed on testnet." : "The testnet RPC did not answer. Nothing was changed."}</p>
        {d.error ? <Button size="sm" onClick={d.reload}>Retry</Button> : null}
      </div>
    );
  }
  if (d.loading || !d.data) {
    return (
      <div className="card limitcard" role="group" aria-label={`Limit parameters for ${sym}`} aria-busy="true" data-testid="live-limit-card">
        {head}
        <Skeleton lg />
        <Skeleton />
        <Skeleton width="70%" />
      </div>
    );
  }

  const { cap, col } = d.data;
  const s = sessionStatus(cap, config.v7.session_stale_s);
  const baseH = BigInt(col?.base_haircut_bps ?? cfg?.base_haircut_bps ?? 0);
  const wkH = BigInt(col?.weekend_haircut_bps ?? cfg?.weekend_haircut_bps ?? 0);
  const q = BigInt(cap.q_usd_e6);
  const r = BigInt(cap.r_usd_e6);
  const depth = BigInt(col?.verified_dex_depth_usd_e6 ?? cap.d_usd_e6);
  const inSession = ((BPS - baseH) * (q + r + depth)) / BPS;
  const weekend = ((BPS - wkH) * (q + r)) / BPS;
  const pct = (x: bigint) => (inSession === 0n ? 0 : Number((x * 10_000n) / inSession) / 100);
  const agg = aggregateCapacity(cap);
  const ltv = col?.max_nectar_ltv_bps ?? cfg?.max_nectar_ltv_bps ?? 0;
  const base = col?.base_ltv_bps ?? cfg?.base_ltv_bps ?? 0;

  return (
    <div className="card limitcard" role="group" aria-label={`Limit parameters for ${sym}`} data-testid="live-limit-card">
      {head}
      <div className="limitpair">
        <div className="col" data-active={s.open ? "true" : "false"} data-testid="limit-in-session">
          <span className="label">In session</span>
          <span className="big num">{formatUsdE6(inSession, 0)}</span>
          <div className="bar nectar"><i style={{ width: `${pct(inSession)}%` }} /></div>
          <span className="caption">haircut {bpsToPct(Number(baseH))} · verified DEX depth {formatUsdE6(depth, 0)} counts</span>
        </div>
        <div className="col" data-active={s.open ? "false" : "true"} data-testid="limit-weekend">
          <span className="label">Weekend parameters</span>
          <span className="big num">{formatUsdE6(weekend, 0)}</span>
          <div className="bar warn"><i style={{ width: `${pct(weekend)}%` }} /></div>
          <span className="caption">haircut {bpsToPct(Number(wkH))} · DEX depth counts 0</span>
        </div>
      </div>
      <table className="num">
        <tbody>
          <tr><td>Committed quotes Q<sub>c</sub></td><td>{formatUsdE6(q, 0)}</td></tr>
          <tr><td>Nectar Reserve R<sub>c</sub></td><td>{formatUsdE6(r, 0)}</td></tr>
          <tr><td>Per-position ceiling</td><td>{bpsToPct(ltv)} LTV (static {bpsToPct(base)})</td></tr>
          {agg.headroom_usd_e6 !== null ? <tr><td>Headroom after total debt</td><td>{formatUsdE6(agg.headroom_usd_e6, 0)}</td></tr> : null}
          <tr><td>Applied now</td><td>{s.open ? "in-session parameters" : "weekend parameters"}</td></tr>
        </tbody>
      </table>
      <p className="caption">Capacity = (1 − h)(Q + R + D), shared by every loan in the asset. Read from nectar-core on testnet; mock collateral.</p>
    </div>
  );
}
