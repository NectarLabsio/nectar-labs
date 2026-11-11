// Request guards for paid / costly API routes (R2-04). Pure Web-API code: runs in route handlers and in `node --test`.
// Nothing here logs a client address; the token bucket keeps it in memory only, as a map key.

export const MAX_JSON_BODY_BYTES = 8 * 1024;

type Reject = { ok: false; response: Response };
export type Guarded<T> = { ok: true; value: T } | Reject;

const reject = (status: number, statusText: string, error: string, headers: Record<string, string> = {}): Reject => ({
  ok: false,
  response: Response.json({ status: statusText, error }, { status, headers: { "cache-control": "no-store", ...headers } }),
});

/**
 * Same-origin browser request only. `Sec-Fetch-Site` (all current browsers) must be `same-origin`; without it, `Origin` must
 * name this host. A request with neither header is refused: the only client is the panel served from this origin.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  if (site !== null) {
    if (site !== "same-origin") return false;
    // Browsers also send Origin on POST; when present it must agree.
    return origin === null || originMatches(req, origin);
  }
  return origin !== null && originMatches(req, origin);
}

function originMatches(req: Request, origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(req.url).host.toLowerCase());
  } catch {
    /* relative url: fall back to headers */
  }
  for (const h of [req.headers.get("host"), req.headers.get("x-forwarded-host")]) {
    for (const part of (h ?? "").split(",")) if (part.trim()) hosts.add(part.trim().toLowerCase());
  }
  return hosts.has(host);
}

/** `content-type: application/json` (parameters such as `charset` allowed). Anything else is a 415. */
export function isJsonContentType(req: Request): boolean {
  return (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() === "application/json";
}

/** Read at most `max` bytes of UTF-8 body; null when larger (declared or actual). Throws on invalid UTF-8. */
export async function readCappedText(req: Request, max: number): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}

/** Origin (403) → content type (415) → size (413) → JSON (400). Returns the parsed body. */
export async function guardJsonPost(req: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<Guarded<unknown>> {
  if (!isSameOrigin(req)) return reject(403, "forbidden", "Cross-origin requests are not accepted.");
  if (!isJsonContentType(req)) return reject(415, "unsupported_media_type", "content-type must be application/json.");
  let text: string | null;
  try {
    text = await readCappedText(req, maxBytes);
  } catch {
    return reject(400, "bad_request", "Body must be UTF-8 JSON.");
  }
  if (text === null) return reject(413, "payload_too_large", `Body over ${Math.floor(maxBytes / 1024)} KB.`);
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return reject(400, "bad_request", "JSON body required.");
  }
}

/**
 * Client key for rate limiting, never logged: `x-real-ip` (set by the proxy), else the last `x-forwarded-for` hop (the one the
 * nearest proxy appended; earlier hops are client-supplied), else one shared bucket. Spoofable without a trusted proxy, so
 * costly routes also apply a global bucket (lib/copilot/handler.ts).
 */
export function clientKey(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? "unknown";
}

/** In-memory token bucket per key: `capacity` requests, refilled continuously over `perMs`. */
export class TokenBucket {
  readonly capacity: number;
  readonly perMs: number;
  readonly maxKeys: number;
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(capacity: number, perMs: number, maxKeys = 10_000) {
    this.capacity = capacity;
    this.perMs = perMs;
    this.maxKeys = maxKeys;
  }

  /** Take one token. Returns 0 when allowed, otherwise the milliseconds until the next token. */
  take(key: string, now = Date.now()): number {
    const rate = this.capacity / this.perMs;
    const prev = this.buckets.get(key);
    const tokens = prev ? Math.min(this.capacity, prev.tokens + (now - prev.at) * rate) : this.capacity;
    if (tokens < 1) {
      this.buckets.set(key, { tokens, at: now });
      return Math.ceil((1 - tokens) / rate);
    }
    if (!prev && this.buckets.size >= this.maxKeys) this.prune(now);
    this.buckets.set(key, { tokens: tokens - 1, at: now });
    return 0;
  }

  /** Drop buckets that are full again (they behave exactly like an absent key); then the oldest if still over the cap. */
  private prune(now: number) {
    const rate = this.capacity / this.perMs;
    for (const [k, b] of this.buckets) if (b.tokens + (now - b.at) * rate >= this.capacity) this.buckets.delete(k);
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

/** 429 with Retry-After, or null when the request may proceed. `key` defaults to the client key; pass "*" for a global bucket. */
export function rateLimit(bucket: TokenBucket, req: Request, now = Date.now(), key = clientKey(req)): Response | null {
  const waitMs = bucket.take(key, now);
  if (waitMs === 0) return null;
  return reject(429, "rate_limited", "Too many requests. Wait a minute and try again.", { "retry-after": String(Math.max(1, Math.ceil(waitMs / 1000))) }).response;
}
