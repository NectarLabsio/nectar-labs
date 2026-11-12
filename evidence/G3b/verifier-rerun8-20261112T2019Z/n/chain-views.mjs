// G3b run 8 (n): deployed mock-ft code vs the local rebuild, faucet_config vs config.yaml, real faucet call tx status. Read-only RPC.
// Usage: node chain-views.mjs <built.wasm> <outdir>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , WASM, OUT] = process.argv;
const RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"];
const EXPECT = "e3d4ded52c1a5e64d4e05750f793ca4f2a177076e13d53cf9d733a99c37c6d14";
const TX = "2A4jN155i6AEbZv35qj8c7XZLV7TjWZejr3mnJmneQrW";
const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (buf) => { let n = BigInt(`0x${buf.toString("hex")}`); let s = ""; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = `1${s}`; else break; } return s; };
async function rpc(method, params) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.result) return { url, result: j.result };
      if (j.error && !/rate|429|limit/i.test(JSON.stringify(j.error))) return { url, error: j.error };
    } catch {}
  }
  return { url: null, error: "all RPCs failed" };
}
const cfgText = readFileSync(resolve(import.meta.dirname, "../../packages/config/config.yaml"), "utf8");
const { parse } = await import(resolve(import.meta.dirname, "../../apps/web/node_modules/yaml/dist/index.js"));
const cfg = parse(cfgText).faucet;
const built = createHash("sha256").update(readFileSync(WASM)).digest();
const out = { built: { path: WASM, sha256: built.toString("hex"), base58: b58(built) }, expected: EXPECT, accounts: {}, tx: null };
console.log(`built sha256 ${out.built.sha256} (= expected: ${out.built.sha256 === EXPECT}) base58 ${out.built.base58}`);
for (const t of cfg.tokens) {
  const acct = t.token;
  const code = await rpc("query", { request_type: "view_code", finality: "final", account_id: acct });
  const acc = await rpc("query", { request_type: "view_account", finality: "final", account_id: acct });
  const bytes = Buffer.from(code.result.code_base64, "base64");
  const sha = createHash("sha256").update(bytes).digest();
  const fc = await rpc("query", { request_type: "call_function", finality: "final", account_id: acct, method_name: "faucet_config", args_base64: Buffer.from("{}").toString("base64") });
  const fcv = fc.result ? JSON.parse(Buffer.from(fc.result.result).toString("utf8")) : fc.error;
  const want = { amount_per_claim: t.amount_per_claim, cap_per_account: t.cap_per_account, cooldown_s: cfg.cooldown_s };
  const match = fcv && String(fcv.amount_per_claim) === want.amount_per_claim && String(fcv.cap_per_account) === want.cap_per_account && Number(fcv.cooldown_s) === want.cooldown_s;
  out.accounts[acct] = { block: code.result.block_height, code_bytes: bytes.length, code_sha256: sha.toString("hex"), code_hash_b58_from_view_account: acc.result.code_hash, sha_b58: b58(sha), equals_built: sha.equals(built), equals_expected: sha.toString("hex") === EXPECT, faucet_config: fcv, config_yaml: want, faucet_config_matches: !!match };
  console.log(`${acct}: view_code ${bytes.length} B sha256 ${sha.toString("hex")} = built ${sha.equals(built)} = expected ${sha.toString("hex") === EXPECT}; view_account code_hash ${acc.result.code_hash} = b58(sha) ${acc.result.code_hash === b58(sha)} (block ${code.result.block_height})`);
  console.log(`  faucet_config ${JSON.stringify(fcv)} vs config.yaml ${JSON.stringify(want)} -> ${match ? "MATCH" : "MISMATCH"}`);
}
const tx = await rpc("EXPERIMENTAL_tx_status", { tx_hash: TX, sender_account_id: "borrower1.nectar.testnet", wait_until: "FINAL" });
if (tx.result) {
  const tr = tx.result.transaction;
  const logs = tx.result.receipts_outcome.flatMap((r) => r.outcome.logs.map((l) => `${r.outcome.executor_id}: ${l}`));
  const fail = JSON.stringify(tx.result.receipts_outcome.map((r) => r.outcome.status)).includes("Failure");
  const blk = await rpc("block", { block_id: tx.result.transaction_outcome.block_hash });
  out.tx = { hash: tr.hash, signer: tr.signer_id, receiver: tr.receiver_id, actions: tr.actions, status: tx.result.status, final_execution_status: tx.result.final_execution_status, block_hash: tx.result.transaction_outcome.block_hash, block_height: blk.result?.header.height, block_time: blk.result ? new Date(Number(BigInt(blk.result.header.timestamp) / 1_000_000n)).toISOString() : null, logs, any_receipt_failure: fail };
  console.log(`tx ${tr.hash}: signer ${tr.signer_id} -> ${tr.receiver_id}; actions ${JSON.stringify(tr.actions).slice(0, 300)}; status ${JSON.stringify(tx.result.status)}; ${tx.result.final_execution_status}; block ${out.tx.block_height} @ ${out.tx.block_time}; receipt failure ${fail}`);
  for (const l of logs) console.log(`  log ${l}`);
} else {
  out.tx = { error: tx.error };
  console.log(`tx status error ${JSON.stringify(tx.error)}`);
}
writeFileSync(resolve(OUT, "chain-views.json"), JSON.stringify(out, null, 2));
const pass = out.built.sha256 === EXPECT && Object.values(out.accounts).every((a) => a.equals_built && a.equals_expected && a.code_hash_b58_from_view_account === a.sha_b58 && a.faucet_config_matches) && out.tx && !out.tx.error && !out.tx.any_receipt_failure;
console.log(pass ? "CHAIN VIEWS PASS" : "CHAIN VIEWS FAIL");
process.exitCode = pass ? 0 : 1;
