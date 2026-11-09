// Feed MCP server (F-160, @modelcontextprotocol/sdk 1.32.2). Read-only and keyless: tools read the
// nectar-core views over public RPC (when CORE_ACCOUNT_ID is set) or the Feed SQLite store. The server
// never computes a price or a limit on its own authority: numbers come from contract views; the
// arithmetic in explain_limit only re-renders the D-009 formula and is cross-checked against the
// contract's `preview_borrow`. No account ids leave this module (list_quotes whitelists fields).
// Transports: stdio (src/mcp-stdio.ts) and stateless Streamable HTTP (createMcpHttpServer).

import { createServer, type Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ExitCapacity, FeedDb } from './db.ts';
import { errMsg } from './log.ts';
import type { ViewReader } from './sources.ts';

export const MCP_TOOL_NAMES = ['get_exit_capacity', 'preview_borrow', 'list_quotes', 'explain_limit'] as const;
const QUOTE_FIELDS = ['quote_id', 'collateral', 'committed_usd_e6', 'remaining_usd_e6', 'amount_usd_e6', 'max_discount_bps', 'notice_period_ns', 'unlock_ns', 'status', 'created_ns'] as const;
const BPS = 10_000n;

export interface McpDeps {
  db: FeedDb;
  /** nectar-core views; null when CORE_ACCOUNT_ID is unset (DB-only mode). */
  views: ViewReader | null;
}

const symbol = z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).describe('collateral symbol, e.g. NVDAx');
const uint = z.string().regex(/^\d{1,39}$/);

const text = (v: unknown): CallToolResult => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (msg: string): CallToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });

/** `1234567890` (e6) -> `$1,234.56`. Display only. */
export function usd(e6: string | bigint): string {
  const v = BigInt(e6);
  const cents = v / 10_000n;
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${whole}.${(cents % 100n).toString().padStart(2, '0')}`;
}

async function capacity(deps: McpDeps, sym: string): Promise<{ cap: ExitCapacity; block: number | null; source: 'view' | 'feed-db' } | null> {
  if (deps.views !== null) {
    const r = await deps.views.view('get_exit_capacity', { symbol: sym });
    return { cap: r.value as ExitCapacity, block: r.blockHeight, source: 'view' };
  }
  const s = deps.db.latestSnapshots().find((x) => x.symbol === sym);
  return s === undefined ? null : { cap: s.capacity, block: s.block_height, source: 'feed-db' };
}

function oneClick(deps: McpDeps, sym: string): Record<string, unknown> {
  const s = deps.db.oneClickSamples(sym, 1)[0];
  if (s === undefined) return { status: 'not_sampled' };
  if (s.status === 'no_route') return { status: 'no 1Click route', observed_at: new Date(s.observed_at).toISOString() };
  return { status: 'verified', amount_in_usd_e6: s.amount_in_usd_e6, amount_out_usd_e6: s.amount_out_usd_e6, gap_bps: s.gap_bps, observed_at: new Date(s.observed_at).toISOString() };
}

function capOf(c: ExitCapacity): bigint {
  if (typeof c.capacity_usd_e6 === 'string') return BigInt(c.capacity_usd_e6);
  return ((BigInt(c.q_usd_e6) + BigInt(c.r_usd_e6) + BigInt(c.d_usd_e6)) * (BPS - BigInt(c.haircut_bps))) / BPS;
}

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'nectar-feed', version: '0.2.0' });
  const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  const guard = (fn: () => Promise<CallToolResult>): Promise<CallToolResult> => fn().catch((e: unknown) => fail(`error: ${errMsg(e)}`));

  server.registerTool(
    'get_exit_capacity',
    { title: 'Exit capacity', description: 'Committed exit capacity for a collateral: Q_c (escrowed quotes), R_c (reserve), D_c (verified depth), haircut, oracle state, plus the latest 1Click dry-quote sample.', inputSchema: { symbol }, annotations: ro },
    ({ symbol: sym }) =>
      guard(async () => {
        const c = await capacity(deps, sym);
        if (c === null) return fail(`no data for ${sym}`);
        return text({ symbol: sym, source: c.source, block_height: c.block, ...c.cap, capacity_usd_e6: capOf(c.cap).toString(), oneclick: oneClick(deps, sym) });
      }),
  );

  server.registerTool(
    'preview_borrow',
    { title: 'Preview borrow', description: 'Runs the nectar-core `preview_borrow` view: Cramér limit B_c, static limit, limit premium, and whether the borrow would pass. Read-only; signs nothing.', inputSchema: { symbol, units: uint.describe('collateral base units (integer string)'), borrow_usd_e6: uint.describe('borrow in USD e6 (integer string)') }, annotations: ro },
    ({ symbol: sym, units, borrow_usd_e6 }) =>
      guard(async () => {
        if (deps.views === null) return fail('preview_borrow needs live views: CORE_ACCOUNT_ID is not configured');
        const r = await deps.views.view('preview_borrow', { symbol: sym, units, borrow_usd_e6 });
        return text({ symbol: sym, units, borrow_usd_e6, block_height: r.blockHeight, ...(r.value as Record<string, unknown>) });
      }),
  );

  server.registerTool(
    'list_quotes',
    { title: 'List quotes', description: 'Live Pappus exit quotes for a collateral: ids, sizes, max discount, notice. Buyer identities are never returned.', inputSchema: { symbol, limit: z.number().int().min(1).max(50).optional() }, annotations: ro },
    ({ symbol: sym, limit }) =>
      guard(async () => {
        const lim = limit ?? 50;
        const raw: Array<Record<string, unknown>> =
          deps.views !== null
            ? ((await deps.views.view('list_quotes', { symbol: sym, from_index: 0, limit: lim })).value as Array<Record<string, unknown>>)
            : (deps.db.quotes(sym).slice(0, lim) as unknown as Array<Record<string, unknown>>);
        const quotes = raw.map((q) => Object.fromEntries(QUOTE_FIELDS.filter((k) => q[k] !== undefined && q[k] !== null).map((k) => [k, q[k]])));
        return text({ symbol: sym, source: deps.views !== null ? 'view' : 'feed-db', quotes });
      }),
  );

  server.registerTool(
    'explain_limit',
    { title: 'Explain limit', description: 'The Cramér limit (D-009, PRD §4.2) B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c)) with live numbers substituted, as text. Optional units adds V_c and the contract-checked B_c.', inputSchema: { symbol, units: uint.optional().describe('collateral base units (integer string)') }, annotations: ro },
    ({ symbol: sym, units }) =>
      guard(async () => {
        const c = await capacity(deps, sym);
        if (c === null) return fail(`no data for ${sym}`);
        const k = c.cap;
        const cap = capOf(k);
        const lines = [
          `Cramér limit for ${sym} (source: ${c.source}${c.block === null ? '' : `, block ${c.block}`})`,
          'B_c = min(LTV_c · V_c, (1 − h_c) · (Q_c + R_c + D_c))',
          `Q_c (escrowed quotes)    = ${usd(k.q_usd_e6)}`,
          `R_c (reserve)            = ${usd(k.r_usd_e6)}`,
          `D_c (verified depth)     = ${usd(k.d_usd_e6)}${k.session_open ? '' : ' (market closed: D_c counts as 0)'}`,
          `h_c (haircut)            = ${k.haircut_bps} bps (${k.session_open ? 'session open' : 'weekend/closed'})`,
          `(1 − h_c)(Q_c+R_c+D_c)   = ${usd(cap)}`,
          `oracle                   = ${usd(k.oracle_price_usd_e6)} per unit, age ${String(k.oracle_age_s)} s, ${k.oracle_fresh ? 'fresh' : 'STALE (borrowing blocked)'}`,
        ];
        let ltvBps = BigInt(k.limit_bps_effective);
        if (deps.views !== null) {
          const coll = (await deps.views.view('get_collateral', { symbol: sym })).value as { decimals?: number; max_nectar_ltv_bps?: number } | null;
          if (coll?.max_nectar_ltv_bps !== undefined) ltvBps = BigInt(coll.max_nectar_ltv_bps);
          lines.push(`LTV_c (max Nectar LTV)   = ${ltvBps} bps`);
          if (units !== undefined && coll?.decimals !== undefined) {
            const v = (BigInt(units) * BigInt(k.oracle_price_usd_e6)) / 10n ** BigInt(coll.decimals);
            const ltvCap = (v * ltvBps) / BPS;
            const pv = (await deps.views.view('preview_borrow', { symbol: sym, units, borrow_usd_e6: '1' })).value as { b_c_usd_e6?: string };
            lines.push(
              `V_c (${units} units)       = ${usd(v)}`,
              `LTV_c · V_c              = ${usd(ltvCap)}`,
              `B_c = min(${usd(ltvCap)}, ${usd(cap)}) = ${usd(ltvCap < cap ? ltvCap : cap)}`,
              `contract preview_borrow  = ${pv.b_c_usd_e6 === undefined ? 'n/a' : usd(pv.b_c_usd_e6)} (authoritative)`,
            );
          }
        } else {
          lines.push(`LTV_c (effective)        = ${ltvBps} bps (feed-db; pass units with live views for V_c)`);
        }
        const oc = oneClick(deps, sym);
        lines.push(`1Click depth sample      = ${String(oc.status)}${oc.status === 'verified' ? ` (gap ${String(oc.gap_bps)} bps)` : ''}`);
        return text(lines.join('\n'));
      }),
  );
  return server;
}

/** Stateless Streamable HTTP on `POST /mcp` (one server+transport per request). No request logging. */
export function createMcpHttpServer(deps: McpDeps): Server {
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' }).end('{"error":"method not allowed (stateless server)"}');
      return;
    }
    const server = createMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    server
      .connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch((e: unknown) => {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: errMsg(e) }));
      });
  });
}
