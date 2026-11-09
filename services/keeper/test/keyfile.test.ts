import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { ConfigError, expandHome, loadConfig } from '../src/config.ts';
import { KeyFileError, loadKeeperKey } from '../src/keyfile.ts';

const dir = mkdtempSync(join(tmpdir(), 'keeper-key-'));
after(() => rmSync(dir, { recursive: true, force: true }));
// Not a real key: syntactically shaped placeholder, never used to sign.
const FAKE = { account_id: 'keeper.example.testnet', public_key: 'ed25519:PUBLIC', private_key: 'ed25519:NOT_A_REAL_KEY' };

function write(name: string, body: string, mode: number): string {
  const p = join(dir, name);
  writeFileSync(p, body);
  chmodSync(p, mode);
  return p;
}

describe('key file', () => {
  it('loads a 0600 near-cli credentials file', () => {
    const k = loadKeeperKey(write('ok.json', JSON.stringify(FAKE), 0o600), 'keeper.example.testnet');
    assert.equal(k.accountId, 'keeper.example.testnet');
    assert.equal(k.publicKey, 'ed25519:PUBLIC');
    assert.ok(k.secretKey.startsWith('ed25519:'));
  });
  it('refuses group/world-readable files', { skip: process.platform === 'win32' }, () => {
    assert.throws(() => loadKeeperKey(write('open.json', JSON.stringify(FAKE), 0o644)), KeyFileError);
  });
  it('refuses missing, non-JSON, keyless and wrong-account files without echoing contents', () => {
    assert.throws(() => loadKeeperKey(join(dir, 'nope.json')), KeyFileError);
    assert.throws(() => loadKeeperKey(write('bad.json', 'not json', 0o600)), (e: unknown) => e instanceof KeyFileError && !e.message.includes('not json'));
    assert.throws(() => loadKeeperKey(write('nokey.json', '{"account_id":"a"}', 0o600)), KeyFileError);
    assert.throws(() => loadKeeperKey(write('other.json', JSON.stringify(FAKE), 0o600), 'someone.testnet'), KeyFileError);
  });
});

describe('config', () => {
  it('treats TODO-G2 ids as unset', () => {
    assert.throws(() => loadConfig({ CORE_ACCOUNT_ID: 'TODO-G2', KEEPER_ACCOUNT_ID: 'k', KEEPER_KEY_PATH: '/x' }), ConfigError);
  });
  it('parses ids, defaults and the key path', () => {
    const c = loadConfig({ CORE_ACCOUNT_ID: 'core.t', KEEPER_ACCOUNT_ID: 'k.t', KEEPER_KEY_PATH: '~/.nectar/keys/k.json', KEEPER_POLL_MS: '5000' });
    assert.equal(c.pollMs, 5000);
    assert.equal(c.keyPath, expandHome('~/.nectar/keys/k.json'));
    assert.equal(c.healthHost, '127.0.0.1');
    assert.throws(() => loadConfig({ CORE_ACCOUNT_ID: 'c', KEEPER_ACCOUNT_ID: 'k', KEEPER_KEY_PATH: '/x', KEEPER_GAS_TGAS: '301' }));
  });
});
