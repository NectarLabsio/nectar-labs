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

/**
 * NEAR testnet RPC fallback order (WO-34k). D-025 primary first; then the other FastNEAR host (F-369: answered
 * `status` with chain_id testnet, not on the providers page); then dRPC and Intear (F-369: listed on
 * docs.near.org/api/rpc/providers, not probed). rpc.testnet.near.org is left out (deprecated, throttled; F-369).
 */
export const DEFAULT_RPC_FALLBACKS = [
  'https://test.rpc.fastnear.com',
  'https://rpc.testnet.fastnear.com',
  'https://near-testnet.drpc.org',
  'https://testnet-rpc.intea.rs',
] as const;

/**
 * NEAR_RPC_URLS (comma list, in order) > NEAR_RPC_URL alone (as before: an explicit single endpoint, e.g. a
 * sandbox, never falls back to testnet) > DEFAULT_RPC_FALLBACKS.
 */
export function rpcUrls(env: NodeJS.ProcessEnv): string[] {
  const blank = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-');
  if (!blank(env.NEAR_RPC_URLS)) {
    const list = [...new Set((env.NEAR_RPC_URLS as string).split(',').map((s) => s.trim()).filter((s) => s !== ''))];
    if (list.length > 0) return list;
  }
  if (!blank(env.NEAR_RPC_URL)) return [(env.NEAR_RPC_URL as string).trim()];
  return [...DEFAULT_RPC_FALLBACKS];
}

/** Tries each backend in order, starting from the last one that answered; rethrows the last error if all fail. */
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

export const viewReaderFor = (urls: readonly string[], contractId: string): ViewReader =>
  urls.length === 1 ? new NearViewReader(urls[0] as string, contractId) : new FallbackViewReader(urls.map((u) => new NearViewReader(u, contractId)));

export const txFetcherFor = (urls: readonly string[], senderId: string, contractId: string): TxOutcomeFetcher =>
  urls.length === 1
    ? new NearTxOutcomeFetcher(urls[0] as string, senderId, contractId)
    : new FallbackTxOutcomeFetcher(urls.map((u) => new NearTxOutcomeFetcher(u, senderId, contractId)));
