"use client";
import type { ReactNode } from "react";
import type { TxIntent } from "@nectar/sdk";

/** Build an intent or return the validation message. */
export function attempt(f: () => TxIntent): TxIntent | string {
  try {
    return f();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** One owner write: fields, inline payload preview, and a button that opens the sign modal (msg, gas, deposit) before the wallet. */
export function OwnerAction({ title, intent, enabled, onRun, children, testId }: { title: string; intent: TxIntent | string | null; enabled: boolean; onRun: (t: TxIntent) => void; children?: ReactNode; testId?: string }) {
  const ok = intent !== null && typeof intent !== "string";
  return (
    <div className="nx-action" data-testid={testId}>
      <h3>{title}</h3>
      {children}
      {typeof intent === "string" ? <p className="nx-k nx-warn" role="alert">{intent}</p> : null}
      {ok ? (
        <details className="nx-details">
          <summary className="nx-k">Payload: {intent.methodName}</summary>
          <pre tabIndex={0} className="nx-code">{JSON.stringify(intent.args, null, 2)}</pre>
        </details>
      ) : null}
      <button type="button" className="nx-btn quiet sm" disabled={!enabled || !ok} onClick={() => ok && onRun(intent)}>{ok ? intent.label : title}</button>
    </div>
  );
}
