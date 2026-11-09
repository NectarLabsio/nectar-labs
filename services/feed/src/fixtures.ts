// FEED_FIXTURES=1: serve /api/oneclick from recorded live dry quotes (test/fixtures, written by
// `pnpm --filter feed record:oneclick`). The recorded responses go through the same sampler path as live
// data, so signatures are re-verified offline with the SDK and impact is recomputed from base units.
// No network: the fetcher only replays files. `as_of` is the recording time, not "now".

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OneClickQuoteResponse } from '@defuse-protocol/one-click-sdk-typescript';
import type { FeedDb } from './db.ts';
import type { Logger } from './log.ts';
import { OneClickClient, OneClickSampler, defaultSamplerConfig, fixtureFetcher, type OneClickToken, type TickResult } from './oneclick.ts';

export const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../test/fixtures');

export interface ImpactFixture {
  recorded_at: string;
  notional_usd: string;
  ref_pair: string;
  quotes: OneClickQuoteResponse[];
}

export async function seedOneClickFromFixtures(db: FeedDb, log: Logger, dir: string = FIXTURE_DIR): Promise<TickResult> {
  const tokens = JSON.parse(readFileSync(resolve(dir, 'oneclick-tokens.json'), 'utf8')) as OneClickToken[];
  const fx = JSON.parse(readFileSync(resolve(dir, 'oneclick-impact.json'), 'utf8')) as ImpactFixture;
  const cfg = defaultSamplerConfig({ ONECLICK_NOTIONAL_USD: fx.notional_usd, ONECLICK_REF_PAIR: fx.ref_pair });
  const r = await new OneClickSampler(db, new OneClickClient(fixtureFetcher(tokens, fx.quotes)), cfg, log).tick(Date.parse(fx.recorded_at));
  log.info('oneclick_fixtures_loaded', { sets: r.sets.length, dropped: r.dropped, recorded_at: fx.recorded_at });
  return r;
}
