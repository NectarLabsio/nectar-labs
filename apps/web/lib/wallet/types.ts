import type { TxIntent } from "@nectar/sdk";

export interface TxOutcome {
  hash: string | null;
  ok: boolean;
  logs: string[];
  failure: string | null;
  /** base64 SuccessValue of the transaction (e.g. ft_transfer_call returns the used amount). */
  successValue: string | null;
}

/** Everything the pages need from a wallet. Concrete modules: near-connect (D-011) and the E2E key adapter. */
export interface WalletAdapter {
  readonly id: string;
  readonly label: string;
  /** Restore a previous session without UI. Must not hit the network unless the user connected before. */
  restore(): Promise<string | null>;
  connect(): Promise<string | null>;
  disconnect(): Promise<void>;
  signAndSend(intent: TxIntent): Promise<TxOutcome>;
  /** Several transactions in ONE wallet request (near-connect `signAndSendTransactions`), outcomes in the same order. Throws when the wallet refuses. */
  signAndSendMany(intents: readonly TxIntent[]): Promise<TxOutcome[]>;
}

interface RawOutcome {
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string; outcome?: { logs?: string[] } };
  receipts_outcome?: Array<{ outcome?: { logs?: string[]; status?: unknown } }>;
  status?: { SuccessValue?: string; Failure?: unknown } | string;
  final_execution_status?: string;
}

/** Normalise a FinalExecutionOutcome-shaped object from any wallet. */
export function parseOutcome(raw: unknown): TxOutcome {
  const o = (raw ?? {}) as RawOutcome;
  const logs = [...(o.transaction_outcome?.outcome?.logs ?? []), ...(o.receipts_outcome ?? []).flatMap((r) => r.outcome?.logs ?? [])];
  const status = typeof o.status === "object" && o.status !== null ? o.status : {};
  const receiptFailure = (o.receipts_outcome ?? [])
    .map((r) => (r.outcome?.status as { Failure?: unknown } | undefined)?.Failure)
    .find((f) => f !== undefined);
  const failure = status.Failure ?? receiptFailure;
  return {
    hash: o.transaction?.hash ?? o.transaction_outcome?.id ?? null,
    ok: failure === undefined,
    logs,
    failure: failure === undefined ? null : JSON.stringify(failure),
    successValue: status.SuccessValue ?? null,
  };
}
