"use client";
import type { ReactNode } from "react";
import { Card, FormulaBlock } from "@nectar/ui";
import { aggregateCapacity, bpsToPct, formatUsdE6, type ExitCapacity, type PublicConfig } from "@nectar/sdk";
import { useChain } from "./AppProvider";
import { AggregateRule, CramerFormula, FORMULA_TERMS } from "./Formula";
import { MultiplierLine, SessionBadge } from "./Session";

type Col = PublicConfig["collaterals"][number];

/**
 * Feed equation card (PRD §4.2, WO-20 §1): live Q_c, R_c, D_c, h_c and the capacity term; on v2 also total debt and aggregate headroom.
 * Labels are canonical: R_c "Nectar Reserve", D_c "verified DEX depth".
 */
export function EquationCard({ symbol, cap, col }: { symbol?: string; cap?: ExitCapacity; col?: Col }) {
  const { generation } = useChain();
  const agg = cap ? aggregateCapacity(cap) : null;
  const v2 = generation === "v2";
  let live: ReactNode = null;
  if (cap && agg && symbol) {
    const dCounted = cap.session_open ? BigInt(cap.d_usd_e6) : 0n;
    live = (
      <>
        {symbol}: (1 − {bpsToPct(cap.haircut_bps)}) · ({formatUsdE6(cap.q_usd_e6, 0)} + {formatUsdE6(cap.r_usd_e6, 0)} + {formatUsdE6(dCounted, 0)}) = {formatUsdE6(agg.capacity_usd_e6, 0)}
        {col ? <> · LTV cap {bpsToPct(col.max_nectar_ltv_bps)} of V<sub>c</sub></> : null} · effective limit {bpsToPct(cap.limit_bps_effective)}
      </>
    );
  }
  return (
    <Card label="Cramér limit (PRD §4.2)" tone="tint" data-testid="equation-card">
      <FormulaBlock
        formula={<CramerFormula />}
        live={live}
        caption={col ? `Config: LTV ${bpsToPct(col.max_nectar_ltv_bps)}, haircut ${bpsToPct(col.base_haircut_bps)} in session / ${bpsToPct(col.weekend_haircut_bps)} weekend, base ${bpsToPct(col.base_ltv_bps)}.` : undefined}
      />
      {cap && agg && symbol ? (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <div className="row between">
            <span className="label">{symbol} · live terms</span>
            <SessionBadge cap={cap} />
          </div>
          <div className="kvs" aria-live="polite">
            <div className="kv"><span>Q<sub>c</sub> committed quotes</span><b className="num" data-testid="eq-q">{formatUsdE6(cap.q_usd_e6, 0)}</b></div>
            <div className="kv"><span>R<sub>c</sub> Nectar Reserve</span><b className="num" data-testid="eq-r">{formatUsdE6(cap.r_usd_e6, 0)}</b></div>
            <div className="kv">
              <span>D<sub>c</sub> verified DEX depth</span>
              <b className="num" data-testid="eq-d">{formatUsdE6(cap.d_usd_e6, 0)}{cap.session_open ? "" : " · counts 0 outside the session"}</b>
            </div>
            <div className="kv"><span>h<sub>c</sub> haircut</span><b className="num" data-testid="eq-h">{bpsToPct(cap.haircut_bps)} ({cap.haircut_bps} bps)</b></div>
            <div className="kv"><span>(1 − h<sub>c</sub>)(Q<sub>c</sub> + R<sub>c</sub> + D<sub>c</sub>)</span><b className="num" data-testid="eq-capacity">{formatUsdE6(agg.capacity_usd_e6, 0)}</b></div>
            {v2 && agg.total_debt_usd_e6 !== null ? (
              <>
                <div className="kv"><span>Total debt in {symbol}</span><b className="num" data-testid="eq-total-debt">{formatUsdE6(agg.total_debt_usd_e6, 0)}</b></div>
                <div className="kv"><span>Aggregate headroom</span><b className="num accent" data-testid="eq-headroom">{formatUsdE6(agg.headroom_usd_e6 ?? 0n, 0)}</b></div>
              </>
            ) : null}
          </div>
          <MultiplierLine cap={cap} symbol={symbol} />
          {v2 ? (
            <p className="caption">
              Aggregate rule: <span className="mono"><AggregateRule /></span>. Every position in the asset shares one capacity.
            </p>
          ) : (
            <p className="caption">Total debt and aggregate headroom appear when the connected contract is v2.</p>
          )}
        </div>
      ) : null}
      <dl className="kvs" style={{ marginTop: 12 }}>
        {FORMULA_TERMS.map(([k, v], i) => (
          <div className="kv" key={i}><dt>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>
        ))}
      </dl>
    </Card>
  );
}
