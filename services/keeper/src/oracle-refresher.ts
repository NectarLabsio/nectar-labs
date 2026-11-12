// Owner-price refresher (WO-63, H-ORACLE option A): keeps the P0 owner oracle on nectar-core-v2 fresh by re-asserting the
// CURRENT on-chain price with `update_owner_price` (owner-only, no deposit: contracts/nectar-core/src/lib.rs:1434). It never
// computes, fetches or changes a price: the value sent is the `oracle_price_usd_e6` string just read from `get_exit_capacity`.
//
// Key: ORACLE_REFRESHER_KEY_PATH, 0600 JSON {account_id, public_key, private_key}; account_id must be config `accounts.owner`.
// With ORACLE_REFRESHER_GENERATE=1 and no file there, a fresh ed25519 keypair is generated in place (parent dir 0700, file 0600)
// and only its public key is logged (`key_generated`); Kunal then adds it on the owner account as a function-call key. Before any
// refresh, every tick checks `view_access_key`: absent → `waiting_for_key`; anything but FunctionCall{receiver_id = config core,
// method_names = ["update_owner_price"]} (a FullAccess key is an owner key) → `key_refused`, skip, keep polling (no crash loop).
//
// Each tick (config `ops.oracle_refresher`): skip unless oracle_source is "Owner". In-session (session_open, or session_reason
// "stale_price", which the contract only reports inside a session window) → refresh once oracle_age_s ≥ session_max_age_s;
// otherwise once ≥ closed_max_age_s. Refresh = update_owner_price {symbol, price_usd_e6}, 0 deposit, 30 Tgas. Stops after
// run_until. RPC via near-rpc.ts (fallback list + per-endpoint backoff); tick errors back off exponentially and never exit.
// Non-zero exit only for key/config errors (main). JSON log lines carry decision, age, tx hash and the RPC host; never key material.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Account, KeyPair, KeyPairSigner, type Provider } from 'near-api-js';
import { backoffDelayMs } from './backoff.ts';
import { expandHome, isPlaceholder } from './config.ts';
import { KeyFileError, loadKeeperKey } from './keyfile.ts';
import { errMsg, type LogFields, type Logger } from './log.ts';
import { fallbackRpc, nearRpcUrls } from './near-rpc.ts';
import { flattenYaml } from './repo-config.ts';

export const REFRESH_METHOD = 'update_owner_price';
export const REFRESH_GAS = 30n * 10n ** 12n;
export const REFRESH_DEPOSIT = 0n;
const KEY_ENV = 'ORACLE_REFRESHER_KEY_PATH';
const DEFAULT_CONFIG_PATH = fileURLToPath(new URL('../../../packages/config/config.yaml', import.meta.url));

export class RefresherConfigError extends Error {}

export interface RefresherConfig {
  ownerAccountId: string;
  coreAccountId: string;
  symbol: string;
  tickMs: number;
  sessionMaxAgeS: number;
  closedMaxAgeS: number;
  runUntilMs: number;
  /** NEAR RPC endpoints in fallback order (near-rpc.ts nearRpcUrls). */
  rpcUrls: string[];
  keyPath: string;
  /** ORACLE_REFRESHER_GENERATE=1: create the key file when absent. */
  generate: boolean;
}

/** Reads config.yaml (`accounts.owner`, `accounts.core`, `collateral.nvdax.symbol`, `ops.oracle_refresher.*`) + the key env. */
export function loadRefresherConfig(env: NodeJS.ProcessEnv = process.env): RefresherConfig {
  const path = isPlaceholder(env.NECTAR_CONFIG_PATH) ? DEFAULT_CONFIG_PATH : (env.NECTAR_CONFIG_PATH as string);
  let flat: Map<string, string>;
  try {
    flat = flattenYaml(readFileSync(path, 'utf8'));
  } catch {
    throw new RefresherConfigError('config.yaml not readable (NECTAR_CONFIG_PATH or packages/config/config.yaml)');
  }
  const req = (k: string): string => {
    const v = flat.get(k);
    if (v === undefined || isPlaceholder(v) || v === 'null') throw new RefresherConfigError(`config.yaml ${k} is unset`);
    return v;
  };
  const int = (k: string, min: number, max: number): number => {
    const n = Number(req(k));
    if (!Number.isInteger(n) || n < min || n > max) throw new RefresherConfigError(`config.yaml ${k} must be an integer in [${min}, ${max}]`);
    return n;
  };
  const runUntilRaw = req('ops.oracle_refresher.run_until');
  const runUntilMs = Date.parse(runUntilRaw);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(runUntilRaw) || Number.isNaN(runUntilMs)) {
    throw new RefresherConfigError('config.yaml ops.oracle_refresher.run_until must be an ISO-8601 time with a zone');
  }
  if (isPlaceholder(env[KEY_ENV])) throw new RefresherConfigError(`${KEY_ENV} is unset`);
  const gen = (env.ORACLE_REFRESHER_GENERATE ?? '').trim();
  if (!['', '0', '1'].includes(gen)) throw new RefresherConfigError('ORACLE_REFRESHER_GENERATE must be 0 or 1');
  return {
    ownerAccountId: req('accounts.owner'),
    coreAccountId: req('accounts.core'),
    symbol: flat.get('collateral.nvdax.symbol') ?? 'NVDAx',
    tickMs: int('ops.oracle_refresher.tick_s', 5, 3_600) * 1_000,
    // The contract closes the session above 900 s (lib.rs:75); a larger threshold could never keep it open.
    sessionMaxAgeS: int('ops.oracle_refresher.session_max_age_s', 60, 899),
    // Borrows need a price under max_age_s_closed (86,400 s).
    closedMaxAgeS: int('ops.oracle_refresher.closed_max_age_s', 60, 86_399),
    runUntilMs,
    rpcUrls: nearRpcUrls(env),
    keyPath: expandHome(env[KEY_ENV] as string),
    generate: gen === '1',
  };
}

// ---------------------------------------------------------------- key file

export interface RefresherKey {
  accountId: string;
  /** Derived from the private key (and checked against the file's public_key). */
  publicKey: string;
  /** Handed straight to the signer; never logged. */
  secretKey: `ed25519:${string}`;
}

/** Generates the key file when absent (GENERATE=1 only), then loads it. Throws KeyFileError on any key problem. */
export function loadOrGenerateKey(cfg: Pick<RefresherConfig, 'keyPath' | 'generate' | 'ownerAccountId'>, log: Logger): RefresherKey {
  if (!existsSync(cfg.keyPath)) {
    if (!cfg.generate) throw new KeyFileError(`key file not found at ${KEY_ENV} (ORACLE_REFRESHER_GENERATE=1 creates one)`);
    const dir = dirname(cfg.keyPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    const kp = KeyPair.fromRandom('ed25519');
    const publicKey = kp.getPublicKey().toString();
    // `wx`: never overwrite a key that appeared meanwhile.
    writeFileSync(cfg.keyPath, JSON.stringify({ account_id: cfg.ownerAccountId, public_key: publicKey, private_key: kp.toString() }) + '\n', { mode: 0o600, flag: 'wx' });
    chmodSync(cfg.keyPath, 0o600);
    log.info('key_generated', { event: 'key_generated', public_key: publicKey });
  }
  const k = loadKeeperKey(cfg.keyPath, cfg.ownerAccountId, KEY_ENV, 'config accounts.owner');
  if (k.accountId === null) throw new KeyFileError(`key file has no account_id (must be config accounts.owner ${cfg.ownerAccountId})`);
  let derived: string;
  try {
    derived = KeyPair.fromString(k.secretKey).getPublicKey().toString();
  } catch {
    throw new KeyFileError('key file private_key is not a valid ed25519 key');
  }
  if (k.publicKey !== null && k.publicKey !== derived) throw new KeyFileError('key file public_key does not match its private_key');
  return { accountId: k.accountId, publicKey: derived, secretKey: k.secretKey };
}

// ---------------------------------------------------------------- chain views and decision

/** Shape of near-api-js AccessKeyView.permission. */
export type KeyPermission = 'FullAccess' | { FunctionCall: { allowance?: string | null; receiver_id: string; method_names: string[] } };

export type KeyState = { kind: 'ready'; allowance: string } | { kind: 'missing' } | { kind: 'refused'; reason: string };

/** Only FunctionCall{receiver_id = core, method_names = ["update_owner_price"]} may sign. A FullAccess key is an owner key. */
export function keyState(perm: KeyPermission | null, coreAccountId: string): KeyState {
  if (perm === null) return { kind: 'missing' };
  if (perm === 'FullAccess') return { kind: 'refused', reason: 'FullAccess key (owner key); add a function-call key limited to update_owner_price' };
  if (typeof perm !== 'object' || !('FunctionCall' in perm)) return { kind: 'refused', reason: 'unknown permission kind' };
  const fc = perm.FunctionCall;
  if (fc.receiver_id !== coreAccountId) return { kind: 'refused', reason: `receiver_id ${fc.receiver_id} != config core ${coreAccountId}` };
  if (fc.method_names.length !== 1 || fc.method_names[0] !== REFRESH_METHOD) {
    return { kind: 'refused', reason: `method_names ${JSON.stringify(fc.method_names)} != ["${REFRESH_METHOD}"]` };
  }
  return { kind: 'ready', allowance: fc.allowance === undefined || fc.allowance === null ? 'unlimited' : String(fc.allowance) };
}

export interface ExitCapacity {
  /** "Owner" | "Pyth" (the enum variant name). */
  oracleSource: string;
  sessionOpen: boolean;
  sessionReason: string;
  oracleAgeS: number;
  /** U128 decimal string exactly as returned; re-sent verbatim. */
  oraclePriceUsdE6: string;
}

export function parseExitCapacity(v: unknown): ExitCapacity {
  if (typeof v !== 'object' || v === null) throw new Error('get_exit_capacity returned no object');
  const o = v as Record<string, unknown>;
  const src = o.oracle_source;
  const oracleSource = typeof src === 'string' ? src : typeof src === 'object' && src !== null ? (Object.keys(src)[0] ?? 'unknown') : 'unknown';
  if (typeof o.session_open !== 'boolean') throw new Error('get_exit_capacity.session_open is not a bool');
  if (typeof o.session_reason !== 'string') throw new Error('get_exit_capacity.session_reason is not a string');
  const age = o.oracle_age_s;
  const ageS = typeof age === 'string' && /^\d+$/.test(age) ? Number(age) : typeof age === 'number' ? age : NaN;
  if (!Number.isSafeInteger(ageS) || ageS < 0) throw new Error('get_exit_capacity.oracle_age_s is not a U64');
  const price = o.oracle_price_usd_e6;
  if (typeof price !== 'string' || !/^(0|[1-9]\d*)$/.test(price)) throw new Error('get_exit_capacity.oracle_price_usd_e6 is not a U128 string');
  return { oracleSource, sessionOpen: o.session_open, sessionReason: o.session_reason, oracleAgeS: ageS, oraclePriceUsdE6: price };
}

export type Action = 'skip_not_owner' | 'skip_no_price' | 'fresh' | 'refresh';

export interface DecisionResult {
  action: Action;
  inSession: boolean;
  thresholdS: number;
}

export function decide(ec: ExitCapacity, cfg: Pick<RefresherConfig, 'sessionMaxAgeS' | 'closedMaxAgeS'>): DecisionResult {
  const inSession = ec.sessionOpen || ec.sessionReason === 'stale_price';
  const thresholdS = inSession ? cfg.sessionMaxAgeS : cfg.closedMaxAgeS;
  if (ec.oracleSource !== 'Owner') return { action: 'skip_not_owner', inSession, thresholdS };
  // update_owner_price panics on 0 and there is no current price to re-assert.
  if (ec.oraclePriceUsdE6 === '0') return { action: 'skip_no_price', inSession, thresholdS };
  return { action: ec.oracleAgeS >= thresholdS ? 'refresh' : 'fresh', inSession, thresholdS };
}

// ---------------------------------------------------------------- chain adapter

export interface RefreshTx {
  txHash: string;
  ok: boolean;
  failure: string | null;
  /** Decoded SuccessValue of the call (update_owner_price returns bool). */
  returned: unknown;
}

export interface RefresherChain {
  /** null = the access key does not exist (yet). */
  accessKey(accountId: string, publicKey: string): Promise<KeyPermission | null>;
  exitCapacity(symbol: string): Promise<unknown>;
  updateOwnerPrice(symbol: string, priceUsdE6: string): Promise<RefreshTx>;
  /** Host of the RPC endpoint that served the last call (logs). */
  rpc(): string | null;
}

/** The only transaction this service ever sends. */
export function refreshCall(coreAccountId: string, symbol: string, priceUsdE6: string): {
  contractId: string;
  methodName: typeof REFRESH_METHOD;
  args: { symbol: string; price_usd_e6: string };
  deposit: bigint;
  gas: bigint;
  waitUntil: 'EXECUTED_OPTIMISTIC';
} {
  return { contractId: coreAccountId, methodName: REFRESH_METHOD, args: { symbol, price_usd_e6: priceUsdE6 }, deposit: REFRESH_DEPOSIT, gas: REFRESH_GAS, waitUntil: 'EXECUTED_OPTIMISTIC' };
}

type ViewProvider = Pick<Provider, 'callFunctionRaw' | 'viewAccessKey'>;
type Caller = Pick<Account, 'callFunctionRaw'>;

function decodeSuccess(status: unknown): unknown {
  if (typeof status !== 'object' || status === null || !('SuccessValue' in status)) return undefined;
  const b64 = (status as { SuccessValue: unknown }).SuccessValue;
  if (typeof b64 !== 'string' || b64 === '') return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** near-api-js 7.4.0 adapter (same calls as chain.ts, F-012). */
export class NearRefresherChain implements RefresherChain {
  private readonly provider: ViewProvider;
  private readonly caller: Caller;
  private readonly coreAccountId: string;
  private readonly rpcHost: () => string | null;

  constructor(provider: ViewProvider, caller: Caller, coreAccountId: string, rpcHost: () => string | null = () => null) {
    this.provider = provider;
    this.caller = caller;
    this.coreAccountId = coreAccountId;
    this.rpcHost = rpcHost;
  }

  async accessKey(accountId: string, publicKey: string): Promise<KeyPermission | null> {
    try {
      const ak = await this.provider.viewAccessKey({ accountId, publicKey });
      return ak.permission as KeyPermission;
    } catch (e) {
      // near-api-js maps UNKNOWN_ACCESS_KEY to AccessKeyDoesNotExistError (not retried by near-rpc.ts).
      if (e instanceof Error && e.name === 'AccessKeyDoesNotExistError') return null;
      throw e;
    }
  }

  async exitCapacity(symbol: string): Promise<unknown> {
    const raw = await this.provider.callFunctionRaw({ contractId: this.coreAccountId, method: 'get_exit_capacity', args: { symbol }, blockQuery: { finality: 'final' } });
    const text = new TextDecoder().decode(new Uint8Array(raw.result));
    return text === '' ? null : (JSON.parse(text) as unknown);
  }

  async updateOwnerPrice(symbol: string, priceUsdE6: string): Promise<RefreshTx> {
    const res = await this.caller.callFunctionRaw(refreshCall(this.coreAccountId, symbol, priceUsdE6));
    const statuses: unknown[] = [res.status, ...res.receipts_outcome.map((r) => r.outcome.status)];
    const f = statuses.find((s) => typeof s === 'object' && s !== null && 'Failure' in s);
    return { txHash: res.transaction_outcome.id, ok: f === undefined, failure: f === undefined ? null : JSON.stringify(f), returned: decodeSuccess(res.status) };
  }

  rpc(): string | null {
    return this.rpcHost();
  }
}

// ---------------------------------------------------------------- loop

export type TickDecision = 'waiting_for_key' | 'key_refused' | Action | 'refreshed' | 'error';

export interface Clock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  random(): number;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const t = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
    }),
  random: Math.random,
};

export class OwnerPriceRefresher {
  private readonly cfg: RefresherConfig;
  private readonly key: Pick<RefresherKey, 'accountId' | 'publicKey'>;
  private readonly chain: RefresherChain;
  private readonly log: Logger;
  private readonly clock: Clock;
  consecutiveErrors = 0;

  constructor(cfg: RefresherConfig, key: Pick<RefresherKey, 'accountId' | 'publicKey'>, chain: RefresherChain, log: Logger, clock: Clock = realClock) {
    this.cfg = cfg;
    this.key = key;
    this.chain = chain;
    this.log = log;
    this.clock = clock;
  }

  private emit(level: 'info' | 'warn' | 'error', event: string, fields: LogFields): void {
    this.log[level](event, { event, ...fields, rpc: this.chain.rpc() });
  }

  /** One tick; never throws. */
  async tick(): Promise<TickDecision> {
    try {
      const ks = keyState(await this.chain.accessKey(this.key.accountId, this.key.publicKey), this.cfg.coreAccountId);
      if (ks.kind === 'missing') {
        this.consecutiveErrors = 0;
        this.emit('info', 'waiting_for_key', { account_id: this.key.accountId, public_key: this.key.publicKey });
        return 'waiting_for_key';
      }
      if (ks.kind === 'refused') {
        this.consecutiveErrors = 0;
        this.emit('warn', 'key_refused', { account_id: this.key.accountId, public_key: this.key.publicKey, reason: ks.reason });
        return 'key_refused';
      }
      const ec = parseExitCapacity(await this.chain.exitCapacity(this.cfg.symbol));
      const d = decide(ec, this.cfg);
      const base: LogFields = {
        decision: d.action,
        symbol: this.cfg.symbol,
        oracle_source: ec.oracleSource,
        age_s: ec.oracleAgeS,
        threshold_s: d.thresholdS,
        in_session: d.inSession,
        session_reason: ec.sessionReason,
        price_usd_e6: ec.oraclePriceUsdE6,
        allowance_yocto: ks.allowance,
      };
      if (d.action !== 'refresh') {
        this.consecutiveErrors = 0;
        this.emit('info', d.action, base);
        return d.action;
      }
      const tx = await this.chain.updateOwnerPrice(this.cfg.symbol, ec.oraclePriceUsdE6);
      if (!tx.ok) throw new Error(`update_owner_price failed in ${tx.txHash}: ${(tx.failure ?? '').slice(0, 300)}`);
      if (tx.returned !== true) throw new Error(`update_owner_price returned ${JSON.stringify(tx.returned) ?? 'nothing'} in ${tx.txHash} (oracle_rejected)`);
      this.consecutiveErrors = 0;
      this.emit('info', 'refreshed', { ...base, decision: 'refreshed', tx_hash: tx.txHash });
      return 'refreshed';
    } catch (e) {
      this.consecutiveErrors++;
      this.emit('error', 'tick_failed', { decision: 'error', error: errMsg(e).slice(0, 500), consecutive_errors: this.consecutiveErrors });
      return 'error';
    }
  }

  /** tick_s after a good tick; exponential (jittered, ≤ 5 min or tick_s) after consecutive errors. */
  nextDelayMs(): number {
    if (this.consecutiveErrors === 0) return this.cfg.tickMs;
    return backoffDelayMs(this.consecutiveErrors, { baseMs: this.cfg.tickMs, maxMs: Math.max(this.cfg.tickMs, 300_000), jitter: 0.5 }, this.clock.random);
  }

  done(): boolean {
    return this.clock.now() >= this.cfg.runUntilMs;
  }

  async run(signal: AbortSignal): Promise<'run_until' | 'aborted'> {
    for (;;) {
      if (signal.aborted) return 'aborted';
      if (this.done()) {
        this.log.info('stopped', { event: 'stopped', reason: 'run_until', run_until: new Date(this.cfg.runUntilMs).toISOString() });
        return 'run_until';
      }
      await this.tick();
      await this.clock.sleep(Math.min(this.nextDelayMs(), Math.max(0, this.cfg.runUntilMs - this.clock.now())), signal);
    }
  }
}

export type CreateResult = { refresher: OwnerPriceRefresher; cfg: RefresherConfig } | { stopped: 'run_until'; cfg: RefresherConfig };

/**
 * Config + key (generated if allowed) + fallback RPC. Throws RefresherConfigError / KeyFileError (main exits 1).
 * Past run_until it returns `stopped` before touching the key.
 */
export function createOracleRefresher(env: NodeJS.ProcessEnv, log: Logger, clock: Clock = realClock): CreateResult {
  const cfg = loadRefresherConfig(env);
  if (clock.now() >= cfg.runUntilMs) return { stopped: 'run_until', cfg };
  const key = loadOrGenerateKey(cfg, log);
  const near = fallbackRpc({ urls: cfg.rpcUrls, log: (level, msg, f) => log[level](msg, f) });
  const account = new Account(key.accountId, near.provider, KeyPairSigner.fromSecretKey(key.secretKey));
  const chain = new NearRefresherChain(near.provider, account, cfg.coreAccountId, () => near.status().last_served);
  return { refresher: new OwnerPriceRefresher(cfg, key, chain, log, clock), cfg };
}
