// Records the public nectar-core views the agent-skill tools read, for test/fixtures/skill-views-<kind>.json.
// Read-only (call_function views over public RPC), keyless. Usage:
//   node --disable-warning=ExperimentalWarning scripts/record-skill-fixture.ts [core_account] [out.json]
// Default core = accounts.core from packages/config/config.yaml (v1); pass nectar-core-v2 once it exists.

import { writeFileSync } from 'node:fs';
import { NearViewReader } from '../src/near.ts';
import { loadRepoIds } from '../src/repo-config.ts';

const core = process.argv[2] ?? loadRepoIds().core;
if (core === null || core === undefined) throw new Error('no core account: pass one or set accounts.core');
const rpc = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.near.org';
const v = new NearViewReader(rpc, core);
// [label, method, args]; the borrow amounts are an accepted and a refused case for 100 NVDAx.
const calls: Array<[string, string, Record<string, unknown>]> = [
  ['contract_version', 'contract_version', {}],
  ['get_collateral', 'get_collateral', { symbol: 'NVDAx' }],
  ['get_exit_capacity', 'get_exit_capacity', { symbol: 'NVDAx' }],
  ['preview_borrow', 'preview_borrow', { symbol: 'NVDAx', units: '100000000', borrow_usd_e6: '2500000000' }],
  ['preview_borrow_refused', 'preview_borrow', { symbol: 'NVDAx', units: '100000000', borrow_usd_e6: '5000000000' }],
];
const views: Record<string, unknown> = {};
for (const [label, m, a] of calls) {
  const r = await v.view(m, a);
  views[label] = { method: m, args: a, block_height: r.blockHeight, value: r.value };
}
const out = JSON.stringify({ recorded_at: new Date().toISOString(), rpc, contract: core, views }, null, 2) + '\n';
if (process.argv[3] !== undefined) writeFileSync(process.argv[3], out);
else process.stdout.write(out);
