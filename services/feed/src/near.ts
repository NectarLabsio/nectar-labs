// near-api-js 7.4.0 adapters for the feed (read-only; F-012). Names checked against the installed
// package's type definitions: JsonRpcProvider({url}).callFunctionRaw({contractId, method, args,
// blockQuery}) and .viewTransactionStatusWithReceipts({txHash, accountId, waitUntil}).

import { JsonRpcProvider } from 'near-api-js';
import type { LogBatch } from './db.ts';
import type { TxOutcomeFetcher, ViewReader, ViewResult } from './sources.ts';

export class NearViewReader implements ViewReader {
  private readonly provider: JsonRpcProvider;
  private readonly contractId: string;

  constructor(rpcUrl: string, contractId: string) {
    this.provider = new JsonRpcProvider({ url: rpcUrl });
    this.contractId = contractId;
  }

  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    const raw = await this.provider.callFunctionRaw({ contractId: this.contractId, method, args, blockQuery: { finality: 'final' } });
    const text = new TextDecoder().decode(new Uint8Array(raw.result));
    return { value: text === '' ? null : (JSON.parse(text) as unknown), blockHeight: raw.block_height };
  }
}

export class NearTxOutcomeFetcher implements TxOutcomeFetcher {
  private readonly provider: JsonRpcProvider;
  private readonly senderId: string;
  private readonly contractId: string;

  constructor(rpcUrl: string, senderId: string, contractId: string) {
    this.provider = new JsonRpcProvider({ url: rpcUrl });
    this.senderId = senderId;
    this.contractId = contractId;
  }

  async fetch(txHash: string): Promise<LogBatch[] | null> {
    const res = await this.provider.viewTransactionStatusWithReceipts({ txHash, accountId: this.senderId, waitUntil: 'FINAL' });
    const out: LogBatch[] = [];
    for (const r of res.receipts_outcome) {
      // Only logs emitted by nectar-core count as nectar events.
      if (r.outcome.executor_id !== this.contractId) continue;
      out.push({ receiptId: r.id, txHash, blockHeight: null, logs: r.outcome.logs });
    }
    return out;
  }
}
