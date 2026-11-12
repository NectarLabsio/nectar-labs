// near-api-js 7.4.0 adapters for the feed (read-only; F-012). Names checked against the installed
// package's type definitions: Provider.callFunctionRaw({contractId, method, args, blockQuery}) and
// .viewTransactionStatusWithReceipts({txHash, accountId, waitUntil}). WO-35k: both take the fallback provider from
// near-rpc.ts (FastNEAR x2, dRPC, Intear; rotate on 429 / 5xx / timeout with backoff), shared by every view caller.

import type { Provider } from 'near-api-js';
import { TESTNET_RPC_FALLBACKS, nearRpcUrls } from './near-rpc.ts';
import type { LogBatch } from './db.ts';
import type { TxOutcomeFetcher, ViewReader, ViewResult } from './sources.ts';

export class NearViewReader implements ViewReader {
  private readonly provider: Provider;
  private readonly contractId: string;

  constructor(provider: Provider, contractId: string) {
    this.provider = provider;
    this.contractId = contractId;
  }

  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    const raw = await this.provider.callFunctionRaw({ contractId: this.contractId, method, args, blockQuery: { finality: 'final' } });
    const text = new TextDecoder().decode(new Uint8Array(raw.result));
    return { value: text === '' ? null : (JSON.parse(text) as unknown), blockHeight: raw.block_height };
  }
}

export class NearTxOutcomeFetcher implements TxOutcomeFetcher {
  private readonly provider: Provider;
  private readonly senderId: string;
  private readonly contractId: string;

  constructor(provider: Provider, senderId: string, contractId: string) {
    this.provider = provider;
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

/** NEAR testnet RPC fallback order: near-rpc.ts TESTNET_RPC_FALLBACKS (mirror of packages/sdk/src/rpc.ts; F-413). */
export const DEFAULT_RPC_FALLBACKS = TESTNET_RPC_FALLBACKS;

/**
 * NEAR_RPC_URLS (comma list, exact) > NEAR_RPC_URL first, then DEFAULT_RPC_FALLBACKS (WO-35k: a single FastNEAR URL no longer
 * runs without a fallback; a loopback sandbox URL or NEAR_RPC_FALLBACK=off stays alone) > DEFAULT_RPC_FALLBACKS.
 */
export const rpcUrls = (env: NodeJS.ProcessEnv): string[] => nearRpcUrls(env);

/** Tries each backend in order, starting from the last one that answered; rethrows the last error if all fail. (Pre-WO-35k; RPC calls now use near-rpc.ts.) */
export class Fallback<T> {
  private readonly items: readonly T[];
  private cur = 0;

  constructor(items: readonly T[]) {
    if (items.length === 0) throw new Error('Fallback needs at least one backend');
    this.items = items;
  }

  get index(): number {
    return this.cur;
  }

  async run<R>(fn: (t: T) => Promise<R>): Promise<R> {
    let last: unknown = null;
    for (let i = 0; i < this.items.length; i++) {
      const idx = (this.cur + i) % this.items.length;
      try {
        const out = await fn(this.items[idx] as T);
        this.cur = idx;
        return out;
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }
}

export class FallbackViewReader implements ViewReader {
  private readonly fb: Fallback<ViewReader>;
  constructor(readers: readonly ViewReader[]) {
    this.fb = new Fallback(readers);
  }
  view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    return this.fb.run((r) => r.view(method, args));
  }
}

export class FallbackTxOutcomeFetcher implements TxOutcomeFetcher {
  private readonly fb: Fallback<TxOutcomeFetcher>;
  constructor(fetchers: readonly TxOutcomeFetcher[]) {
    this.fb = new Fallback(fetchers);
  }
  fetch(txHash: string): Promise<LogBatch[] | null> {
    return this.fb.run((f) => f.fetch(txHash));
  }
}

export const viewReaderFor = (provider: Provider, contractId: string): ViewReader => new NearViewReader(provider, contractId);

export const txFetcherFor = (provider: Provider, senderId: string, contractId: string): TxOutcomeFetcher => new NearTxOutcomeFetcher(provider, senderId, contractId);
