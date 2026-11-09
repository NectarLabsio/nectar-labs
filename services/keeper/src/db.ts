// SQLite state (node:sqlite, built into Node ≥ 22.13; no native addon). Holds the `keeper_runs`
// table the Keepers page reads (PRD §10.1), per-position retry state and minute heartbeats.
// Everything here is re-derivable from chain state: deleting the file is always safe.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type RunStatus = 'sent' | 'ok' | 'failed';

export interface RunRow {
  id: number;
  position_id: string;
  status: RunStatus;
  tx_hash: string | null;
  error: string | null;
  created_at: number;
}

export interface RetryState {
  attempts: number;
  next_attempt_at: number;
}

export class KeeperDb {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS keeper_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('sent','ok','failed')),
        tx_hash TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS keeper_runs_pos ON keeper_runs(position_id);
      CREATE TABLE IF NOT EXISTS keeper_retry (
        position_id TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        next_attempt_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS keeper_heartbeats (
        at INTEGER PRIMARY KEY,
        last_block INTEGER,
        open_positions INTEGER NOT NULL,
        pending_settlements INTEGER NOT NULL
      );
    `);
  }

  startRun(positionId: string, now: number): number {
    const r = this.db
      .prepare('INSERT INTO keeper_runs (position_id, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(positionId, 'sent', now, now);
    return Number(r.lastInsertRowid);
  }

  finishRun(id: number, status: Exclude<RunStatus, 'sent'>, txHash: string | null, error: string | null, now: number): void {
    this.db.prepare('UPDATE keeper_runs SET status = ?, tx_hash = ?, error = ?, updated_at = ? WHERE id = ?').run(status, txHash, error, now, id);
  }

  /** Runs left in `sent` by a crash: mark them failed so the chain state decides what happens next. */
  recoverInterrupted(now: number): number {
    const r = this.db
      .prepare("UPDATE keeper_runs SET status = 'failed', error = 'interrupted (restart)', updated_at = ? WHERE status = 'sent'")
      .run(now);
    return Number(r.changes);
  }

  runs(limit = 50): RunRow[] {
    return this.db
      .prepare('SELECT id, position_id, status, tx_hash, error, created_at FROM keeper_runs ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as RunRow[];
  }

  retry(positionId: string): RetryState | null {
    const row = this.db.prepare('SELECT attempts, next_attempt_at FROM keeper_retry WHERE position_id = ?').get(positionId);
    return row === undefined ? null : (row as unknown as RetryState);
  }

  setRetry(positionId: string, attempts: number, nextAttemptAt: number): void {
    this.db
      .prepare(
        'INSERT INTO keeper_retry (position_id, attempts, next_attempt_at) VALUES (?, ?, ?) ON CONFLICT(position_id) DO UPDATE SET attempts = excluded.attempts, next_attempt_at = excluded.next_attempt_at',
      )
      .run(positionId, attempts, nextAttemptAt);
  }

  clearRetry(positionId: string): void {
    this.db.prepare('DELETE FROM keeper_retry WHERE position_id = ?').run(positionId);
  }

  heartbeat(at: number, lastBlock: number | null, openPositions: number, pendingSettlements: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO keeper_heartbeats (at, last_block, open_positions, pending_settlements) VALUES (?, ?, ?, ?)')
      .run(at, lastBlock, openPositions, pendingSettlements);
  }

  lastHeartbeatAt(): number | null {
    const row = this.db.prepare('SELECT MAX(at) AS at FROM keeper_heartbeats').get() as { at: number | null } | undefined;
    return row?.at ?? null;
  }

  close(): void {
    this.db.close();
  }
}
