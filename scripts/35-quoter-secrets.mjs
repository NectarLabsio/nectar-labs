#!/usr/bin/env node
// P1: store the demo market-maker secrets for the quoter in OutLayer without `outlayer login` (FACTS F-167, D-014).
//   node scripts/35-quoter-secrets.mjs --quote <id>:<q_bps>:<gamma_bps> [--quote ...] [--profile mm-demo] [--dry-run]
// Steps: (1) POST testnet-api /secrets/pubkey → X25519 pubkey; (2) ECIES (X25519 → HKDF-SHA256 info "outlayer-keystore-v1", no salt
// → ChaCha20-Poly1305, 12-byte nonce), blob 0x01‖eph_pub‖nonce‖ct+tag, base64; (3) near-cli `store_secrets` on outlayer.testnet signed
// by the owner (owner = predecessor = secrets_ref.account_id), 50 Tgas, 0.1 NEAR (CLI default; refund rules per F-167).
// DISCLOSURE: these are demo values, not a real market maker's book. F-167 notes the pubkey request itself carries the plaintext
// secrets_json to the OutLayer coordinator, so only demo values are ever sent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, diffieHellman, createPublicKey, hkdfSync, randomBytes, createCipheriv } from 'node:crypto';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = parse(readFileSync(join(root, 'packages/config/config.yaml'), 'utf8'));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const quotes = args.flatMap((a, i) => (a === '--quote' ? [args[i + 1]] : []));
const dryRun = args.includes('--dry-run');
const profile = opt('--profile', 'mm-demo');
const owner = cfg.accounts.owner;
const projectId = cfg.outlayer.project_id;
const outlayer = cfg.outlayer.account;
const api = process.env.OUTLAYER_API ?? 'https://testnet-api.outlayer.ai';
// Who may open the secrets (OutLayer source, keystore-worker/src/types.rs + contract AccessConditionV1; FACTS row pending):
// plain Whitelist leaves are judged on the transaction SIGNER (the keeper, whose key signs trigger_preliquidation); Predecessor{…}
// re-judges on the calling contract; WasmHash pins the executed code. Default: keeper-signed AND relayed by nectar-core AND our wasm.
// (G4 run C, request 15145, was denied with Whitelist[core, owner] — the signer is the keeper.) Override with SECRETS_ACCESS_JSON.
const access = process.env.SECRETS_ACCESS_JSON ? JSON.parse(process.env.SECRETS_ACCESS_JSON) : { Logic: { operator: 'And', conditions: [
  { Whitelist: { accounts: [cfg.accounts.keeper] } },
  { Predecessor: { condition: { Whitelist: { accounts: [cfg.accounts.core] } } } },
  { WasmHash: { hash: cfg.outlayer.version_key } },
] } };

if (!quotes.length || String(projectId).startsWith('TODO')) {
  console.error('usage: --quote <id>:<q_bps>:<gamma_bps> (repeat); requires outlayer.project_id in config.yaml'); process.exit(2);
}
const secrets = {};
for (const q of quotes) {
  const [id, qb, gb] = q.split(':');
  for (const [k, v] of [['Q_BPS', qb], ['GAMMA_BPS', gb]]) {
    if (!/^\d+$/.test(v ?? '') || Number(v) > 10000) { console.error(`bad ${k} in ${q}`); process.exit(2); }
    secrets[`MM_${id}_${k}`] = v;
  }
}
const secretsJson = JSON.stringify(secrets);
console.log(`profile=${profile} owner=${owner} project=${projectId} keys=${Object.keys(secrets).join(',')}`);

const res = await fetch(`${api}/secrets/pubkey`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessor: { type: 'Project', project_id: projectId }, owner, profile, secrets_json: secretsJson }),
});
if (!res.ok) { console.error(`pubkey request failed: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
const { pubkey } = await res.json();
if (!/^[0-9a-f]{64}$/i.test(pubkey ?? '')) { console.error('unexpected pubkey format'); process.exit(1); }

const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex');
const server = createPublicKey({ key: Buffer.concat([SPKI_X25519, Buffer.from(pubkey, 'hex')]), format: 'der', type: 'spki' });
const eph = generateKeyPairSync('x25519');
const ephPub = eph.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: server });
const key = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('outlayer-keystore-v1'), 32));
const nonce = randomBytes(12);
const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
const ct = Buffer.concat([c.update(secretsJson, 'utf8'), c.final(), c.getAuthTag()]);
const blob = Buffer.concat([Buffer.from([1]), ephPub, nonce, ct]).toString('base64');

const storeArgs = JSON.stringify({ accessor: { Project: { project_id: projectId } }, profile, encrypted_secrets_base64: blob, access, vault_id: null });
if (dryRun) { console.log(`dry-run: store_secrets args ${storeArgs.length} bytes; not sent`); process.exit(0); }
execFileSync('near', ['contract', 'call-function', 'as-transaction', outlayer, 'store_secrets', 'json-args', storeArgs,
  'prepaid-gas', '50 Tgas', 'attached-deposit', '0.1 NEAR', 'sign-as', owner, 'network-config', 'testnet', 'sign-with-keychain', 'send'],
  { stdio: ['ignore', 'inherit', 'inherit'] });
console.log(`stored. next: set_quoter_secrets_ref {"profile":"${profile}","account_id":"${owner}"} on ${cfg.accounts.core} (WO-10b)`);
