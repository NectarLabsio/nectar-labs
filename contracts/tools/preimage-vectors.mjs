#!/usr/bin/env node
// WO-15: writes contracts/nectar-core/tests/preimage_vectors.json (golden vectors for the settlement preimage,
// interface-p2.md / D-016). Built here independently of the Rust builder; consumed by nectar-core unit tests,
// later by the Solana program tests (WO-14) and the keeper (WO-16). Each vector carries the raw-preimage
// Ed25519 signature by the public test key (seed 0x07 x 32, same as contracts/test-stubs signer stub).
// Usage: node contracts/tools/preimage-vectors.mjs   (deterministic; re-run = identical file)
import { ed25519 } from '@noble/curves/ed25519.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { base58encode, hex } from './b58.mjs';

const SEED = new Uint8Array(32).fill(7);
const pub = ed25519.getPublicKey(SEED);

const preimage = (v) =>
  `NECTAR_SETTLE_V1|chain=${v.chain_id}|program=${v.vault_program}|pos=${v.position_id}|quote=${v.quote_id}` +
  `|repay_e6=${v.repay_e6}|seize_units=${v.seize_units}|recipient=${v.recipient}|nonce=${v.nonce}|expires=${v.expires}`;

const PROGRAM = 'Nectar1Vau1t11111111111111111111111111111111'.slice(0, 44);
const cases = [
  { name: 'demo_leg', chain_id: 'solana-devnet', vault_program: PROGRAM, position_id: '0', quote_id: '0',
    repay_e6: '10000000000', seize_units: '57544379', recipient: '3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV',
    nonce: '0', expires: '1700003600' },
  { name: 'second_nonce', chain_id: 'solana-devnet', vault_program: PROGRAM, position_id: '7', quote_id: '12',
    repay_e6: '1250000000', seize_units: '9058', recipient: '11111111111111111111111111111111',
    nonce: '1', expires: '1762819200' },
  { name: 'max_values', chain_id: 'solana-devnet', vault_program: PROGRAM, position_id: '18446744073709551615',
    quote_id: '18446744073709551615', repay_e6: '340282366920938463463374607431768211455',
    seize_units: '340282366920938463463374607431768211455',
    recipient: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', nonce: '18446744073709551615',
    expires: '18446744073709551615' },
];

const vectors = cases.map((v) => {
  const p = preimage(v);
  const bytes = new TextEncoder().encode(p);
  return { ...v, preimage: p, preimage_hex: hex(bytes), preimage_len: bytes.length,
           signature_hex: hex(ed25519.sign(bytes, SEED)) };
});

const out = {
  generator: 'contracts/tools/preimage-vectors.mjs (@noble/curves 2.4.0)',
  format: 'NECTAR_SETTLE_V1|chain=|program=|pos=|quote=|repay_e6=|seize_units=|recipient=|nonce=|expires= (interface-p2.md, D-016: signed raw, no pre-hash)',
  test_key_seed_hex: hex(SEED),
  test_public_key_hex: hex(pub),
  test_public_key_base58: base58encode(pub),
  vectors,
};
const path = fileURLToPath(new URL('../nectar-core/tests/preimage_vectors.json', import.meta.url));
writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${vectors.length} vectors to ${path}; test key ${out.test_public_key_base58}`);
