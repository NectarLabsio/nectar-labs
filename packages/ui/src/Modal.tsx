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

/** One line of the fee stack. `sub` lines are part of the line above (e.g. the referrer share of origination), not added to the total. */
export interface FeeLine {
  label: ReactNode;
  value: ReactNode;
  sub?: boolean;
}

/** Fee stack with its total (PRD §4.11: the sign modal shows the total of every fee before the wallet opens). */
export function FeeStackList({ lines, total, note, testId }: { lines: FeeLine[]; total: ReactNode; note?: ReactNode; testId?: string }) {
  return (
    <div className="stack-sm feestack" data-testid={testId}>
      <span className="label">Fees</span>
      <div className="kvs">
        {lines.map((l, i) => (
          <div className={l.sub ? "kv sub" : "kv"} key={i}>
            <span>{l.label}</span>
            <b className="num">{l.value}</b>
          </div>
        ))}
        <div className="kv total">
          <span>Total fees</span>
          <b className="num" data-testid={testId ? `${testId}-total` : undefined}>{total}</b>
        </div>
      </div>
      {note ? <p className="caption">{note}</p> : null}
    </div>
  );
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
  /** Fee stack and its total, rendered before the JSON. */
  fees?: { lines: FeeLine[]; total: ReactNode; note?: ReactNode };
}

/** The sign preview every write passes through: exact msg JSON, gas and deposit before the wallet opens. */
export function SignModal({ preview, signer, network, busy, error, onConfirm, onCancel, summary, fees }: SignModalProps) {
  if (!preview) return null;
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
      <SignTxRows preview={preview} signer={signer} network={network} testIdPrefix="sign" />
      {fees ? <FeeStackList lines={fees.lines} total={fees.total} note={fees.note} testId="sign-fees" /> : null}
      {summary}
      <SignJson preview={preview} testIdPrefix="sign" />
      {error ? <p className="error danger-text" role="alert">{error}</p> : null}
    </Modal>
  );
}

/** Network, signer, receiver, method, gas and deposit of a NEAR write (sign modal and the v2 review drawer). */
export function SignTxRows({ preview, signer, network, testIdPrefix = "sign" }: { preview: SignPreview; signer: string | null; network: string; testIdPrefix?: string }) {
  return (
    <div className="kvs">
      <div className="kv"><span>Network</span><b>{network}</b></div>
      <div className="kv"><span>Signer</span><b>{signer ?? "not connected"}</b></div>
      <div className="kv"><span>Receiver</span><b>{preview.receiverId}</b></div>
      <div className="kv"><span>Method</span><b>{preview.methodName}</b></div>
      <div className="kv"><span>Gas (max, unused is refunded)</span><b data-testid={`${testIdPrefix}-gas`}>{fmtGas(preview.gas)}</b></div>
      <div className="kv"><span>Deposit</span><b data-testid={`${testIdPrefix}-deposit`}>{fmtYocto(preview.deposit)}</b></div>
    </div>
  );
}

/** The decoded ft_on_transfer `msg` (if any) and the raw call args, exactly as the wallet receives them. */
export function SignJson({ preview, testIdPrefix = "sign" }: { preview: SignPreview; testIdPrefix?: string }) {
  const msgJson = preview.msg === undefined ? null : JSON.stringify(preview.msg, null, 2);
  return (
    <>
      {msgJson ? (
        <div className="stack-sm">
          <span className="label">msg (ft_on_transfer)</span>
          <pre className="codeblock" data-testid={`${testIdPrefix}-msg`}>{msgJson}</pre>
        </div>
      ) : null}
      <div className="stack-sm">
        <span className="label">args</span>
        <pre className="codeblock" data-testid={`${testIdPrefix}-args`}>{JSON.stringify(preview.args, null, 2)}</pre>
      </div>
    </>
  );
}

/** One Solana instruction as the user will sign it: program, named accounts with roles, decoded args and the raw data. */
export interface SolanaIxPreview {
  label: string;
  program: string;
  accounts: Array<{ name: string; address: string; signer: boolean; writable: boolean }>;
  args: Record<string, string>;
  dataHex: string;
}

export interface SolanaSignPreview {
  label: string;
  network: string;
  feePayer: string;
  instructions: SolanaIxPreview[];
  /** Network fee and rent lines (the Solana analogue of gas and deposit). */
  fees: FeeLine[];
  feesTotal: ReactNode;
  note?: ReactNode;
}

/** Sign preview for a Solana devnet transaction (Wallet Standard): every instruction, account and byte before the wallet opens. */
export function SolanaSignModal({ preview, busy, error, onConfirm, onCancel }: { preview: SolanaSignPreview | null; busy: boolean; error?: string | null; onConfirm: () => void; onCancel: () => void }) {
  if (!preview) return null;
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
      <p className="small">Nothing is sent until you approve it in your wallet. These are the exact instructions the wallet will be asked to sign, in order.</p>
      <div className="kvs">
        <div className="kv"><span>Network</span><b>{preview.network}</b></div>
        <div className="kv"><span>Fee payer</span><b className="mono">{preview.feePayer}</b></div>
        <div className="kv"><span>Instructions</span><b>{preview.instructions.length}</b></div>
      </div>
      <FeeStackList lines={preview.fees} total={preview.feesTotal} note={preview.note} testId="sol-sign-fees" />
      {preview.instructions.map((ix, i) => (
        <div className="stack-sm" key={i} data-testid={`sol-ix-${i}`}>
          <span className="label">
            #{i + 1} {ix.label}
          </span>
          <div className="kvs">
            <div className="kv"><span>Program</span><b className="mono">{ix.program}</b></div>
          </div>
          <pre className="codeblock" data-testid={`sol-ix-${i}-args`}>{JSON.stringify(ix.args, null, 2)}</pre>
          {ix.accounts.length ? (
            <pre className="codeblock">{ix.accounts.map((a) => `${a.name}${a.signer ? " (signer)" : ""}${a.writable ? " (writable)" : ""}\n  ${a.address}`).join("\n")}</pre>
          ) : null}
          <details>
            <summary className="small">Instruction data ({ix.dataHex.length / 2} bytes)</summary>
            <pre className="codeblock" data-testid={`sol-ix-${i}-data`}>{ix.dataHex}</pre>
          </details>
        </div>
      ))}
      {error ? <p className="error danger-text" role="alert">{error}</p> : null}
    </Modal>
  );
}
