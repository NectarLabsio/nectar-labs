// `pnpm --filter web test:copilot` — recorded fixture (see scripts/build-copilot-fixture.ts provenance). `-- --live` needs NEAR_AI_API_KEY.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import dcap from "@phala/dcap-qvl";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { SYSTEM_PROMPT, buildRequestBody, expectedMrConfigPrefix, mrConfigMatches, personalHash, quoteFields, recoverPersonalSign, verifyBundle, type CopilotBundle, type QuoteVerdict } from "./verify.ts";
import { MODEL_ID, apiKey, attestationPath, judgeNras, liveBundle, signatureBackoffMs, signaturePath, verifyQuote, type Collateral } from "./server.ts";

const dir = resolve(import.meta.dirname, "fixtures");
const fx = JSON.parse(readFileSync(resolve(dir, "synthetic.json"), "utf8")) as { nowSecs: number; nonce: string; bundle: Omit<CopilotBundle, "quoteVerdict"> };
const collateral = JSON.parse(readFileSync(resolve(dir, "phala-tdx-collateral.json"), "utf8")) as Collateral;
const sampleQuote = readFileSync(resolve(dir, "phala-tdx-quote.hex"), "utf8").trim();
const byId = (v: ReturnType<typeof verifyBundle>, id: string) => v.checks.find((c) => c.id === id)?.status;

test("DCAP: Phala sample TDX quote verifies against Intel root with recorded collateral", async () => {
  const v = await verifyQuote(sampleQuote, { collateral, nowSecs: fx.nowSecs });
  assert.equal(v.ran, true);
  assert.equal(v.ok, true, v.detail);
  console.log(`  sample quote TCB status: ${v.tcbStatus} (accepted: ${v.ok})`);
});

test("DCAP: patched report_data breaks the quote signature", async () => {
  const v = await verifyQuote(fx.bundle.attestation.intel_quote, { collateral, nowSecs: fx.nowSecs });
  assert.equal(v.ran, true);
  assert.equal(v.ok, false, v.detail);
});

test("quote offsets match dcap-qvl Quote.parse (report_data, mr_config_id)", () => {
  const parsed = dcap.Quote.parse(Buffer.from(sampleQuote, "hex"));
  const td = (parsed.report as unknown as { asTd10(): { reportData: Uint8Array; mrConfigId: Uint8Array } }).asTd10();
  const f = quoteFields(sampleQuote);
  assert.equal(f.reportData, bytesToHex(td.reportData));
  assert.equal(f.mrConfigId, bytesToHex(td.mrConfigId));
  assert.equal(f.teeType, 0x81);
});

test("fixture: signature, hashes, model id and report_data pass; DCAP fails → answer hidden", async () => {
  const quoteVerdict = await verifyQuote(fx.bundle.attestation.intel_quote, { collateral, nowSecs: fx.nowSecs });
  const v = verifyBundle({ ...fx.bundle, quoteVerdict }, fx.nonce);
  for (const id of ["signature_kind", "model_id", "request_hash", "response_hash", "signature_recover", "report_data_signer", "report_data_nonce"]) assert.equal(byId(v, id), "passed", id);
  assert.equal(byId(v, "quote_dcap"), "failed");
  assert.equal(byId(v, "rtmr3_replay"), "not run");
  assert.equal(byId(v, "gpu_nras"), "not run");
  assert.match(v.checks.find((c) => c.id === "gpu_nras")?.label ?? "", /JWT signature not verified/);
  assert.equal(byId(v, "model_listed"), "not run");
  assert.match(v.checks.find((c) => c.id === "model_listed")?.detail ?? "", /model id unverified \(F-078\)/);
  assert.equal(v.verified, false);
  assert.equal(v.answer, null);
});

test("gate logic: with an accepted DCAP verdict over the same quote bytes the answer is released", () => {
  const ok: QuoteVerdict = { ran: true, ok: true, tcbStatus: "UpToDate", quoteSha256: createHash("sha256").update(Buffer.from(fx.bundle.attestation.intel_quote!, "hex")).digest("hex"), detail: "test verdict" };
  const v = verifyBundle({ ...fx.bundle, quoteVerdict: ok }, fx.nonce);
  assert.equal(v.verified, true);
  assert.match(v.answer ?? "", /stock split/);
  const other = verifyBundle({ ...fx.bundle, quoteVerdict: { ...ok, quoteSha256: "00".repeat(32) } }, fx.nonce);
  assert.equal(byId(other, "quote_dcap"), "failed");
  assert.equal(other.answer, null);
});

test("negative: tampered response, stale nonce, foreign signer, gateway signature", () => {
  const verdict: QuoteVerdict = { ran: false, ok: false, tcbStatus: null, quoteSha256: null, detail: "skipped" };
  const base: CopilotBundle = { ...fx.bundle, quoteVerdict: verdict };
  assert.equal(byId(verifyBundle({ ...base, responseText: base.responseText.replace("split", "merger") }, fx.nonce), "response_hash"), "failed");
  assert.equal(byId(verifyBundle(base, randomBytes(32).toString("hex")), "report_data_nonce"), "failed");
  const sk = secp256k1.utils.randomSecretKey();
  const rec = secp256k1.sign(personalHash(base.signature.text), sk, { prehash: false, format: "recovered" });
  const foreign = `0x${bytesToHex(rec.slice(1))}${(rec[0]! + 27).toString(16)}`;
  assert.notEqual(recoverPersonalSign(base.signature.text, foreign).toLowerCase(), base.attestation.signing_address.toLowerCase());
  assert.equal(byId(verifyBundle({ ...base, signature: { ...base.signature, signature: foreign } }, fx.nonce), "signature_recover"), "failed");
  const gw = base.signature.text.split(":").slice(1).join(":");
  assert.equal(byId(verifyBundle({ ...base, signature: { ...base.signature, text: gw } }, fx.nonce), "signature_kind"), "failed");
});

test("F-075: MRCONFIGID check is a prefix match on 01 || sha256(app_compose)", () => {
  const compose = '{"docker_compose_file":"services: {}"}';
  const prefix = expectedMrConfigPrefix(compose);
  assert.equal(prefix.length, 66);
  assert.ok(mrConfigMatches(prefix + "00".repeat(15), compose));
  assert.ok(mrConfigMatches(prefix + "ab".repeat(15), compose), "trailing bytes are not checked");
  assert.ok(!mrConfigMatches("02" + prefix.slice(2) + "00".repeat(15), compose));
  assert.ok(!mrConfigMatches(expectedMrConfigPrefix(compose + " ") + "00".repeat(15), compose));
  const skipped: QuoteVerdict = { ran: false, ok: false, tcbStatus: null, quoteSha256: null, detail: "skipped" };
  const v = verifyBundle({ ...fx.bundle, attestation: { ...fx.bundle.attestation, app_compose: compose }, quoteVerdict: skipped }, fx.nonce);
  assert.equal(byId(v, "mr_config_id"), "failed"); // fixture quote is not bound to this compose
});

test("F-074/F-076/C-018: request paths carry no provider param or aliasing header; 404 backoff grows", () => {
  const n = "ab".repeat(32);
  assert.equal(attestationPath("org/m", n), `/attestation/report?model=org%2Fm&signing_algo=ecdsa&nonce=${n}`);
  assert.equal(signaturePath("chat-1", "org/m"), "/signature/chat-1?model=org%2Fm&signing_algo=ecdsa");
  assert.doesNotMatch(attestationPath("m", n), /provider|aliasing/);
  assert.deepEqual([0, 1, 2, 3].map(signatureBackoffMs), [500, 1000, 2000, 4000]);
});

test("F-077: NRAS verdict needs overall=true and both nonces equal ours", () => {
  const n = "cd".repeat(32);
  const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
  const resp = (claims: object) => [["JWT", jwt(claims)], { "GPU-0": jwt({}) }];
  const payload = JSON.stringify({ nonce: n, evidence_list: [] });
  assert.equal(judgeNras(resp({ "x-nvidia-overall-att-result": true, eat_nonce: n }), payload, n).ok, true);
  assert.equal(judgeNras(resp({ "x-nvidia-overall-att-result": false, eat_nonce: n }), payload, n).ok, false);
  assert.equal(judgeNras(resp({ "x-nvidia-overall-att-result": true, eat_nonce: "00".repeat(32) }), payload, n).ok, false);
  assert.equal(judgeNras(resp({ "x-nvidia-overall-att-result": true, eat_nonce: n }), JSON.stringify({ nonce: "ff" }), n).ok, false);
  assert.equal(judgeNras({}, payload, n).ok, false);
  const base: CopilotBundle = { ...fx.bundle, quoteVerdict: { ran: false, ok: false, tcbStatus: null, quoteSha256: null, detail: "skipped" } };
  assert.equal(byId(verifyBundle({ ...base, gpuVerdict: { ran: true, ok: true, detail: "ok" }, modelListed: true }, fx.nonce), "gpu_nras"), "passed");
  assert.equal(byId(verifyBundle({ ...base, modelListed: true }, fx.nonce), "model_listed"), "passed");
  assert.equal(byId(verifyBundle({ ...base, modelListed: false }, fx.nonce), "model_listed"), "failed");
});

test("system prompt forbids prices and amounts; request carries it", () => {
  assert.match(SYSTEM_PROMPT, /Never state, estimate or imply prices/);
  assert.match(SYSTEM_PROMPT, /amounts/);
  assert.equal((JSON.parse(buildRequestBody("m", "n")) as { messages: { role: string }[] }).messages[0]?.role, "system");
});

test("live round trip (only with --live and NEAR_AI_API_KEY)", { skip: process.env.COPILOT_LIVE !== "1" ? "fixture run (pass --live)" : false }, async () => {
  assert.ok(apiKey(), "NEAR_AI_API_KEY missing (TODO-H7)");
  const nonce = randomBytes(32).toString("hex");
  const b = await liveBundle(buildRequestBody(MODEL_ID, "Issuer announced a stock split; trading halted briefly."), nonce);
  const v = verifyBundle(b, nonce);
  for (const c of v.checks) console.log(`  ${c.status.padEnd(8)} ${c.label} — ${c.detail}`);
  assert.equal(v.verified, true);
});
