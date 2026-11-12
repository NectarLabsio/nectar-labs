"use client";
// WO-62c: the sign preview for a batch (one wallet request, several transactions). Same rule as SignModal: every transaction's
// receiver, method, gas, deposit and exact args JSON are on screen, in order, before the wallet opens.
import type { ReactNode } from "react";
import type { TxIntent } from "@nectar/sdk";
import { Button, Modal, SignJson, SignTxRows } from "@nectar/ui";

export interface BatchSignModalProps {
  intents: readonly TxIntent[] | null;
  title: string;
  signer: string | null;
  network: string;
  busy: boolean;
  error?: string | null;
  summary?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BatchSignModal({ intents, title, signer, network, busy, error, summary, onConfirm, onCancel }: BatchSignModalProps) {
  if (!intents || intents.length === 0) return null;
  const n = intents.length;
  return (
    <Modal
      open
      title={`Review: ${title}`}
      onClose={onCancel}
      locked={busy}
      actions={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={busy} data-testid="batch-confirm">
            {busy ? "Waiting for wallet" : "Open wallet to sign"}
          </Button>
        </>
      }
    >
      <p className="small">
        Nothing is sent until you approve it in your wallet. Your wallet is asked once to sign {n === 1 ? "this transaction" : `these ${n} transactions`}, in this order. This is exactly what it will be asked to sign.
      </p>
      {summary}
      {intents.map((i, k) => (
        <section className="stack-sm" key={`${i.receiverId}-${k}`} data-testid={`batch-tx-${k}`} aria-label={`Transaction ${k + 1} of ${n}`}>
          <span className="label">
            #{k + 1} {i.label}
          </span>
          <SignTxRows preview={i} signer={signer} network={network} testIdPrefix={`batch-${k}`} />
          <SignJson preview={i} testIdPrefix={`batch-${k}`} />
        </section>
      ))}
      {error ? (
        <p className="error danger-text" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
