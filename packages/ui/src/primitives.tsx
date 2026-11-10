import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export type ButtonVariant = "default" | "primary" | "ghost" | "danger" | "icon";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  loading?: boolean;
}
export function Button({ variant = "default", size = "md", loading, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("btn", variant !== "default" && variant, size === "sm" && "sm", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  /** Heading level of `title` (default 3). Use 2 when the card sits directly under the page h1, so the outline never skips a level. */
  titleLevel?: 2 | 3;
  label?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "tint" | "warn" | "danger";
  live?: boolean;
  as?: "section" | "div" | "article";
}
export function Card({ title, titleLevel = 3, label, actions, footer, tone = "default", live, as = "section", className, children, ...rest }: CardProps) {
  const Tag = as;
  const H = titleLevel === 2 ? "h2" : "h3";
  const head = title || label || actions;
  return (
    <Tag className={cx("card", tone !== "default" && tone, className)} data-live={live ? "true" : undefined} {...rest}>
      {head ? (
        <div className="card-head">
          <div className="stack-sm">
            {label ? <span className="label">{label}</span> : null}
            {title ? <H className="card-title">{title}</H> : null}
          </div>
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? <div className="card-foot">{footer}</div> : null}
    </Tag>
  );
}

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaUp?: boolean;
  spark?: ReactNode;
  loading?: boolean;
  className?: string;
}
export function Stat({ label, value, delta, deltaUp, spark, loading, className }: StatProps) {
  return (
    <div className={cx("card stat rise", className)}>
      <span className="label">{label}</span>
      <div className="v num">{loading ? <Skeleton lg /> : value}</div>
      {delta ? <div className={cx("d", deltaUp && "up")}>{delta}</div> : null}
      {spark ? <div className="spark">{spark}</div> : null}
    </div>
  );
}

export type BadgeKind = "neutral" | "mock" | "live" | "fallback" | "verified" | "unverified" | "paused" | "warn" | "info" | "danger" | "good" | "stale" | "weekend";
export function Badge({ kind = "neutral", children, className, title }: { kind?: BadgeKind; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cx("badge", kind !== "neutral" && kind, className)} title={title}>
      {children}
    </span>
  );
}

export type PositionPill = "open" | "at-risk" | "settling" | "settled" | "closed";
const PILL_TEXT: Record<PositionPill, string> = { open: "Open", "at-risk": "At risk", settling: "Settling", settled: "Settled", closed: "Closed" };
export function StatusPill({ status }: { status: PositionPill }) {
  return (
    <span className={cx("badge", status)} role="status" aria-live="polite">
      {PILL_TEXT[status]}
    </span>
  );
}

export interface BannerProps {
  tone?: "info" | "warn" | "danger" | "good";
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  role?: "status" | "alert";
  className?: string;
}
const ICON: Record<NonNullable<BannerProps["tone"]>, string> = { info: "i", warn: "!", danger: "×", good: "✓" };
export function Banner({ tone = "info", title, children, actions, role, className }: BannerProps) {
  return (
    <div className={cx("banner", tone, className)} role={role ?? (tone === "danger" ? "alert" : "status")}>
      <span className="b-icon" aria-hidden="true">{ICON[tone]}</span>
      <div className="b-body">
        {title ? <span className="b-title">{title}</span> : null}
        {children ? <div>{children}</div> : null}
        {actions ? <div className="b-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  unit?: ReactNode;
}
export function Field({ label, hint, error, unit, id, className, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  return (
    <div className={cx("field", className)} data-invalid={error ? "true" : undefined}>
      <label htmlFor={fid}>{label}</label>
      <div className="input-wrap">
        <input id={fid} aria-invalid={error ? true : undefined} aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined} {...rest} />
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {hint ? <span className="hint" id={hintId}>{hint}</span> : null}
      {error ? <span className="error" id={errId} role="alert">{error}</span> : null}
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: ReactNode;
  hint?: ReactNode;
}
/** A labelled checkbox with an optional hint (44 px target). */
export function Checkbox({ label, hint, id, className, ...rest }: CheckboxProps) {
  const auto = useId();
  const fid = id ?? auto;
  const hintId = hint ? `${fid}-hint` : undefined;
  return (
    <div className={cx("check", className)}>
      <input id={fid} type="checkbox" aria-describedby={hintId} {...rest} />
      <span className="check-body">
        <label htmlFor={fid}>{label}</label>
        {hint ? <span className="hint" id={hintId}>{hint}</span> : null}
      </span>
    </div>
  );
}

export interface SelectFieldProps {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: ReactNode;
  id?: string;
}
export function SelectField({ label, value, onChange, options, hint, id }: SelectFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <div className="input-wrap">
        <select id={fid} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Segmented choice (notice presets, theme, shocks). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="f-label" id={`seg-${label}`}>{label}</span>
      <div className="seg" role="group" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Skeleton({ lg, width }: { lg?: boolean; width?: string }) {
  return <span className={cx("skel", lg && "lg")} style={width ? { width } : undefined} aria-hidden="true" />;
}

export function Kv({ k, v, title }: { k: ReactNode; v: ReactNode; title?: string }) {
  return (
    <div className="kv" title={title}>
      <span>{k}</span>
      <b className="num">{v}</b>
    </div>
  );
}

export function Bar({ pct, tone = "default", label }: { pct: number; tone?: "default" | "nectar" | "warn" | "danger"; label: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={cx("bar", tone !== "default" && tone)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)}>
      <i style={{ width: `${w}%` }} />
    </div>
  );
}

/** Monospace formula with an optional expanded line of live values. */
export function FormulaBlock({ formula, live, caption }: { formula: ReactNode; live?: ReactNode; caption?: ReactNode }) {
  return (
    <div className="stack-sm">
      <div className="eq" role="math" aria-label="formula">{formula}</div>
      {live ? <div className="eq wrap-ok" aria-live="polite">{live}</div> : null}
      {caption ? <p className="caption">{caption}</p> : null}
    </div>
  );
}

/** Explorer link. The href must come from configuration or an API response, never hand-built per call site. */
export function TxLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <span className="dim">{children}</span>;
  return (
    <a className="link" href={href} target="_blank" rel="noreferrer noopener">
      {children}
      <span className="sr-only"> (opens explorer in a new tab)</span>
    </a>
  );
}

/** Three-hexagon decorative mark, drawn in tokens. */
export function Hexmark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  const hex = (cx0: number, cy: number, r: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const a = ((60 * k - 90) * Math.PI) / 180;
      return `${(cx0 + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    }).join(" ");
  return (
    <svg className={cx("hexmark", className)} width={size} height={size} viewBox="0 0 200 200" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <polygon points={hex(100, 60, 44)} />
      <polygon points={hex(57, 136, 44)} />
      <polygon points={hex(143, 136, 44)} />
    </svg>
  );
}

/** Tiny SVG sparkline; stroke uses currentColor (set via a token class). */
export function Sparkline({ values, width = 120, height = 28, label }: { values: number[]; width?: number; height?: number; label: string }) {
  if (values.length < 2) return <span className="caption">no history yet</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="accent">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
