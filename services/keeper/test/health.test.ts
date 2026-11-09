// Health maths vs the shared test vectors. Reads contracts/nectar-core/tests/model.csv (written by
// WO-2's model.py) when present; until WO-2 lands it, falls back to test/model.fixture.csv, which has
// the columns below and hand-computed values. Columns are matched by header name; the real CSV must
// carry at least the HEALTH columns, and LIMIT columns are checked when present.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LTV_INFINITE_BPS, ceilDiv, cramerLimit, isPreLiqBreached, limitPremiumUsdE6, ltvBps, valueUsdE6 } from '../src/health.ts';

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

const rows = parseCsv(readFileSync(SOURCE, 'utf8'));
const label = (r: Row, i: number): string => r.case ?? `row ${i + 2}`;

describe(`health maths vs ${SOURCE === REAL ? 'contracts/nectar-core/tests/model.csv' : 'test/model.fixture.csv (WO-2 CSV not landed)'}`, () => {
  it('CSV has rows and the health columns', () => {
    assert.ok(rows.length > 0, 'no rows');
    for (const c of HEALTH) assert.ok(c in (rows[0] ?? {}), `model.csv lacks column ${c}; report to orchestrator`);
  });

  rows.forEach((r, i) => {
    it(`health: ${label(r, i)}`, () => {
      const v = valueUsdE6(BigInt(get(r, 'units')), BigInt(get(r, 'price_usd_e6')), Number(get(r, 'decimals')));
      assert.equal(v, BigInt(get(r, 'value_usd_e6')), 'value_usd_e6');
      const debt = BigInt(get(r, 'debt_usd_e6'));
      assert.equal(ltvBps(debt, v), BigInt(get(r, 'ltv_bps')), 'ltv_bps');
      assert.equal(isPreLiqBreached(debt, v, BigInt(get(r, 'pre_liq_ltv_bps'))), bool(get(r, 'triggerable')), 'triggerable');
    });

    if (LIMIT.every((c) => (r[c] ?? '') !== '')) {
      it(`limit: ${label(r, i)}`, () => {
        const v = BigInt(get(r, 'value_usd_e6'));
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
        });
        assert.equal(lim.bcUsdE6, BigInt(get(r, 'b_c_usd_e6')), 'b_c_usd_e6');
        assert.equal(lim.staticLimitUsdE6, BigInt(get(r, 'static_limit_usd_e6')), 'static_limit_usd_e6');
        const prem = limitPremiumUsdE6(BigInt(get(r, 'borrow_usd_e6')), lim.staticLimitUsdE6, BigInt(get(r, 'limit_premium_bps')));
        assert.equal(prem, BigInt(get(r, 'premium_usd_e6')), 'premium_usd_e6');
      });
    }
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
});
