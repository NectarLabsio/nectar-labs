import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Allowance } from '../src/chain.ts';
import { FullAccessKeyError, assertNotFullAccess } from '../src/startup.ts';

const reader = (a: Allowance) => ({ keyAllowance: async (): Promise<Allowance> => a });

describe('startup full-access refusal', () => {
  it('refuses a FullAccess key with a clear message', async () => {
    await assert.rejects(assertNotFullAccess(reader({ kind: 'full_access' }), 'keeper.nectar.testnet'), (e: unknown) => {
      assert.ok(e instanceof FullAccessKeyError);
      assert.match(e.message, /FullAccess key on keeper\.nectar\.testnet/);
      assert.match(e.message, /function-call key/);
      return true;
    });
  });
  it('accepts function-call keys (limited and unlimited)', async () => {
    assert.deepEqual(await assertNotFullAccess(reader({ kind: 'unlimited' }), 'k'), { kind: 'unlimited' });
    assert.deepEqual(await assertNotFullAccess(reader({ kind: 'limited', yocto: '1' }), 'k'), { kind: 'limited', yocto: '1' });
  });
  it('does not refuse when the key cannot be read (RPC down); healthz reports it', async () => {
    assert.equal((await assertNotFullAccess(reader({ kind: 'unknown', reason: 'rpc down' }), 'k')).kind, 'unknown');
  });
});
