// CORS allowlist shared by the Feed and x402 (WO-34k). Unset list = each service's existing behaviour (Feed: `*`
// on every reply, no preflight; x402: no CORS headers). A set list (comma-separated origins, e.g. SITE_URL,APP_URL)
// allows exactly those origins: the reply echoes the matching Origin and adds `Vary: Origin`; any other origin gets
// no allow header and its preflight is refused with 403. Requests are never logged (no IPs, no Origin values).

import type { IncomingMessage, ServerResponse } from 'node:http';

export class CorsConfigError extends Error {}

/** null when unset/blank; otherwise the exact origins (scheme://host[:port], no path, no trailing slash). */
export function parseCorsOrigins(raw: string | undefined, envName = 'FEED_CORS_ORIGINS'): ReadonlySet<string> | null {
  if (raw === undefined || raw.trim() === '' || raw.startsWith('TODO-')) return null;
  const out = new Set<string>();
  for (const part of raw.split(',')) {
    const t = part.trim().replace(/\/+$/, '');
    if (t === '') continue;
    let u: URL;
    try {
      u = new URL(t);
    } catch {
      throw new CorsConfigError(`${envName}: ${JSON.stringify(t)} is not an origin (expected https://host[:port])`);
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.origin !== t) {
      throw new CorsConfigError(`${envName}: ${JSON.stringify(t)} is not a bare origin (scheme://host[:port], no path)`);
    }
    out.add(u.origin);
  }
  if (out.size === 0) throw new CorsConfigError(`${envName} is set but lists no origin`);
  return out;
}

export interface CorsPolicy {
  /** null = the service's legacy behaviour. */
  origins: ReadonlySet<string> | null;
  /** Legacy behaviour when `origins` is null: `*` (Feed) or no header at all (x402). */
  legacyWildcard: boolean;
  methods: string;
}

const originOf = (req: IncomingMessage): string | undefined => {
  const o = req.headers.origin;
  return Array.isArray(o) ? o[0] : o;
};

/** Headers to merge into every reply for this request. */
export function corsHeaders(policy: CorsPolicy, req: IncomingMessage): Record<string, string> {
  if (policy.origins === null) return policy.legacyWildcard ? { 'access-control-allow-origin': '*' } : {};
  const origin = originOf(req);
  if (origin !== undefined && policy.origins.has(origin)) {
    return { 'access-control-allow-origin': origin, 'access-control-expose-headers': '*', vary: 'Origin' };
  }
  return { vary: 'Origin' };
}

/**
 * Answers an OPTIONS preflight when an allowlist is set (204 for a listed origin, 403 otherwise) and returns true.
 * Returns false (caller handles the request as before) when no allowlist is set or the method is not OPTIONS.
 */
export function handlePreflight(policy: CorsPolicy, req: IncomingMessage, res: ServerResponse): boolean {
  if (policy.origins === null || req.method !== 'OPTIONS') return false;
  const h = corsHeaders(policy, req);
  if (h['access-control-allow-origin'] === undefined) {
    res.writeHead(403, { 'content-type': 'application/json', vary: 'Origin' }).end('{"error":"origin not allowed"}');
    return true;
  }
  res
    .writeHead(204, {
      ...h,
      'access-control-allow-methods': policy.methods,
      'access-control-allow-headers': '*',
      'access-control-max-age': '600',
    })
    .end();
  return true;
}
