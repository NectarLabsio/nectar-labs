"use client";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { Button } from "./primitives";

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  /** Prevent closing while a wallet is open. */
  locked?: boolean;
}

/** Accessible dialog: focus moves in, Escape closes, focus is trapped and restored. */
export function Modal({ open, title, onClose, children, actions, locked }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
      if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
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
  }, [open, onClose, locked]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId} style={{ fontSize: 20 }}>{title}</h2>
          <Button variant="ghost" onClick={onClose} disabled={locked} aria-label="Close">
            Close
          </Button>
        </div>
        {children}
        {actions ? <div className="modal-acts">{actions}</div> : null}
      </div>
    </div>
  );
}

export interface SignPreview {
  label: string;
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  /** gas units, decimal string */
  gas: string;
  /** yoctoNEAR, decimal string */
  deposit: string;
  /** decoded ft_on_transfer msg, if any */
  msg?: unknown;
}

const fmtGas = (g: string) => `${(BigInt(g) / 1_000_000_000_000n).toString()} TGas`;
function fmtYocto(y: string): string {
  const v = BigInt(y);
  if (v === 0n) return "0 NEAR";
  if (v < 1_000_000_000_000_000_000n) return `${v.toString()} yoctoNEAR`;
  const base = 10n ** 24n;
  const frac = (v % base).toString().padStart(24, "0").replace(/0+$/, "");
  return `${(v / base).toString()}${frac ? "." + frac : ""} NEAR`;
}

export interface SignModalProps {
  preview: SignPreview | null;
  signer: string | null;
  network: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra lines (premium, health after) rendered above the JSON. */
  summary?: ReactNode;
}

/** The sign preview every write passes through: exact msg JSON, gas and deposit before the wallet opens. */
export function SignModal({ preview, signer, network, busy, error, onConfirm, onCancel, summary }: SignModalProps) {
  if (!preview) return null;
  const msgJson = preview.msg === undefined ? null : JSON.stringify(preview.msg, null, 2);
  return (
    <Modal
      open
      title={`Review: ${preview.label}`}
      onClose={onCancel}
      locked={busy}
      actions={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={busy}>
            {busy ? "Waiting for wallet" : "Open wallet to sign"}
          </Button>
        </>
      }
    >
      <p className="small">Nothing is sent until you approve it in your wallet. This is exactly what the wallet will be asked to sign.</p>
      <div className="kvs">
        <div className="kv"><span>Network</span><b>{network}</b></div>
        <div className="kv"><span>Signer</span><b>{signer ?? "not connected"}</b></div>
        <div className="kv"><span>Receiver</span><b>{preview.receiverId}</b></div>
        <div className="kv"><span>Method</span><b>{preview.methodName}</b></div>
        <div className="kv"><span>Gas (max, unused is refunded)</span><b data-testid="sign-gas">{fmtGas(preview.gas)}</b></div>
        <div className="kv"><span>Deposit</span><b data-testid="sign-deposit">{fmtYocto(preview.deposit)}</b></div>
      </div>
      {summary}
      {msgJson ? (
        <div className="stack-sm">
          <span className="label">msg (ft_on_transfer)</span>
          <pre className="codeblock" data-testid="sign-msg">{msgJson}</pre>
        </div>
      ) : null}
      <div className="stack-sm">
        <span className="label">args</span>
        <pre className="codeblock" data-testid="sign-args">{JSON.stringify(preview.args, null, 2)}</pre>
      </div>
      {error ? <p className="error danger-text" role="alert">{error}</p> : null}
    </Modal>
  );
}
