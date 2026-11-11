// Exponential backoff with bounded jitter. Pure: the random source is injectable for tests.

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** Fraction of the delay that is randomised downward, 0..1 (0.5 → delay in [d/2, d]). */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1_000, maxMs: 300_000, jitter: 0.5 };

/** `baseMs` on the first attempt, doubling per further attempt, never above `capMs`. No jitter: the contract enforces its own cooldown. */
export function cappedCooldownMs(baseMs: number, attempts: number, capMs: number): number {
  return Math.min(capMs, baseMs * 2 ** Math.min(Math.max(attempts - 1, 0), 30));
}

export function backoffDelayMs(attempt: number, opts: BackoffOptions = DEFAULT_BACKOFF, rand: () => number = Math.random): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError('attempt must be a non-negative integer');
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.min(attempt, 30));
  const j = Math.min(1, Math.max(0, opts.jitter));
  return Math.round(exp * (1 - j * rand()));
}
