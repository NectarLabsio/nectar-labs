const NEAR='https://test.rpc.fastnear.com';
const rpc=async(m,p)=>(await (await fetch(NEAR,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})})).json());
for (const [h, senders] of [['HvFX6YRaY64YWss7KBQSpucM1vnVUtHFraQvqjGs6Q1V',['agent1.nectar.testnet','borrower1.nectar.testnet','nectar.testnet']],['BemztvL9jzTCm5wzbA8tD7Kj3q7qKEe9fJTLA8Zsn35G',['x402-relayer.nectar.testnet']]]) {
  let j; for (const s of senders) { j = await rpc('EXPERIMENTAL_tx_status',{tx_hash:h,sender_account_id:s,wait_until:'NONE'}); if (j.result) break; }
  if (!j.result) { console.log(h, 'NO RESULT', JSON.stringify(j.error).slice(0,200)); continue; }
  const t=j.result.transaction;
  console.log(`tx ${h} signer=${t.signer_id} receiver=${t.receiver_id} final=${Object.keys(j.result.status)[0]} failed_receipts=${j.result.receipts_outcome.filter(r=>r.outcome.status.Failure).length}`);
  for (const a of t.actions) {
    if (a.FunctionCall) console.log(`  FunctionCall ${a.FunctionCall.method_name} args=${Buffer.from(a.FunctionCall.args,'base64').toString().slice(0,300)} deposit=${a.FunctionCall.deposit}`);
    else if (a.Delegate) { const d=a.Delegate.delegate_action; console.log(`  Delegate sender=${d.sender_id} receiver=${d.receiver_id} nonce=${d.nonce} max_block_height=${d.max_block_height}`); for (const x of d.actions) if (x.FunctionCall) console.log(`    inner FunctionCall ${x.FunctionCall.method_name} args=${Buffer.from(x.FunctionCall.args,'base64').toString()} deposit=${x.FunctionCall.deposit}`); }
    else console.log('  action', JSON.stringify(a).slice(0,200));
  }
  for (const r of j.result.receipts_outcome) { const st=Object.keys(r.outcome.status)[0]; console.log(`  receipt executor=${r.outcome.executor_id} status=${st}${r.outcome.logs.length? ' logs: '+r.outcome.logs.map(l=>l.slice(0,260)).join(' ;; '):''}`); }
}
