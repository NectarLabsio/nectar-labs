#!/usr/bin/env node
// `pnpm demo:testnet` / G2: read-only views of nectar-core over public testnet RPC (no keys, no near CLI).
// ABI: docs/work/interface-p0.md. Ids: packages/config/config.yaml. Exit 2 if not deployed yet (TODO-G2).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = parse(readFileSync(join(root, 'packages/config/config.yaml'), 'utf8'));
const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
const CORE = cfg.accounts.core;
const SYMBOL = cfg.collateral?.nvdax?.symbol ?? 'NVDAx';
const EXPLORER = 'https://testnet.nearblocks.io';

if (!CORE || String(CORE).startsWith('TODO')) {
  console.error('nectar-core is not deployed yet (accounts.core is TODO-G2 in packages/config/config.yaml).');
  console.error('See README "Live on testnet" and docs/STATE.md.');
  process.exit(2);
}

async function view(method, args = {}) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'demo', method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: CORE, method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64') },
    }),
  });
  const body = await res.json();
  if (body.error || body.result?.error) throw new Error(`${method}: ${JSON.stringify(body.error ?? body.result.error)}`);
  return JSON.parse(Buffer.from(body.result.result).toString('utf8'));
}

const fmtUsd = (e6) => `$${(Number(BigInt(e6 ?? 0) / 10000n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const section = (t) => console.log(`\n== ${t} ==`);

try {
  section('contract');
  console.log(`account  ${CORE}   version ${await view('contract_version')}`);
  section(`exit capacity ${SYMBOL}`);
  const cap = await view('get_exit_capacity', { symbol: SYMBOL });
  console.log(`Q_c ${fmtUsd(cap.q_usd_e6)}  R_c ${fmtUsd(cap.r_usd_e6)}  D_c ${fmtUsd(cap.d_usd_e6)}  haircut ${cap.haircut_bps} bps  session ${cap.session_open ? 'open' : 'closed'}`);
  console.log(`oracle ${fmtUsd(cap.oracle_price_usd_e6)} (age ${cap.oracle_age_s}s, ${cap.oracle_fresh ? 'fresh' : 'STALE'})  effective limit ${cap.limit_bps_effective} bps`);
  section('pool');
  const pool = await view('get_pool');
  console.log(`available ${fmtUsd(pool.available_usd_e6)}  utilised ${fmtUsd(pool.utilised_usd_e6)}  treasury ${fmtUsd(pool.treasury_usd_e6)}`);
  section('quotes');
  const quotes = await view('list_quotes', { symbol: SYMBOL, from_index: 0, limit: 16 });
  for (const q of quotes) console.log(`#${q.quote_id}  remaining ${fmtUsd(q.remaining_usd_e6)}  max discount ${q.max_discount_bps} bps  ${q.unlock_ns ? 'exiting' : 'live'}`);
  if (!quotes.length) console.log('(none)');
  section('positions');
  const positions = await view('list_positions', { from_index: 0, limit: 16 });
  for (const p of positions) {
    const h = p.status === 'Open' ? await view('get_health', { position_id: p.position_id }) : null;
    console.log(`#${p.position_id}  ${p.status}  debt ${fmtUsd(p.debt_usd_e6)}${h ? `  ltv ${h.ltv_bps} bps / pre-liq ${h.pre_liq_ltv_bps} bps${h.triggerable ? '  TRIGGERABLE' : ''}` : ''}`);
  }
  if (!positions.length) console.log('(none)');
  section('explorer');
  for (const id of [CORE, cfg.accounts.usdc_mock, cfg.accounts.nvdax_mock]) console.log(`${EXPLORER}/address/${id}`);
} catch (e) {
  console.error(`RPC read failed: ${e.message}`);
  process.exit(1);
}
