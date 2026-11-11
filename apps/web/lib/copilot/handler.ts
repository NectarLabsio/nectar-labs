// POST /api/copilot logic (R2-04), kept out of the route file so `node --test` can drive it with plain Requests.
// Order: same-origin (403) → JSON content type (415) → 8 KB body (413) → JSON (400) → per-IP token bucket (429) → work.
import { TokenBucket, guardJsonPost, rateLimit } from "../api/guard.ts";
import { liveRequestBody, type CopilotBundle } from "./verify.ts";

export const NOTES_MAX_CHARS = 4000;

export interface CopilotDeps {
  apiKey: () => string;
  model: string;
  /** Live round trip for exact request bytes (server.ts liveBundle). */
  live: (requestBody: string, nonceHex: string) => Promise<CopilotBundle>;
  /** Recorded fixture response, DCAP verdict computed once and cached by the caller. */
  fixture: () => Promise<Record<string, unknown>>;
  /** Live calls spend NEAR AI credit; fixture calls are served from memory. Per-client buckets, plus a global ceiling on live calls. */
  buckets: { live: TokenBucket; liveGlobal: TokenBucket; fixture: TokenBucket };
  /** Server-side log for upstream failures (no client address, no request body). */
  log?: (msg: string) => void;
}

/** 5 live calls per minute per client and 30 across all clients; 30 fixture calls per minute per client (no outbound requests, cached verdict). */
export const defaultBuckets = (): CopilotDeps["buckets"] => ({ live: new TokenBucket(5, 60_000), liveGlobal: new TokenBucket(30, 60_000), fixture: new TokenBucket(30, 60_000) });

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function handleCopilotPost(req: Request, d: CopilotDeps): Promise<Response> {
  const g = await guardJsonPost(req);
  if (!g.ok) return g.response;
  const body = (g.value !== null && typeof g.value === "object" ? g.value : {}) as { nonce?: unknown; notes?: unknown; fixture?: unknown };

  if (body.fixture === true) {
    const limited = rateLimit(d.buckets.fixture, req);
    if (limited) return limited;
    return json(await d.fixture());
  }
  if (!d.apiKey()) return json({ status: "key_missing" }, 503);
  const nonce = typeof body.nonce === "string" ? body.nonce.toLowerCase() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(nonce)) return json({ status: "bad_request", error: "nonce must be 64 hex chars" }, 400);
  if (!notes || notes.length > NOTES_MAX_CHARS) return json({ status: "bad_request", error: `notes must be 1–${NOTES_MAX_CHARS} characters` }, 400);
  const limited = rateLimit(d.buckets.live, req) ?? rateLimit(d.buckets.liveGlobal, req, Date.now(), "*");
  if (limited) return limited;
  try {
    // Same builder the browser uses to rebuild the expected request (R2-03), with max_tokens (R2-04).
    return json({ status: "ok", nonce, bundle: await d.live(liveRequestBody(d.model, notes), nonce) });
  } catch (e) {
    d.log?.(`copilot upstream error: ${e instanceof Error ? e.message : String(e)}`);
    return json({ status: "upstream_error", error: "NEAR AI request failed. Try again later." }, 502);
  }
}
