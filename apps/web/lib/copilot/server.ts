// Server-only: NEAR AI Cloud client (F-070..F-072) and Intel DCAP quote verification with @phala/dcap-qvl 0.7.1 (F-073).
// Never imported by client components. The API key is read from NEAR_AI_API_KEY (TODO-H7); absent → "key missing".
import { createHash } from "node:crypto";
import dcap from "@phala/dcap-qvl";
import type { CopilotBundle, QuoteVerdict } from "./verify";

export const NEAR_AI_BASE = "https://cloud-api.near.ai/v1"; // F-070
export const MODEL_ID = process.env.NEAR_AI_MODEL || "deepseek-ai/DeepSeek-V3.1";
export const apiKey = (): string => process.env.NEAR_AI_API_KEY ?? "";

/** Good TCB states for a production answer. Anything else fails the check (detail shows the state). */
const OK_TCB = new Set(["UpToDate", "SWHardeningNeeded"]);

export type Collateral = Parameters<typeof dcap.verify>[1];

/**
 * Verify a hex TDX quote. Live: collateral from Phala's PCCS (dcap-qvl default; server-side only, only when the key is set).
 * Fixture: recorded collateral and a fixed time so the result is reproducible offline.
 */
export async function verifyQuote(quoteHex: string | null, opts: { collateral?: Collateral; nowSecs?: number } = {}): Promise<QuoteVerdict> {
  if (!quoteHex) return { ran: false, ok: false, tcbStatus: null, quoteSha256: null, detail: "no intel_quote in attestation report" };
  const bytes = Buffer.from(quoteHex.replace(/^0x/i, ""), "hex");
  const quoteSha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    const collateral = opts.collateral ?? (await dcap.getCollateral(dcap.PHALA_PCCS_URL, bytes));
    const report = dcap.verify(bytes, collateral, opts.nowSecs ?? Math.floor(Date.now() / 1000));
    const ok = OK_TCB.has(report.status);
    return { ran: true, ok, tcbStatus: report.status, quoteSha256, detail: ok ? "Intel signature chain and TCB verified" : `TCB status ${report.status} not accepted` };
  } catch (e) {
    return { ran: true, ok: false, tcbStatus: null, quoteSha256, detail: `dcap-qvl rejected the quote: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function get(path: string, headers: Record<string, string> = {}): Promise<unknown> {
  const r = await fetch(`${NEAR_AI_BASE}${path}`, { headers: { accept: "application/json", authorization: `Bearer ${apiKey()}`, ...headers }, cache: "no-store" });
  if (!r.ok) throw new Error(`NEAR AI ${path.split("?")[0]} → HTTP ${r.status}`);
  return r.json();
}

interface ModelAttestation { signing_address?: string; intel_quote?: string; info?: { tcb_info?: { app_compose?: string } | string } }

/** Live round trip: chat → signature (retry while 404) → attestation with our nonce → DCAP. Returns the raw bundle for the browser to verify. */
export async function liveBundle(requestBody: string, nonceHex: string): Promise<CopilotBundle> {
  const chat = await fetch(`${NEAR_AI_BASE}/chat/completions`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
    body: requestBody,
    cache: "no-store",
  });
  if (!chat.ok) throw new Error(`NEAR AI chat → HTTP ${chat.status}`);
  const responseText = await chat.text(); // exact bytes: hashed and signed
  const chatId = (JSON.parse(responseText) as { id?: string }).id;
  if (!chatId) throw new Error("chat response has no id");

  let signature: CopilotBundle["signature"] | null = null;
  for (let i = 0; i < 5 && !signature; i++) {
    try {
      signature = (await get(`/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(MODEL_ID)}&signing_algo=ecdsa`)) as CopilotBundle["signature"]; // F-072
    } catch (e) {
      if (i === 4 || !String(e).includes("404")) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!signature) throw new Error("no signature");

  // F-071: nonce + x-no-aliasing so the report is for the node that answered.
  const report = (await get(`/attestation/report?model=${encodeURIComponent(MODEL_ID)}&provider=near&signing_algo=ecdsa&nonce=${nonceHex}`, { "x-no-aliasing": "true" })) as { model_attestations?: ModelAttestation[] };
  const signer = signature.text ? report.model_attestations?.find((a) => a.signing_address) : undefined;
  const att = report.model_attestations?.find((a) => a.signing_address && a.intel_quote) ?? signer;
  const tcb = att?.info?.tcb_info;
  const appCompose = typeof tcb === "string" ? ((JSON.parse(tcb) as { app_compose?: string }).app_compose ?? null) : (tcb?.app_compose ?? null);
  const intelQuote = att?.intel_quote ?? null;
  return {
    source: "live",
    modelId: MODEL_ID,
    requestBody,
    responseText,
    signature,
    attestation: { signing_address: att?.signing_address ?? "", intel_quote: intelQuote, app_compose: appCompose },
    quoteVerdict: await verifyQuote(intelQuote),
  };
}
