// Feed SQLite store (node:sqlite). Idempotent by construction: events are keyed by
// (receipt_id, log_index), snapshots by (symbol, block_height), positions by id. Re-ingesting the same
// batch after a restart is a no-op. Raw event data is kept for audit; REST never returns account ids.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { num, parseEventLog, str } from './events.ts';

export interface ExitCapacity {
  q_usd_e6: string;
  r_usd_e6: string;
  d_usd_e6: string;
  haircut_bps: number;
  session_open: boolean;
  oracle_price_usd_e6: string;
  oracle_age_s: number | string;
  oracle_fresh: boolean;
  b_c_usd_per_unit_e6?: string | null;
  limit_bps_effective: number;
  capacity_usd_e6?: string;
}

export interface AssetSnapshot {
  symbol: string;
  block_height: number;
  observed_at: number;
  capacity: ExitCapacity;
}

export interface PositionObservation {
  position_id: string;
  status: 'Open' | 'Settling' | 'Closed';
  collateral: string | null;
}

export interface LogBatch {
  receiptId: string;
  txHash: string | null;
  blockHeight: number | null;
  logs: string[];
}

export interface QuoteRow {
  quote_id: string;
  collateral: string | null;
  amount_usd_e6: string | null;
  max_discount_bps: number | null;
  status: string;
}

export interface SettlementRow {
  position_id: string;
  quote_id: string | null;
  disc_bps: number | null;
  repay_usd_e6: string | null;
  seize_units: string | null;
  status: string | null;
  block_height: number | null;
  tx_hash: string | null;
  source: 'event' | 'view';
  observed_at: number;
}

/** One verified dry quote of a 3-size set; amounts are base units (strings), rate/impact from base units only (C-014). */
export interface OneClickPairSample {
  notional_usd: number;
  amount_in: string;
  amount_out: string;
  min_amount_out: string;
  rate_e6: string;
  impact_bps: number;
  worst_impact_bps: number;
  correlation_id: string;
}

export interface OneClickSetRow {
  pair_id: string;
  origin: string;
  destination: string;
  observed_at: number;
  samples: OneClickPairSample[];
}

/** GET /api/oneclick body (openapi `OneClick`); also the source for MCP. */
export interface OneClickReport {
  as_of: string;
  pairs: Array<{ id: string; origin: string; destination: string; verified: true; correlation_id: string; observed_at: string; samples: OneClickPairSample[] }>;
  assets: Array<{ symbol: string; status: 'no_route' | 'route'; observed_at: string }>;
}

export function isExitCapacity(v: unknown): v is ExitCapacity {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.q_usd_e6 === 'string' && typeof c.r_usd_e6 === 'string' && typeof c.d_usd_e6 === 'string' &&
    typeof c.haircut_bps === 'number' && typeof c.session_open === 'boolean' && typeof c.oracle_price_usd_e6 === 'string' &&
    typeof c.oracle_fresh === 'boolean' && typeof c.limit_bps_effective === 'number'
  );
}

export class FeedDb {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id TEXT NOT NULL, log_index INTEGER NOT NULL,
        tx_hash TEXT, block_height INTEGER, event TEXT NOT NULL, data TEXT NOT NULL, observed_at INTEGER NOT NULL,
        UNIQUE (receipt_id, log_index)
      );
      CREATE TABLE IF NOT EXISTS asset_snapshots (
        symbol TEXT NOT NULL, block_height INTEGER NOT NULL, observed_at INTEGER NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (symbol, block_height)
      );
      CREATE TABLE IF NOT EXISTS quotes (
        quote_id TEXT PRIMARY KEY, collateral TEXT, amount_usd_e6 TEXT, max_discount_bps INTEGER,
        status TEXT NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS positions (
        position_id TEXT PRIMARY KEY, collateral TEXT, status TEXT NOT NULL, updated_block INTEGER, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id TEXT NOT NULL, quote_id TEXT, disc_bps INTEGER, repay_usd_e6 TEXT, seize_units TEXT, status TEXT,
        block_height INTEGER, tx_hash TEXT, source TEXT NOT NULL CHECK (source IN ('event','view')),
        dedupe_key TEXT NOT NULL UNIQUE, observed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oneclick_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair_id TEXT NOT NULL, origin TEXT NOT NULL, destination TEXT NOT NULL, observed_at INTEGER NOT NULL,
        set_key TEXT NOT NULL UNIQUE, samples TEXT NOT NULL, responses TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oneclick_assets (
        symbol TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('no_route','route')), observed_at INTEGER NOT NULL
      );
    `);
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  bumpMeta(key: string): void {
    this.setMeta(key, String(Number(this.meta(key) ?? '0') + 1));
  }

  /** 1Click R_c series: one verified 3-size set. Idempotent per set of correlation ids; `responses` = full signed quotes. */
  addOneClickSet(r: OneClickSetRow, responses: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO oneclick_sets (pair_id, origin, destination, observed_at, set_key, samples, responses) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(r.pair_id, r.origin, r.destination, r.observed_at, r.samples.map((s) => s.correlation_id).join(','), JSON.stringify(r.samples), responses);
  }

  /** Latest set per pair, newest first (`limit` sets per pair). */
  oneClickSets(pairId: string | null, limit = 1): Array<OneClickSetRow & { responses: string }> {
    const ids = pairId === null ? (this.db.prepare('SELECT DISTINCT pair_id FROM oneclick_sets ORDER BY pair_id').all() as Array<{ pair_id: string }>).map((r) => r.pair_id) : [pairId];
    const st = this.db.prepare('SELECT pair_id, origin, destination, observed_at, samples, responses FROM oneclick_sets WHERE pair_id = ? ORDER BY id DESC LIMIT ?');
    return ids.flatMap((id) =>
      (st.all(id, limit) as Array<{ pair_id: string; origin: string; destination: string; observed_at: number; samples: string; responses: string }>).map((r) => ({
        ...r,
        samples: JSON.parse(r.samples) as OneClickPairSample[],
      })),
    );
  }

  setOneClickAsset(symbol: string, status: 'no_route' | 'route', observedAt: number): void {
    this.db
      .prepare('INSERT INTO oneclick_assets (symbol, status, observed_at) VALUES (?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET status = excluded.status, observed_at = excluded.observed_at')
      .run(symbol, status, observedAt);
  }

  oneClickAssets(): Array<{ symbol: string; status: 'no_route' | 'route'; observed_at: number }> {
    return this.db.prepare('SELECT symbol, status, observed_at FROM oneclick_assets ORDER BY symbol').all() as unknown as Array<{ symbol: string; status: 'no_route' | 'route'; observed_at: number }>;
  }

  /** The single view of 1Click data used by REST and MCP. `as_of` = last sampler tick (else `now`). */
  oneClickReport(now: number): OneClickReport {
    const tick = this.meta('oneclick_last_tick_at');
    const iso = (t: number): string => new Date(t).toISOString();
    return {
      as_of: iso(tick === null ? now : Number(tick)),
      pairs: this.oneClickSets(null, 1).map((s) => ({
        id: s.pair_id,
        origin: s.origin,
        destination: s.destination,
        verified: true as const,
        correlation_id: (s.samples[1] ?? s.samples[0])?.correlation_id ?? '',
        observed_at: iso(s.observed_at),
        samples: s.samples,
      })),
      assets: this.oneClickAssets().map((a) => ({ symbol: a.symbol, status: a.status, observed_at: iso(a.observed_at) })),
    };
  }

  meta(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }

  seeBlock(h: number | null): void {
    if (h === null) return;
    const cur = Number(this.meta('last_block') ?? '0');
    if (h > cur) this.setMeta('last_block', String(h));
  }

  /** Parses NEP-297 logs of one receipt and applies them. Returns the number of new events stored. */
  ingestLogs(b: LogBatch, now: number): number {
    let added = 0;
    this.seeBlock(b.blockHeight);
    b.logs.forEach((line, i) => {
      const p = parseEventLog(line);
      if (!p.ok) return;
      const r = this.db
        .prepare('INSERT OR IGNORE INTO events (receipt_id, log_index, tx_hash, block_height, event, data, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(b.receiptId, i, b.txHash, b.blockHeight, p.value.event, JSON.stringify(p.value.data), now);
      if (Number(r.changes) === 0) return; // already applied
      added++;
      this.apply(p.value.event, p.value.data, b, i, now);
    });
    return added;
  }

  private apply(event: string, d: Record<string, unknown>, b: LogBatch, logIndex: number, now: number): void {
    const qid = str(d, 'quote_id');
    switch (event) {
      case 'quote_funded':
        if (qid === null) return;
        this.db
          .prepare(
            "INSERT INTO quotes (quote_id, collateral, amount_usd_e6, max_discount_bps, status, updated_at) VALUES (?, ?, ?, ?, 'Live', ?) ON CONFLICT(quote_id) DO UPDATE SET collateral = excluded.collateral, amount_usd_e6 = excluded.amount_usd_e6, max_discount_bps = excluded.max_discount_bps, updated_at = excluded.updated_at",
          )
          .run(qid, str(d, 'collateral'), str(d, 'amount_usd_e6'), num(d, 'max_discount_bps'), now);
        return;
      case 'quote_topped_up': {
        if (qid === null) return;
        const row = this.db.prepare('SELECT amount_usd_e6 FROM quotes WHERE quote_id = ?').get(qid) as { amount_usd_e6: string | null } | undefined;
        const add = str(d, 'amount_usd_e6');
        if (row === undefined || row.amount_usd_e6 === null || add === null) return;
        this.db.prepare('UPDATE quotes SET amount_usd_e6 = ?, updated_at = ? WHERE quote_id = ?').run((BigInt(row.amount_usd_e6) + BigInt(add)).toString(), now, qid);
        return;
      }
      case 'quote_exiting':
      case 'quote_withdrawn':
        if (qid === null) return;
        this.db.prepare('UPDATE quotes SET status = ?, updated_at = ? WHERE quote_id = ?').run(event === 'quote_exiting' ? 'Exiting' : 'Withdrawn', now, qid);
        return;
      case 'position_opened':
        this.upsertPosition({ position_id: str(d, 'position_id') ?? '', status: 'Open', collateral: str(d, 'collateral') }, b.blockHeight, now, false);
        return;
      case 'preliq_triggered':
        this.upsertPosition({ position_id: str(d, 'position_id') ?? '', status: 'Settling', collateral: null }, b.blockHeight, now, false);
        return;
      case 'settled_near': {
        const pid = str(d, 'position_id');
        if (pid === null) return;
        this.db
          .prepare(
            "INSERT OR IGNORE INTO settlements (position_id, quote_id, disc_bps, repay_usd_e6, seize_units, status, block_height, tx_hash, source, dedupe_key, observed_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'event', ?, ?)",
          )
          .run(pid, qid, num(d, 'disc_bps'), str(d, 'repay_usd_e6'), str(d, 'seize_units'), b.blockHeight, b.txHash, `ev:${b.receiptId}:${logIndex}`, now);
        return;
      }
      default:
        return;
    }
  }

  /** Records a position status; a change into Settling/Closed seen via views becomes a `view` settlement row (events write their own). */
  upsertPosition(p: PositionObservation, blockHeight: number | null, now: number, fromView = true): void {
    if (p.position_id === '') return;
    const prev = this.db.prepare('SELECT status FROM positions WHERE position_id = ?').get(p.position_id) as { status: string } | undefined;
    this.db
      .prepare(
        'INSERT INTO positions (position_id, collateral, status, updated_block, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(position_id) DO UPDATE SET collateral = COALESCE(excluded.collateral, positions.collateral), status = excluded.status, updated_block = excluded.updated_block, updated_at = excluded.updated_at',
      )
      .run(p.position_id, p.collateral, p.status, blockHeight, now);
    if (fromView && prev !== undefined && prev.status !== p.status && p.status !== 'Open') {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO settlements (position_id, quote_id, disc_bps, repay_usd_e6, seize_units, status, block_height, tx_hash, source, dedupe_key, observed_at) VALUES (?, NULL, NULL, NULL, NULL, ?, ?, NULL, 'view', ?, ?)",
        )
        .run(p.position_id, p.status, blockHeight, `view:${p.position_id}:${p.status}`, now);
    }
  }

  upsertQuoteFromView(q: QuoteRow, now: number): void {
    this.db
      .prepare(
        'INSERT INTO quotes (quote_id, collateral, amount_usd_e6, max_discount_bps, status, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(quote_id) DO UPDATE SET collateral = COALESCE(excluded.collateral, quotes.collateral), amount_usd_e6 = COALESCE(excluded.amount_usd_e6, quotes.amount_usd_e6), max_discount_bps = COALESCE(excluded.max_discount_bps, quotes.max_discount_bps), status = excluded.status, updated_at = excluded.updated_at',
      )
      .run(q.quote_id, q.collateral, q.amount_usd_e6, q.max_discount_bps, q.status, now);
  }

  addSnapshot(s: AssetSnapshot): void {
    this.seeBlock(s.block_height);
    this.db
      .prepare('INSERT OR IGNORE INTO asset_snapshots (symbol, block_height, observed_at, data) VALUES (?, ?, ?, ?)')
      .run(s.symbol, s.block_height, s.observed_at, JSON.stringify(s.capacity));
  }

  latestSnapshots(): AssetSnapshot[] {
    const rows = this.db
      .prepare(
        'SELECT s.symbol, s.block_height, s.observed_at, s.data FROM asset_snapshots s JOIN (SELECT symbol, MAX(block_height) AS bh FROM asset_snapshots GROUP BY symbol) m ON s.symbol = m.symbol AND s.block_height = m.bh ORDER BY s.symbol',
      )
      .all() as Array<{ symbol: string; block_height: number; observed_at: number; data: string }>;
    return rows.map((r) => ({ symbol: r.symbol, block_height: r.block_height, observed_at: r.observed_at, capacity: JSON.parse(r.data) as ExitCapacity }));
  }

  history(symbol: string, limit: number): AssetSnapshot[] {
    const rows = this.db
      .prepare('SELECT symbol, block_height, observed_at, data FROM asset_snapshots WHERE symbol = ? ORDER BY block_height DESC LIMIT ?')
      .all(symbol, limit) as Array<{ symbol: string; block_height: number; observed_at: number; data: string }>;
    return rows.map((r) => ({ symbol: r.symbol, block_height: r.block_height, observed_at: r.observed_at, capacity: JSON.parse(r.data) as ExitCapacity }));
  }

  quotes(symbol: string): QuoteRow[] {
    return this.db
      .prepare('SELECT quote_id, collateral, amount_usd_e6, max_discount_bps, status FROM quotes WHERE collateral = ? ORDER BY CAST(quote_id AS INTEGER)')
      .all(symbol) as unknown as QuoteRow[];
  }

  settlements(limit: number, positionId: string | null): SettlementRow[] {
    const sql =
      'SELECT position_id, quote_id, disc_bps, repay_usd_e6, seize_units, status, block_height, tx_hash, source, observed_at FROM settlements' +
      (positionId === null ? '' : ' WHERE position_id = ?') +
      ' ORDER BY id DESC LIMIT ?';
    const st = this.db.prepare(sql);
    return (positionId === null ? st.all(limit) : st.all(positionId, limit)) as unknown as SettlementRow[];
  }

  eventCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
  }

  close(): void {
    this.db.close();
  }
}
