import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FeedDb, type ExitCapacity } from '../src/db.ts';
import { MCP_TOOL_NAMES, createMcpHttpServer, createMcpServer, usd, type McpDeps } from '../src/mcp.ts';
import type { ViewReader, ViewResult } from '../src/sources.ts';

// Same fixture as contracts tests (tests.rs: 943-944): Q=50k, h=2500 closed -> cap 37.5k; LTV 7000.
const CAP: ExitCapacity & { capacity_usd_e6: string } = {
  q_usd_e6: '50000000000', r_usd_e6: '0', d_usd_e6: '0', haircut_bps: 2500, session_open: false,
  oracle_price_usd_e6: '180000000', oracle_age_s: 30, oracle_fresh: true, b_c_usd_per_unit_e6: '126000000', limit_bps_effective: 7000,
  capacity_usd_e6: '37500000000',
};

class Views implements ViewReader {
  calls: string[] = [];
  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    this.calls.push(method);
    switch (method) {
      case 'get_exit_capacity': return { value: CAP, blockHeight: 42 };
      case 'get_collateral': return { value: { symbol: 'NVDAx', decimals: 6, base_ltv_bps: 5000, max_nectar_ltv_bps: 7000 }, blockHeight: 42 };
      case 'list_quotes': return { value: [{ quote_id: '0', buyer: 'bob.testnet', buyer_remote_recipient: 'So1ana', collateral: 'NVDAx', remaining_usd_e6: '50000000000', max_discount_bps: 250 }], blockHeight: 42 };
      case 'preview_borrow': {
        // 100 units * $180 = $18,000; LTV cap $12,600 < cap $37,500.
        assert.equal(args.symbol, 'NVDAx');
        return { value: { b_c_usd_e6: '12600000000', static_limit_usd_e6: '9000000000', premium_usd_e6: '0', ok: true, reason: null }, blockHeight: 42 };
      }
      default: throw new Error(`unexpected view ${method}`);
    }
  }
}

async function connect(deps: McpDeps): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer(deps).connect(a);
  const c = new Client({ name: 'test', version: '0' });
  await c.connect(b);
  return c;
}
const body = (r: unknown): string => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? '');

function seeded(): FeedDb {
  const db = new FeedDb(':memory:');
  db.addSnapshot({ symbol: 'NVDAx', block_height: 40, observed_at: 1, capacity: CAP });
  db.upsertQuoteFromView({ quote_id: '0', collateral: 'NVDAx', amount_usd_e6: '50000000000', max_discount_bps: 250, status: 'Live' }, 1);
  db.setOneClickAsset('NVDAx', 'no_route', 1);
  const s = (n: number, impact: number, worst: number, id: string) => ({ notional_usd: n, amount_in: '1', amount_out: '1', min_amount_out: '1', rate_e6: '1', impact_bps: impact, worst_impact_bps: worst, correlation_id: id });
  db.addOneClickSet({ pair_id: 'wnear-usdc', origin: 'nep141:wrap.near', destination: 'nep141:usdc', observed_at: 1, samples: [s(500, 0, 100, 'a'), s(1000, 3, 102, 'b'), s(2000, 9, 108, 'c')] }, '[]');
  return db;
}

describe('Feed MCP (in-memory transport)', () => {
  it('lists exactly the read-only tools (four feed + four skill)', async () => {
    const c = await connect({ db: seeded(), views: new Views() });
    const { tools } = await c.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [...MCP_TOOL_NAMES].sort());
    assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false));
  });

  it('get_exit_capacity returns capacity plus "no 1Click route" for NVDAx', async () => {
    const c = await connect({ db: seeded(), views: new Views() });
    const v = JSON.parse(body(await c.callTool({ name: 'get_exit_capacity', arguments: { symbol: 'NVDAx' } }))) as Record<string, unknown>;
    assert.equal(v.capacity_usd_e6, '37500000000');
    assert.equal(v.source, 'view');
    assert.deepEqual((v.oneclick as { status: string }).status, 'no 1Click route');
    const pairs = (v.oneclick as { pairs: Array<{ id: string; samples: Array<{ impact_bps: number }> }> }).pairs;
    assert.deepEqual(pairs.map((p) => [p.id, p.samples.map((x) => x.impact_bps)]), [['wnear-usdc', [0, 3, 9]]], 'same numbers as GET /api/oneclick');
  });

  it('list_quotes never returns buyer identities', async () => {
    for (const views of [new Views(), null]) {
      const c = await connect({ db: seeded(), views });
      const t = body(await c.callTool({ name: 'list_quotes', arguments: { symbol: 'NVDAx' } }));
      assert.ok(!t.includes('bob.testnet') && !t.includes('buyer') && !t.includes('So1ana'), t);
      assert.ok(t.includes('"quote_id": "0"'));
    }
  });

  it('preview_borrow relays the contract view; refuses without live views', async () => {
    const views = new Views();
    const c = await connect({ db: seeded(), views });
    const v = JSON.parse(body(await c.callTool({ name: 'preview_borrow', arguments: { symbol: 'NVDAx', units: '100000000', borrow_usd_e6: '10000000000' } }))) as Record<string, unknown>;
    assert.equal(v.b_c_usd_e6, '12600000000');
    assert.ok(views.calls.includes('preview_borrow'));
    const off = await connect({ db: seeded(), views: null });
    const r = await off.callTool({ name: 'preview_borrow', arguments: { symbol: 'NVDAx', units: '1', borrow_usd_e6: '1' } });
    assert.equal(r.isError, true);
  });

  it('explain_limit renders the D-009 formula with live numbers and the contract check', async () => {
    const c = await connect({ db: seeded(), views: new Views() });
    const t = body(await c.callTool({ name: 'explain_limit', arguments: { symbol: 'NVDAx', units: '100000000' } }));
    assert.match(t, /B_c = min\(LTV_c · V_c, \(1 − h_c\) · \(Q_c \+ R_c \+ D_c\)\)/);
    assert.match(t, /\(1 − h_c\)\(Q_c\+R_c\+D_c\)\s+= \$37,500\.00/);
    assert.match(t, /V_c \(100000000 units\)\s+= \$18,000\.00/);
    assert.match(t, /B_c = min\(\$12,600\.00, \$37,500\.00\) = \$12,600\.00/);
    assert.match(t, /contract preview_borrow\s+= \$12,600\.00/);
    assert.match(t, /no 1Click route/);
    assert.match(t, /wnear-usdc impact \$500\/\$1,000\/\$2,000 = 0\/3\/9 bps \(worst 100\/102\/108 bps, verified\)/);
  });

  it('DB-only mode serves from the Feed store; unknown symbol is a tool error', async () => {
    const c = await connect({ db: seeded(), views: null });
    const v = JSON.parse(body(await c.callTool({ name: 'get_exit_capacity', arguments: { symbol: 'NVDAx' } }))) as Record<string, unknown>;
    assert.equal(v.source, 'feed-db');
    assert.equal((await c.callTool({ name: 'explain_limit', arguments: { symbol: 'TSLAx' } })).isError, true);
  });

  it('usd() formats e6 amounts', () => {
    assert.equal(usd('1234567890'), '$1,234.56');
    assert.equal(usd(0n), '$0.00');
  });
});

describe('Feed MCP (Streamable HTTP, stateless)', () => {
  it('serves tools/list and tools/call over POST /mcp', async () => {
    const srv = createMcpHttpServer({ db: seeded(), views: null });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as AddressInfo).port;
    try {
      const c = new Client({ name: 'http-test', version: '0' });
      await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
      assert.equal((await c.listTools()).tools.length, MCP_TOOL_NAMES.length);
      const t = body(await c.callTool({ name: 'explain_limit', arguments: { symbol: 'NVDAx' } }));
      assert.match(t, /\$37,500\.00/);
      await c.close();
      assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`)).status, 405);
    } finally {
      srv.close();
    }
  });
});
