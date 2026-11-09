// Read-only REST per services/feed/openapi.yaml. Responses cached 10 s (PRD §10.2). Privacy: no
// account ids in any response and no request logging of addresses or headers.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AssetSnapshot, FeedDb, SettlementRow } from './db.ts';

export const ROUTES = ['/api/feed', '/api/asset/{id}', '/api/settlements', '/api/oneclick', '/healthz'] as const;
export const CACHE_MS = 10_000;
const SYMBOL_RE = /^[A-Za-z0-9._-]{1,32}$/;

export interface ApiOptions {
  now?: () => number;
  pollMs?: number;
  source?: string;
}

function asset(s: AssetSnapshot): Record<string, unknown> {
  const c = s.capacity;
  return {
    symbol: s.symbol,
    q_usd_e6: c.q_usd_e6,
    r_usd_e6: c.r_usd_e6,
    d_usd_e6: c.d_usd_e6,
    haircut_bps: c.haircut_bps,
    session_open: c.session_open,
    oracle_price_usd_e6: c.oracle_price_usd_e6,
    oracle_age_s: Number(c.oracle_age_s),
    oracle_fresh: c.oracle_fresh,
    b_c_usd_per_unit_e6: c.b_c_usd_per_unit_e6 ?? null,
    limit_bps_effective: c.limit_bps_effective,
    block_height: s.block_height,
    observed_at: new Date(s.observed_at).toISOString(),
  };
}

function settlement(r: SettlementRow): Record<string, unknown> {
  return {
    position_id: r.position_id,
    quote_id: r.quote_id,
    disc_bps: r.disc_bps,
    repay_usd_e6: r.repay_usd_e6,
    seize_units: r.seize_units,
    status: r.status,
    block_height: r.block_height,
    tx_hash: r.tx_hash,
    source: r.source,
    observed_at: new Date(r.observed_at).toISOString(),
  };
}

function intParam(u: URL, k: string, dflt: number, max: number): number | null {
  const raw = u.searchParams.get(k);
  if (raw === null) return dflt;
  if (!/^\d+$/.test(raw)) return null;
  return Math.min(max, Math.max(1, Number(raw)));
}

export interface Reply {
  status: number;
  body: unknown;
  cacheable: boolean;
}

export function route(db: FeedDb, method: string, rawUrl: string, opts: ApiOptions = {}): Reply {
  const now = (opts.now ?? Date.now)();
  if (method !== 'GET' && method !== 'HEAD') return { status: 405, body: { error: 'method not allowed' }, cacheable: false };
  const u = new URL(rawUrl, 'http://feed.local');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const lastBlock = db.meta('last_block');
  const asOf = { as_of_block: lastBlock === null ? null : Number(lastBlock), as_of: new Date(now).toISOString() };

  if (path === '/healthz') {
    const lastPoll = db.meta('last_poll_at');
    const pollMs = opts.pollMs ?? 10_000;
    const fresh = lastPoll !== null && now - Number(lastPoll) <= 3 * pollMs;
    return {
      status: fresh ? 200 : 503,
      body: {
        ok: fresh,
        last_block_seen: asOf.as_of_block,
        last_poll_at: lastPoll === null ? null : new Date(Number(lastPoll)).toISOString(),
        last_error: db.meta('last_error'),
        source: opts.source ?? 'views',
        events_indexed: db.eventCount(),
      },
      cacheable: false,
    };
  }
  if (path === '/api/oneclick') return { status: 200, body: db.oneClickReport(now), cacheable: true };
  if (path === '/api/feed') return { status: 200, body: { ...asOf, assets: db.latestSnapshots().map(asset) }, cacheable: true };

  const m = /^\/api\/asset\/([^/]+)$/.exec(path);
  if (m) {
    const symbol = decodeURIComponent(m[1] ?? '');
    if (!SYMBOL_RE.test(symbol)) return { status: 400, body: { error: 'bad symbol' }, cacheable: false };
    const limit = intParam(u, 'limit', 168, 2000);
    if (limit === null) return { status: 400, body: { error: 'bad limit' }, cacheable: false };
    const hist = db.history(symbol, limit);
    const latest = hist[0];
    if (latest === undefined) return { status: 404, body: { error: 'unknown asset' }, cacheable: true };
    return {
      status: 200,
      body: {
        ...asOf,
        symbol,
        latest: asset(latest),
        history: hist.map((s) => ({
          block_height: s.block_height,
          observed_at: new Date(s.observed_at).toISOString(),
          q_usd_e6: s.capacity.q_usd_e6,
          limit_bps_effective: s.capacity.limit_bps_effective,
          haircut_bps: s.capacity.haircut_bps,
          session_open: s.capacity.session_open,
        })),
        quotes: db.quotes(symbol),
      },
      cacheable: true,
    };
  }
  if (path === '/api/settlements') {
    const limit = intParam(u, 'limit', 50, 500);
    const pid = u.searchParams.get('position_id');
    if (limit === null || (pid !== null && !/^\d{1,20}$/.test(pid))) return { status: 400, body: { error: 'bad query' }, cacheable: false };
    return { status: 200, body: { ...asOf, items: db.settlements(limit, pid).map(settlement) }, cacheable: true };
  }
  return { status: 404, body: { error: 'not found' }, cacheable: false };
}

export function createApi(db: FeedDb, opts: ApiOptions = {}): Server {
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; reply: Reply }>();
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const key = req.url ?? '/';
    const hit = cache.get(key);
    let reply: Reply;
    if (hit !== undefined && now() - hit.at < CACHE_MS && req.method === 'GET') reply = hit.reply;
    else {
      reply = route(db, req.method ?? 'GET', key, opts);
      if (reply.cacheable && req.method === 'GET') {
        if (cache.size > 1000) cache.clear();
        cache.set(key, { at: now(), reply });
      }
    }
    res.writeHead(reply.status, {
      'content-type': 'application/json',
      'cache-control': reply.cacheable ? `public, max-age=${CACHE_MS / 1000}` : 'no-store',
      'access-control-allow-origin': '*',
    });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(reply.body));
  });
}
