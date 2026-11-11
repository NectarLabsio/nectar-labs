// Read-only: ft_balance_of for agent1 / nectar.testnet on usdc-mock + nvdax-mock via fastnear RPC.
const RPC = 'https://test.rpc.fastnear.com';
async function view(contract, method, args) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') } }) });
  const j = await r.json();
  if (j.error || j.result?.error) return { error: JSON.stringify(j.error ?? j.result.error).slice(0, 200) };
  return { block: j.result.block_height, value: JSON.parse(Buffer.from(j.result.result).toString()) };
}
const label = process.argv[2] ?? 'snapshot';
const out = { label, at: new Date().toISOString() };
for (const [tok, acct] of [['usdc-mock.nectar.testnet', 'agent1.nectar.testnet'], ['usdc-mock.nectar.testnet', 'nectar.testnet'], ['nvdax-mock.nectar.testnet', 'agent1.nectar.testnet']]) {
  const v = await view(tok, 'ft_balance_of', { account_id: acct });
  out[`${tok.split('.')[0]}:${acct.split('.')[0]}`] = v.value ?? v.error;
  out.block = v.block ?? out.block;
}
console.log(JSON.stringify(out));
