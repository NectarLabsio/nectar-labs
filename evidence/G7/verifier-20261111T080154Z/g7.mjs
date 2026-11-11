// Read-only G7 re-run chain verification. node g7.mjs <clone-dir>
import crypto from 'node:crypto';
import fs from 'node:fs';
const NEAR = 'https://test.rpc.fastnear.com', SOL = 'https://api.devnet.solana.com';
const CORE = 'nectar-core-v2.nectar.testnet', SIGNER = 'v1.signer-prod.testnet', KEEPER = 'keeper-v2.nectar.testnet';
const VAULT = 'ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW', MINT = '3Ve8GiDBtD7crfwUcKukpMigKQaU2aXtSCNgu661E8hT';
const ED = 'Ed25519SigVerify111111111111111111111111111';
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58d = (s) => { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('b58 ' + s); n = n * 58n + BigInt(i); } let h = n.toString(16); if (h.length % 2) h = '0' + h; let b = n === 0n ? [] : [...Buffer.from(h, 'hex')]; for (const c of s) { if (c === '1') b.unshift(0); else break; } return Buffer.from(b); };
const b58e = (buf) => { let n = BigInt('0x' + (Buffer.from(buf).toString('hex') || '0')); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const x of buf) { if (x === 0) s = '1' + s; else break; } return s; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rpc = async (url, method, params) => { for (let i = 0; i < 5; i++) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json().catch(() => ({ error: 'http ' + r.status })); if (j.error && JSON.stringify(j.error).match(/429|Too many/i)) { await sleep(1500 * (i + 1)); continue; } return j; } return { error: 'rate-limited' }; };
const nv = async (acct, m, args) => { const j = await rpc(NEAR, 'query', { request_type: 'call_function', finality: 'final', account_id: acct, method_name: m, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }); if (!j.result?.result) return { __err: JSON.stringify(j.error || j.result).slice(0, 200) }; return JSON.parse(Buffer.from(j.result.result).toString()); };
const ntx = async (h, sender) => (await rpc(NEAR, 'EXPERIMENTAL_tx_status', { tx_hash: h, sender_account_id: sender, wait_until: 'NONE' })).result;
const sol = async (m, p) => { await sleep(350); return (await rpc(SOL, m, p)).result; };
const keyBytes = (v) => { if (Array.isArray(v)) return Buffer.from(v); if (typeof v !== 'string') return null; const s = v.replace(/^ed25519:/, ''); if (/^(0x)?[0-9a-f]{64}$/i.test(s)) return Buffer.from(s.replace(/^0x/, ''), 'hex'); return b58d(s); };
const out = []; const log = (...a) => { const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); out.push(s); console.log(s); };
const clone = process.argv[2];
const pdas = {}; for (const p of [8, 9, 10]) { const t = fs.readFileSync(`${clone}/evidence/G7/rerun/deposit-${p}.log`, 'utf8'); pdas[p] = JSON.parse(t.slice(t.indexOf('{"position_pda'))).position_pda; }
const keeperLog = fs.readFileSync(`${clone}/evidence/rollout/keeper-20261111T070745Z.log`, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const tokDelta = (t) => { const pre = Object.fromEntries((t.meta.preTokenBalances || []).filter((b) => b.mint === MINT).map((b) => [b.owner + '#' + b.accountIndex, b.uiTokenAmount.uiAmountString])); return (t.meta.postTokenBalances || []).filter((b) => b.mint === MINT).map((b) => `${b.owner.slice(0, 8)}…[${b.accountIndex}] ${pre[b.owner + '#' + b.accountIndex] ?? '∅'}→${b.uiTokenAmount.uiAmountString}`).join(' | '); };
const auth = {};
log('# NEAR positions');
for (const p of [8, 9, 10]) {
  const pos = await nv(CORE, 'get_position', { position_id: String(p) });
  const r = pos.remote || {};
  const dpk = await nv(SIGNER, 'derived_public_key', { path: `solana-devnet/pos/${p}`, predecessor: CORE, domain_id: 1 });
  auth[p] = keyBytes(r.authority);
  const match = auth[p] && keyBytes(dpk)?.equals(auth[p]);
  log(`pos ${p}: status=${pos.status} owner=${pos.owner} debt=${pos.debt_usd_e6 ?? pos.principal_usd_e6 ?? '?'} remote.chain=${r.chain_id} authority=${r.authority} committed_depositor=${r.committed_depositor} deposit_state=${JSON.stringify(r.deposit_state ?? r.state ?? r.deposit_status)}`);
  log(`  derived_public_key(solana-devnet/pos/${p}, ${CORE}, 1)=${JSON.stringify(dpk)} → AUTHORITY ${match ? 'MATCH' : 'MISMATCH'}`);
  log(`  remote keys: ${Object.keys(r).join(',')}`);
  log(`  pending_release: ${JSON.stringify(await nv(CORE, 'get_pending_release', { position_id: String(p) })).slice(0, 700)}`);
  log(`  pending_settlement: ${JSON.stringify(await nv(CORE, 'get_pending_settlement', { position_id: String(p) })).slice(0, 700)}`);
}
log('# NEAR keeper txs (confirm / trigger / relay)');
for (const e of keeperLog.filter((e) => e.tx_hash)) {
  const t = await ntx(e.tx_hash, KEEPER);
  const st = t ? Object.keys(t.status)[0] : 'NO_RESULT';
  const evs = (t?.receipts_outcome || []).flatMap((ro) => ro.outcome.logs.filter((l) => l.startsWith('EVENT_JSON:')).map((l) => JSON.parse(l.slice(11))));
  const fails = (t?.receipts_outcome || []).filter((ro) => ro.outcome.status.Failure).length;
  log(`${e.msg} pos=${e.position_id} tx=${e.tx_hash} signer=${t?.transaction?.signer_id} method=${t?.transaction?.actions?.[0]?.FunctionCall?.method_name} status=${st} failed_receipts=${fails}`);
  for (const ev of evs) log(`   EVENT ${ev.event} ${JSON.stringify(ev.data).slice(0, 330)}`);
}
log('# Solana');
const pa = await sol('getAccountInfo', [VAULT, { encoding: 'jsonParsed' }]);
const pdAddr = pa?.value?.data?.parsed?.info?.programData;
const pd = await sol('getAccountInfo', [pdAddr, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]);
const pdFull = await sol('getAccountInfo', [pdAddr, { encoding: 'jsonParsed' }]);
log(`program ${VAULT} executable=${pa?.value?.executable} programData=${pdAddr} space=${pd?.value?.space} lastDeploySlot=${pdFull?.value?.data?.parsed?.info?.slot} upgradeAuthority=${pdFull?.value?.data?.parsed?.info?.authority}`);
const sigs = keeperLog.filter((e) => e.msg === 'solana_tx_confirmed');
for (const e of sigs) {
  const t = await sol('getTransaction', [e.solana_tx_sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
  const st = (await sol('getSignatureStatuses', [[e.solana_tx_sig], { searchTransactionHistory: true }]))?.value?.[0];
  const ixs = t.transaction.message.instructions;
  const ids = ixs.map((i) => i.programId);
  const k = ids.indexOf(ED);
  const d = b58d(ixs[k].data);
  const so = d.readUInt16LE(2), po = d.readUInt16LE(6), mo = d.readUInt16LE(10), ms = d.readUInt16LE(12);
  const sig = d.subarray(so, so + 64), pk = d.subarray(po, po + 32), msg = d.subarray(mo, mo + ms);
  const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: pk.toString('base64url') }, format: 'jwk' });
  const ok = crypto.verify(null, msg, key, sig);
  const tam = Buffer.from(msg); tam[tam.length - 1] ^= 1;
  const neg = crypto.verify(null, tam, key, sig);
  log(`${e.op} pos=${e.position_id} sig=${e.solana_tx_sig} slot=${t.slot} err=${JSON.stringify(t.meta.err)} confirmation=${st?.confirmationStatus}`);
  log(`  programs=[${ids.map((x) => (x === ED ? 'Ed25519' : x === VAULT ? 'VAULT' : x.slice(0, 8))).join(', ')}] ed25519_idx=${k} next_is_vault=${ids[k + 1] === VAULT} vault_accounts_include_pda=${(ixs[k + 1].accounts || []).includes(pdas[e.position_id])}`);
  log(`  ed25519 pubkey=${b58e(pk)} == authority(pos ${e.position_id}): ${auth[e.position_id] ? pk.equals(auth[e.position_id]) : 'n/a'} sig_valid=${ok} tampered_valid=${neg}`);
  log(`  msg=${msg.toString('utf8')}`);
  log(`  sig_hex=${sig.toString('hex').slice(0, 32)}… token: ${tokDelta(t)}`);
  log(`  logs: ${(t.meta.logMessages || []).filter((l) => /Instruction:|Program log: (?!Instruction)/.test(l)).slice(0, 6).join(' / ').slice(0, 400)}`);
}
log('# position PDAs (closed?) and their history');
for (const p of [8, 9, 10]) {
  const ai = await sol('getAccountInfo', [pdas[p], { encoding: 'base64' }]);
  log(`pos ${p} pda=${pdas[p]} account=${ai?.value === null ? 'null (closed)' : 'EXISTS lamports=' + ai?.value?.lamports}`);
  const hs = await sol('getSignaturesForAddress', [pdas[p], { limit: 10 }]);
  for (const h of (hs || []).reverse()) {
    const t = await sol('getTransaction', [h.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
    const ins = (t?.meta?.logMessages || []).filter((l) => l.includes('Instruction:')).map((l) => l.replace('Program log: Instruction: ', '')).join('+');
    log(`  ${h.signature.slice(0, 16)}… slot=${h.slot} err=${JSON.stringify(h.err)} ${ins} :: ${t ? tokDelta(t) : ''}`);
  }
}
fs.writeFileSync(`${clone}/vlogs/g7-chain.log`, out.join('\n') + '\n');
