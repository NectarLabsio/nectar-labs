// Display helpers. Integers in, strings out; no floats touch amounts.

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Fixed-point integer to a decimal string with `dp` places shown (truncated, not rounded). */
export function formatUnits(v: bigint | string, decimals: number, dp = 2): string {
  const n = typeof v === "bigint" ? v : BigInt(v);
  const neg = n < 0n;
  const a = neg ? -n : n;
  const base = 10n ** BigInt(decimals);
  const whole = group((a / base).toString());
  if (dp === 0) return (neg ? "-" : "") + whole;
  const frac = (a % base).toString().padStart(decimals, "0").slice(0, dp).padEnd(dp, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export function formatUsdE6(v: bigint | string, dp = 2): string {
  const s = formatUnits(v, 6, dp);
  return s.startsWith("-") ? `-$${s.slice(1)}` : `$${s}`;
}

/** Parse a user decimal string ("1,234.5") into a fixed-point integer. Throws on bad input. */
export function parseUnits(input: string, decimals: number): bigint {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) throw new Error("Enter a positive number");
  const [w = "0", f = ""] = s.split(".");
  if (f.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function formatBps(bps: number): string {
  return `${bps.toLocaleString("en-US")} bps`;
}

/** bps as a percent string with up to 2 decimals: 6250 -> "62.5 %". */
export function bpsToPct(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = Math.abs(bps % 100);
  return frac === 0 ? `${whole} %` : `${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")} %`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${seconds} s`;
}

export const NS_PER_S = 1_000_000_000n;
export const secondsToNs = (s: number | bigint): string => (BigInt(s) * NS_PER_S).toString();
export const nsToSeconds = (ns: string | bigint): number => Number(BigInt(ns) / NS_PER_S);

/** yoctoNEAR to a NEAR string. */
export function formatYocto(v: bigint | string, dp = 5): string {
  return `${formatUnits(v, 24, dp)} NEAR`;
}
/** gas units to TGas string. */
export function formatGas(v: bigint | string): string {
  return `${formatUnits(v, 12, 0)} TGas`;
}
