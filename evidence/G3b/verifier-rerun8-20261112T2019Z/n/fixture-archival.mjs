// G3b run 8 (k)/(n): is contracts/mock-ft/tests/fixtures/mock-ft-deployed.wasm the code usdc-mock ran before the upgrade (block 277406854)?
// Archival RPC view_code at that block vs the fixture sha256. Read-only. Usage: node fixture-archival.mjs <fixture.wasm>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const fx = createHash("sha256").update(readFileSync(process.argv[2])).digest("hex");
console.log(`fixture sha256 ${fx}`);
for (const url of ["https://archival-rpc.testnet.fastnear.com", "https://archival-rpc.testnet.near.org"]) {
  for (const acct of ["usdc-mock.nectar.testnet", "nvdax-mock.nectar.testnet"]) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_code", block_id: 277406854, account_id: acct } }), signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (j.result) { const h = createHash("sha256").update(Buffer.from(j.result.code_base64, "base64")).digest("hex"); console.log(`${url} ${acct} @277406854 sha256 ${h} = fixture ${h === fx}`); }
      else console.log(`${url} ${acct} error ${JSON.stringify(j.error ?? j).slice(0, 160)}`);
    } catch (e) { console.log(`${url} ${acct} ${String(e).slice(0, 120)}`); }
  }
}
