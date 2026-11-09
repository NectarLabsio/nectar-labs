// /healthz and /runs (read-only). No request logging of addresses or headers: the server never reads
// `req.socket.remoteAddress` or forwarding headers, so no wallet ↔ IP join can be produced here.

import { createServer, type Server } from 'node:http';
import type { KeeperDb } from './db.ts';
import type { KeeperStatus } from './keeper.ts';

export interface HealthBody {
  ok: boolean;
  last_block_seen: number | null;
  last_tick_at: string | null;
  last_tick_ok: boolean;
  consecutive_errors: number;
  last_error: string | null;
  allowance: string;
  open_positions: number;
  pending_settlements: number;
  triggers_sent: number;
  uptime_s: number;
}

export function allowanceLabel(a: KeeperStatus['allowance']): string {
  switch (a.kind) {
    case 'unlimited':
      return 'unlimited';
    case 'limited':
      return `${a.yocto} yocto`;
    case 'full_access':
      return 'FULL_ACCESS (expected a function-call key)';
    case 'unknown':
      return `unknown: ${a.reason.slice(0, 120)}`;
  }
}

export function healthBody(s: KeeperStatus, pollMs: number, now: number): HealthBody {
  const fresh = s.lastTickAt !== null && now - s.lastTickAt <= 3 * pollMs;
  return {
    ok: fresh && s.consecutiveErrors < 3 && s.allowance.kind !== 'full_access',
    last_block_seen: s.lastBlockSeen,
    last_tick_at: s.lastTickAt === null ? null : new Date(s.lastTickAt).toISOString(),
    last_tick_ok: s.lastTickOk,
    consecutive_errors: s.consecutiveErrors,
    last_error: s.lastError,
    allowance: allowanceLabel(s.allowance),
    open_positions: s.openPositions,
    pending_settlements: s.pendingSettlements,
    triggers_sent: s.triggersSent,
    uptime_s: Math.floor((now - s.startedAt) / 1000),
  };
}

export function startHealthServer(status: KeeperStatus, db: KeeperDb, pollMs: number, port: number, host: string, now: () => number = Date.now): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const send = (code: number, body: unknown): void => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
    if (path === '/healthz') {
      const body = healthBody(status, pollMs, now());
      return send(body.ok ? 200 : 503, body);
    }
    if (path === '/runs') return send(200, { runs: db.runs(50) });
    return send(404, { error: 'not found' });
  });
  server.listen(port, host);
  return server;
}
