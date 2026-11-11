// Borrow-call guard for the demo agent (review 2, R2-05). The Feed MCP returns an UNSIGNED call; tool output is
// untrusted input, never a signing instruction. Before signing, the agent rebuilds the call it asked for from its
// own inputs and config, compares the MCP call field by field, and signs only the local rebuild:
//   receiver_id   = the collateral token from config (collateral.<k>.token for the requested symbol)
//   method        = ft_transfer_call
//   args          = { receiver_id: nectar-core from config, amount: the requested units, msg }
//   msg           = {"LockCollateralAndBorrow":{collateral, borrow_usd_e6, pre_liq_ltv_bps}} byte-equal to the rebuild;
//                   no pay_to / referrer / shield / unknown keys (pay_to would send the proceeds elsewhere)
//   deposit       = "1" (yoctoNEAR, NEP-141)
//   gas           = 1..300 Tgas
// Explicit, not the SDK `tx.borrow`: packages/sdk uses extensionless imports that Node's type stripping cannot load,
// and its intent adds `memo: null`, which the Feed's call does not carry. The shape matches services/feed/src/skill.ts.

import { ConfigError } from './config.ts';

export const BORROW_METHOD = 'ft_transfer_call';
export const ONE_YOCTO = '1';
export const TGAS = 1_000_000_000_000n;
/** NEAR per-transaction prepaid gas ceiling. */
export const MAX_GAS = 300n * TGAS;
const MSG_KEY = 'LockCollateralAndBorrow';
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const SYMBOL_RE = /^[A-Za-z0-9._-]{1,32}$/;
const UNITS_RE = /^[1-9]\d{0,38}$/;

export interface BorrowExpectation {
  /** NEP-141 collateral token the call must be addressed to. */
  token: string;
  /** nectar-core account that must receive the tokens. */
  core: string;
  collateral: string;
  units: string;
  /** What the agent asks the MCP for (decimal USD). */
  borrowUsd: string;
  borrowUsdE6: string;
  /** exact: the agent sent pre_liq_ltv_bps; range: the Feed picks it (defaults to the collateral maximum). */
  preLiq: { exact: number } | { min: number; max: number };
}

export interface BorrowCall {
  receiver_id: string;
  method: typeof BORROW_METHOD;
  args: { receiver_id: string; amount: string; msg: string };
  deposit: typeof ONE_YOCTO;
  gas: string;
}

export class BorrowCallRefused extends Error {
  readonly mismatches: readonly string[];
  constructor(mismatches: readonly string[]) {
    super(`refusing to sign the MCP borrow call: ${mismatches.join('; ')}`);
    this.mismatches = mismatches;
  }
}

const isAccount = (v: string): boolean => v.length >= 2 && v.length <= 64 && ACCOUNT_RE.test(v);
const unset = (v: string | undefined): v is undefined => v === undefined || v.trim() === '' || v.startsWith('TODO-') || v === 'null';
const rec = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const show = (v: unknown): string => {
  const s = v === undefined ? 'undefined' : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

/** "10" | "12.5" | "0.000001" -> USD e6, exact (more than 6 decimals is refused, never rounded). */
export function usdToE6(s: string): string {
  const m = /^(0|[1-9]\d{0,20})(?:\.(\d{1,6}))?$/.exec(s);
  if (m === null) throw new ConfigError(`DEMO_BORROW_USD must be a decimal USD amount with at most 6 decimals, got ${JSON.stringify(s)}`);
  const e6 = BigInt(m[1] ?? '0') * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
  if (e6 === 0n) throw new ConfigError('DEMO_BORROW_USD must be > 0');
  return e6.toString();
}

function bpsOf(v: string | undefined, name: string): number | null {
  if (unset(v)) return null;
  const n = Number(v);
  if (!/^\d{1,5}$/.test(v) || n > 10_000) throw new ConfigError(`${name} must be an integer in [0, 10000]`);
  return n;
}

/** The agent's own intent: env first (the inputs it sends), then packages/config/config.yaml. No network. */
export function borrowExpectation(env: NodeJS.ProcessEnv, y: ReadonlyMap<string, string>): BorrowExpectation {
  const collateral = unset(env.DEMO_COLLATERAL) ? 'NVDAx' : env.DEMO_COLLATERAL;
  if (!SYMBOL_RE.test(collateral)) throw new ConfigError('DEMO_COLLATERAL must be a collateral symbol');
  const units = unset(env.DEMO_UNITS) ? '1000000' : env.DEMO_UNITS;
  if (!UNITS_RE.test(units)) throw new ConfigError('DEMO_UNITS must be a positive integer string (collateral base units)');
  const borrowUsd = unset(env.DEMO_BORROW_USD) ? '10' : env.DEMO_BORROW_USD;

  // collateral.<k>.symbol == requested symbol -> collateral.<k>.token / pre_liq_{min,max}_bps
  let entry: string | null = null;
  for (const [k, v] of y) {
    const m = /^collateral\.([A-Za-z0-9_]+)\.symbol$/.exec(k);
    if (m !== null && v === collateral) entry = `collateral.${m[1] ?? ''}`;
  }
  const token = unset(env.DEMO_COLLATERAL_TOKEN) ? (entry === null ? undefined : y.get(`${entry}.token`)) : env.DEMO_COLLATERAL_TOKEN;
  if (unset(token)) throw new ConfigError(`no token for collateral ${collateral}: set DEMO_COLLATERAL_TOKEN or collateral.<k>.token in config.yaml`);
  const core = unset(env.CORE_ACCOUNT_ID) ? y.get('accounts.core') : env.CORE_ACCOUNT_ID;
  if (unset(core)) throw new ConfigError('no nectar-core account: set CORE_ACCOUNT_ID or accounts.core in config.yaml');
  for (const [name, id] of [['collateral token', token], ['nectar-core', core]] as const) {
    if (!isAccount(id) || !id.endsWith('.testnet')) throw new ConfigError(`${name} ${JSON.stringify(id)} must be a .testnet account id`);
  }

  const exact = bpsOf(env.DEMO_PRE_LIQ_LTV_BPS, 'DEMO_PRE_LIQ_LTV_BPS');
  const min = entry === null ? null : bpsOf(y.get(`${entry}.pre_liq_min_bps`), `${entry}.pre_liq_min_bps`);
  const max = entry === null ? null : bpsOf(y.get(`${entry}.pre_liq_max_bps`), `${entry}.pre_liq_max_bps`);
  const preLiq = exact !== null ? { exact } : { min: min ?? 1, max: max ?? 10_000 };
  return { token, core, collateral, units, borrowUsd, borrowUsdE6: usdToE6(borrowUsd), preLiq };
}

/** The msg exactly as the contract expects it (field order of services/feed/src/skill.ts and packages/sdk). */
export function borrowMsg(collateral: string, borrowUsdE6: string, preLiqLtvBps: number): string {
  return JSON.stringify({ [MSG_KEY]: { collateral, borrow_usd_e6: borrowUsdE6, pre_liq_ltv_bps: preLiqLtvBps } });
}

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[], where: string, out: string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) out.push(`${where}.${k} was not requested (got ${show(o[k])})`);
}

/**
 * Returns the locally rebuilt call (what the agent signs) or throws BorrowCallRefused listing every mismatch.
 * Never returns the MCP object itself.
 */
export function verifyBorrowCall(mcpCall: unknown, x: BorrowExpectation): BorrowCall {
  const bad: string[] = [];
  const c = rec(mcpCall);
  if (c === null) throw new BorrowCallRefused([`call is not an object (got ${show(mcpCall)})`]);
  onlyKeys(c, ['receiver_id', 'method', 'args', 'deposit', 'gas'], 'call', bad);
  if (c.receiver_id !== x.token) bad.push(`receiver_id ${show(c.receiver_id)} != collateral token ${x.token}`);
  if (c.method !== BORROW_METHOD) bad.push(`method ${show(c.method)} != ${BORROW_METHOD}`);
  if (c.deposit !== ONE_YOCTO) bad.push(`deposit ${show(c.deposit)} != "1" yoctoNEAR`);

  let gas: bigint | null = null;
  if (typeof c.gas === 'string' && /^\d{1,20}$/.test(c.gas)) gas = BigInt(c.gas);
  if (gas === null || gas === 0n || gas > MAX_GAS) bad.push(`gas ${show(c.gas)} is not an integer string in (0, 300 Tgas]`);

  let preLiq: number | null = null;
  const a = rec(c.args);
  if (a === null) bad.push(`args is not an object (got ${show(c.args)})`);
  else {
    onlyKeys(a, ['receiver_id', 'amount', 'msg', 'memo'], 'args', bad);
    if (a.memo !== undefined && a.memo !== null) bad.push(`args.memo ${show(a.memo)} was not requested`);
    if (a.receiver_id !== x.core) bad.push(`args.receiver_id ${show(a.receiver_id)} != nectar-core ${x.core}`);
    if (a.amount !== x.units) bad.push(`args.amount ${show(a.amount)} != requested units ${x.units}`);
    let parsed: unknown = undefined;
    if (typeof a.msg !== 'string') bad.push(`args.msg is not a string (got ${show(a.msg)})`);
    else {
      try {
        parsed = JSON.parse(a.msg);
      } catch {
        bad.push('args.msg is not valid JSON');
      }
    }
    const top = rec(parsed);
    const body = top === null ? null : rec(top[MSG_KEY]);
    if (typeof a.msg === 'string' && parsed !== undefined) {
      if (top === null || Object.keys(top).length !== 1 || body === null) bad.push(`msg is not {"${MSG_KEY}": {...}} (got ${show(a.msg)})`);
      else {
        onlyKeys(body, ['collateral', 'borrow_usd_e6', 'pre_liq_ltv_bps'], `msg.${MSG_KEY}`, bad);
        if (body.collateral !== x.collateral) bad.push(`msg collateral ${show(body.collateral)} != ${x.collateral}`);
        if (body.borrow_usd_e6 !== x.borrowUsdE6) bad.push(`msg borrow_usd_e6 ${show(body.borrow_usd_e6)} != requested ${x.borrowUsdE6} ($${x.borrowUsd})`);
        const p = body.pre_liq_ltv_bps;
        const okRange = 'exact' in x.preLiq ? p === x.preLiq.exact : typeof p === 'number' && p >= x.preLiq.min && p <= x.preLiq.max;
        if (typeof p !== 'number' || !Number.isInteger(p) || !okRange) {
          const want = 'exact' in x.preLiq ? String(x.preLiq.exact) : `[${x.preLiq.min}, ${x.preLiq.max}]`;
          bad.push(`msg pre_liq_ltv_bps ${show(p)} not ${want}`);
        } else preLiq = p;
      }
    }
    if (bad.length === 0 && preLiq !== null && a.msg !== borrowMsg(x.collateral, x.borrowUsdE6, preLiq)) {
      bad.push('args.msg bytes differ from the locally rebuilt msg (duplicate keys, reordering or whitespace)');
    }
  }
  if (bad.length > 0 || gas === null || preLiq === null) throw new BorrowCallRefused(bad.length > 0 ? bad : ['call incomplete']);
  return {
    receiver_id: x.token,
    method: BORROW_METHOD,
    args: { receiver_id: x.core, amount: x.units, msg: borrowMsg(x.collateral, x.borrowUsdE6, preLiq) },
    deposit: ONE_YOCTO,
    gas: gas.toString(),
  };
}
