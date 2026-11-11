// Feed MCP server (F-160, @modelcontextprotocol/sdk 1.32.2). Read-only and keyless: tools read the
// nectar-core views over public RPC (when CORE_ACCOUNT_ID is set) or the Feed SQLite store. The server
// never computes a price or a limit on its own authority: numbers come from contract views; the
// arithmetic in explain_limit only re-renders the D-009 formula and is cross-checked against the
// contract's `preview_borrow`. No account ids leave this module (list_quotes whitelists fields).
// Transports: stdio (src/mcp-stdio.ts) and stateless Streamable HTTP (createMcpHttpServer).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { corsHeaders, handlePreflight, type CorsPolicy } from './cors.ts';
import type { ExitCapacity, FeedDb, OneClickReport } from './db.ts';
import { errMsg } from './log.ts';
import { SKILL_TOOL_NAMES, SkillError, notAvailable, openProtectedStockLoan, quoteCapacity } from './skill.ts';
import type { ViewReader } from './sources.ts';

export const MCP_TOOL_NAMES = ['get_exit_capacity', 'preview_borrow', 'list_quotes', 'explain_limit', ...SKILL_TOOL_NAMES] as const;
const QUOTE_FIELDS = ['quote_id', 'collateral', 'committed_usd_e6', 'remaining_usd_e6', 'amount_usd_e6', 'max_discount_bps', 'notice_period_ns', 'unlock_ns', 'status', 'created_ns'] as const;
const BPS = 10_000n;

export interface McpDeps {
  db: FeedDb;
  /** nectar-core views; null when CORE_ACCOUNT_ID is unset (DB-only mode). */
  views: ViewReader | null;
  /** nectar-core account id that `views` reads; the agent-skill tools address unsigned calls to it. */
  coreId?: string | null;
}

const symbol = z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).describe('collateral symbol, e.g. NVDAx');
const uint = z.string().regex(/^\d{1,39}$/);
const account = z.string().min(2).max(64).regex(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/);

const text = (v: unknown): CallToolResult => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (msg: string): CallToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });
/** Skill refusals are JSON (`{error, detail, ...data}`) so an agent can branch on the code. */
const skillFail = (e: unknown): CallToolResult =>
  e instanceof SkillError ? { content: [{ type: 'text', text: JSON.stringify({ error: e.code, detail: e.message, ...(e.data ?? {}) }, null, 2) }], isError: true } : fail(`error: ${errMsg(e)}`);

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

/** Same numbers as GET /api/oneclick (FeedDb.oneClickReport): asset route status + reference-pair impact sets. */
function oneClick(deps: McpDeps, sym: string): { status: string; observed_at?: string; pairs: OneClickReport['pairs'] } {
  const r = deps.db.oneClickReport(Date.now());
  const a = r.assets.find((x) => x.symbol === sym);
  const own = r.pairs.filter((p) => p.id === `${sym.toLowerCase()}-usdc`);
  const status = a === undefined ? 'not_sampled' : a.status === 'no_route' ? 'no 1Click route' : 'route';
  return { status, ...(a === undefined ? {} : { observed_at: a.observed_at }), pairs: own.length > 0 ? own : r.pairs };
}

/** `wnear-usdc impact $500/$1,000/$2,000 = 0/3/9 bps (worst 99/102/108 bps)` */
function impactLine(p: OneClickReport['pairs'][number]): string {
  const n = p.samples.map((s) => `$${s.notional_usd.toLocaleString('en-US')}`).join('/');
  return `${p.id} impact ${n} = ${p.samples.map((s) => s.impact_bps).join('/')} bps (worst ${p.samples.map((s) => s.worst_impact_bps).join('/')} bps, verified)`;
}

function capOf(c: ExitCapacity): bigint {
  if (typeof c.capacity_usd_e6 === 'string') return BigInt(c.capacity_usd_e6);
  return ((BigInt(c.q_usd_e6) + BigInt(c.r_usd_e6) + BigInt(c.d_usd_e6)) * (BPS - BigInt(c.haircut_bps))) / BPS;
}

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'nectar-feed', version: '0.3.0' });
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
        lines.push(`1Click route (${sym})${' '.repeat(Math.max(1, 11 - sym.length))}= ${oc.status}`);
        for (const p of oc.pairs) lines.push(`1Click dry quotes        = ${impactLine(p)}`);
        return text(lines.join('\n'));
      }),
  );

  // ---- agent skill (PRD v7 §10.5): read-only, keyless; returns unsigned calls only ----
  const skill = { views: deps.views, coreId: deps.coreId ?? null };
  const sguard = (fn: () => Promise<Record<string, unknown>>): Promise<CallToolResult> => fn().then(text, skillFail);

  server.registerTool(
    'open_protected_stock_loan',
    {
      title: 'Open protected stock loan (unsigned)',
      description:
        'Builds the UNSIGNED NEP-141 call that locks stock collateral and borrows mock USDC from nectar-core: {receiver_id: <collateral token>, method: "ft_transfer_call", args: {receiver_id: <core>, amount, msg}, deposit: "1", gas}, plus a preview (static and Cramér limits, every fee, health at −5/−10/−20%). Never signs: the agent signs from account_id with its own key. pay_to/referrer need nectar-core v2; shield is not available yet.',
      inputSchema: {
        account_id: account.describe('the borrower (signer) NEAR account id'),
        collateral: symbol,
        units: uint.describe('collateral base units (integer string; NVDAx has 6 decimals)'),
        borrow_usd: z.string().regex(/^\d{1,21}(\.\d{1,6})?$/).describe('USD amount to borrow, decimal string, e.g. "100" or "12.5"'),
        shield: z.string().max(32).optional().describe('weekend/event shield preset (returns unsupported_until_v2_shields for now)'),
        pay_to: z.object({ receiver_id: account, memo: z.string().max(256).optional() }).optional().describe('v2: send net proceeds to this merchant (must be registered on the USDC token)'),
        referrer: account.optional().describe('v2: registered referrer, earns half the origination fee; must differ from account_id'),
        pre_liq_ltv_bps: z.number().int().min(0).max(10_000).optional().describe('pre-liquidation LTV; defaults to the collateral maximum'),
      },
      annotations: ro,
    },
    (a) => sguard(() => openProtectedStockLoan(skill, a)),
  );

  server.registerTool(
    'quote_capacity',
    { title: 'Quote capacity', description: 'Committed exit capacity terms for a collateral: Q_c (escrowed quotes), R_c (Nectar Reserve), D_c (verified DEX depth), h_c, total debt and aggregate headroom (v2; null on v1).', inputSchema: { symbol }, annotations: ro },
    ({ symbol: sym }) => sguard(() => quoteCapacity(skill, sym)),
  );

  server.registerTool(
    'get_note',
    { title: 'Get Position Note', description: 'NEP-171 Position Note by token id. Returns not_available until Position Notes ship (WO-22).', inputSchema: { token_id: z.string().min(1).max(64) }, annotations: ro },
    () => sguard(async () => notAvailable('get_note', 'Position Notes (WO-22)')),
  );

  server.registerTool(
    'build_self_settle',
    { title: 'Build self-settle (unsigned)', description: 'Unsigned Profit-Lock self-settlement call for a position. Returns not_available until WO-23a.', inputSchema: { position_id: uint.describe('position id (integer string)') }, annotations: ro },
    () => sguard(async () => notAvailable('build_self_settle', 'Profit-Lock self-settlement (WO-23a)')),
  );
  return server;
}

/** Stateless Streamable HTTP on `POST /mcp` (one server+transport per request). No request logging. */
export function createMcpHttpServer(deps: McpDeps, cors?: CorsPolicy): Server {
  const handle = mcpHandler(deps, cors);
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
      return;
    }
    handle(req, res);
  });
}

/** `/mcp` handler: CORS (allowlist only; the dedicated MCP port had no CORS headers before WO-34k), POST only. */
export function mcpHandler(deps: McpDeps, cors: CorsPolicy = { origins: null, legacyWildcard: false, methods: 'POST, OPTIONS' }): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (handlePreflight(cors, req, res)) return;
    for (const [k, v] of Object.entries(corsHeaders(cors, req))) res.setHeader(k, v);
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
  };
}
