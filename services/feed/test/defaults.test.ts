// WO-11d: zero-config defaults from packages/config/config.yaml, and a clean MCP stdio stream.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { flattenYaml, loadRepoIds } from '../src/repo-config.ts';

// Expected ids come from the same config.yaml the loader reads (D-018: v1 -> v2 is a config change), never a literal.
const CFG = flattenYaml(readFileSync(fileURLToPath(new URL('../../../packages/config/config.yaml', import.meta.url)), 'utf8'));
const CORE = CFG.get('accounts.core');

describe('repo config defaults', () => {
  it('flattens nested scalars and strips comments', () => {
    const m = flattenYaml('accounts:\n  core: a.testnet # a\n  demo:\n    b: x\ncollateral:\n  nvdax:\n    token: n.testnet\n');
    assert.equal(m.get('accounts.core'), 'a.testnet');
    assert.equal(m.get('accounts.demo.b'), 'x');
    assert.equal(m.get('collateral.nvdax.token'), 'n.testnet');
  });
  it('reads config.yaml with no env; env overrides; TODO-* is unset', () => {
    const ids = loadRepoIds({});
    assert.match(CORE ?? '', /^[a-z0-9-]+(\.[a-z0-9-]+)*\.testnet$/);
    assert.equal(ids.core, CORE);
    assert.equal(ids.usdcMock, 'usdc-mock.nectar.testnet');
    assert.equal(ids.nvdaxMock, 'nvdax-mock.nectar.testnet');
    assert.equal(ids.nvdaxToken, 'nvdax-mock.nectar.testnet');
    assert.equal(loadRepoIds({ CORE_ACCOUNT_ID: 'other.testnet' }).core, 'other.testnet');
    assert.equal(loadRepoIds({ CORE_ACCOUNT_ID: 'TODO-G2' }).core, CORE);
    assert.equal(loadRepoIds({ NECTAR_CONFIG_PATH: '/nonexistent/config.yaml' }).core, null);
  });
});

describe('MCP stdio', () => {
  it('writes only JSON-RPC to stdout (first byte is "{")', async () => {
    const entry = fileURLToPath(new URL('../src/mcp-stdio.ts', import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), 'feed-mcp-'));
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', entry], {
      env: { ...process.env, FEED_DB_PATH: join(dir, 'feed.sqlite'), NECTAR_CONFIG_PATH: '/nonexistent/config.yaml' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
    child.stdin.write(JSON.stringify(init) + '\n');
    const first = await new Promise<string>((res, rej) => {
      const t = setTimeout(() => rej(new Error('no stdout within 10 s')), 10_000);
      child.stdout.once('data', (b: Buffer) => { clearTimeout(t); res(b.toString('utf8')); });
    });
    child.kill();
    assert.equal(first[0], '{');
    assert.equal((JSON.parse(first.split('\n')[0] ?? '') as { id: number }).id, 1);
  });
});
