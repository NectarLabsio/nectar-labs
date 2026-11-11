"use client";
// App v2 components (DESIGN_SYSTEM §3c, docs/ui/app/*.dc.html). Styles: packages/ui/app.css (`nx-` classes, tokens only).
// Presentational: callers pass numbers already read through packages/sdk; geometry lives in ./charts (unit-tested).
import type { CSSProperties, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { HEALTH_WORD, donutArcs, gaugeFill, gaugePoint, healthTone, ladderWidths, meterShares, sliderFill, stressBars, weekChart, type HealthTone } from "./charts";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
/** useId() output is not a valid url(#…) fragment in every engine; keep letters, digits, - and _. */
const useSvgId = (p: string) => `${p}${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

export type Tone = "pos" | "warn" | "neg";
/** Series colours (DESIGN_SYSTEM §3c): Q mint, R teal, D sky, haircut amber hatch, debt ink. */
export type SeriesTone = "q" | "r" | "d" | "h" | "used" | "v";

// ---------------------------------------------------------------- Panel

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  as?: "section" | "div" | "aside" | "article" | "figure";
  title?: ReactNode;
  /** Heading level for `title` (default 2: panels sit under the page h1). */
  titleLevel?: 2 | 3;
  actions?: ReactNode;
  /** Inner padding (default true). */
  pad?: boolean;
  /** Radius scale 22 / 16 / 12. */
  size?: "lg" | "md" | "sm";
}

/** One elevated surface: gradient panel, 1 px inner line, soft shadow. No nested borders. */
export function Panel({ as = "section", title, titleLevel = 2, actions, pad = true, size = "lg", className, children, ...rest }: PanelProps) {
  const Tag = as;
  const H = titleLevel === 3 ? "h3" : "h2";
  return (
    <Tag className={cx("nx-panel", pad && "nx-pad", size !== "lg" && `nx-panel-${size}`, className)} {...rest}>
      {title || actions ? (
        <div className="nx-ph">
          {title ? <H className="nx-h2">{title}</H> : <span />}
          {actions ? <div className="nx-row">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------- Chips, dots, chain squares

export function Chip({ children, className, title, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx("nx-chip", className)} title={title} {...rest}>
      {children}
    </span>
  );
}

export type SessionTone = "open" | "weekend" | "off";

/** Session chip: pulsing dot (mint open, amber weekend, grey unknown). `short` replaces the label at phone width. */
export function SessionChip({ tone, label, short, title }: { tone: SessionTone; label: ReactNode; short?: ReactNode; title?: string }) {
  return (
    <span className="nx-chip nx-session" data-testid="nav-session" data-tone={tone} title={title}>
      <i className={cx("nx-dot", tone === "weekend" && "amber", tone === "off" && "off")} aria-hidden="true" />
      <span className={short ? "nx-lbl-long" : undefined}>{label}</span>
      {short ? <span className="nx-lbl-short" aria-hidden="true">{short}</span> : null}
    </span>
  );
}

export function ChainMark({ chain }: { chain: "near" | "sol" | "base" }) {
  return (
    <span className={`nx-chain ${chain}`} aria-hidden="true">
      {chain === "near" ? "N" : chain === "sol" ? "S" : "B"}
    </span>
  );
}

// ---------------------------------------------------------------- Stats

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaUp?: boolean;
  spark?: ReactNode;
  loading?: boolean;
  className?: string;
  /** Value size: v 15 px mono (default), mid 22 px, big 32 px, hero 56 px (Syne). */
  size?: "v" | "mid" | "big" | "hero";
  tone?: Tone;
}

/** Label over value; numbers in DM Mono, large figures in Syne. Use inside <Stats> for the divided row. */
export function Stat({ label, value, delta, deltaUp, spark, loading, className, size = "v", tone }: StatProps) {
  return (
    <div className={cx("nx-stat", className)}>
      <span className="nx-k">{label}</span>
      <span className={cx(`nx-${size}`, size === "v" && "num", tone && `nx-${tone}`)}>{loading ? <span className="nx-skel" aria-label="Loading" role="img" /> : value}</span>
      {delta ? <span className={cx("nx-delta", deltaUp && "up")}>{delta}</span> : null}
      {spark ? <span className="nx-spark">{spark}</span> : null}
    </div>
  );
}

export function Stats({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cx("nx-stats", className)} role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Segmented control and tabs

export interface SegOption<T extends string> { value: T; label: ReactNode; disabled?: boolean; badge?: ReactNode }

/** Segmented control (one choice). Buttons carry aria-pressed. */
export function Seg<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: Array<SegOption<T>>; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("nx-seg", className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "on" : undefined} aria-pressed={o.value === value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
          {o.badge ? <small>{o.badge}</small> : null}
        </button>
      ))}
    </div>
  );
}

export interface TabItem<T extends string> { id: T; label: ReactNode; count?: number }

/** Props for the panel a TabBar controls. */
export function tabPanelProps(idBase: string, id: string) {
  return { role: "tabpanel" as const, id: `${idBase}-panel-${id}`, "aria-labelledby": `${idBase}-tab-${id}`, tabIndex: 0 };
}

/** Tabs: underlined (Portfolio: Loans / Deposits / Notes / Activity) or segmented (Earn mode, Agents transport). Roving tabindex, arrow keys move. */
export function TabBar<T extends string>({ label, tabs, value, onChange, idBase, variant = "underline", className }: { label: string; tabs: Array<TabItem<T>>; value: T; onChange: (v: T) => void; idBase: string; variant?: "underline" | "seg"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === value);
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (j === null || tabs.length === 0) return;
    e.preventDefault();
    const next = tabs[(j + tabs.length) % tabs.length]!;
    onChange(next.id);
    ref.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${idBase}-tab-${next.id}`)}`)?.focus();
  };
  return (
    <div ref={ref} className={cx(variant === "seg" ? "nx-seg" : "nx-tabs", className)} role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} type="button" role="tab" id={`${idBase}-tab-${t.id}`} aria-selected={on} aria-controls={`${idBase}-panel-${t.id}`} tabIndex={on ? 0 : -1} className={on ? "on" : undefined} onClick={() => onChange(t.id)}>
            {t.label}
            {t.count !== undefined ? <span className="nx-ct">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Slider

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Spoken value, e.g. "$20,000 of $33,600". */
  valueText?: string;
  tone?: Tone;
  hideLabel?: boolean;
  id?: string;
  disabled?: boolean;
}

/** Range input whose track fills to the value (mint, or coral when `tone="neg"`). */
export function Slider({ label, value, min, max, step = 1, onChange, valueText, tone = "pos", hideLabel, id, disabled }: SliderProps) {
  const auto = useId();
  const inputId = id ?? `sl${auto.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = sliderFill(value, min, max);
  const color = tone === "neg" ? "var(--danger)" : tone === "warn" ? "var(--warn-bar)" : "var(--accent)";
  const style = { "--track": `linear-gradient(90deg, ${color} 0 ${fill}%, var(--raise) ${fill}% 100%)` } as CSSProperties;
  return (
    <div className="nx-slider">
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "nx-k"}>
        {label}
      </label>
      <input id={inputId} className="nx-range" type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={valueText} style={style} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

// ---------------------------------------------------------------- Drawer

export interface DrawerProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Pinned to the bottom of the drawer (primary action). */
  footer?: ReactNode;
  /** While signing, Escape and the scrim do not close it. */
  locked?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Review drawer from the right: scrim, focus moves in and is kept inside, Escape closes, focus returns on close. */
export function Drawer({ open, title, onClose, children, footer, locked }: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useSvgId("dr");
  const close = useRef(onClose);
  close.current = onClose;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = ref.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lockedRef.current) {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab" && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div className="nx-scrim" aria-hidden="true" onClick={() => !lockedRef.current && close.current()} />
      <aside ref={ref} className="nx-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="nx-ph">
          <h2 className="nx-h2 nx-drawer-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="nx-btn quiet sm" onClick={() => close.current()} disabled={locked}>
            Close
          </button>
        </div>
        <div className="nx-drawer-body">{children}</div>
        {footer ? <div className="nx-drawer-foot">{footer}</div> : null}
      </aside>
    </>
  );
}

/** Pending / done steps inside the drawer ("Sign in your wallet", "Confirmed on NEAR testnet"). */
export function Steps({ steps }: { steps: Array<{ title: ReactNode; detail?: ReactNode; state: "todo" | "now" | "done"; busy?: boolean }> }) {
  return (
    <ol className="nx-steps">
      {steps.map((s, i) => (
        <li key={i} className={cx("nx-stp", s.state !== "todo" && s.state)} aria-current={s.state === "now" ? "step" : undefined}>
          <i aria-hidden="true">{s.state === "done" ? "✓" : i + 1}</i>
          <span className="nx-stack">
            <b>{s.title}</b>
            {s.detail ? <span>{s.detail}</span> : null}
          </span>
          {s.busy ? <span className="nx-spin" role="img" aria-label="Waiting" /> : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- Toast

export interface ToastProps {
  /** Message; null hides the toast but keeps the live region mounted so screen readers announce the next one. */
  message: ReactNode | null;
  /** Next step, e.g. a link to the new loan. */
  action?: ReactNode;
  onClose: () => void;
  /** ms before it hides itself; 0 keeps it. */
  timeout?: number;
}

/** Toast with the next step (ink pill at the bottom). Always-mounted polite live region. */
export function Toast({ message, action, onClose, timeout = 4500 }: ToastProps) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (message === null || !timeout) return;
    const t = setTimeout(() => close.current(), timeout);
    return () => clearTimeout(t);
  }, [message, timeout]);
  return (
    <div className="nx-toast-region" role="status" aria-live="polite">
      {message !== null ? (
        <div className="nx-toast" data-testid="nx-toast">
          <span>{message}</span>
          {action}
          <button type="button" className="nx-toast-x" onClick={() => close.current()} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Meter and legend

export function Meter({ segments, total, label, lg }: { segments: Array<{ tone: SeriesTone; value: number }>; total?: number; label?: string; lg?: boolean }) {
  const shares = meterShares(segments.map((s) => s.value), total);
  return (
    <div className={cx("nx-meter", lg && "lg")} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {segments.map((s, i) => (
        <i key={i} className={`nx-c-${s.tone}`} style={{ flexBasis: `${shares[i]}%` }} />
      ))}
    </div>
  );
}

export function Legend({ items, column }: { items: Array<{ tone: SeriesTone; label: ReactNode; value?: ReactNode }>; column?: boolean }) {
  return (
    <div className={cx("nx-legend", column && "col")}>
      {items.map((it, i) => (
        <span key={i}>
          <i className={`nx-c-${it.tone}`} aria-hidden="true" />
          {it.label}
          {it.value !== undefined ? <b>{it.value}</b> : null}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Gauge and stress bars

export interface GaugeProps {
  /** Health factor (≥ 0). 0 or NaN shows "n/a". */
  value: number;
  /** Health drawn as a full arc (default 3). */
  max?: number;
  /** Flag line (pre-liquidation), default 1. */
  flag?: number;
  label?: string;
  /** Formatted value; default two decimals. */
  valueText?: string;
}

/** Health gauge (Borrow and Position artboards): arc filled to health / max, coral tick at the flag line. */
export function Gauge({ value, max = 3, flag = 1, label = "health after", valueText }: GaugeProps) {
  const ok = Number.isFinite(value) && value > 0;
  const text = valueText ?? (ok ? value.toFixed(2) : "n/a");
  const tone: HealthTone = ok ? healthTone(value) : "pos";
  const a = gaugePoint(flag / max, 88);
  const b = gaugePoint(flag / max, 116);
  return (
    <svg className={`nx-gauge ${tone}`} viewBox="0 0 240 132" width="220" height="121" role="img" aria-label={`${label}: ${text}${ok ? `, ${HEALTH_WORD[tone].toLowerCase()}` : ""}`} data-health={ok ? value : undefined}>
      <path className="nx-gauge-track" d="M20 120 A100 100 0 0 1 220 120" fill="none" strokeWidth="14" strokeLinecap="round" />
      <path className="nx-gauge-fill" d="M20 120 A100 100 0 0 1 220 120" fill="none" strokeWidth="14" strokeLinecap="round" pathLength={100} strokeDasharray={`${gaugeFill(value, max)} 100`} />
      <line className="nx-gauge-flag" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="2" />
      <text className="nx-gauge-val" x="120" y="98" textAnchor="middle">
        {text}
      </text>
      <text className="nx-gauge-lab" x="120" y="120" textAnchor="middle">
        {label}
      </text>
    </svg>
  );
}

/** Health after price shocks, one bar per shock, with the flag line dashed across. */
export function StressBars({ health, shocks, max = 3, flag = 1, caption }: { health: number; shocks?: number[]; max?: number; flag?: number; caption: ReactNode }) {
  const bars = stressBars(health, shocks, max);
  const flagBottom = 22 + (Math.min(flag, max) / max) * 76;
  return (
    <figure className="nx-stress">
      <figcaption className="nx-k">{caption}</figcaption>
      <div className="nx-stress-grid">
        <div className="nx-stress-flag" style={{ bottom: `${flagBottom.toFixed(1)}px` }} aria-hidden="true" />
        {bars.map((b) => (
          <div key={b.label} className="nx-stress-col">
            <span className="num nx-stress-v">{health > 0 ? b.value.toFixed(2) : "n/a"}</span>
            <div className={`nx-stress-bar ${b.tone}`} style={{ height: `${b.height}px` }} aria-hidden="true" />
            <span className="nx-k nx-stress-l">
              <span className="sr-only">Price </span>
              {b.label}
              <span className="sr-only">: health {health > 0 ? b.value.toFixed(2) : "n/a"}</span>
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------- Week chart

export interface WeekChartProps {
  /** Exit capacity while the NYSE session runs (USD). */
  open: number;
  /** Exit capacity when closed or on weekend parameters (USD). */
  closed: number;
  /** Hour of the week in New York (Mon 00:00 = 0); null hides "now". */
  nowH: number | null;
  /** Axis top; default a round number above the data. */
  max?: number;
  format: (usd: number) => string;
  title?: ReactNode;
}

/** Exit capacity through the week (Main artboard): step line, weekend hatch, "now" marker, New York time. */
export function WeekChart({ open, closed, nowH, max, format, title = "This week" }: WeekChartProps) {
  const g = weekChart(open, closed, nowH, max);
  const fillId = useSvgId("wf");
  const hatchId = useSvgId("wh");
  return (
    <figure className="nx-week">
      <div className="nx-ph">
        <span className="nx-h2">{title}</span>
        <span className="nx-k">New York time</span>
      </div>
      <svg viewBox="0 0 600 214" role="img" aria-label={`Exit capacity through the week: ${format(open)} in session, ${format(closed)} when closed`}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="nx-week-stop0" />
            <stop offset="1" className="nx-week-stop1" />
          </linearGradient>
          <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="7" className="nx-week-hatch" />
          </pattern>
        </defs>
        <path className="nx-axl" d={g.ticks.map((t) => `M44 ${t.y}H592`).join("")} fill="none" />
        {g.ticks.map((t) => (
          <text key={t.y} className="nx-ax" x="38" y={t.y + 4} textAnchor="end">
            {format(t.value)}
          </text>
        ))}
        {g.hatches.map(([x, w]) => (
          <rect key={x} x={x} y="20" width={w} height="160" fill={`url(#${hatchId})`} />
        ))}
        <path d={g.area} fill={`url(#${fillId})`} />
        <path className="nx-week-line" d={g.line} fill="none" strokeWidth="2" strokeLinejoin="round" />
        {g.now ? (
          <g className="nx-week-now">
            <line x1={g.now.x} x2={g.now.x} y1="16" y2="180" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx={g.now.x} cy={g.now.y} r="5" />
            <rect x={g.now.x - 32} y="0" width="64" height="18" rx="6" />
            <text x={g.now.x} y="13" textAnchor="middle">
              now
            </text>
          </g>
        ) : null}
        {g.days.map((d) => (
          <text key={d.label} className="nx-ax" x={d.x} y="204" textAnchor="middle">
            {d.label}
          </text>
        ))}
      </svg>
      <figcaption>
        <Legend
          items={[
            { tone: "q", label: "In session" },
            { tone: "h", label: "Weekend window, Shields fixed" },
            { tone: "used", label: "Now" },
          ]}
        />
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- Ladder

export interface LadderRow {
  key: string;
  /** "2.50%" or "market" */
  discount: string;
  /** "$180.38" */
  buysAt: ReactNode;
  /** "quote q-1, buyer1" */
  source: ReactNode;
  amount: number;
  amountText: string;
  units: ReactNode;
  cumulative: ReactNode;
  kind: "q" | "r" | "d";
  /** DEX depth row: shown dim, `note` spans units + cumulative. */
  muted?: boolean;
  note?: ReactNode;
}

/** Buy-side ladder ordered by discount, the order settlement uses (Market artboard). */
export function Ladder({ rows, caption, highlightLast = true }: { rows: LadderRow[]; caption: string; highlightLast?: boolean }) {
  const widths = ladderWidths(rows.filter((r) => !r.muted).map((r) => r.amount));
  const max = Math.max(0, ...rows.filter((r) => !r.muted).map((r) => r.amount));
  let wi = 0;
  const lastLive = rows.map((r) => !r.muted).lastIndexOf(true);
  return (
    <div className="nx-tbl-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="nx-tbl nx-ladder">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Discount</th>
            <th scope="col">Buys at or above</th>
            <th scope="col" className="nx-ladder-c">
              Committed
            </th>
            <th scope="col" className="r">
              Units
            </th>
            <th scope="col" className="r">
              Cumulative
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const w = r.muted ? (max > 0 ? Math.min(100, (r.amount / max) * 100) : 0) : widths[wi++] ?? 0;
            return (
              <tr key={r.key} className={r.muted ? "muted" : undefined}>
                <td>
                  <span className="nx-v">{r.discount}</span>
                </td>
                <td>
                  <span className={r.muted ? "nx-k" : "nx-v"}>{r.buysAt}</span>
                  {r.muted ? null : <span className="nx-k nx-block">{r.source}</span>}
                </td>
                <td>
                  <span className="nx-stack nx-gap6">
                    <span className="nx-v">{r.amountText}</span>
                    <span className="nx-meter" aria-hidden="true">
                      <i className={`nx-c-${r.kind}`} style={{ width: `${w}%` }} />
                    </span>
                  </span>
                </td>
                {r.muted ? (
                  <td className="r" colSpan={2}>
                    <span className="nx-k">{r.note}</span>
                  </td>
                ) : (
                  <>
                    <td className="r">
                      <span className="nx-v">{r.units}</span>
                    </td>
                    <td className="r">
                      <span className={cx("nx-v", highlightLast && i === lastLive && "nx-pos")}>{r.cumulative}</span>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Donut

export interface DonutSegment { key: string; label: ReactNode; value: number; valueText: string; tone: SeriesTone }

/** Limit composition donut (Market artboard): segments on one ring, total in the centre, legend beside. */
export function Donut({ segments, centerLabel, centerValue, size = 170, legend = true, label }: { segments: DonutSegment[]; centerLabel: string; centerValue: string; size?: number; legend?: boolean; label?: string }) {
  const arcs = donutArcs(segments.map((s) => ({ key: s.key, value: s.value })));
  return (
    <div className="nx-donut">
      <svg viewBox="0 0 170 170" width={size} height={size} role="img" aria-label={label ?? `${centerLabel} ${centerValue}: ${segments.map((s) => `${typeof s.label === "string" ? s.label : s.key} ${s.valueText}`).join(", ")}`}>
        <circle className="nx-donut-track" cx="85" cy="85" r="64" fill="none" strokeWidth="18" />
        {arcs.map((a, i) => (
          <circle key={a.key} className={`nx-donut-arc nx-s-${segments[i]!.tone}`} cx="85" cy="85" r="64" fill="none" strokeWidth="18" pathLength={100} strokeDasharray={a.dash} strokeDashoffset={a.offset} transform="rotate(-90 85 85)" />
        ))}
        <text className="nx-donut-lab" x="85" y="80" textAnchor="middle">
          {centerLabel}
        </text>
        <text className="nx-donut-val" x="85" y="102" textAnchor="middle">
          {centerValue}
        </text>
      </svg>
      {legend ? <Legend column items={segments.map((s) => ({ tone: s.tone, label: s.label, value: s.valueText }))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Placement ladder, waterfall, agent run

export interface PlacementItem {
  key: string;
  who: ReactNode;
  at: ReactNode;
  size: number;
  sizeText: string;
  cap: string;
  kind: "q" | "r" | "me";
}

/** Where a new commitment would stand (Earn artboard): rows in settlement order, the new one highlighted. */
export function PlacementLadder({ rows, label }: { rows: PlacementItem[]; label: string }) {
  const widths = ladderWidths(rows.map((r) => r.size));
  return (
    <ol className="nx-place" aria-label={label}>
      {rows.map((r, i) => (
        <li key={r.key} className={cx("nx-place-row", r.kind === "me" && "me")} data-kind={r.kind}>
          <span className="num nx-place-n">{i + 1}</span>
          <span className="nx-stack nx-place-who">
            <span className="nx-place-name">{r.who}</span>
            <span className="nx-k">{r.at}</span>
          </span>
          <span className="nx-stack nx-place-size">
            <span className="nx-v nx-place-amt">{r.sizeText}</span>
            <span className="nx-meter" aria-hidden="true">
              <i className={`nx-c-${r.kind === "me" ? "q" : r.kind === "r" ? "r" : "used"}`} style={{ width: `${widths[i] ?? 0}%` }} />
            </span>
          </span>
          <span className="nx-v nx-place-cap">{r.cap}</span>
        </li>
      ))}
    </ol>
  );
}

/** One step of the settlement order (Earn artboard). */
export function FallStep({ tone, title, detail, on }: { tone: "q" | "r" | "off"; title: ReactNode; detail: ReactNode; on?: boolean }) {
  return (
    <div className={cx("nx-fall", on && "on")}>
      <i className={tone === "off" ? "nx-fall-off" : `nx-c-${tone}`} aria-hidden="true" />
      <span className="nx-stack">
        <b className="nx-strong">{title}</b>
        <span className="nx-k">{detail}</span>
      </span>
    </div>
  );
}

/** One call of a replayed agent run (Agents artboard): number or check, the call, its result, the payload on demand. */
export function RunStep({ n, call, summary, state, open, onToggle, children }: { n: number; call: string; summary: ReactNode; state: "todo" | "now" | "done"; open: boolean; onToggle: () => void; children: ReactNode }) {
  const done = state === "done";
  return (
    <article className={cx("nx-run", state)} data-state={state}>
      <button type="button" className="nx-run-head" aria-expanded={open} onClick={onToggle} disabled={state === "todo"}>
        <i className="nx-run-dot" aria-hidden="true">{done ? "✓" : n}</i>
        <span className="nx-stack nx-run-t">
          <span className="nx-run-call">{call}</span>
          <span className="nx-k">{done ? summary : state === "now" ? "running…" : "waiting"}</span>
        </span>
        <span className="nx-k">{done ? (open ? "Hide" : "Show") : null}</span>
      </button>
      {open ? <div className="nx-run-body">{children}</div> : null}
    </article>
  );
}
