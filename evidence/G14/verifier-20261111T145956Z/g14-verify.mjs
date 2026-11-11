// Read-only chain check of the verifier-run x402 demo txs (EXPERIMENTAL_tx_status on fastnear, D-025).
// Usage: node g14-verify.mjs <borrowTx> <relayTx>
const NEAR = 'https://test.rpc.fastnear.com';
const rpc = async (m, p) => (await (await fetch(NEAR, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json());
const [borrow, relay] = process.argv.slice(2);
for (const [h, sender] of [[borrow, 'agent1.nectar.testnet'], [relay, 'x402-relayer.nectar.testnet']]) {
  const j = await rpc('EXPERIMENTAL_tx_status', { tx_hash: h, sender_account_id: sender, wait_until: 'FINAL' });
  if (!j.result) { console.log(h, 'NO RESULT', JSON.stringify(j.error).slice(0, 200)); continue; }
  const t = j.result.transaction;
  const failed = j.result.receipts_outcome.filter((r) => r.outcome.status.Failure);
  const burnt = j.result.receipts_outcome.reduce((a, r) => a + BigInt(r.outcome.gas_burnt), BigInt(j.result.transaction_outcome.outcome.gas_burnt));
  console.log(`tx ${h} signer=${t.signer_id} pk=${t.public_key} receiver=${t.receiver_id} final=${Object.keys(j.result.status)[0]} final_execution_status=${j.result.final_execution_status} receipts=${j.result.receipts_outcome.length} failed_receipts=${failed.length} gas_burnt_total=${(Number(burnt) / 1e12).toFixed(2)}T`);
  for (const a of t.actions) {
    if (a.FunctionCall) console.log(`  FunctionCall ${a.FunctionCall.method_name} args=${Buffer.from(a.FunctionCall.args, 'base64').toString().slice(0, 300)} deposit=${a.FunctionCall.deposit}`);
    else if (a.Delegate) {
      const d = a.Delegate.delegate_action;
      console.log(`  Delegate sender=${d.sender_id} receiver=${d.receiver_id} delegate_pk=${d.public_key} nonce=${d.nonce} max_block_height=${d.max_block_height}`);
      for (const x of d.actions) if (x.FunctionCall) console.log(`    inner FunctionCall ${x.FunctionCall.method_name} args=${Buffer.from(x.FunctionCall.args, 'base64').toString()} deposit=${x.FunctionCall.deposit}`);
    } else console.log('  action', JSON.stringify(a).slice(0, 200));
  }
  for (const r of j.result.receipts_outcome) {
    const st = Object.keys(r.outcome.status)[0];
    console.log(`  receipt ${r.id.slice(0, 8)}… executor=${r.outcome.executor_id} status=${st}${r.outcome.logs.length ? ' logs: ' + r.outcome.logs.map((l) => l.slice(0, 300)).join(' ;; ') : ''}`);
  }
}
// Key scope (F-328): list access keys of agent1 + x402-relayer (public keys + permission only).
for (const acct of ['agent1.nectar.testnet', 'x402-relayer.nectar.testnet']) {
  const j = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: acct });
  console.log(`keys ${acct}: ${(j.result?.keys ?? []).map((k) => `${k.public_key} ${typeof k.access_key.permission === 'string' ? k.access_key.permission : 'FunctionCall'}`).join(' | ')}`);
}
