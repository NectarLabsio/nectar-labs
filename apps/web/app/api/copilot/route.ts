import { MODEL_ID, apiKey, liveBundle, verifyQuote, type Collateral } from "@/lib/copilot/server";
import { buildRequestBody, type CopilotBundle } from "@/lib/copilot/verify";
import fixture from "@/lib/copilot/fixtures/synthetic.json";
import collateral from "@/lib/copilot/fixtures/phala-tdx-collateral.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/copilot — is the NEAR AI key configured (TODO-H7)? Never returns the key. */
export function GET() {
  return Response.json({ configured: Boolean(apiKey()), model: MODEL_ID });
}

/**
 * POST /api/copilot {nonce, notes} → raw bundle (request bytes, response bytes, signature, attestation, DCAP verdict).
 * The browser verifies and only then extracts the answer. {fixture: true} returns the recorded fixture (works without a key).
 */
export async function POST(req: Request) {
  let body: { nonce?: unknown; notes?: unknown; fixture?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ status: "bad_request", error: "JSON body required" }, { status: 400 });
  }
  if (body.fixture === true) {
    const b = fixture.bundle as Omit<CopilotBundle, "quoteVerdict">;
    const quoteVerdict = await verifyQuote(b.attestation.intel_quote, { collateral: collateral as unknown as Collateral, nowSecs: fixture.nowSecs });
    return Response.json({ status: "ok", nonce: fixture.nonce, provenance: fixture.provenance, bundle: { ...b, quoteVerdict } });
  }
  if (!apiKey()) return Response.json({ status: "key_missing" }, { status: 503 });
  const nonce = typeof body.nonce === "string" ? body.nonce.toLowerCase() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(nonce)) return Response.json({ status: "bad_request", error: "nonce must be 64 hex chars" }, { status: 400 });
  if (!notes || notes.length > 4000) return Response.json({ status: "bad_request", error: "notes must be 1–4000 characters" }, { status: 400 });
  try {
    const bundle = await liveBundle(buildRequestBody(MODEL_ID, notes), nonce);
    return Response.json({ status: "ok", nonce, bundle });
  } catch (e) {
    return Response.json({ status: "upstream_error", error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
