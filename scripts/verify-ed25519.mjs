#!/usr/bin/env node
// Verify an MPC Ed25519 settlement signature off-chain (G7). Usage: node scripts/verify-ed25519.mjs <ed25519:base58 pubkey> '<pending json>'
// pending = nectar-core get_pending_settlement view: {preimage, signature_hex, ...}. The message is the raw ASCII preimage (D-016).
import { createPublicKey, verify } from 'node:crypto';
const [pubArg, pendingArg] = process.argv.slice(2);
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (s) => { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex; let out = Buffer.from(hex, 'hex');
  const lead = s.match(/^1*/)[0].length; return Buffer.concat([Buffer.alloc(lead), out]); };
const raw = b58(pubArg.replace(/^ed25519:/, ''));
if (raw.length !== 32) { console.error(`pubkey length ${raw.length} != 32`); process.exit(2); }
const pending = JSON.parse(pendingArg);
if (!pending?.signature_hex) { console.error('no signature yet (pending.signature_hex is null)'); process.exit(1); }
const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
const ok = verify(null, Buffer.from(pending.preimage, 'utf8'), key, Buffer.from(pending.signature_hex, 'hex'));
console.log(JSON.stringify({ authority: pubArg, preimage: pending.preimage, signature_valid: ok }));
process.exit(ok ? 0 : 1);
