// Builds the copilot verifier fixture (WO-17). Run: node scripts/build-copilot-fixture.ts <dcap-qvl checkout>/sample
// Why synthetic: on 2026-11-09/10 cloud-api.near.ai answered 500 (DB pool error) without a key and no key is set (H7),
// and near-examples/nearai-cloud-verification-example ships no recorded test data. So:
//  - the Intel TDX quote + collateral are Phala's dcap-qvl `sample/tdx_quote*` (MIT), a real Intel-signed quote;
//  - the chat signature is made with a throwaway secp256k1 key generated here and discarded (never written);
//  - the synthetic quote is that sample with report_data patched to (signer || nonce), so DCAP MUST fail on it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { buildRequestBody, expectedReportData, personalHash, pubkeyToAddress, sha256Hex } from "../lib/copilot/verify.ts";

const sample = process.argv[2];
if (!sample) throw new Error("usage: build-copilot-fixture.ts <dcap-qvl>/sample");
const out = resolve(import.meta.dirname, "../lib/copilot/fixtures");
mkdirSync(out, { recursive: true });

const quote = readFileSync(join(sample, "tdx_quote"));
writeFileSync(join(out, "phala-tdx-quote.hex"), quote.toString("hex") + "\n");
writeFileSync(join(out, "phala-tdx-collateral.json"), readFileSync(join(sample, "tdx_quote_collateral.json")));

const model = "deepseek-ai/DeepSeek-V3.1";
const sk = secp256k1.utils.randomSecretKey();
const address = pubkeyToAddress(secp256k1.getPublicKey(sk));
const nonce = randomBytes(32).toString("hex");
const notes = "Issuer announced a stock split effective next month. Trading was halted briefly last week pending news. Liquidity on the tokenised wrapper is thin outside US hours.";
const requestBody = buildRequestBody(model, notes);
const answer = "- A stock split is announced; position units and oracle feeds must track the ratio change.\n- A recent trading halt shows event risk: exits can pause without notice.\n- Thin out-of-hours liquidity on the wrapper raises exit risk for pre-liquidation.";
const responseText = JSON.stringify({ id: "chatcmpl-fixture-wo17", object: "chat.completion", model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: answer } }] });
const text = `${model}:${sha256Hex(requestBody)}:${sha256Hex(responseText)}`;
const rec = secp256k1.sign(personalHash(text), sk, { prehash: false, format: "recovered" }); // [v, r(32), s(32)]
const signature = `0x${bytesToHex(rec.slice(1))}${(rec[0]! + 27).toString(16)}`;

const patched = Buffer.from(quote);
Buffer.from(expectedReportData(address, nonce), "hex").copy(patched, 48 + 520);

const fixture = {
  provenance: {
    built: new Date().toISOString(),
    why: "NEAR AI Cloud unreachable (500) and no NEAR_AI_API_KEY (H7); verification example repo has no recorded data",
    quote: "Phala-Network/dcap-qvl sample/tdx_quote + tdx_quote_collateral.json (MIT), verify at nowSecs",
    signer: "throwaway secp256k1 key generated at build time and discarded; stands in for the model TEE signing key",
    syntheticQuote: "sample quote with report_data patched to signer||nonce: report_data checks pass, DCAP must fail",
  },
  nowSecs: 1750377600, // 2025-06-20T00:00:00Z, inside the sample collateral validity (issueDate 2025-06-19, nextUpdate 2025-07-19)
  nonce,
  bundle: {
    source: "fixture",
    modelId: model,
    requestBody,
    responseText,
    signature: { text, signature, signing_algo: "ecdsa", signature_kind: "provider_tee" },
    attestation: { signing_address: address, intel_quote: patched.toString("hex"), app_compose: null },
  },
};
writeFileSync(join(out, "synthetic.json"), JSON.stringify(fixture, null, 2) + "\n");
console.log(`fixture written: signer ${address}, nonce ${nonce.slice(0, 12)}…`);
