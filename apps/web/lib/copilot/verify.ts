// NEAR AI Cloud copilot verification (WO-17). Pure, runs in the browser and in Node tests.
// Facts: F-074 (attestation report), F-075 (report_data right-padded, mr_config prefix), F-076 (signature), F-077 (NRAS), F-078 (model ids).
// The answer is released only when every REQUIRED check passes; other checks are listed as "not run", never hidden.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export type CheckStatus = "passed" | "failed" | "not run";
export interface Check { id: string; label: string; status: CheckStatus; detail: string; required: boolean }

/** Server verdict for the Intel TDX quote (dcap-qvl runs in a server route; F-073). */
export interface QuoteVerdict { ran: boolean; ok: boolean; tcbStatus: string | null; quoteSha256: string | null; detail: string }

/** Server verdict for NVIDIA GPU attestation via NRAS (F-077; live mode only). JWT signature is not verified, same as the reference example. */
export interface GpuVerdict { ran: boolean; ok: boolean; detail: string }

/** Everything the browser needs to verify one copilot answer. Exact bytes: request body and response text are hashed as-is. */
export interface CopilotBundle {
  source: "live" | "fixture";
  modelId: string;
  requestBody: string;
  responseText: string;
  signature: { text: string; signature: string; signing_algo: string; signature_kind?: string };
  attestation: { signing_address: string; intel_quote: string | null; app_compose?: string | null };
  quoteVerdict: QuoteVerdict;
  /** Absent in fixture mode → GPU check "not run". */
  gpuVerdict?: GpuVerdict;
  /** true/false = model id found/not found in the live `/v1/models` list; null/absent = list unavailable (F-078). */
  modelListed?: boolean | null;
}

export interface Verification { verified: boolean; checks: Check[]; answer: string | null }

export const sha256Hex = (s: string): string => bytesToHex(sha256(utf8ToBytes(s)));
const strip0x = (h: string): string => (h.startsWith("0x") || h.startsWith("0X") ? h.slice(2) : h);
const eq = (a: string, b: string): boolean => strip0x(a).toLowerCase() === strip0x(b).toLowerCase();

/** Ethereum address of an uncompressed/compressed secp256k1 public key. */
export function pubkeyToAddress(pub: Uint8Array): string {
  const full = secp256k1.Point.fromBytes(pub).toBytes(false);
  return `0x${bytesToHex(keccak_256(full.slice(1)).slice(-20))}`;
}

/** EIP-191 personal_sign hash of a UTF-8 message. */
export function personalHash(message: string): Uint8Array {
  const m = utf8ToBytes(message);
  return keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${m.length}`), ...m]));
}

/** Recover the address that EIP-191-signed `message` (65-byte r||s||v, v in {0,1,27,28}). */
export function recoverPersonalSign(message: string, signatureHex: string): string {
  const sig = hexToBytes(strip0x(signatureHex));
  if (sig.length !== 65) throw new Error(`signature is ${sig.length} bytes, expected 65`);
  const v = sig[64]! >= 27 ? sig[64]! - 27 : sig[64]!;
  if (v !== 0 && v !== 1) throw new Error(`bad recovery id ${sig[64]}`);
  const recovered = new Uint8Array([v, ...sig.slice(0, 64)]);
  const pub = secp256k1.recoverPublicKey(recovered, personalHash(message), { prehash: false });
  return pubkeyToAddress(pub);
}

/** F-075: report_data = signing address bytes right-padded with zeros to 32 bytes ‖ raw 32-byte nonce. */
export function expectedReportData(signingAddress: string, nonceHex: string): string {
  const id = hexToBytes(strip0x(signingAddress));
  if (id.length > 32) throw new Error("signer identity longer than 32 bytes");
  const n = hexToBytes(strip0x(nonceHex));
  if (n.length !== 32) throw new Error("nonce must be 32 bytes");
  const out = new Uint8Array(64);
  out.set(id, 0);
  out.set(n, 32);
  return bytesToHex(out);
}

// TDX quote v4/v5 layout: 48-byte header, then TD report body. Offsets inside the TD10 body:
// teeTcbSvn 16, mrSeam 48, mrSignerSeam 48, seamAttributes 8, tdAttributes 8, xfam 8, mrTd 48, mrConfigId 48 (@184), mrOwner, mrOwnerConfig, rtmr0..3, reportData 64 (@520).
// Cross-checked against @phala/dcap-qvl Quote.parse in verify.test.ts.
const HEADER = 48;
const MRCONFIG_OFF = HEADER + 184;
const REPORT_DATA_OFF = HEADER + 520;

export function quoteFields(quoteHex: string): { reportData: string; mrConfigId: string; teeType: number } {
  const q = hexToBytes(strip0x(quoteHex));
  if (q.length < REPORT_DATA_OFF + 64) throw new Error("quote too short");
  const teeType = q[4]! | (q[5]! << 8) | (q[6]! << 16) | (q[7]! << 24);
  return { reportData: bytesToHex(q.slice(REPORT_DATA_OFF, REPORT_DATA_OFF + 64)), mrConfigId: bytesToHex(q.slice(MRCONFIG_OFF, MRCONFIG_OFF + 48)), teeType };
}

/** F-075: MRCONFIGID must start with 0x01 || sha256(app_compose); the remaining bytes are not checked (nearai-cloud-verifier does the same). */
export const expectedMrConfigPrefix = (appCompose: string): string => `01${sha256Hex(appCompose)}`;
export const mrConfigMatches = (mrConfigId: string, appCompose: string): boolean => mrConfigId.toLowerCase().startsWith(expectedMrConfigPrefix(appCompose));

/** Pull the assistant text out of an OpenAI-compatible non-streaming response. */
export function extractAnswer(responseText: string): string | null {
  try {
    const j = JSON.parse(responseText) as { choices?: { message?: { content?: unknown } }[] };
    const c = j.choices?.[0]?.message?.content;
    return typeof c === "string" ? c : null;
  } catch {
    return null;
  }
}

export function verifyBundle(b: CopilotBundle, nonceHex: string): Verification {
  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string, required = true) => checks.push({ id, label, status, detail, required });
  const pass = (ok: boolean): CheckStatus => (ok ? "passed" : "failed");

  // 1. Signed text binds model id, request and response (F-072 provider_tee format).
  const parts = b.signature.text.split(":");
  const kind = parts.length === 3 ? "provider_tee" : parts.length === 2 ? "gateway" : "unknown";
  add("signature_kind", "Signature is from the model TEE (provider_tee)", pass(kind === "provider_tee" && (b.signature.signature_kind ?? "provider_tee") === "provider_tee"), `signed text has ${parts.length} parts (${kind})`);
  const [mid, rq, rs] = kind === "provider_tee" ? parts : [null, parts[0], parts[1]];
  add("model_id", "Signed model id equals requested model", mid === null ? "failed" : pass(mid === b.modelId), `signed ${mid ?? "none"}, requested ${b.modelId}`);
  const reqHash = sha256Hex(b.requestBody);
  const resHash = sha256Hex(b.responseText);
  add("request_hash", "sha256(request) matches signed text", pass(rq === reqHash), `local ${reqHash.slice(0, 16)}…`);
  add("response_hash", "sha256(response) matches signed text", pass(rs === resHash), `local ${resHash.slice(0, 16)}…`);

  // 2. EIP-191 recovery to the attested signing address.
  let recovered: string | null = null;
  let recErr = "";
  try {
    recovered = recoverPersonalSign(b.signature.text, b.signature.signature);
  } catch (e) {
    recErr = e instanceof Error ? e.message : String(e);
  }
  add("signature_recover", "Signature recovers (EIP-191) to attested signing_address", recovered ? pass(eq(recovered, b.attestation.signing_address)) : "failed", recovered ? `recovered ${recovered}, attested ${b.attestation.signing_address}` : `recovery error: ${recErr}`);

  // 3. The attestation quote binds that address and our fresh nonce in report_data.
  let fields: ReturnType<typeof quoteFields> | null = null;
  let qErr = "no intel_quote in attestation report";
  if (b.attestation.intel_quote) {
    try {
      fields = quoteFields(b.attestation.intel_quote);
    } catch (e) {
      qErr = e instanceof Error ? e.message : String(e);
    }
  }
  let want: string | null = null;
  try {
    want = expectedReportData(b.attestation.signing_address, nonceHex);
  } catch (e) {
    qErr = e instanceof Error ? e.message : String(e);
  }
  add("report_data_signer", "report_data[0..32] = signing_address zero-padded", fields && want ? pass(fields.reportData.slice(0, 64) === want.slice(0, 64)) : "failed", fields ? `quote ${fields.reportData.slice(0, 40)}…` : qErr);
  add("report_data_nonce", "report_data[32..64] = this request's nonce", fields && want ? pass(fields.reportData.slice(64) === want.slice(64)) : "failed", fields ? `nonce ${nonceHex.slice(0, 16)}…` : qErr);

  // 4. Intel DCAP verification ran on the server over the same bytes.
  const v = b.quoteVerdict;
  const sameQuote = Boolean(b.attestation.intel_quote && v.quoteSha256 && eq(v.quoteSha256, bytesToHex(sha256(hexToBytes(strip0x(b.attestation.intel_quote))))));
  add("quote_dcap", "TDX quote verified with @phala/dcap-qvl (server)", !v.ran ? "failed" : pass(v.ok && sameQuote), !v.ran ? `not run: ${v.detail}` : `${v.detail}${v.tcbStatus ? ` · TCB ${v.tcbStatus}` : ""}${sameQuote ? "" : " · quote hash mismatch"}`);

  // 5. Optional deeper checks: listed honestly.
  const mrLabel = "MRCONFIGID starts with 01 || sha256(app_compose)";
  if (b.attestation.app_compose && fields) add("mr_config_id", mrLabel, pass(mrConfigMatches(fields.mrConfigId, b.attestation.app_compose)), `quote ${fields.mrConfigId.slice(0, 18)}…`, false);
  else add("mr_config_id", mrLabel, "not run", "app_compose not present in the report", false);
  add("rtmr3_replay", "RTMR3 event-log replay", "not run", "not implemented in this build", false);
  const gpuLabel = "NVIDIA NRAS (JWT signature not verified — same as the reference example)";
  const g = b.gpuVerdict;
  add("gpu_nras", gpuLabel, !g || !g.ran ? "not run" : pass(g.ok), g ? g.detail : "live mode only; not run on the recorded fixture", false);
  const ml = b.modelListed;
  add("model_listed", "Model id listed by NEAR AI /v1/models", ml === true ? "passed" : ml === false ? "failed" : "not run", ml === true ? `${b.modelId} listed` : ml === false ? `${b.modelId} not in the live model list` : "model id unverified (F-078): live model list unavailable", false);

  const verified = checks.every((c) => !c.required || c.status === "passed");
  return { verified, checks, answer: verified ? extractAnswer(b.responseText) : null };
}

/** System prompt: no prices, no amounts; risk and corporate-action context from the user's notes only. */
export const SYSTEM_PROMPT = [
  "You are a risk-context assistant for a testnet lending demo that uses mock collateral.",
  "Summarise only the risk and corporate-action context contained in the user's pasted notes (splits, dividends, halts, delistings, earnings dates, liquidity remarks).",
  "Never state, estimate or imply prices, price targets, amounts, sizes, loan values, LTVs or any other number that could be read as financial advice.",
  "If the notes contain no relevant context, say so. Do not use outside knowledge. Answer in at most 6 short bullet points.",
].join(" ");

export function buildRequestBody(modelId: string, notes: string): string {
  return JSON.stringify({ model: modelId, stream: false, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: notes }] });
}
