// Server-only: NEAR AI Cloud client (F-070, F-074, F-076), Intel DCAP quote verification with @phala/dcap-qvl 0.7.1 (F-073)
// and NVIDIA GPU attestation via NRAS (F-077). Outbound origins, live mode only: cloud-api.near.ai, Phala PCCS, nras.attestation.nvidia.com.
// Never imported by client components. The API key is read from NEAR_AI_API_KEY (TODO-H7); absent → "key missing".
import { createHash } from "node:crypto";
import dcap from "@phala/dcap-qvl";
import { recoverPersonalSign, type CopilotBundle, type GpuVerdict, type QuoteVerdict } from "./verify.ts";

export const NEAR_AI_BASE = "https://cloud-api.near.ai/v1"; // F-070
export const NRAS_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu"; // F-077
// F-078: no TEE model id could be confirmed (endpoint down); configurable, and the panel shows "model id unverified" unless /v1/models lists it.
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

async function get(path: string): Promise<unknown> {
  const r = await fetch(`${NEAR_AI_BASE}${path}`, { headers: { accept: "application/json", authorization: `Bearer ${apiKey()}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`NEAR AI ${path.split("?")[0]} → HTTP ${r.status}`);
  return r.json();
}

interface ModelAttestation { signing_address?: string; intel_quote?: string; nvidia_payload?: string; info?: { tcb_info?: { app_compose?: string } | string } }

/** Attestation report path (F-074/F-075): no `provider` param, no `x-no-aliasing` header (C-018). */
export const attestationPath = (model: string, nonceHex: string): string => `/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${nonceHex}`;
/** Signature path (F-076). */
export const signaturePath = (chatId: string, model: string): string => `/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`;
/** Backoff for signature 404 retries (signature is cached on the serving node, F-076): 0.5 s, 1 s, 2 s, 4 s. */
export const signatureBackoffMs = (attempt: number): number => 500 * 2 ** attempt;

const b64urlJson = (part: string): Record<string, unknown> => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

/**
 * F-077: judge an NRAS response the way the reference example does — decode (not verify) the overall JWT,
 * pass iff `x-nvidia-overall-att-result === true` and `eat_nonce` and the payload nonce both equal ours.
 */
export function judgeNras(response: unknown, nvidiaPayload: string, nonceHex: string): GpuVerdict {
  try {
    const token = Array.isArray(response) && Array.isArray(response[0]) ? (response[0] as unknown[])[1] : null;
    if (typeof token !== "string") return { ran: true, ok: false, detail: "NRAS response has no overall JWT" };
    const claims = b64urlJson(token.split(".")[1] ?? "");
    const overall = claims["x-nvidia-overall-att-result"] === true;
    const eatNonce = String(claims["eat_nonce"] ?? "").toLowerCase() === nonceHex.toLowerCase();
    const payloadNonce = String((JSON.parse(nvidiaPayload) as { nonce?: unknown }).nonce ?? "").toLowerCase() === nonceHex.toLowerCase();
    const ok = overall && eatNonce && payloadNonce;
    return { ran: true, ok, detail: ok ? "overall result true, eat_nonce and payload nonce match" : `overall ${overall} · eat_nonce ${eatNonce ? "match" : "mismatch"} · payload nonce ${payloadNonce ? "match" : "mismatch"}` };
  } catch (e) {
    return { ran: true, ok: false, detail: `NRAS response unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function verifyGpu(nvidiaPayload: string | undefined, nonceHex: string): Promise<GpuVerdict> {
  if (!nvidiaPayload) return { ran: false, ok: false, detail: "no nvidia_payload in attestation report" };
  try {
    const r = await fetch(NRAS_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: nvidiaPayload, cache: "no-store" });
    if (!r.ok) return { ran: true, ok: false, detail: `NRAS → HTTP ${r.status}` };
    return judgeNras(await r.json(), nvidiaPayload, nonceHex);
  } catch (e) {
    return { ran: true, ok: false, detail: `NRAS unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** true/false when /v1/models answers, null when it does not (F-078: it was failing on 2026-11-09). */
async function modelListed(model: string): Promise<boolean | null> {
  try {
    const j = (await get("/models")) as { data?: { id?: string }[] };
    return Array.isArray(j.data) ? j.data.some((m) => m.id === model) : null;
  } catch {
    return null;
  }
}

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
      signature = (await get(signaturePath(chatId, MODEL_ID))) as CopilotBundle["signature"]; // F-076
    } catch (e) {
      if (i === 4 || !String(e).includes("404")) throw e;
      await new Promise((r) => setTimeout(r, signatureBackoffMs(i)));
    }
  }
  if (!signature) throw new Error("no signature");

  // F-074: fresh nonce; one attestation per TEE node.
  const [report, listed] = await Promise.all([get(attestationPath(MODEL_ID, nonceHex)) as Promise<{ model_attestations?: ModelAttestation[] }>, modelListed(MODEL_ID)]);
  // F-076: the recovered signer must be one of model_attestations[].signing_address — pick that node's attestation.
  let recovered = "";
  try {
    recovered = recoverPersonalSign(signature.text, signature.signature).toLowerCase();
  } catch {
    /* the browser check reports the recovery error */
  }
  const att = report.model_attestations?.find((a) => a.signing_address?.toLowerCase() === recovered) ?? report.model_attestations?.find((a) => a.signing_address && a.intel_quote);
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
    gpuVerdict: await verifyGpu(att?.nvidia_payload, nonceHex),
    modelListed: listed,
  };
}
