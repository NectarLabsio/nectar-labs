"use client";
import { Badge, Banner } from "@nectar/ui";
import { formatDuration, multiplierIsOne, multiplierLine, nsToSeconds, sessionHeadline, sessionReasonText, sessionStatus, type ExitCapacity } from "@nectar/sdk";
import { useChain, useFeature } from "./AppProvider";

/**
 * "In session" or "Weekend parameters" plus the reason (WO-20 §2).
 * v2: the contract's `session_reason`. v1: owner flag `market_session_open` + oracle age (no calendar on v1).
 */
export function SessionBadge({ cap, compact }: { cap: ExitCapacity; compact?: boolean }) {
  const { config } = useChain();
  const s = sessionStatus(cap, config.v7.session_stale_s);
  const why = sessionReasonText(s);
  return (
    <span className="session" data-testid="session-badge" data-session={s.open ? "open" : "weekend"} data-reason={s.reason}>
      <Badge kind={s.open ? "live" : "weekend"} title={why}>
        {sessionHeadline(s)}
      </Badge>
      {compact ? <span className="sr-only">{why}</span> : <span className="why">{why}</span>}
    </span>
  );
}

/** "1 NVDAx = 1.02 shares after corporate actions", only on v2 with `features.multiplier` and M ≠ 1. */
export function MultiplierLine({ cap, symbol }: { cap: ExitCapacity; symbol: string }) {
  const on = useFeature("multiplier");
  if (!on || multiplierIsOne(cap.multiplier_e18)) return null;
  return (
    <p className="multline" data-testid="multiplier-line">
      {multiplierLine(symbol, cap.multiplier_e18!)}
      {cap.price_kind === "TokenIncludesMultiplier" ? <span className="dim"> · price already includes it</span> : null}
    </p>
  );
}

/** v2 only: a pending corporate action refuses new borrows (interface-v7 §A3). Shown whenever the contract says so, because the borrow would fail. */
export function CorporateActionBanner({ cap, symbol }: { cap: ExitCapacity; symbol: string }) {
  if (!cap.ca_pending) return null;
  const eff = cap.ca_effective_ns ? nsToSeconds(cap.ca_effective_ns) - Math.floor(Date.now() / 1000) : null;
  return (
    <Banner tone="warn" title="Corporate action pending" role="status">
      New {symbol} borrows are refused until it is applied{eff !== null ? (eff > 0 ? ` (effective in ${formatDuration(eff)})` : " (effective now; anyone may apply it)") : ""}. Repay and settlement continue.
    </Banner>
  );
}
