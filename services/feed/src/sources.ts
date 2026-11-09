// Where the indexer's data comes from, behind one interface.
//
// 1. ViewPollingSource (default, always on): reads views each interval — list_collaterals,
//    get_exit_capacity, list_quotes, list_positions — and writes snapshots + status transitions.
//    Needs nothing beyond `call_function` views.
// 2. TxStatusSource (optional): given known transaction hashes (e.g. the keeper's own
//    `keeper_runs.tx_hash`), fetches the outcome with receipts and feeds the NEP-297 logs to the DB
//    (PRD §10.2). near-api-js 7.4.0 exposes this as provider.viewTransactionStatusWithReceipts.
// A general "tail every receipt to nectar-core" source is NOT implemented: the cheapest documented
// RPC approach is unverified in docs/FACTS.md (researcher run requested in the WO-5 report).

import type { FeedDb, LogBatch, PositionObservation, QuoteRow } from './db.ts';
import { isExitCapacity } from './db.ts';
import { errMsg, type Logger } from './log.ts';

export interface ViewResult {
  value: unknown;
  blockHeight: number;
}

export interface ViewReader {
  view(method: string, args: Record<string, unknown>): Promise<ViewResult>;
}

export interface TxOutcomeFetcher {
  /** Returns one LogBatch per receipt of the transaction, or null if not found / not final yet. */
  fetch(txHash: string): Promise<LogBatch[] | null>;
}

export interface Source {
  readonly kind: string;
  poll(db: FeedDb, now: number): Promise<void>;
}

const PAGE = 50;
const MAX_PAGES = 200;

async function pageAll(reader: ViewReader, method: string, extra: Record<string, unknown>, onBlock: (h: number) => void): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { value, blockHeight } = await reader.view(method, { ...extra, from_index: p * PAGE, limit: PAGE });
    onBlock(blockHeight);
    if (!Array.isArray(value)) throw new Error(`${method} did not return an array`);
    out.push(...value);
    if (value.length < PAGE) break;
  }
  return out;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}
function s(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

export class ViewPollingSource implements Source {
  readonly kind = 'views';
  private readonly reader: ViewReader;
  private readonly log: Logger;

  constructor(reader: ViewReader, log: Logger) {
    this.reader = reader;
    this.log = log;
  }

  async poll(db: FeedDb, now: number): Promise<void> {
    let block = 0;
    const see = (h: number): void => {
      if (h > block) block = h;
    };
    const collaterals = await pageAll(this.reader, 'list_collaterals', {}, see);
    for (const c of collaterals) {
      const symbol = rec(c) && s(rec(c) as Record<string, unknown>, 'symbol');
      if (!symbol) {
        this.log.warn('abi_mismatch', { view: 'list_collaterals' });
        continue;
      }
      const { value, blockHeight } = await this.reader.view('get_exit_capacity', { symbol });
      see(blockHeight);
      if (!isExitCapacity(value)) {
        this.log.warn('abi_mismatch', { view: 'get_exit_capacity', symbol });
      } else {
        db.addSnapshot({ symbol, block_height: blockHeight, observed_at: now, capacity: value });
      }
      const quotes = await pageAll(this.reader, 'list_quotes', { symbol }, see);
      for (const q of quotes) {
        const o = rec(q);
        const id = o && s(o, 'quote_id', 'id');
        if (!o || id === null) continue;
        const row: QuoteRow = {
          quote_id: id,
          collateral: s(o, 'collateral') ?? symbol,
          amount_usd_e6: s(o, 'remaining_usd_e6', 'amount_usd_e6'),
          max_discount_bps: typeof o.max_discount_bps === 'number' ? o.max_discount_bps : null,
          status: s(o, 'status') ?? 'Live',
        };
        db.upsertQuoteFromView(row, now);
      }
    }
    const positions = await pageAll(this.reader, 'list_positions', {}, see);
    positions.forEach((p, i) => {
      const o = rec(p);
      const status = o?.status;
      if (!o || (status !== 'Open' && status !== 'Settling' && status !== 'Closed')) {
        this.log.warn('abi_mismatch', { view: 'list_positions', index: i });
        return;
      }
      const obs: PositionObservation = { position_id: s(o, 'position_id', 'id') ?? String(i), status, collateral: s(o, 'collateral') };
      db.upsertPosition(obs, block, now);
    });
    db.seeBlock(block);
  }
}

export class TxStatusSource implements Source {
  readonly kind = 'tx_status';
  private readonly fetcher: TxOutcomeFetcher;
  private readonly hashes: () => string[];
  private readonly done = new Set<string>();
  private readonly log: Logger;

  constructor(fetcher: TxOutcomeFetcher, hashes: () => string[], log: Logger) {
    this.fetcher = fetcher;
    this.hashes = hashes;
    this.log = log;
  }

  async poll(db: FeedDb, now: number): Promise<void> {
    for (const h of this.hashes()) {
      if (this.done.has(h)) continue;
      try {
        const batches = await this.fetcher.fetch(h);
        if (batches === null) continue;
        for (const b of batches) db.ingestLogs(b, now);
        this.done.add(h);
      } catch (e) {
        this.log.warn('tx_status_failed', { tx_hash: h, error: errMsg(e) });
      }
    }
  }
}
