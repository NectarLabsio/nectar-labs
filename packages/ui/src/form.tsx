"use client";
// App v2 form and row components (Borrow / Position / Markets artboards, WO-33b). Styles: app.css `nx-` classes, tokens only.
import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { healthTone, type HealthTone } from "./charts";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export type BadgeTone = "pos" | "warn" | "neg" | "info" | "plain";

/** Small status badge (text always carries the meaning; colour is secondary). */
export function NxBadge({ tone = "plain", children, className, ...rest }: { tone?: BadgeTone; children: ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={cx("nx-badge", tone !== "plain" && tone, className)} {...rest}>
      {children}
    </span>
  );
}

const ICONS = {
  clock: <><circle cx="10" cy="10" r="7.5" /><path d="M10 6v4l2.5 2" /></>,
  info: <><circle cx="10" cy="10" r="7.5" /><path d="M10 6v5M10 13.5v.5" /></>,
  warn: <><path d="M10 3l8 14H2z" /><path d="M10 8v4M10 14.5v.5" /></>,
  check: <><circle cx="10" cy="10" r="7.5" /><path d="M6.5 10.2l2.4 2.3 4.6-4.8" /></>,
} as const;

/** Proactive notice row (weekend outlook, health below 1, settling, Profit-Lock cap). */
export function Notice({ tone = "warn", icon = "info", title, children, action, busy, testId, live }: { tone?: "warn" | "pos" | "neg" | "info"; icon?: keyof typeof ICONS; title?: ReactNode; children?: ReactNode; action?: ReactNode; busy?: boolean; testId?: string; live?: boolean }) {
  return (
    <div className={cx("nx-notice", tone !== "warn" && tone)} data-testid={testId} role={live ? "status" : undefined}>
      <span className="ic" aria-hidden="true">
        {busy ? (
          <span className="nx-spin" style={{ margin: 0 }} />
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            {ICONS[icon]}
          </svg>
        )}
      </span>
      <span className="nx-notice-body">
        {title ? <b>{title}</b> : null}
        {children ? <span className="nx-k">{children}</span> : null}
      </span>
      {action}
    </div>
  );
}

/** Key / value row with a divider (`kvr`). */
export function Kvr({ k, v, testId, title }: { k: ReactNode; v: ReactNode; testId?: string; title?: string }) {
  return (
    <div className="nx-kvr" title={title}>
      <span>{k}</span>
      <b data-testid={testId}>{v}</b>
    </div>
  );
}

/** Inline "i" tooltip: focusable, the text is in the accessible name. */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button className="nx-tip" type="button" aria-label={label}>
      i<span role="tooltip">{children}</span>
    </button>
  );
}

/** Big amount input in a well: label + right note on top, input + token pill, helper line + quick buttons below. */
export function AmountBox({
  label,
  note,
  token,
  error,
  helper,
  quick,
  children,
  input,
  testId,
}: {
  label: ReactNode;
  note?: ReactNode;
  token: ReactNode;
  error?: string | null;
  helper?: ReactNode;
  quick?: Array<{ label: string; onClick: () => void; on?: boolean; disabled?: boolean }>;
  children?: ReactNode;
  input: InputHTMLAttributes<HTMLInputElement>;
  testId?: string;
}) {
  const auto = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = input.id ?? `amt${auto}`;
  const msgId = `${id}-msg`;
  return (
    <div className={cx("nx-amt", error && "err")} data-testid={testId}>
      <div className="nx-amt-top">
        <label htmlFor={id}>{label}</label>
        {note ? <span>{note}</span> : null}
      </div>
      <div className="nx-amt-mid">
        <input inputMode="decimal" autoComplete="off" {...input} id={id} aria-invalid={error ? true : undefined} aria-describedby={msgId} />
        <span className="nx-token">{token}</span>
      </div>
      {children}
      <div className="nx-amt-bot" id={msgId}>
        <span className={error ? "nx-neg" : undefined} role={error ? "alert" : undefined}>
          {error ?? helper}
        </span>
        {quick && quick.length ? (
          <span className="nx-mini">
            {quick.map((q) => (
              <button key={q.label} type="button" className={q.on ? "on" : undefined} onClick={q.onClick} disabled={q.disabled}>
                {q.label}
              </button>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** USDC as a drawn blue coin (DESIGN_SYSTEM §3c). */
export function Coin({ size }: { size?: number }) {
  return (
    <span className="nx-coin" aria-hidden="true" style={size ? { width: size, height: size, fontSize: size * 0.43 } : undefined}>
      $
    </span>
  );
}

/** Option card (Protection: Weekend Shield / Standard / Event Shield). */
export function Opt({ on, title, detail, price, flag, disabled, onClick, testId }: { on: boolean; title: ReactNode; detail: ReactNode; price?: ReactNode; flag?: ReactNode; disabled?: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" className={cx("nx-opt", on && "on")} aria-pressed={on} disabled={disabled} onClick={onClick} data-testid={testId}>
      {flag ? <span className="flag">{flag}</span> : null}
      <span className="t">{title}</span>
      <span className="d">{detail}</span>
      {price ? <span className="p">{price}</span> : null}
    </button>
  );
}

/** On/off switch (role=switch). */
export function Switch({ checked, onChange, label, testId, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string; disabled?: boolean }) {
  return <button type="button" className="nx-switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} data-testid={testId} />;
}

/** Text field in the v2 style (label above, error below). */
export function TextField({ label, error, hint, ...input }: { label: string; error?: string | null; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = input.id ?? `tf${auto}`;
  return (
    <div className="nx-field">
      <label className="nx-k" htmlFor={id}>
        {label}
      </label>
      <input className="nx-txt" {...input} id={id} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-d` : undefined} />
      {error ? (
        <span className="nx-field-err" id={`${id}-d`}>
          {error}
        </span>
      ) : hint ? (
        <span className="nx-k" id={`${id}-d`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Health ring (Main account dock, Position): value in the centre, arc filled to health / max, tone by health. */
export function Ring({ value, max = 2.5, size = 160, label, word, okAt = 1.2, tightAt = 1 }: { value: number | null; max?: number; size?: number; label: string; word?: string; okAt?: number; tightAt?: number }) {
  const inf = value === null || !Number.isFinite(value);
  const tone: HealthTone = inf ? "pos" : healthTone(value, okAt, tightAt);
  const fill = inf ? 100 : Math.max(0, Math.min(1, value / max)) * 100;
  const text = inf ? "n/a" : value.toFixed(2);
  const small = size < 100;
  return (
    <svg className={cx("nx-ring", tone)} viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={`${label}: ${text}${word ? `, ${word}` : ""}`}>
      <circle className="nx-ring-track" cx="80" cy="80" r="64" fill="none" strokeWidth={small ? 16 : 12} />
      <circle className="nx-ring-fill" cx="80" cy="80" r="64" fill="none" strokeWidth={small ? 16 : 12} strokeLinecap="round" pathLength={100} strokeDasharray={`${fill.toFixed(1)} 100`} transform="rotate(-90 80 80)" />
      <text className="nx-ring-val" x="80" y={small || !word ? 92 : 84} textAnchor="middle" fontSize={small ? 34 : 36}>
        {text}
      </text>
      {word && !small ? (
        <text className="nx-ring-lab" x="80" y="106" textAnchor="middle">
          {word}
        </text>
      ) : null}
    </svg>
  );
}

/** Breadcrumb trail; the last item is the current page. */
export function Crumb({ items }: { items: Array<{ label: ReactNode; href?: string; render?: (children: ReactNode) => ReactNode }> }) {
  return (
    <nav className="nx-crumb" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="nx-row" style={{ gap: 8 }}>
          {i > 0 ? <span aria-hidden="true">/</span> : null}
          {it.render ? it.render(it.label) : it.href ? <a href={it.href}>{it.label}</a> : <span className="nx-head" aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
