// Read-only REST per services/feed/openapi.yaml. Responses cached 10 s (PRD §10.2). Privacy: no
// account ids in any response and no request logging of addresses or headers.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { corsHeaders, handlePreflight, type CorsPolicy } from './cors.ts';
import type { AssetSnapshot, FeedDb, SettlementRow } from './db.ts';
import type { RpcStatus } from './near-rpc.ts';
import { CURSOR_KEY } from './neardata.ts';

export const ROUTES = ['/api/feed', '/api/feed/export.csv', '/api/asset/{id}', '/api/settlements', '/api/oneclick', '/healthz', '/health'] as const;
/** Columns of /api/feed/export.csv (the x402-paid export, services/x402). No account ids. */
export const EXPORT_COLUMNS = [
  'symbol', 'block_height', 'observed_at', 'q_usd_e6', 'r_usd_e6', 'd_usd_e6', 'haircut_bps', 'session_open',
  'capacity_usd_e6', 'oracle_price_usd_e6', 'oracle_fresh', 'limit_bps_effective',
] as const;
const EXPORT_ROWS_PER_ASSET = 168;
export const CACHE_MS = 10_000;
const SYMBOL_RE = /^[A-Za-z0-9._-]{1,32}$/;

export interface ApiOptions {
  now?: () => number;
  pollMs?: number;
  source?: string;
  /** Public contract ids reported by /health (no keys, no user accounts). */
  contracts?: Record<string, string | null>;
  /** Service version (package.json) and optional commit (NECTAR_GIT_SHA) for /health. */
  version?: { version: string; commit: string | null };
  /** Where indexing started on an empty DB (FEED_START_BLOCK), reported by /health. */
  startBlock?: string;
  /** CORS allowlist (FEED_CORS_ORIGINS); undefined = legacy `*`. */
  cors?: CorsPolicy;
  /**
   * WO-35k event-history marker: `indexed` = a Neardata block tail feeds the event tables; `unavailable` = views mode
   * (FEED_INDEXER=views), no block tail, so event lists answer empty with this marker. Default: from `source` (contains
   * `neardata` → indexed), else indexed when `source` is unset.
   */
  history?: 'indexed' | 'unavailable';
  /** NEAR RPC fallback status (near-rpc.ts), reported by /health as `rpc`. */
  rpcStatus?: () => RpcStatus;
}

export function historyMode(opts: ApiOptions): 'indexed' | 'unavailable' {
  if (opts.history !== undefined) return opts.history;
  if (opts.source === undefined) return 'indexed';
  return opts.source.split('+').includes('neardata') ? 'indexed' : 'unavailable';
}

export const LEGACY_CORS: CorsPolicy = { origins: null, legacyWildcard: true, methods: 'GET, HEAD, POST, OPTIONS' };

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
  /** Default application/json; a string body with another type is sent verbatim. */
  contentType?: string;
}

const csvCell = (v: unknown): string => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Capacity history per asset (newest first, at most 168 rows each) as CSV. */
export function exportCsv(db: FeedDb): string {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const latest of db.latestSnapshots()) {
    for (const s of db.history(latest.symbol, EXPORT_ROWS_PER_ASSET)) {
      const c = s.capacity;
      const cap = c.capacity_usd_e6 ?? (((BigInt(c.q_usd_e6) + BigInt(c.r_usd_e6) + BigInt(c.d_usd_e6)) * (10_000n - BigInt(c.haircut_bps))) / 10_000n).toString();
      const row = [s.symbol, s.block_height, new Date(s.observed_at).toISOString(), c.q_usd_e6, c.r_usd_e6, c.d_usd_e6, c.haircut_bps, c.session_open, cap, c.oracle_price_usd_e6, c.oracle_fresh, c.limit_bps_effective];
      lines.push(row.map(csvCell).join(','));
    }
  }
  return lines.join('\n') + '\n';
}

export function route(db: FeedDb, method: string, rawUrl: string, opts: ApiOptions = {}): Reply {
  const now = (opts.now ?? Date.now)();
  if (method !== 'GET' && method !== 'HEAD') return { status: 405, body: { error: 'method not allowed' }, cacheable: false };
  const u = new URL(rawUrl, 'http://feed.local');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const lastBlock = db.meta('last_block');
  const asOf = { as_of_block: lastBlock === null ? null : Number(lastBlock), as_of: new Date(now).toISOString() };
  const history = historyMode(opts);

  if (path === '/healthz' || path === '/health') {
    const lastPoll = db.meta('last_poll_at');
    const pollMs = opts.pollMs ?? 10_000;
    const fresh = lastPoll !== null && now - Number(lastPoll) <= 3 * pollMs;
    if (path === '/health') {
      // WO-35k honest head. Indexed: the Neardata final height, never below the last indexed block (a final view at block X
      // proves the head is >= X). Views mode: no block tail runs, so the head is the block height of the latest final view
      // (a neardata_final left in the DB by an earlier run is stale and ignored); lag is then 0 by construction.
      const ndRaw = history === 'indexed' ? db.meta('neardata_final') : null;
      const nd = ndRaw === null ? null : Number(ndRaw);
      const head = nd === null ? asOf.as_of_block : asOf.as_of_block === null ? nd : Math.max(nd, asOf.as_of_block);
      const headSource = head === null ? null : nd !== null && head === nd ? 'neardata_final' : 'view_block';
      // WO-71: the Neardata block cursor itself and its distance to the Neardata final height; null in views-only mode.
      const curRaw = history === 'indexed' ? db.meta(CURSOR_KEY) : null;
      const cursor = curRaw !== null && /^\d+$/.test(curRaw) ? Number(curRaw) : null;
      return {
        status: fresh ? 200 : 503,
        body: {
          ok: fresh,
          last_indexed_block: asOf.as_of_block,
          chain_head: head,
          chain_head_source: headSource,
          lag_blocks: head === null || asOf.as_of_block === null ? null : head - asOf.as_of_block,
          indexer_cursor: cursor,
          indexer_lag_blocks: cursor === null || nd === null ? null : nd - cursor,
          last_poll_at: lastPoll === null ? null : new Date(Number(lastPoll)).toISOString(),
          poll_age_s: lastPoll === null ? null : Math.max(0, Math.round((now - Number(lastPoll)) / 1000)),
          last_error: db.meta('last_error'),
          source: opts.source ?? 'views',
          start_block: opts.startBlock ?? 'head',
          events_indexed: db.eventCount(),
          history,
          rpc: opts.rpcStatus?.() ?? null,
          contracts: opts.contracts ?? {},
          version: opts.version?.version ?? null,
          commit: opts.version?.commit ?? null,
        },
        cacheable: false,
      };
    }
    return {
      status: fresh ? 200 : 503,
      body: {
        ok: fresh,
        last_block_seen: asOf.as_of_block,
        last_poll_at: lastPoll === null ? null : new Date(Number(lastPoll)).toISOString(),
        last_error: db.meta('last_error'),
        source: opts.source ?? 'views',
        events_indexed: db.eventCount(),
        history,
      },
      cacheable: false,
    };
  }
  if (path === '/api/oneclick') return { status: 200, body: db.oneClickReport(now), cacheable: true };
  if (path === '/api/feed/export.csv') return { status: 200, body: exportCsv(db), cacheable: true, contentType: 'text/csv; charset=utf-8' };
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
    // Views mode has no event history: an empty list with the marker, never rows synthesized from view status changes.
    return { status: 200, body: { ...asOf, history, items: history === 'indexed' ? db.settlements(limit, pid).map(settlement) : [] }, cacheable: true };
  }
  return { status: 404, body: { error: 'not found' }, cacheable: false };
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** REST handler (cache + CORS). Also mounted by the single-port server (server.ts). */
export function apiHandler(db: FeedDb, opts: ApiOptions = {}): Handler {
  const now = opts.now ?? Date.now;
  const cors = opts.cors ?? LEGACY_CORS;
  const cache = new Map<string, { at: number; reply: Reply }>();
  return (req: IncomingMessage, res: ServerResponse) => {
    if (handlePreflight(cors, req, res)) return;
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
      'content-type': reply.contentType ?? 'application/json',
      'cache-control': reply.cacheable ? `public, max-age=${CACHE_MS / 1000}` : 'no-store',
      ...corsHeaders(cors, req),
    });
    const out = typeof reply.body === 'string' && reply.contentType !== undefined ? reply.body : JSON.stringify(reply.body);
    res.end(req.method === 'HEAD' ? undefined : out);
  };
}

export function createApi(db: FeedDb, opts: ApiOptions = {}): Server {
  return createServer(apiHandler(db, opts));
}
