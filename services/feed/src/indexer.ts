// Runs every source once per interval with exponential backoff on failure. Restart-safe: all writes
// are idempotent (see db.ts), so a crash mid-poll just repeats work.

import type { FeedDb } from './db.ts';
import { errMsg, type Logger } from './log.ts';
import type { Source } from './sources.ts';

export class Indexer {
  private readonly db: FeedDb;
  private readonly sources: Source[];
  private readonly log: Logger;
  private readonly pollMs: number;
  private readonly now: () => number;
  consecutiveErrors = 0;

  constructor(db: FeedDb, sources: Source[], log: Logger, pollMs: number, now: () => number = Date.now) {
    this.db = db;
    this.sources = sources;
    this.log = log;
    this.pollMs = pollMs;
    this.now = now;
  }

  async pollOnce(): Promise<boolean> {
    let ok = true;
    for (const s of this.sources) {
      try {
        await s.poll(this.db, this.now());
      } catch (e) {
        ok = false;
        this.db.setMeta('last_error', `${s.kind}: ${errMsg(e)}`.slice(0, 300));
        this.log.error('poll_failed', { source: s.kind, error: errMsg(e) });
      }
    }
    if (ok) {
      this.consecutiveErrors = 0;
      this.db.setMeta('last_poll_at', String(this.now()));
      this.db.setMeta('last_error', '');
    } else this.consecutiveErrors++;
    return ok;
  }

  nextDelayMs(): number {
    if (this.consecutiveErrors === 0) return this.pollMs;
    return Math.min(300_000, this.pollMs * 2 ** Math.min(this.consecutiveErrors, 5));
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.pollOnce();
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.nextDelayMs());
        signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
      });
    }
  }
}
