// x402 resource server for the Feed CSV export (PRD v7 §10.5; F-328/F-329). One paid route,
// `GET /api/feed/export.csv`, priced per route as `{amount: "10000", asset: <usdc-mock>}` (0.01 mock USDC)
// on `near:testnet`, payTo = treasury. Flow per request: no/invalid payment -> 402 with PAYMENT-REQUIRED;
// verified payment -> fetch the CSV from the local Feed -> settle through the facilitator -> 200 + CSV.
// The upstream is fetched before settlement, so a Feed outage never charges the payer.
// No request logging of IPs, user agents or payer ids (privacy rule; logs carry outcome codes only).

import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createNearFacilitator, type FacilitatorNearSigner, type FacilitatorNearSignerConfig } from '@fastnear/x402/facilitator';
import { createNearResourceServer, type FacilitatorEndpointConfig, type NearFacilitatorClient } from '@fastnear/x402/server';
import { x402HTTPResourceServer, type HTTPAdapter, type HTTPRequestContext, type RoutesConfig } from '@x402/core/server';
import { corsHeaders, handlePreflight, type CorsPolicy } from '../../feed/src/cors.ts';
import { MAX_TIMEOUT_SECONDS, NETWORK, ROUTE, SCHEME, type X402Config } from './config.ts';

export type Log = (msg: string, fields?: Record<string, string | number | boolean | null>) => void;
export const jsonLog: Log = (msg, fields = {}) => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), service: 'x402', msg, ...fields }) + '\n');

export function routes(cfg: Pick<X402Config, 'network' | 'amount' | 'asset' | 'payTo'>): RoutesConfig {
  if (cfg.network !== NETWORK) throw new Error(`network must be ${NETWORK}`);
  return {
    [ROUTE]: {
      accepts: [{ scheme: SCHEME, network: cfg.network, price: { amount: cfg.amount, asset: cfg.asset }, payTo: cfg.payTo, maxTimeoutSeconds: MAX_TIMEOUT_SECONDS }],
      description: 'Nectar Feed capacity history export (CSV; NEAR testnet, mock collateral)',
      mimeType: 'text/csv',
    },
  };
}

/** Our own facilitator: relayer = x402-relayer.nectar.testnet (full-access key), or an injected signer in tests. */
export function buildFacilitator(signer: FacilitatorNearSigner | FacilitatorNearSignerConfig): ReturnType<typeof createNearFacilitator> {
  return createNearFacilitator({ registrations: [{ network: NETWORK, signer }] });
}

class NodeAdapter implements HTTPAdapter {
  private readonly req: IncomingMessage;
  private readonly url: URL;
  constructor(req: IncomingMessage) {
    this.req = req;
    this.url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  }
  getHeader(name: string): string | undefined {
    const v = this.req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  }
  getMethod(): string {
    return this.req.method ?? 'GET';
  }
  getPath(): string {
    return this.url.pathname;
  }
  getUrl(): string {
    return this.url.toString();
  }
  getAcceptHeader(): string {
    return this.getHeader('accept') ?? '*/*';
  }
  getUserAgent(): string {
    return ''; // never read (privacy rule)
  }
}

export type Upstream = () => Promise<{ ok: boolean; status: number; body: string }>;

export function feedUpstream(feedUrl: string, fetchImpl: typeof fetch = fetch): Upstream {
  return async () => {
    const r = await fetchImpl(`${feedUrl.replace(/\/+$/, '')}/api/feed/export.csv`);
    return { ok: r.ok, status: r.status, body: await r.text() };
  };
}

export interface PaidServerDeps {
  cfg: Pick<X402Config, 'network' | 'amount' | 'asset' | 'payTo'>;
  facilitator: NearFacilitatorClient | FacilitatorEndpointConfig;
  upstream: Upstream;
  log?: Log;
  /** GET /health (hosted.ts healthReply); absent = 404 as before. */
  health?: () => Promise<{ status: number; body: Record<string, unknown> }>;
  /** X402_CORS_ORIGINS allowlist; absent = no CORS headers (as before). */
  cors?: CorsPolicy;
}

export async function createPaidServer(d: PaidServerDeps): Promise<Server> {
  const log = d.log ?? jsonLog;
  const http = new x402HTTPResourceServer(createNearResourceServer({ facilitators: d.facilitator }), routes(d.cfg));
  await http.initialize();
  const cors: CorsPolicy = d.cors ?? { origins: null, legacyWildcard: false, methods: 'GET, OPTIONS' };
  return createServer((req, res) => {
    if (handlePreflight(cors, req, res)) return;
    for (const [k, v] of Object.entries(corsHeaders(cors, req))) res.setHeader(k, v);
    void (async () => {
      const adapter = new NodeAdapter(req);
      const ctx: HTTPRequestContext = { adapter, path: adapter.getPath(), method: adapter.getMethod() };
      if (d.health !== undefined && ctx.path === '/health' && (ctx.method === 'GET' || ctx.method === 'HEAD')) {
        const h = await d.health();
        res.writeHead(h.status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(ctx.method === 'HEAD' ? undefined : JSON.stringify(h.body));
        return;
      }
      if (!http.requiresPayment(ctx)) {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
        return;
      }
      const r = await http.processHTTPRequest(ctx);
      if (r.type === 'payment-error') {
        log('payment_required', { status: r.response.status });
        res.writeHead(r.response.status, r.response.headers).end(r.response.body === undefined ? undefined : JSON.stringify(r.response.body));
        return;
      }
      if (r.type === 'no-payment-required') {
        res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"route is not priced"}');
        return;
      }
      const up = await d.upstream().catch(() => null);
      if (up === null || !up.ok) {
        log('upstream_failed', { status: up?.status ?? null });
        res.writeHead(502, { 'content-type': 'application/json' }).end('{"error":"feed unavailable; payment not settled"}');
        return;
      }
      const s = await http.processSettlement(r.paymentPayload, r.paymentRequirements, r.declaredExtensions, { request: ctx, responseBody: Buffer.from(up.body) });
      if (!s.success) {
        log('settle_failed', { reason: s.errorReason });
        res.writeHead(s.response.status, s.response.headers).end(s.response.body === undefined ? undefined : JSON.stringify(s.response.body));
        return;
      }
      log('paid', { network: s.network, transaction: s.transaction });
      res.writeHead(200, { ...s.headers, 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' }).end(up.body);
    })().catch((e: unknown) => {
      log('error', { error: e instanceof Error ? e.message : String(e) });
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"internal"}');
    });
  });
}

/** Remote facilitator endpoint; `secret` is the bearer token createFacilitatorHttp expects, null for none. */
export function facilitatorEndpoint(url: string, secret: string | null): FacilitatorEndpointConfig {
  if (secret === null) return { url };
  const auth = { authorization: `Bearer ${secret}` };
  return { url, createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: auth }) };
}

type RouteTerms = Pick<X402Config, 'network' | 'amount' | 'asset' | 'payTo'>;

/** The first field where `requirements` differs from this service's own route terms, or null when they all match. */
export function requirementsMismatch(requirements: unknown, cfg: RouteTerms): string | null {
  const got = typeof requirements === 'object' && requirements !== null ? (requirements as Record<string, unknown>) : {};
  const want = { scheme: SCHEME, network: cfg.network, asset: cfg.asset, amount: cfg.amount, payTo: cfg.payTo, maxTimeoutSeconds: MAX_TIMEOUT_SECONDS };
  for (const [field, value] of Object.entries(want)) if (got[field] !== value) return field;
  return null;
}

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();

export interface FacilitatorHttpDeps {
  cfg: RouteTerms;
  /** Bearer token every request must present. There is no unauthenticated mode. */
  secret: string;
  log?: Log;
}

/**
 * Facilitator over HTTP (/verify, /settle, /supported) so other resource servers can use X402_FACILITATOR_URL.
 * SR-32: the relayer pays gas for whatever settles here, so a caller needs the shared secret and can only
 * settle this service's own route terms. @x402/near checks the delegate against the requirements it is given,
 * so pinning the requirements pins the transfer.
 */
export function createFacilitatorHttp(f: ReturnType<typeof createNearFacilitator>, d: FacilitatorHttpDeps): Server {
  const log = d.log ?? jsonLog;
  const expected = sha256(d.secret);
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)));
    };
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (token === undefined || !timingSafeEqual(sha256(token), expected)) {
      log('facilitator_refused', { reason: 'unauthorized' });
      return send(401, { error: 'unauthorized' });
    }
    if (req.method === 'GET' && path === '/supported') return send(200, f.getSupported());
    if (req.method !== 'POST' || (path !== '/verify' && path !== '/settle')) return send(404, { error: 'not found' });
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      void (async () => {
        const b = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { paymentPayload: Parameters<typeof f.verify>[0]; paymentRequirements: Parameters<typeof f.verify>[1] };
        const field = requirementsMismatch(b.paymentRequirements, d.cfg);
        if (field !== null) {
          log('facilitator_refused', { reason: 'requirements_not_allowed', field });
          send(403, { error: 'requirements_not_allowed', field });
          return;
        }
        const out = path === '/verify' ? await f.verify(b.paymentPayload, b.paymentRequirements) : await f.settle(b.paymentPayload, b.paymentRequirements);
        log(path === '/verify' ? 'facilitator_verify' : 'facilitator_settle', { ok: 'isValid' in out ? out.isValid : out.success });
        send(200, out);
      })().catch((e: unknown) => send(400, { error: e instanceof Error ? e.message : String(e) }));
    });
  });
}
