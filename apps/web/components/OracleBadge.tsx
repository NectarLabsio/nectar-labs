"use client";
import { Badge } from "@nectar/ui";
import { oracleSourceLabel, type ExitCapacity, type QuoterConfigView } from "@nectar/sdk";

/** Oracle badge: source, age, confidence. Owner oracle (P0, or P1 without a Pyth key per D-013) carries no confidence interval. */
export function OracleBadge({ cap }: { cap: ExitCapacity }) {
  const src = oracleSourceLabel(cap.oracle_source);
  const conf = src === "Pyth" ? "conf n/a" : "no conf";
  const kind = !cap.oracle_fresh ? "stale" : src === "Pyth" ? "live" : "fallback";
  return (
    <Badge kind={kind} title={src === "Owner" ? "Owner oracle on testnet (disclosed)" : "Pyth price read by nectar-core at trigger time"}>
      {src === "Owner" ? "owner" : "Pyth"} · {String(cap.oracle_age_s)}s · {conf}
    </Badge>
  );
}

/** "OutLayer quoter vN" when a pin is set, else "P0 static pricing" (also when the P1 view is absent). */
export function pricingLabel(q: QuoterConfigView | null | undefined): { live: boolean; text: string } {
  if (q && q.project_id && q.version_key) return { live: true, text: `OutLayer quoter · ${q.project_id} @ ${q.version_key}` };
  return { live: false, text: "P0 static pricing" };
}

/** P1 view that may not exist yet on the deployed contract: resolve to null instead of failing the page. */
export async function optionalView<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
