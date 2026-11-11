// Agent-skill MCP tools (WO-25 Part 1): schemas, unsigned-call snapshot, v1/v2 branches on recorded view
// fixtures (v1 recorded live from nectar-core.nectar.testnet; v2 shaped from the v2 source + model.csv), and a
// guarantee that no tool reads a key or an environment variable.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FeedDb } from '../src/db.ts';
import { createMcpServer } from '../src/mcp.ts';
import { SKILL_TOOL_NAMES, healthTable, parseUsdE6 } from '../src/skill.ts';
import type { ViewReader, ViewResult } from '../src/sources.ts';

const here = dirname(fileURLToPath(import.meta.url));
interface Entry { method: string; args: Record<string, unknown>; block_height: number; value: unknown }
interface Fixture { contract: string; views: Record<string, Entry> }
const load = (k: 'v1' | 'v2'): Fixture => JSON.parse(readFileSync(resolve(here, `fixtures/skill-views-${k}.json`), 'utf8')) as Fixture;

/** Replays a fixture: an entry matches when its method matches and every fixture arg (and `referrer`) equals the call's. */
class FixtureViews implements ViewReader {
  calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  private readonly fx: Fixture;
  constructor(fx: Fixture) {
    this.fx = fx;
  }
  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    this.calls.push({ method, args });
    const e = Object.values(this.fx.views).find(
      (x) => x.method === method && Object.entries(x.args).every(([k, v]) => args[k] === v) && x.args.referrer === args.referrer,
    );
    if (e === undefined) throw new Error(`no fixture for ${method} ${JSON.stringify(args)}`);
    return { value: e.value, blockHeight: e.block_height };
  }
}

async function connect(fx: Fixture | null): Promise<{ c: Client; views: FixtureViews | null }> {
  const views = fx === null ? null : new FixtureViews(fx);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer({ db: new FeedDb(':memory:'), views, coreId: fx?.contract ?? null }).connect(a);
  const c = new Client({ name: 'skill-test', version: '0' });
  await c.connect(b);
  return { c, views };
}
type Res = { content: Array<{ text: string }>; isError?: boolean };
const json = (r: unknown): Record<string, unknown> => JSON.parse((r as Res).content[0]?.text ?? '{}') as Record<string, unknown>;
const isErr = (r: unknown): boolean => (r as Res).isError === true;

const V1_OPEN = { account_id: 'agent1.nectar.testnet', collateral: 'NVDAx', units: '100000000', borrow_usd: '2500' };
const V2_OPEN = { account_id: 'agent1.nectar.testnet', collateral: 'NVDAx', units: '100000000', borrow_usd: '11250' };

describe('agent skill: tool schemas', () => {
  it('registers the four skill tools, read-only, with the PRD §10.5 inputs', async () => {
    const { c } = await connect(load('v1'));
    const { tools } = await c.listTools();
    for (const n of SKILL_TOOL_NAMES) assert.ok(tools.some((t) => t.name === n), n);
    const open = tools.find((t) => t.name === 'open_protected_stock_loan');
    const props = Object.keys((open?.inputSchema.properties ?? {}) as Record<string, unknown>).sort();
    assert.deepEqual(props, ['account_id', 'borrow_usd', 'collateral', 'pay_to', 'pre_liq_ltv_bps', 'referrer', 'shield', 'units']);
    assert.deepEqual([...(open?.inputSchema.required ?? [])].sort(), ['account_id', 'borrow_usd', 'collateral', 'units']);
    assert.deepEqual(Object.keys((tools.find((t) => t.name === 'quote_capacity')?.inputSchema.properties ?? {}) as object), ['symbol']);
    assert.deepEqual(Object.keys((tools.find((t) => t.name === 'get_note')?.inputSchema.properties ?? {}) as object), ['token_id']);
    assert.deepEqual(Object.keys((tools.find((t) => t.name === 'build_self_settle')?.inputSchema.properties ?? {}) as object), ['position_id']);
    for (const t of tools.filter((x) => (SKILL_TOOL_NAMES as readonly string[]).includes(x.name))) {
      assert.equal(t.annotations?.readOnlyHint, true);
      assert.equal(t.annotations?.destructiveHint, false);
    }
  });

  it('schema rejects a bad account id and a float-y borrow amount', async () => {
    const { c } = await connect(load('v1'));
    assert.ok(isErr(await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V1_OPEN, account_id: 'Agent1!' } })));
    assert.ok(isErr(await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V1_OPEN, borrow_usd: '1e3' } })));
    assert.ok(isErr(await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V1_OPEN, borrow_usd: '1.0000001' } })));
  });

  it('parseUsdE6 is exact', () => {
    assert.equal(parseUsdE6('2500'), 2_500_000_000n);
    assert.equal(parseUsdE6('12.5'), 12_500_000n);
    assert.equal(parseUsdE6('0.000001'), 1n);
    assert.throws(() => parseUsdE6('0.0000001'));
  });
});

describe('agent skill: open_protected_stock_loan', () => {
  it('v1: unsigned-call snapshot, v1 fee fields marked absent, health table', async () => {
    const { c, views } = await connect(load('v1'));
    const r = await c.callTool({ name: 'open_protected_stock_loan', arguments: V1_OPEN });
    assert.ok(!isErr(r), JSON.stringify(r));
    const v = json(r);
    // Snapshot: exactly what the agent signs.
    assert.deepEqual(v.call, {
      receiver_id: 'nvdax-mock.nectar.testnet',
      method: 'ft_transfer_call',
      args: {
        receiver_id: 'nectar-core.nectar.testnet',
        amount: '100000000',
        msg: '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"2500000000","pre_liq_ltv_bps":8000}}',
      },
      deposit: '1',
      gas: '200000000000000',
    });
    assert.equal(v.signer_id, 'agent1.nectar.testnet');
    assert.deepEqual(v.contract, { account_id: 'nectar-core.nectar.testnet', version: 'nectar-core 0.1.0 p2', kind: 'v1' });
    const p = v.preview as Record<string, unknown>;
    assert.deepEqual(p.limits, { static_limit_usd_e6: '3560000000', cramer_limit_usd_e6: '2887500000' });
    assert.deepEqual(p.fees, { limit_premium_usd_e6: '0', origination_fee_usd_e6: null, referrer_share_usd_e6: null, total_fees_usd_e6: '0', net_proceeds_usd_e6: '2500000000' });
    assert.deepEqual(p.absent_fields, ['origination_fee_usd_e6', 'referrer_share_usd_e6', 'aggregate_headroom_usd_e6', 'multiplier_e18']);
    assert.equal(p.value_usd_e6, '8900000000'); // 100 units x $89
    // $2,500 debt on $89 x 100: ceil(2500e4/8900)=2809; -5% $84.55 -> 2957; -10% $80.10 -> 3122; -20% $71.20 -> 3512.
    assert.deepEqual((p.health as Array<{ shock_bps: number; ltv_bps: string; triggerable: boolean }>).map((h) => [h.shock_bps, h.ltv_bps, h.triggerable]), [
      [0, '2809', false], [-500, '2957', false], [-1000, '3122', false], [-2000, '3512', false],
    ]);
    // v1 preview_borrow got exactly the v1 args (no borrower / referrer).
    assert.deepEqual(views?.calls.find((x) => x.method === 'preview_borrow')?.args, { symbol: 'NVDAx', units: '100000000', borrow_usd_e6: '2500000000' });
  });

  it('v1: a borrow the contract would refuse returns the preview and no call', async () => {
    const { c } = await connect(load('v1'));
    const r = await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V1_OPEN, borrow_usd: '5000' } });
    assert.ok(isErr(r));
    const v = json(r);
    assert.equal(v.error, 'borrow_would_fail');
    assert.equal(v.call, undefined);
    assert.equal((v.preview as { reason: string }).reason, 'borrow above B_c');
  });

  it('v1: pay_to and referrer are refused (v1 would silently ignore them)', async () => {
    const { c } = await connect(load('v1'));
    for (const extra of [{ pay_to: { receiver_id: 'merchant.nectar.testnet' } }, { referrer: 'agent2.nectar.testnet' }]) {
      const r = await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V1_OPEN, ...extra } });
      assert.ok(isErr(r));
      assert.equal(json(r).error, 'unsupported_on_v1');
    }
  });

  it('v2: fee stack from preview_borrow, pay_to + referrer in msg, v2 gas', async () => {
    const { c, views } = await connect(load('v2'));
    const args = { ...V2_OPEN, pay_to: { receiver_id: 'merchant.nectar.testnet', memo: 'inv-42' }, referrer: 'agent2.nectar.testnet' };
    const r = await c.callTool({ name: 'open_protected_stock_loan', arguments: args });
    assert.ok(!isErr(r), JSON.stringify(r));
    const v = json(r);
    assert.deepEqual(v.call, {
      receiver_id: 'nvdax-mock.nectar.testnet',
      method: 'ft_transfer_call',
      args: {
        receiver_id: 'nectar-core-v2.nectar.testnet',
        amount: '100000000',
        msg: '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"11250000000","pre_liq_ltv_bps":8000,"pay_to":{"receiver_id":"merchant.nectar.testnet","memo":"inv-42"},"referrer":"agent2.nectar.testnet"}}',
      },
      deposit: '1',
      gas: '250000000000000',
    });
    const p = v.preview as Record<string, unknown>;
    // model.csv demo_borrow: premium 121.5, origination 33.75 (half to the referrer), net 11,094.75.
    assert.deepEqual(p.fees, {
      limit_premium_usd_e6: '121500000', origination_fee_usd_e6: '33750000', referrer_share_usd_e6: '16875000',
      total_fees_usd_e6: '155250000', net_proceeds_usd_e6: '11094750000',
    });
    assert.deepEqual(p.limits, { static_limit_usd_e6: '7200000000', cramer_limit_usd_e6: '11250000000' });
    assert.equal(p.aggregate_headroom_usd_e6, '11250000000');
    assert.deepEqual(p.absent_fields, []);
    assert.deepEqual(views?.calls.find((x) => x.method === 'preview_borrow')?.args, {
      symbol: 'NVDAx', units: '100000000', borrow_usd_e6: '11250000000', borrower: 'agent1.nectar.testnet', referrer: 'agent2.nectar.testnet',
    });
    // model.csv demo_borrow: ltv 6250 at $180; shocks -> 6579 / 6945 / 7813 under pre_liq 8000.
    assert.deepEqual((p.health as Array<{ ltv_bps: string; triggerable: boolean }>).map((h) => [h.ltv_bps, h.triggerable]), [
      ['6250', false], ['6579', false], ['6945', false], ['7813', false],
    ]);
  });

  it('v2: plain borrow keeps the v1 msg shape and gas; pre_liq override changes the -20% row', async () => {
    const { c } = await connect(load('v2'));
    const v = json(await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V2_OPEN, pre_liq_ltv_bps: 7500 } }));
    const call = v.call as { args: { msg: string }; gas: string };
    assert.equal(call.args.msg, '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"11250000000","pre_liq_ltv_bps":7500}}');
    assert.equal(call.gas, '200000000000000');
    assert.deepEqual(((v.preview as { health: Array<{ triggerable: boolean }> }).health).map((h) => h.triggerable), [false, false, false, true]);
    const bad = await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V2_OPEN, pre_liq_ltv_bps: 9000 } });
    assert.equal(json(bad).error, 'bad_pre_liq');
  });

  it('v2: aggregate_limit refusal; referrer == borrower refused before any view', async () => {
    const { c, views } = await connect(load('v2'));
    const r = await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V2_OPEN, borrow_usd: '12000' } });
    assert.equal(json(r).error, 'borrow_would_fail');
    assert.equal((json(r).preview as { reason: string }).reason, 'aggregate_limit');
    const n = views?.calls.length ?? 0;
    const self = await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V2_OPEN, referrer: V2_OPEN.account_id } });
    assert.equal(json(self).error, 'referrer_is_borrower');
    assert.equal(views?.calls.length, n);
  });

  describe('pre_liq_ltv_bps refusal (SR-33)', () => {
    // 65 NVDAx at $180 = $11,700 of value: LTV cap $8,190, and pre_liq 6500 allows at most $7,605 of debt.
    const UNITS = '65000000';
    /** v2 fixture whose preview_borrow says ok for `borrowE6`, as the real view does: it takes no pre_liq. */
    const okPreview = (k: 'v1' | 'v2', borrowE6: string): Fixture => {
      const fx = load(k);
      const value = { ...(fx.views.preview_borrow?.value as Record<string, unknown>), ok: true, reason: null };
      fx.views.preview_borrow_pre_liq = { method: 'preview_borrow', args: { symbol: 'NVDAx', units: UNITS, borrow_usd_e6: borrowE6 }, block_height: 1000, value };
      return fx;
    };
    const open = async (fx: Fixture, borrow_usd: string, pre_liq_ltv_bps: number): Promise<unknown> =>
      (await connect(fx)).c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V2_OPEN, units: UNITS, borrow_usd, pre_liq_ltv_bps } });

    it('v2: above pre_liq but under the LTV cap fails with the contract reason and no call', async () => {
      const r = await open(okPreview('v2', '7800000000'), '7800', 6500); // LTV 6667 < 7000 cap
      assert.ok(isErr(r));
      const v = json(r);
      assert.equal(v.error, 'borrow_would_fail');
      assert.equal(v.call, undefined);
      const p = v.preview as { ok: boolean; reason: string; health: Array<{ ltv_bps: string; triggerable: boolean }> };
      assert.deepEqual([p.ok, p.reason], [false, 'borrow above pre_liq_ltv_bps']);
      assert.deepEqual([p.health[0]?.ltv_bps, p.health[0]?.triggerable], ['6667', true]);
    });

    it('boundary matches math::triggerable: exactly at pre_liq passes, one e6 above fails', async () => {
      const at = await open(okPreview('v2', '7605000000'), '7605', 6500);
      assert.ok(!isErr(at), JSON.stringify(at));
      assert.equal((json(at).preview as { ok: boolean }).ok, true);
      const above = json(await open(okPreview('v2', '7605000001'), '7605.000001', 6500));
      assert.equal((above.preview as { reason: string }).reason, 'borrow above pre_liq_ltv_bps');
    });

    it('the same borrow passes at a pre_liq that allows it', async () => {
      const r = await open(okPreview('v2', '7800000000'), '7800', 7000);
      assert.ok(!isErr(r), JSON.stringify(r));
    });

    it('v2: value uses the multiplier, as the contract does', async () => {
      const fx = okPreview('v2', '7800000000');
      (fx.views.get_exit_capacity?.value as Record<string, unknown>).multiplier_e18 = '2000000000000000000'; // doubles V; LTV 3334
      assert.ok(!isErr(await open(fx, '7800', 6500)));
    });

    it('v1: the deployed contract has the same rule', async () => {
      const v = json(await open(okPreview('v1', '4000000000'), '4000', 6500)); // 65 x $89 = $5,785; LTV 6915
      assert.equal(v.error, 'borrow_would_fail');
      assert.equal((v.preview as { reason: string }).reason, 'borrow above pre_liq_ltv_bps');
    });

    it('an earlier contract refusal keeps its own reason', async () => {
      const r = await (await connect(load('v2'))).c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V2_OPEN, borrow_usd: '12000', pre_liq_ltv_bps: 6500 } }); // LTV 6667 also breaches
      assert.equal((json(r).preview as { reason: string }).reason, 'aggregate_limit');
    });
  });

  it('shield returns unsupported_until_v2_shields; no live views is a clear error', async () => {
    const { c } = await connect(load('v2'));
    assert.equal(json(await c.callTool({ name: 'open_protected_stock_loan', arguments: { ...V2_OPEN, shield: 'weekend' } })).error, 'unsupported_until_v2_shields');
    const off = await connect(null);
    assert.equal(json(await off.c.callTool({ name: 'open_protected_stock_loan', arguments: V2_OPEN })).error, 'no_live_views');
  });

  it('healthTable matches model.csv demo_borrow (ltv 6250, not triggerable at pre_liq 7500)', () => {
    const [h0] = healthTable(100_000_000n, 180_000_000n, 6, 10n ** 18n, 11_250_000_000n, 7500);
    assert.deepEqual([h0?.value_usd_e6, h0?.ltv_bps, h0?.triggerable], ['18000000000', '6250', false]);
  });
});

describe('agent skill: companions', () => {
  it('quote_capacity on v1 marks aggregate fields absent; on v2 returns total debt + headroom', async () => {
    const v1 = json(await (await connect(load('v1'))).c.callTool({ name: 'quote_capacity', arguments: { symbol: 'NVDAx' } }));
    assert.deepEqual([v1.q_c_usd_e6, v1.r_c_usd_e6, v1.d_c_usd_e6, v1.h_c_bps, v1.capacity_usd_e6], ['3850000000', '0', '0', 2500, '2887500000']);
    assert.equal(v1.total_debt_usd_e6, null);
    assert.equal(v1.headroom_usd_e6, null);
    assert.deepEqual(v1.absent_fields, ['session_reason', 'total_debt_usd_e6', 'headroom_usd_e6']);
    const v2 = json(await (await connect(load('v2'))).c.callTool({ name: 'quote_capacity', arguments: { symbol: 'NVDAx' } }));
    assert.deepEqual([v2.total_debt_usd_e6, v2.headroom_usd_e6, v2.session_reason], ['0', '11250000000', 'outside_hours']);
    assert.match(String(v2.legend), /R_c Nectar Reserve · D_c verified DEX depth/);
  });

  it('get_note and build_self_settle return not_available', async () => {
    const { c } = await connect(load('v2'));
    const n = json(await c.callTool({ name: 'get_note', arguments: { token_id: '1' } }));
    const s = json(await c.callTool({ name: 'build_self_settle', arguments: { position_id: '1' } }));
    assert.equal(n.status, 'not_available');
    assert.equal(s.status, 'not_available');
  });
});

describe('agent skill: keyless guarantee', () => {
  it('skill.ts and mcp.ts import no fs/crypto-key APIs and never touch process.env or key paths', () => {
    for (const f of ['../src/skill.ts', '../src/mcp.ts']) {
      const src = readFileSync(resolve(here, f), 'utf8');
      const code = src.replace(/\/\/.*$/gm, '');
      assert.doesNotMatch(code, /process\.env|readFile|node:fs|['"]fs['"]|KEY_PATH|KeyPair|secretKey|private_key|keychain|InMemoryKeyStore|signTransaction/, f);
    }
  });

  it('every tool runs with process.env locked (any read throws)', async () => {
    const real = process.env;
    const { c } = await connect(load('v2'));
    const touched: string[] = [];
    process.env = new Proxy({} as NodeJS.ProcessEnv, {
      get(_t, k) {
        touched.push(String(k));
        throw new Error(`env read: ${String(k)}`);
      },
      has(_t, k) {
        touched.push(String(k));
        return false;
      },
    });
    try {
      const calls: Array<[string, Record<string, unknown>]> = [
        ['open_protected_stock_loan', { ...V2_OPEN, referrer: 'agent2.nectar.testnet' }],
        ['quote_capacity', { symbol: 'NVDAx' }],
        ['get_note', { token_id: '1' }],
        ['build_self_settle', { position_id: '1' }],
      ];
      for (const [name, args] of calls) assert.ok(!isErr(await c.callTool({ name, arguments: args })), name);
    } finally {
      process.env = real;
    }
    assert.deepEqual(touched, []);
  });
});
