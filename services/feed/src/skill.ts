// Agent skill (PRD v7 §10.5, WO-25 Part 1). Read-only and keyless: every function here reads public
// contract views through a ViewReader and returns data or an UNSIGNED call. This module imports no fs,
// reads no environment variable and holds no key; the agent signs with its own key (near-api-js).
// Numbers come from contract views (`preview_borrow`, `get_exit_capacity`, `get_collateral`). The only
// local arithmetic is the display-only health table under price shocks, done with the keeper's health
// maths (services/keeper/src/health.ts, pinned to contracts/nectar-core/tests/model.csv).
//
// v1 vs v2 is detected with `contract_version()`: "2.0.0-v7" (interface-v7.md A6) is v2; anything else
// is v1. v1 has no origination fee, referrer, pay_to or aggregate debt, so those fields are null and
// listed in `absent_fields`; pay_to / referrer are refused on v1 (v1 would silently ignore them).

import { BPS, E18, effectiveMultiplierE18, isPreLiqBreached, ltvBps, valueUsdE6, type PriceKind } from '../../keeper/src/health.ts';
import type { ViewReader } from './sources.ts';

export const SKILL_TOOL_NAMES = ['open_protected_stock_loan', 'quote_capacity', 'get_note', 'build_self_settle'] as const;

/** Gas per borrow (TGas), same as packages/sdk GAS_TGAS.borrow / borrowV2. Unused gas is refunded. */
export const BORROW_GAS_TGAS = { v1: 200n, v2: 250n } as const;
const TGAS = 1_000_000_000_000n;
export const ONE_YOCTO = '1';
export const SHOCKS_BPS = [-500, -1000, -2000] as const;
export const PAY_TO_MEMO_MAX = 256;
const V2_PREFIX = '2.';

export type ContractKind = 'v1' | 'v2';

export interface UnsignedCall {
  receiver_id: string;
  method: 'ft_transfer_call';
  args: { receiver_id: string; amount: string; msg: string };
  deposit: '1';
  gas: string;
}

export interface PayTo {
  receiver_id: string;
  memo?: string;
}

export interface OpenLoanInput {
  account_id: string;
  collateral: string;
  units: string;
  borrow_usd: string;
  shield?: string;
  pay_to?: PayTo;
  referrer?: string;
  pre_liq_ltv_bps?: number;
}

export interface SkillDeps {
  views: ViewReader | null;
  /** nectar-core account id the call is addressed to (the same contract `views` reads). */
  coreId: string | null;
}

/** A refusal: `code` is machine-readable, `detail` is prose, `data` carries whatever was computed. */
export class SkillError extends Error {
  readonly code: string;
  readonly data: Record<string, unknown> | undefined;
  constructor(code: string, detail: string, data?: Record<string, unknown>) {
    super(detail);
    this.code = code;
    this.data = data;
  }
}

const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export function isAccountId(v: string): boolean {
  return v.length >= 2 && v.length <= 64 && ACCOUNT_RE.test(v);
}

/** "100" | "100.5" | "0.000001" -> USD e6 (exact; more than 6 decimals is refused, never rounded). */
export function parseUsdE6(s: string): bigint {
  const m = /^(0|[1-9]\d{0,20})(?:\.(\d{1,6}))?$/.exec(s.trim());
  if (m === null) throw new SkillError('bad_amount', `borrow_usd must be a decimal USD amount with at most 6 decimals, got ${JSON.stringify(s)}`);
  return BigInt(m[1] ?? '0') * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
function big(v: unknown, field: string): bigint {
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  throw new SkillError('bad_view', `view field ${field} is missing or not an integer`);
}
function bigOpt(v: unknown): string | null {
  if (typeof v === 'string' && /^\d+$/.test(v)) return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return String(v);
  return null;
}

function need(deps: SkillDeps): { views: ViewReader; coreId: string } {
  if (deps.views === null || deps.coreId === null) throw new SkillError('no_live_views', 'this tool needs live contract views: CORE_ACCOUNT_ID is not configured');
  return { views: deps.views, coreId: deps.coreId };
}

export async function contractKind(views: ViewReader): Promise<{ kind: ContractKind; version: string }> {
  const r = await views.view('contract_version', {});
  const version = typeof r.value === 'string' ? r.value : String(r.value);
  return { kind: version.startsWith(V2_PREFIX) ? 'v2' : 'v1', version };
}

/** The exact NEP-141 call the agent signs: collateral token -> ft_transfer_call(core, units, msg), 1 yocto. */
export function buildBorrowCall(p: { token: string; core: string; units: string; msg: Record<string, unknown>; gasTgas: bigint }): UnsignedCall {
  return {
    receiver_id: p.token,
    method: 'ft_transfer_call',
    args: { receiver_id: p.core, amount: p.units, msg: JSON.stringify(p.msg) },
    deposit: ONE_YOCTO,
    gas: (p.gasTgas * TGAS).toString(),
  };
}

/** Msg body in the contract's field order; v2 keys only when set (v1 shape is byte-identical otherwise). */
export function lockCollateralAndBorrowMsg(collateral: string, borrowUsdE6: bigint, preLiqLtvBps: number, payTo?: PayTo, referrer?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { collateral, borrow_usd_e6: borrowUsdE6.toString(), pre_liq_ltv_bps: preLiqLtvBps };
  if (payTo !== undefined) body.pay_to = payTo.memo === undefined || payTo.memo === '' ? { receiver_id: payTo.receiver_id } : { receiver_id: payTo.receiver_id, memo: payTo.memo };
  if (referrer !== undefined) body.referrer = referrer;
  return { LockCollateralAndBorrow: body };
}

export interface HealthRow {
  shock_bps: number;
  price_usd_e6: string;
  value_usd_e6: string;
  ltv_bps: string;
  pre_liq_ltv_bps: number;
  triggerable: boolean;
}

/** Display-only: position health right after the borrow and at each price shock (debt = full borrow). */
export function healthTable(units: bigint, priceUsdE6: bigint, decimals: number, multiplierE18: bigint, debtUsdE6: bigint, preLiqLtvBps: number): HealthRow[] {
  return [0, ...SHOCKS_BPS].map((shock) => {
    const price = (priceUsdE6 * (BPS + BigInt(shock))) / BPS;
    const v = valueUsdE6(units, price, decimals, multiplierE18);
    return {
      shock_bps: shock,
      price_usd_e6: price.toString(),
      value_usd_e6: v.toString(),
      ltv_bps: ltvBps(debtUsdE6, v).toString(),
      pre_liq_ltv_bps: preLiqLtvBps,
      triggerable: isPreLiqBreached(debtUsdE6, v, BigInt(preLiqLtvBps)),
    };
  });
}

const V1_ABSENT_FEES = ['origination_fee_usd_e6', 'referrer_share_usd_e6', 'aggregate_headroom_usd_e6', 'multiplier_e18'] as const;

export async function openProtectedStockLoan(deps: SkillDeps, i: OpenLoanInput): Promise<Record<string, unknown>> {
  if (i.shield !== undefined) throw new SkillError('unsupported_until_v2_shields', 'shields are not available until the v2 shields module (WO-23a) ships');
  if (!isAccountId(i.account_id)) throw new SkillError('bad_account', 'account_id must be a NEAR account id');
  if (i.referrer !== undefined && !isAccountId(i.referrer)) throw new SkillError('bad_account', 'referrer must be a NEAR account id');
  if (i.referrer !== undefined && i.referrer === i.account_id) throw new SkillError('referrer_is_borrower', 'referrer must differ from the borrower');
  if (i.pay_to !== undefined) {
    if (!isAccountId(i.pay_to.receiver_id)) throw new SkillError('bad_account', 'pay_to.receiver_id must be a NEAR account id');
    if ((i.pay_to.memo ?? '').length > PAY_TO_MEMO_MAX) throw new SkillError('bad_memo', `pay_to.memo is at most ${PAY_TO_MEMO_MAX} characters`);
  }
  const borrowE6 = parseUsdE6(i.borrow_usd);
  if (borrowE6 === 0n) throw new SkillError('bad_amount', 'borrow_usd must be > 0');
  if (!/^[1-9]\d{0,38}$/.test(i.units)) throw new SkillError('bad_amount', 'units must be a positive integer string (collateral base units)');
  const units = BigInt(i.units);

  const { views, coreId } = need(deps);
  const { kind, version } = await contractKind(views);
  if (kind === 'v1' && (i.pay_to !== undefined || i.referrer !== undefined)) {
    throw new SkillError('unsupported_on_v1', `pay_to and referrer need nectar-core v2 (${coreId} reports ${JSON.stringify(version)}); v1 would ignore them`);
  }
  const coll = rec((await views.view('get_collateral', { symbol: i.collateral })).value);
  if (Object.keys(coll).length === 0) throw new SkillError('unknown_collateral', `no collateral ${i.collateral} on ${coreId}`);
  const token = String(coll.token ?? '');
  if (!isAccountId(token)) throw new SkillError('bad_view', 'get_collateral.token is missing');
  const decimals = Number(coll.decimals);
  const plMin = Number(coll.pre_liq_min_bps);
  const plMax = Number(coll.pre_liq_max_bps);
  const preLiq = i.pre_liq_ltv_bps ?? plMax;
  if (!Number.isInteger(preLiq) || preLiq < plMin || preLiq > plMax) throw new SkillError('bad_pre_liq', `pre_liq_ltv_bps must be in [${plMin}, ${plMax}] for ${i.collateral}`);

  const capView = await views.view('get_exit_capacity', { symbol: i.collateral });
  const cap = rec(capView.value);
  const price = big(cap.oracle_price_usd_e6, 'oracle_price_usd_e6');
  const m = kind === 'v2' ? effectiveMultiplierE18((cap.price_kind as PriceKind | undefined) ?? 'Underlying', bigOpt(cap.multiplier_e18) === null ? E18 : BigInt(cap.multiplier_e18 as string)) : E18;

  const args: Record<string, unknown> = { symbol: i.collateral, units: i.units, borrow_usd_e6: borrowE6.toString() };
  if (kind === 'v2') {
    args.borrower = i.account_id;
    if (i.referrer !== undefined) args.referrer = i.referrer;
  }
  const pvView = await views.view('preview_borrow', args);
  const pv = rec(pvView.value);
  const premium = big(pv.premium_usd_e6, 'premium_usd_e6');

  const fees =
    kind === 'v2'
      ? {
          limit_premium_usd_e6: premium.toString(),
          origination_fee_usd_e6: bigOpt(pv.origination_fee_usd_e6),
          referrer_share_usd_e6: bigOpt(pv.referrer_share_usd_e6),
          total_fees_usd_e6: bigOpt(pv.total_fees_usd_e6),
          net_proceeds_usd_e6: bigOpt(pv.net_proceeds_usd_e6),
        }
      : {
          limit_premium_usd_e6: premium.toString(),
          origination_fee_usd_e6: null,
          referrer_share_usd_e6: null,
          // v1 charges only the limit premium, so these two are exact (computed from v1 preview_borrow).
          total_fees_usd_e6: premium.toString(),
          net_proceeds_usd_e6: (borrowE6 > premium ? borrowE6 - premium : 0n).toString(),
        };

  const preview = {
    source: kind === 'v2' ? 'preview_borrow (v2)' : 'v1 views (preview_borrow, get_collateral, get_exit_capacity)',
    block_height: pvView.blockHeight,
    symbol: i.collateral,
    units: i.units,
    borrow_usd_e6: borrowE6.toString(),
    value_usd_e6: valueUsdE6(units, price, decimals, m).toString(),
    limits: {
      static_limit_usd_e6: String(pv.static_limit_usd_e6),
      cramer_limit_usd_e6: String(pv.b_c_usd_e6),
    },
    fees,
    aggregate_headroom_usd_e6: kind === 'v2' ? bigOpt(pv.aggregate_headroom_usd_e6) : null,
    multiplier_e18: kind === 'v2' ? bigOpt(pv.multiplier_e18) : null,
    session_open: typeof pv.session_open === 'boolean' ? pv.session_open : cap.session_open === true,
    ok: pv.ok === true,
    reason: typeof pv.reason === 'string' ? pv.reason : null,
    pre_liq_ltv_bps: preLiq,
    health: healthTable(units, price, decimals, m, borrowE6, preLiq),
    absent_fields: kind === 'v1' ? [...V1_ABSENT_FEES] : [],
  };
  const contract = { account_id: coreId, version, kind };
  if (!preview.ok) throw new SkillError('borrow_would_fail', `the contract would refuse this borrow: ${preview.reason ?? 'unknown reason'}`, { contract, preview });

  const msg = lockCollateralAndBorrowMsg(i.collateral, borrowE6, preLiq, i.pay_to, i.referrer);
  return {
    contract,
    signer_id: i.account_id,
    call: buildBorrowCall({ token, core: coreId, units: i.units, msg, gasTgas: kind === 'v2' && (i.pay_to !== undefined || i.referrer !== undefined) ? BORROW_GAS_TGAS.v2 : BORROW_GAS_TGAS.v1 }),
    msg_decoded: msg,
    preview,
    note: 'UNSIGNED. Sign and send this function call from signer_id with your own key (near-api-js). Health rows are display-only; the contract decides.',
  };
}

export async function quoteCapacity(deps: SkillDeps, symbol: string): Promise<Record<string, unknown>> {
  const { views, coreId } = need(deps);
  const { kind, version } = await contractKind(views);
  const r = await views.view('get_exit_capacity', { symbol });
  const c = rec(r.value);
  const q = big(c.q_usd_e6, 'q_usd_e6');
  const rr = big(c.r_usd_e6, 'r_usd_e6');
  const d = big(c.d_usd_e6, 'd_usd_e6');
  const h = BigInt(Number(c.haircut_bps));
  const capacity = bigOpt(c.capacity_usd_e6) ?? (((q + rr + d) * (BPS - h)) / BPS).toString();
  return {
    symbol,
    contract: { account_id: coreId, version, kind },
    block_height: r.blockHeight,
    q_c_usd_e6: q.toString(),
    r_c_usd_e6: rr.toString(),
    d_c_usd_e6: d.toString(),
    h_c_bps: Number(c.haircut_bps),
    session_open: c.session_open === true,
    session_reason: typeof c.session_reason === 'string' ? c.session_reason : null,
    capacity_usd_e6: capacity,
    total_debt_usd_e6: kind === 'v2' ? bigOpt(c.total_debt_usd_e6) : null,
    headroom_usd_e6: kind === 'v2' ? bigOpt(c.aggregate_headroom_usd_e6) : null,
    absent_fields: kind === 'v1' ? ['session_reason', 'total_debt_usd_e6', 'headroom_usd_e6'] : [],
    legend: 'Q_c escrowed quotes · R_c Nectar Reserve · D_c verified DEX depth (0 when the session is closed) · h_c haircut; capacity = (1 − h_c)(Q_c + R_c + D_c)',
    ...(kind === 'v1' ? { note: 'v1 has no aggregate debt: each borrow is capped at min(LTV_c·V_c, capacity_usd_e6)' } : {}),
  };
}

export function notAvailable(tool: 'get_note' | 'build_self_settle', until: string): Record<string, unknown> {
  return { status: 'not_available', tool, reason: `${tool} ships with ${until}; nothing to return yet` };
}
