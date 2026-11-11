import { MODEL_ID, apiKey, liveBundle, verifyQuote, type Collateral } from "@/lib/copilot/server";
import { defaultBuckets, handleCopilotPost } from "@/lib/copilot/handler";
import type { CopilotBundle } from "@/lib/copilot/verify";
import fixture from "@/lib/copilot/fixtures/synthetic.json";
import collateral from "@/lib/copilot/fixtures/phala-tdx-collateral.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/copilot — is the NEAR AI key configured (TODO-H7)? Never returns the key. */
export function GET() {
  return Response.json({ configured: Boolean(apiKey()), model: MODEL_ID });
}

// R2-04: the fixture's DCAP verdict is computed once per server process and reused.
let fixtureOnce: Promise<Record<string, unknown>> | null = null;
function fixtureResponse(): Promise<Record<string, unknown>> {
  fixtureOnce ??= (async () => {
    const b = fixture.bundle as Omit<CopilotBundle, "quoteVerdict">;
    const quoteVerdict = await verifyQuote(b.attestation.intel_quote, { collateral: collateral as unknown as Collateral, nowSecs: fixture.nowSecs });
    return { status: "ok", nonce: fixture.nonce, provenance: fixture.provenance, bundle: { ...b, quoteVerdict } };
  })();
  return fixtureOnce;
}

const deps = {
  apiKey,
  model: MODEL_ID,
  live: liveBundle,
  fixture: fixtureResponse,
  buckets: defaultBuckets(),
  log: (msg: string) => console.error(msg),
};

/**
 * POST /api/copilot {nonce, notes} → raw bundle (request bytes, response bytes, signature, attestation, DCAP verdict).
 * The browser verifies and only then extracts the answer. {fixture: true} returns the recorded fixture (works without a key).
 * Same-origin JSON only, 8 KB body cap, per-client rate limit (lib/copilot/handler.ts).
 */
export function POST(req: Request) {
  return handleCopilotPost(req, deps);
}
