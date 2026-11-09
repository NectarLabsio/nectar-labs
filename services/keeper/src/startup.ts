// Startup guard: refuse to run when the key at KEEPER_KEY_PATH is a FullAccess key on chain.
// D-012 (deleting full-access keys on the keeper account) stays the primary control; this is the
// daemon-side backstop. Only a confirmed `full_access` refuses: an unreachable RPC (`unknown`) lets
// the keeper start and `/healthz` reports the allowance once it is readable.

import type { Allowance, CoreReader } from './chain.ts';

export class FullAccessKeyError extends Error {
  constructor(accountId: string) {
    super(
      `key at KEEPER_KEY_PATH is a FullAccess key on ${accountId}; the keeper only runs with a function-call key ` +
        `scoped to nectar-core keeper methods (D-012). Add a function-call key, point KEEPER_KEY_PATH at it, delete the full-access key.`,
    );
    this.name = 'FullAccessKeyError';
  }
}

export async function assertNotFullAccess(reader: Pick<CoreReader, 'keyAllowance'>, accountId: string): Promise<Allowance> {
  const a = await reader.keyAllowance();
  if (a.kind === 'full_access') throw new FullAccessKeyError(accountId);
  return a;
}
