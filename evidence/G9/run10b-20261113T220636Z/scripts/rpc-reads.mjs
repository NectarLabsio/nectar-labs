// G9 run 10b: read-only RPC reads, >= 2.5 s apart, rpc.testnet.near.org. No keys, no transactions.
const RPC = 'https://rpc.testnet.near.org';
const CORE = 'nectar-core-v2.nectar.testnet';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return r.json();
}
async function view(name, args = {}, blockId) {
  const p = { request_type: 'call_function', account_id: CORE, method_name: name, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') };
  if (blockId) p.block_id = blockId; else p.finality = 'final';
  const j = await rpc('query', p);
  if (j.error || j.result?.error) return { error: j.error ?? j.result.error };
  return { block_height: j.result.block_height, value: JSON.parse(Buffer.from(j.result.result).toString()) };
}
const iso = (ns) => new Date(Number(BigInt(ns) / 1000000n)).toISOString();
const out = { at: new Date().toISOString() };
const latest = await rpc('block', { finality: 'final' });
out.latest_final = latest.error ? { error: latest.error } : { height: latest.result.header.height, ts: iso(latest.result.header.timestamp_nanosec) };
await sleep(2500);
const b = await rpc('block', { block_id: 277568411 });
out.block_277568411 = b.error ? { error: b.error } : { ts: iso(b.result.header.timestamp_nanosec) };
await sleep(2500);
const cfg = await view('get_config');
out.get_config_final = cfg.error ? cfg : { block_height: cfg.block_height, max_age_ns_session: cfg.value.max_age_ns_session, max_age_ns_closed: cfg.value.max_age_ns_closed, keys: Object.keys(cfg.value) };
await sleep(2500);
const cfgAt = await view('get_config', {}, 277568411);
out.get_config_at_277568411 = cfgAt.error ? cfgAt : { max_age_ns_session: cfgAt.value.max_age_ns_session, max_age_ns_closed: cfgAt.value.max_age_ns_closed };
await sleep(2500);
out.get_health_22 = await view('get_health', { position_id: 22 });
console.log(JSON.stringify(out, null, 2));
