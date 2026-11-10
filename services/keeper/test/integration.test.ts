// Read-only integration against the deployed testnet contract. Skipped unless NECTAR_IT=1. Core id:
// CORE_ACCOUNT_ID, else accounts.core in packages/config/config.yaml. Never sends a transaction.
//   NECTAR_IT=1 [CORE_ACCOUNT_ID=<core>] [NEAR_RPC_URL=...] pnpm --filter keeper test

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isHealthView, isPositionView, positionIdOf } from '../src/abi.ts';
import { NearCoreReader } from '../src/chain.ts';
import { isPreLiqBreached } from '../src/health.ts';
import { loadRepoIds } from '../src/repo-config.ts';

const core = loadRepoIds().core;
const enabled = process.env.NECTAR_IT === '1' && core !== null;
const rpc = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';

describe('testnet integration (read-only)', { skip: enabled ? false : 'set NECTAR_IT=1' }, () => {
  const reader = new NearCoreReader(rpc, core as string);

  it('contract_version answers', async () => {
    const { value, blockHeight } = await reader.view('contract_version', {});
    assert.equal(typeof value, 'string');
    assert.ok(blockHeight > 0);
  });

  it('list_positions + get_health match the ABI and local maths', async () => {
    const { value } = await reader.view('list_positions', { from_index: 0, limit: 20 });
    assert.ok(Array.isArray(value));
    for (const [i, p] of (value as unknown[]).entries()) {
      assert.ok(isPositionView(p), `position ${i} shape`);
      if (p.status !== 'Open') continue;
      const { value: hv } = await reader.view('get_health', { position_id: positionIdOf(p, i) });
      assert.ok(isHealthView(hv), 'get_health shape');
      const breached = isPreLiqBreached(BigInt(hv.debt_usd_e6), BigInt(hv.value_usd_e6), BigInt(hv.pre_liq_ltv_bps));
      assert.equal(breached && hv.oracle_fresh, hv.triggerable);
    }
  });
});
