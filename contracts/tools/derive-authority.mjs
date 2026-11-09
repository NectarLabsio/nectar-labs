#!/usr/bin/env node
// WO-15: off-chain Ed25519 child key of the MPC signer (F-036) = the Solana vault authority (D-016).
//   tweak  = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:" + predecessor + "," + path)
//   scalar = tweak read little-endian mod L;  child = root + G * scalar
// Root = v1.signer-prod.testnet public_key({domain_id:1}) (F-036). On-chain check: view derived_public_key.
// Usage: node contracts/tools/derive-authority.mjs [path ...] [--predecessor <account>] [--check]
//   --check asserts path "solana-1" reproduces the F-036 live value and exits non-zero otherwise.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha3_256 } from '@noble/hashes/sha3.js';
import { base58decode, base58encode } from './b58.mjs';

const ROOT = '6vSEtQxrQj6txUMh33WC4ERyCWmNMRTdufDWAaDY3Un2'; // F-036, domain 1, testnet
const F036_LIVE = { path: 'solana-1', key: 'ed25519:3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV' };

export function deriveEd25519(predecessor, path, root = ROOT) {
  const t = sha3_256(new TextEncoder().encode(`near-mpc-recovery v0.1.0 epsilon derivation:${predecessor},${path}`));
  let s = 0n;
  for (let i = 31; i >= 0; i--) s = (s << 8n) | BigInt(t[i]);
  s %= ed25519.Point.Fn.ORDER;
  const child = ed25519.Point.fromBytes(base58decode(root, 32)).add(ed25519.Point.BASE.multiply(s));
  return 'ed25519:' + base58encode(child.toBytes());
}

const args = process.argv.slice(2);
let predecessor = 'nectar-core.nectar.testnet';
const paths = [];
let check = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--predecessor') predecessor = args[++i];
  else if (args[i] === '--check') check = true;
  else paths.push(args[i]);
}
if (paths.length === 0) paths.push(F036_LIVE.path, 'solana-devnet-v1');
for (const p of paths) {
  const k = deriveEd25519(predecessor, p);
  console.log(JSON.stringify({ predecessor, path: p, domain_id: 1, public_key: k, solana_address: k.slice(8) }));
}
if (check) {
  const got = deriveEd25519('nectar-core.nectar.testnet', F036_LIVE.path);
  if (got !== F036_LIVE.key) {
    console.error(`F-036 check FAILED: ${got} != ${F036_LIVE.key}`);
    process.exit(1);
  }
  console.error('F-036 check ok (solana-1 matches the live derived_public_key view)');
}
