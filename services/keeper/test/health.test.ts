// Health maths vs the shared test vectors. Reads contracts/nectar-core/tests/model.csv (written by
// WO-2's model.py) when present; until WO-2 lands it, falls back to test/model.fixture.csv, which has
// the columns below and hand-computed values. Columns are matched by header name; the real CSV must
// carry at least the HEALTH columns, and LIMIT columns are checked when present. V2 columns (multiplier,
// aggregate debt, origination; interface-v7.md A1/A3/A5) are checked when the header has them; an empty
// cell in a present column fails loudly. Absent columns take the v1 defaults (M = 1e18, total_debt = 0).

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  E18, LTV_INFINITE_BPS, borrowOk, ceilDiv, collateralStateFromView, cramerLimit, effectiveMultiplierE18, isPreLiqBreached,
  limitPremiumUsdE6, ltvBps, netProceedsUsdE6, originationFeeUsdE6, valueUsdE6,
} from '../src/health.ts';

const here = dirname(fileURLToPath(import.meta.url));
const REAL = resolve(here, '../../../contracts/nectar-core/tests/model.csv');
const FIXTURE = resolve(here, 'model.fixture.csv');
const SOURCE = existsSync(REAL) ? REAL : FIXTURE;

const HEALTH = ['units', 'decimals', 'price_usd_e6', 'debt_usd_e6', 'pre_liq_ltv_bps', 'value_usd_e6', 'ltv_bps', 'triggerable'] as const;
const LIMIT = [
  'session_open', 'q_usd_e6', 'r_usd_e6', 'd_usd_e6', 'base_haircut_bps', 'weekend_haircut_bps',
  'max_nectar_ltv_bps', 'base_ltv_bps', 'limit_premium_bps', 'borrow_usd_e6', 'b_c_usd_e6', 'static_limit_usd_e6', 'premium_usd_e6',
] as const;

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith('#'));
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim());
  return lines.map((l) => {
    const cells = l.split(',').map((c) => c.trim());
    const r: Row = {};
    header.forEach((h, i) => (r[h] = cells[i] ?? ''));
    return r;
  });
}

function bool(s: string): boolean {
  const v = s.toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw new Error(`not a boolean: ${s}`);
}

const get = (r: Row, k: string): string => {
  const v = r[k];
  if (v === undefined || v === '') throw new Error(`missing column ${k}`);
  return v;
};
/** v2 column: the v1 default when the header lacks it; an empty cell in a present column throws. */
const opt = (r: Row, k: string, dflt: bigint): bigint => (k in r ? BigInt(get(r, k)) : dflt);
const has = (r: Row, k: string): boolean => k in r;

const all = parseCsv(readFileSync(SOURCE, 'utf8'));
const label = (r: Row, i: number): string => r.case ?? `row ${i + 2}`;
// model.csv carries row kinds (`limit`, `leg`, ...) and leaves columns irrelevant to a kind empty. The
// keeper mirrors only the `limit` maths (health + Cramér limit + premium); `leg` rows (liquidation leg
// sizing) are the contract's job and are skipped here. The fixture has no `kind` column: all its rows
// are limit-shaped.
const hasKind = all.length > 0 && 'kind' in (all[0] ?? {});
const rows = hasKind ? all.filter((r) => r.kind === 'limit') : all;
let limitChecked = 0;

describe(`health maths vs ${SOURCE === REAL ? 'contracts/nectar-core/tests/model.csv' : 'test/model.fixture.csv (WO-2 CSV not landed)'}`, () => {
  it('CSV has limit rows and the health + limit columns', () => {
    assert.ok(rows.length > 0, `no limit rows in ${SOURCE}`);
    for (const c of [...HEALTH, ...LIMIT]) assert.ok(c in (rows[0] ?? {}), `model.csv lacks column ${c}; report to orchestrator`);
  });

  rows.forEach((r, i) => {
    it(`health: ${label(r, i)}`, () => {
      const m = opt(r, 'multiplier_e18', E18);
      const v = valueUsdE6(BigInt(get(r, 'units')), BigInt(get(r, 'price_usd_e6')), Number(get(r, 'decimals')), m);
      assert.equal(v, BigInt(get(r, 'value_usd_e6')), 'value_usd_e6');
      const debt = BigInt(get(r, 'debt_usd_e6'));
      assert.equal(ltvBps(debt, v), BigInt(get(r, 'ltv_bps')), 'ltv_bps');
      assert.equal(isPreLiqBreached(debt, v, BigInt(get(r, 'pre_liq_ltv_bps'))), bool(get(r, 'triggerable')), 'triggerable');
    });

    {
      // Every limit row needs every LIMIT column: an empty one fails loudly via get().
      it(`limit: ${label(r, i)}`, () => {
        const v = BigInt(get(r, 'value_usd_e6'));
        const totalDebt = opt(r, 'total_debt_usd_e6', 0n);
        const lim = cramerLimit({
          valueE6: v,
          sessionOpen: bool(get(r, 'session_open')),
          qUsdE6: BigInt(get(r, 'q_usd_e6')),
          rUsdE6: BigInt(get(r, 'r_usd_e6')),
          dUsdE6: BigInt(get(r, 'd_usd_e6')),
          baseHaircutBps: BigInt(get(r, 'base_haircut_bps')),
          weekendHaircutBps: BigInt(get(r, 'weekend_haircut_bps')),
          maxNectarLtvBps: BigInt(get(r, 'max_nectar_ltv_bps')),
          baseLtvBps: BigInt(get(r, 'base_ltv_bps')),
          totalDebtUsdE6: totalDebt,
        });
        assert.equal(lim.bcUsdE6, BigInt(get(r, 'b_c_usd_e6')), 'b_c_usd_e6');
        assert.equal(lim.staticLimitUsdE6, BigInt(get(r, 'static_limit_usd_e6')), 'static_limit_usd_e6');
        const borrow = BigInt(get(r, 'borrow_usd_e6'));
        const prem = limitPremiumUsdE6(borrow, lim.staticLimitUsdE6, BigInt(get(r, 'limit_premium_bps')));
        assert.equal(prem, BigInt(get(r, 'premium_usd_e6')), 'premium_usd_e6');
        if (has(r, 'haircut_bps')) assert.equal(lim.haircutBps, BigInt(get(r, 'haircut_bps')), 'haircut_bps');
        if (has(r, 'capacity_usd_e6')) assert.equal(lim.capacityUsdE6, BigInt(get(r, 'capacity_usd_e6')), 'capacity_usd_e6');
        if (has(r, 'aggregate_headroom_usd_e6')) {
          assert.equal(lim.aggregateHeadroomUsdE6, BigInt(get(r, 'aggregate_headroom_usd_e6')), 'aggregate_headroom_usd_e6');
        }
        if (has(r, 'borrow_ok')) {
          const ok = borrowOk(borrow, lim, totalDebt, v, BigInt(get(r, 'pre_liq_ltv_bps')));
          assert.equal(ok, bool(get(r, 'borrow_ok')), 'borrow_ok');
        }
        if (has(r, 'origination_fee_bps')) {
          const orig = originationFeeUsdE6(borrow, BigInt(get(r, 'origination_fee_bps')));
          assert.equal(orig, BigInt(get(r, 'origination_fee_usd_e6')), 'origination_fee_usd_e6');
          assert.equal(netProceedsUsdE6(borrow, prem, orig), BigInt(get(r, 'net_proceeds_usd_e6')), 'net_proceeds_usd_e6');
        }
        limitChecked++;
      });
    }
  });

  // Runs last in this suite (node:test runs `it`s in declaration order): no vacuous pass.
  it('every limit row was checked', () => {
    assert.ok(limitChecked > 0, 'no limit rows checked');
    assert.equal(limitChecked, rows.length, 'limit rows checked');
  });
});

describe('health maths edge cases', () => {
  it('V == 0 with debt is infinitely leveraged and breached', () => {
    assert.equal(ltvBps(1n, 0n), LTV_INFINITE_BPS);
    assert.equal(isPreLiqBreached(1n, 0n, 7500n), true);
  });
  it('rejects negatives and bad divisors', () => {
    assert.throws(() => valueUsdE6(-1n, 1n, 6), RangeError);
    assert.throws(() => ceilDiv(1n, 0n), RangeError);
    assert.throws(() => valueUsdE6(1n, 1n, 1.5), RangeError);
  });
  it('closed session forces D_c = 0 and uses the weekend haircut', () => {
    const base = { valueE6: 10n ** 12n, qUsdE6: 0n, rUsdE6: 0n, dUsdE6: 1_000_000n, baseHaircutBps: 1000n, weekendHaircutBps: 2500n, maxNectarLtvBps: 7000n, baseLtvBps: 4000n };
    assert.equal(cramerLimit({ ...base, sessionOpen: false }).bcUsdE6, 0n);
    assert.equal(cramerLimit({ ...base, sessionOpen: false }).haircutBps, 2500n);
    assert.equal(cramerLimit({ ...base, sessionOpen: true }).bcUsdE6, 900_000n);
  });
  it('aggregate headroom floors at 0 when total debt exceeds capacity', () => {
    const base = { valueE6: 10n ** 12n, sessionOpen: true, qUsdE6: 1_000_000n, rUsdE6: 0n, dUsdE6: 0n, baseHaircutBps: 1000n, weekendHaircutBps: 2500n, maxNectarLtvBps: 7000n, baseLtvBps: 4000n };
    const lim = cramerLimit({ ...base, totalDebtUsdE6: 5_000_000n });
    assert.equal(lim.aggregateHeadroomUsdE6, 0n);
    assert.equal(lim.bcUsdE6, 0n);
    assert.equal(cramerLimit({ ...base, totalDebtUsdE6: 100_000n }).bcUsdE6, 800_000n);
  });
  it('TokenIncludesMultiplier ignores M; a 2-for-1 split with halved price leaves V unchanged', () => {
    assert.equal(effectiveMultiplierE18('TokenIncludesMultiplier', 2n * E18), E18);
    assert.equal(effectiveMultiplierE18('Underlying', 2n * E18), 2n * E18);
    assert.equal(valueUsdE6(100_000_000n, 180_000_000n, 6), valueUsdE6(100_000_000n, 90_000_000n, 6, 2n * E18));
  });
  it('reads v1 views: no multiplier / total debt ⇒ defaults; session from market_session_open; missing ⇒ closed', () => {
    assert.deepEqual(collateralStateFromView({ market_session_open: true }), { multiplierE18: E18, priceKind: 'Underlying', totalDebtUsdE6: 0n, sessionOpen: true });
    assert.deepEqual(collateralStateFromView({ session_open: false, q_usd_e6: '1' }), { multiplierE18: E18, priceKind: 'Underlying', totalDebtUsdE6: 0n, sessionOpen: false });
    assert.equal(collateralStateFromView({}).sessionOpen, false);
    assert.equal(collateralStateFromView(null).sessionOpen, false);
  });
  it('reads v2 views', () => {
    const s = collateralStateFromView({ session_open: true, multiplier_e18: '2000000000000000000', price_kind: 'TokenIncludesMultiplier', total_debt_usd_e6: '10500000000' });
    assert.deepEqual(s, { multiplierE18: 2n * E18, priceKind: 'TokenIncludesMultiplier', totalDebtUsdE6: 10_500_000_000n, sessionOpen: true });
  });
});
