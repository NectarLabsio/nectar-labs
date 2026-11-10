// Pure geometry for the app v2 visuals (docs/ui/app/*.dc.html renderVals). No React, no DOM: unit-tested with `node --test`.
// Inputs are plain numbers already formatted for display by the caller; amounts come from packages/sdk view calls on real routes.

export type HealthTone = "pos" | "warn" | "neg";

/** Health tone used by the gauge, stress bars and badges: ≥ 1.5 comfortable, ≥ 1.1 tight, below that close to the flag line. */
export function healthTone(h: number, ok = 1.5, tight = 1.1): HealthTone {
  if (!Number.isFinite(h)) return "pos";
  return h >= ok ? "pos" : h >= tight ? "warn" : "neg";
}

export const HEALTH_WORD: Record<HealthTone, string> = { pos: "Comfortable", warn: "Tight", neg: "Too close to the flag line" };

/** Share of the gauge arc filled, 0–100 (pathLength 100). `max` is the health shown as a full arc. */
export function gaugeFill(h: number, max = 3): number {
  if (!Number.isFinite(h) || h <= 0 || max <= 0) return 0;
  return Math.round(Math.min(1, h / max) * 1000) / 10;
}

/** Point on the 240×132 gauge arc (centre 120,120, radius 100) at a fraction 0–1 from the left end; used for the flag tick. */
export function gaugePoint(frac: number, r = 100): { x: number; y: number } {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, frac)));
  return { x: Math.round((120 + r * Math.cos(a)) * 10) / 10, y: Math.round((120 - r * Math.sin(a)) * 10) / 10 };
}

export interface StressBar { label: string; value: number; height: number; tone: HealthTone }

/** Health after price shocks (health × (1 − shock)); bar height in px out of `maxPx`, floored at 4 px so a bar never vanishes. */
export function stressBars(health: number, shocks: readonly number[] = [0.1, 0.2, 0.3, 0.5], max = 3, maxPx = 76): StressBar[] {
  return shocks.map((s) => {
    const v = health > 0 ? health * (1 - s) : 0;
    return { label: `−${Math.round(s * 100)}%`, value: v, height: Math.round(Math.max(4, (Math.min(max, v) / max) * maxPx) * 10) / 10, tone: healthTone(v) };
  });
}

/** Weekly hours, New York time: Monday 00:00 = 0, Sunday 24:00 = 168. */
export const WEEK_HOURS = 168;
/** NYSE regular session, 09:30–16:00 ET, as offsets into each weekday. */
export const SESSION_OPEN_H = 9.5;
export const SESSION_CLOSE_H = 16;

export interface WeekChartGeometry {
  line: string;
  area: string;
  /** hatched weekend windows: [x, width] */
  hatches: Array<[number, number]>;
  now: { x: number; y: number } | null;
  ticks: Array<{ y: number; value: number }>;
  days: Array<{ x: number; label: string }>;
}

const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * Exit capacity through the week (Main artboard): `open` while the NYSE session runs, `closed` otherwise.
 * Plot area x 44–592, y 20–180 in a 600×214 viewBox. `nowH` is the current hour of the week (null hides the marker).
 */
export function weekChart(open: number, closed: number, nowH: number | null, maxValue?: number): WeekChartGeometry {
  const top = Math.max(open, closed, 1);
  const max = maxValue && maxValue >= top ? maxValue : niceCeil(top * 1.1);
  const X = (h: number) => 44 + (h / WEEK_HOURS) * 548;
  const Y = (v: number) => 180 - (Math.max(0, v) / max) * 160;
  let line = `M${r1(X(0))} ${r1(Y(closed))}`;
  for (let d = 0; d < 5; d++) {
    line += ` H${r1(X(24 * d + SESSION_OPEN_H))} V${r1(Y(open))} H${r1(X(24 * d + SESSION_CLOSE_H))} V${r1(Y(closed))}`;
  }
  line += ` H${r1(X(WEEK_HOURS))}`;
  const area = `${line} V180 H44 Z`;
  const hatches: Array<[number, number]> = [
    [44, Number(r1(X(SESSION_OPEN_H) - 44))],
    [Number(r1(X(24 * 4 + SESSION_CLOSE_H))), Number(r1(X(WEEK_HOURS) - X(24 * 4 + SESSION_CLOSE_H)))],
  ];
  let now: WeekChartGeometry["now"] = null;
  if (nowH !== null && Number.isFinite(nowH)) {
    const h = ((nowH % WEEK_HOURS) + WEEK_HOURS) % WEEK_HOURS;
    now = { x: Number(r1(X(h))), y: Number(r1(Y(inSession(h) ? open : closed))) };
  }
  const ticks = [0, 1, 2, 3].map((i) => ({ y: Number(r1(180 - (i * 160) / 3)), value: (max * i) / 3 }));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ x: Number(r1(X(24 * i + 12))), label }));
  return { line, area, hatches, now, ticks, days };
}

/** True when hour-of-week `h` is inside a weekday regular session (holidays are the contract's job, not the chart's). */
export function inSession(h: number): boolean {
  const day = Math.floor(h / 24);
  const t = h - day * 24;
  return day < 5 && t >= SESSION_OPEN_H && t < SESSION_CLOSE_H;
}

/** Hour of the week in New York for a Date (Intl, no tz database bundled). */
export function nyHourOfWeek(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return Math.max(0, day) * 24 + Number(get("hour")) + Number(get("minute")) / 60;
}

/** 1, 2, 3 or 5 × 10^k at or above x, so axis labels read cleanly ($30k, $60k, $90k). */
export function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const k = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 1.5, 2, 3, 5, 6, 9, 10]) if (m * k >= x) return m * k;
  return 10 * k;
}

export interface DonutArc { key: string; dash: string; offset: string; pct: number }

/** Donut segments on a pathLength-100 circle: each arc's dasharray and (negative) dashoffset, in order. */
export function donutArcs(values: ReadonlyArray<{ key: string; value: number }>): DonutArc[] {
  const total = values.reduce((s, v) => s + Math.max(0, v.value), 0);
  let acc = 0;
  return values.map((v) => {
    const pct = total > 0 ? (Math.max(0, v.value) / total) * 100 : 0;
    const arc = { key: v.key, dash: `${r1(pct)} ${r1(100 - pct)}`, offset: r1(-acc), pct: Number(r1(pct)) };
    acc += pct;
    return arc;
  });
}

/** Bar widths (%) for ladder rows relative to the largest committed amount. */
export function ladderWidths(amounts: readonly number[]): number[] {
  const max = Math.max(0, ...amounts);
  return amounts.map((a) => (max > 0 ? Number(r1((Math.max(0, a) / max) * 100)) : 0));
}

/** Filled share of a slider track, 0–100. */
export function sliderFill(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Number(r1(Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))));
}

/** Flex-basis shares (%) for a stacked meter; `total` defaults to the sum. */
export function meterShares(values: readonly number[], total?: number): number[] {
  const t = total ?? values.reduce((s, v) => s + Math.max(0, v), 0);
  return values.map((v) => (t > 0 ? Number(((Math.max(0, v) / t) * 100).toFixed(2)) : 0));
}
