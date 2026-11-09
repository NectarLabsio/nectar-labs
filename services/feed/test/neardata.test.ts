// Neardata source against a real captured testnet block (no network in tests). The fixture is the
// unmodified GET /v0/block/276971305 body except `shards[].state_changes`, emptied (unused; its storage
// `key_base64` values trip gitleaks generic-api-key).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FeedDb } from '../src/db.ts';
import { Indexer } from '../src/indexer.ts';
import { createLogger } from '../src/log.ts';
import { CURSOR_KEY, NeardataSource, blockHeight, extractContractLogs, type BlockFetcher } from '../src/neardata.ts';

const here = dirname(fileURLToPath(import.meta.url));
const BLOCK: unknown = JSON.parse(readFileSync(resolve(here, 'fixtures/neardata-block-276971305.json'), 'utf8'));
const H = 276971305;
const CORE = 'nectar-core.nectar.testnet';
const quiet = createLogger('feed', () => {});

class FakeFetcher implements BlockFetcher {
  final = H;
  calls: number[] = [];
  blocks = new Map<number, unknown>([[H, BLOCK]]);
  fail = false;
  async lastFinalHeight(): Promise<number> {
    if (this.fail) throw new Error('neardata down');
    return this.final;
  }
  async block(h: number): Promise<unknown> {
    this.calls.push(h);
    return this.blocks.get(h) ?? null;
  }
}

describe('neardata block shape (captured fixture)', () => {
  it('reads the height and extracts only nectar-core receipts', () => {
    assert.equal(blockHeight(BLOCK), H);
    const batches = extractContractLogs(BLOCK, CORE);
    assert.equal(batches.length, 1);
    assert.deepEqual(
      { ...batches[0], logs: batches[0]?.logs.length },
      { receiptId: 'B26QJVXkyUwj45S4YT8qqw4tY5BoBqZLMxFH3B8Y1rE7', txHash: 'Hqv3k254hR2yf4uQViU816XUbVkrFHowjn6YdTpFUkYr', blockHeight: H, logs: 1 },
    );
    assert.match(batches[0]?.logs[0] ?? '', /"event":"liquidity_supplied"/);
    assert.equal(extractContractLogs(BLOCK, 'someone-else.testnet').length, 0);
    assert.deepEqual(extractContractLogs(null, CORE), []);
  });
  it('skips failed receipts', () => {
    const b = structuredClone(BLOCK) as { shards: Array<{ receipt_execution_outcomes: Array<{ execution_outcome: { outcome: { executor_id: string; status: unknown } } }> }> };
    for (const s of b.shards) for (const o of s.receipt_execution_outcomes) if (o.execution_outcome.outcome.executor_id === CORE) o.execution_outcome.outcome.status = { Failure: { ActionError: {} } };
    assert.equal(extractContractLogs(b, CORE).length, 0);
  });
});

describe('NeardataSource', () => {
  it('ingests the event, advances the cursor, and is idempotent on replay', async () => {
    const db = new FeedDb(':memory:');
    const f = new FakeFetcher();
    const src = new NeardataSource(f, { contractId: CORE, startHeight: H - 2, maxBlocksPerPoll: 100 }, quiet);
    await src.poll(db, 1);
    assert.deepEqual(f.calls, [H - 2, H - 1, H]); // nulls (skipped heights) are tolerated
    assert.equal(db.eventCount(), 1);
    assert.equal(db.meta(CURSOR_KEY), String(H));
    assert.equal(db.meta('last_block'), String(H));
    // Restart: new source instance resumes from the stored cursor, fetches nothing new.
    f.calls = [];
    await new NeardataSource(f, { contractId: CORE, startHeight: 1, maxBlocksPerPoll: 100 }, quiet).poll(db, 2);
    assert.deepEqual(f.calls, []);
    // Crash between ingest and cursor write → replay of the same block adds nothing.
    db.setMeta(CURSOR_KEY, String(H - 1));
    await src.poll(db, 3);
    assert.equal(db.eventCount(), 1);
    db.close();
  });
  it('starts at the final block without a cursor or start height, and caps blocks per poll', async () => {
    const db = new FeedDb(':memory:');
    const f = new FakeFetcher();
    f.final = H + 10;
    await new NeardataSource(f, { contractId: CORE, startHeight: null, maxBlocksPerPoll: 3 }, quiet).poll(db, 1);
    assert.deepEqual(f.calls, [H + 10]);
    f.calls = [];
    db.setMeta(CURSOR_KEY, String(H - 1));
    await new NeardataSource(f, { contractId: CORE, startHeight: null, maxBlocksPerPoll: 3 }, quiet).poll(db, 2);
    assert.deepEqual(f.calls, [H, H + 1, H + 2]);
    assert.equal(db.meta(CURSOR_KEY), String(H + 2));
    db.close();
  });
  it('rejects a block whose height does not match the request', async () => {
    const db = new FeedDb(':memory:');
    const f = new FakeFetcher();
    f.final = H + 1;
    f.blocks.set(H + 1, BLOCK);
    db.setMeta(CURSOR_KEY, String(H));
    await assert.rejects(new NeardataSource(f, { contractId: CORE, startHeight: null, maxBlocksPerPoll: 10 }, quiet).poll(db, 1), /answered height/);
    assert.equal(db.meta(CURSOR_KEY), String(H));
    db.close();
  });
  it('a Neardata outage is a poll error with backoff, not a crash', async () => {
    const db = new FeedDb(':memory:');
    const f = new FakeFetcher();
    f.fail = true;
    const ix = new Indexer(db, [new NeardataSource(f, { contractId: CORE, startHeight: null, maxBlocksPerPoll: 10 }, quiet)], quiet, 1000);
    assert.equal(await ix.pollOnce(), false);
    assert.ok(ix.nextDelayMs() > 1000);
    assert.match(db.meta('last_error') ?? '', /neardata: neardata down/);
    db.close();
  });
});
