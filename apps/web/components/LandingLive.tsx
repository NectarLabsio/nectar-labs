"use client";
import { Stat } from "@nectar/ui";
import { bpsToPct, formatUsdE6, type ExitCapacity } from "@nectar/sdk";
import { useChain, useView } from "./AppProvider";

/** Stat tiles on the landing page. Live from get_exit_capacity / get_pool when deployed; otherwise says so. */
export function LandingStats() {
  const { deployed, config } = useChain();
  const sym = config.collaterals[0]?.symbol ?? "NVDAx";
  const cap = useView<ExitCapacity>((v) => v.getExitCapacity(sym), [sym]);
  const quotes = useView((v) => v.listQuotes(sym, 0, 64), [sym]);
  const pending = !deployed;
  const err = cap.error || quotes.error;
  const note = pending ? "awaiting testnet deployment" : err ? "RPC error, retry later" : `${sym} · NEAR testnet · live`;
  const live = Boolean(cap.data);
  const base = config.collaterals[0]?.base_ltv_bps ?? 0;
  return (
    <div className="stats" aria-live="polite">
      <div className="wrap">
        <Stat label="Committed capacity" value={live ? formatUsdE6(cap.data!.q_usd_e6, 0) : "—"} delta={note} loading={cap.loading} />
        <Stat
          label="Effective limit"
          value={live ? bpsToPct(cap.data!.limit_bps_effective) : "—"}
          delta={live ? `static ${bpsToPct(base)} → ${bpsToPct(cap.data!.limit_bps_effective)} LTV` : note}
          deltaUp={live}
          loading={cap.loading}
        />
        <Stat label="Live quotes" value={quotes.data ? String(quotes.data.length) : "—"} delta={quotes.data ? "funded and not exiting or exiting" : note} loading={quotes.loading} />
        <Stat
          label="Market session"
          value={live ? (cap.data!.session_open ? "Open" : "Closed") : "—"}
          delta={live ? `haircut ${bpsToPct(cap.data!.haircut_bps)} · oracle ${cap.data!.oracle_fresh ? "fresh" : "stale"}` : note}
          loading={cap.loading}
        />
      </div>
    </div>
  );
}
