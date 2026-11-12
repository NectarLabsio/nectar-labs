// Pyth price pusher (D-013): fetches Hermes update data and calls `update_price_feeds` on the Pyth
// contract (F-054) from a SEPARATE updater account — never the keeper account, never an owner key.
// A deposit is required, which a function-call key cannot attach (F-015), so the updater account is a
// small-balance account with its own key file (ORACLE_UPDATER_KEY_PATH, 0600).
//
// Disabled (logs `oracle_updater_disabled{reason}`) unless PYTH_API_KEY_PATH, ORACLE_UPDATER_ACCOUNT_ID,
// ORACLE_UPDATER_KEY_PATH and ORACLE_UPDATER_FEED_IDS are all set (TODO-H13: no Pyth key exists yet).
//
// Unverified shapes, all configurable (see report / F-054, F-056):
// - Hermes auth: F-056 documents `Authorization: Bearer <key>` for Pyth Pro, not for Hermes →
//   PYTH_AUTH_HEADER (default `Authorization`) and PYTH_AUTH_SCHEME (default `Bearer`, '' = raw key).
// - Hermes body: `{binary:{encoding:"hex", data:[<hex>…]}}` requested with `encoding=hex`.
// - Fee view: F-054 lists `get_update_fee_estimate` but not its argument names →
//   ORACLE_UPDATER_FEE_VIEW (default `get_update_fee_estimate`), ORACLE_UPDATER_DATA_ARG (default `data`,
//   also used for `update_price_feeds`).
// The API key is never logged; any error text is scrubbed of it before logging.

import { Account, KeyPairSigner, type Provider } from 'near-api-js';
import { fallbackRpc, nearRpcUrls } from './near-rpc.ts';
import { expandHome, isPlaceholder } from './config.ts';
import { loadKeeperKey, loadSecretFile } from './keyfile.ts';
import { errMsg, type Logger } from './log.ts';

export interface UpdaterConfig {
  hermesUrl: string;
  feedIds: string[];
  authHeader: string;
  authScheme: string;
  pythContractId: string;
  feeView: string;
  dataArg: string;
  maxFeeYocto: bigint;
  gasTgas: number;
  intervalMs: number;
  /** NEAR RPC endpoints in fallback order (WO-35k near-rpc.ts). */
  rpcUrls: string[];
  accountId: string;
  keyPath: string;
  apiKeyPath: string;
}

export type UpdaterSetup = { enabled: true; cfg: UpdaterConfig } | { enabled: false; reason: string };

const FEED_ID = /^(0x)?[0-9a-fA-F]{64}$/;

export function loadUpdaterConfig(env: NodeJS.ProcessEnv = process.env): UpdaterSetup {
  if (isPlaceholder(env.PYTH_API_KEY_PATH)) return { enabled: false, reason: 'PYTH_API_KEY_PATH unset (TODO-H13)' };
  const missing = ['ORACLE_UPDATER_ACCOUNT_ID', 'ORACLE_UPDATER_KEY_PATH'].filter((k) => isPlaceholder(env[k]));
  if (missing.length > 0) return { enabled: false, reason: `unset: ${missing.join(', ')}` };
  if (env.ORACLE_UPDATER_ACCOUNT_ID === env.KEEPER_ACCOUNT_ID) return { enabled: false, reason: 'ORACLE_UPDATER_ACCOUNT_ID must not be the keeper account (D-013)' };
  const ids = (env.ORACLE_UPDATER_FEED_IDS ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '' && !s.startsWith('TODO-'));
  if (ids.length === 0) return { enabled: false, reason: 'ORACLE_UPDATER_FEED_IDS unset (TODO-G5)' };
  const bad = ids.find((i) => !FEED_ID.test(i));
  if (bad !== undefined) return { enabled: false, reason: 'ORACLE_UPDATER_FEED_IDS has a non-32-byte-hex id' };
  const pick = (k: string, d: string): string => (env[k] === undefined || env[k] === '' ? d : (env[k] as string));
  const n = (k: string, d: number, min: number, max: number): number => {
    const v = Number(pick(k, String(d)));
    if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${k} must be an integer in [${min}, ${max}]`);
    return v;
  };
  const maxFee = pick('ORACLE_UPDATER_MAX_FEE_YOCTO', (10n ** 23n).toString()); // 0.1 NEAR safety cap
  if (!/^\d+$/.test(maxFee)) throw new Error('ORACLE_UPDATER_MAX_FEE_YOCTO must be a decimal integer');
  return {
    enabled: true,
    cfg: {
      hermesUrl: pick('PYTH_HERMES_URL', 'https://hermes.pyth.network').replace(/\/+$/, ''),
      feedIds: ids.map((i) => i.replace(/^0x/, '').toLowerCase()),
      authHeader: pick('PYTH_AUTH_HEADER', 'Authorization'),
      authScheme: env.PYTH_AUTH_SCHEME ?? 'Bearer',
      pythContractId: pick('ORACLE_PYTH_CONTRACT', 'pyth-oracle.testnet'),
      feeView: pick('ORACLE_UPDATER_FEE_VIEW', 'get_update_fee_estimate'),
      dataArg: pick('ORACLE_UPDATER_DATA_ARG', 'data'),
      maxFeeYocto: BigInt(maxFee),
      gasTgas: n('ORACLE_UPDATER_GAS_TGAS', 150, 10, 300),
      intervalMs: n('ORACLE_UPDATER_INTERVAL_MS', 30_000, 1_000, 3_600_000),
      rpcUrls: nearRpcUrls(env),
      accountId: env.ORACLE_UPDATER_ACCOUNT_ID as string,
      keyPath: expandHome(env.ORACLE_UPDATER_KEY_PATH as string),
      apiKeyPath: expandHome(env.PYTH_API_KEY_PATH as string),
    },
  };
}

export interface HttpResponse {
  status: number;
  body: string;
}
export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;

export const fetchGet: HttpGet = async (url, headers) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: await r.text() };
};

export interface PythChain {
  view(method: string, args: Record<string, unknown>): Promise<unknown>;
  updatePriceFeeds(args: Record<string, string>, depositYocto: bigint): Promise<{ txHash: string; ok: boolean; failure: string | null }>;
}

export class HermesError extends Error {
  readonly status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export function hermesUrl(cfg: Pick<UpdaterConfig, 'hermesUrl' | 'feedIds'>): string {
  const q = cfg.feedIds.map((id) => `ids[]=${id}`).join('&');
  return `${cfg.hermesUrl}/v2/updates/price/latest?${q}&encoding=hex`;
}

/** Extracts hex update blobs from a Hermes `/v2/updates/price/latest` body. */
export function parseHermesUpdate(body: string): string[] {
  let o: unknown;
  try {
    o = JSON.parse(body);
  } catch {
    throw new Error('hermes body is not JSON');
  }
  const bin = typeof o === 'object' && o !== null ? (o as Record<string, unknown>).binary : undefined;
  if (typeof bin !== 'object' || bin === null) throw new Error('hermes body has no binary');
  const b = bin as Record<string, unknown>;
  if (b.encoding !== 'hex') throw new Error(`hermes binary encoding ${String(b.encoding)} != hex`);
  if (!Array.isArray(b.data) || b.data.length === 0) throw new Error('hermes binary.data is empty');
  return b.data.map((d) => {
    if (typeof d !== 'string' || !/^(0x)?[0-9a-fA-F]+$/.test(d) || d.length % 2 !== 0) throw new Error('hermes binary.data item is not hex');
    return d.replace(/^0x/, '');
  });
}

export function parseYocto(v: unknown): bigint {
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  throw new Error('fee view did not return a U128');
}

export function redact(msg: string, secret: string): string {
  return secret.length >= 4 ? msg.split(secret).join('[redacted]') : msg;
}

export interface UpdateResult {
  pushed: number;
  txHashes: string[];
}

export class OracleUpdater {
  private readonly cfg: UpdaterConfig;
  private readonly apiKey: string;
  private readonly http: HttpGet;
  private readonly chain: PythChain;
  private readonly log: Logger;
  consecutiveErrors = 0;

  constructor(cfg: UpdaterConfig, apiKey: string, http: HttpGet, chain: PythChain, log: Logger) {
    this.cfg = cfg;
    this.apiKey = apiKey;
    this.http = http;
    this.chain = chain;
    this.log = log;
  }

  private authHeaders(): Record<string, string> {
    return { [this.cfg.authHeader]: this.cfg.authScheme === '' ? this.apiKey : `${this.cfg.authScheme} ${this.apiKey}` };
  }

  async runOnce(): Promise<UpdateResult> {
    const res = await this.http(hermesUrl(this.cfg), { accept: 'application/json', ...this.authHeaders() });
    if (res.status === 401 || res.status === 403) throw new HermesError(res.status, `hermes unauthorized (HTTP ${res.status}); check PYTH_AUTH_HEADER/PYTH_AUTH_SCHEME (F-056)`);
    if (res.status !== 200) throw new HermesError(res.status, `hermes HTTP ${res.status}: ${redact(res.body.slice(0, 200), this.apiKey)}`);
    const blobs = parseHermesUpdate(res.body);
    const out: UpdateResult = { pushed: 0, txHashes: [] };
    for (const data of blobs) {
      const args = { [this.cfg.dataArg]: data };
      const fee = parseYocto(await this.chain.view(this.cfg.feeView, args));
      if (fee > this.cfg.maxFeeYocto) throw new Error(`update fee ${fee} yocto exceeds ORACLE_UPDATER_MAX_FEE_YOCTO`);
      const tx = await this.chain.updatePriceFeeds(args, fee);
      if (!tx.ok) throw new Error(`update_price_feeds failed in ${tx.txHash}: ${(tx.failure ?? '').slice(0, 200)}`);
      out.pushed++;
      out.txHashes.push(tx.txHash);
      this.log.info('oracle_updated', { pyth: this.cfg.pythContractId, tx_hash: tx.txHash, fee_yocto: fee.toString(), feeds: this.cfg.feedIds.length });
    }
    return out;
  }

  /** One tick with error accounting; never throws. */
  async tick(): Promise<UpdateResult | null> {
    try {
      const r = await this.runOnce();
      this.consecutiveErrors = 0;
      return r;
    } catch (e) {
      this.consecutiveErrors++;
      this.log.error('oracle_update_failed', {
        error: redact(errMsg(e), this.apiKey),
        http_status: e instanceof HermesError ? e.status : undefined,
        consecutive_errors: this.consecutiveErrors,
      });
      return null;
    }
  }

  nextDelayMs(): number {
    if (this.consecutiveErrors === 0) return this.cfg.intervalMs;
    return Math.min(600_000, this.cfg.intervalMs * 2 ** Math.min(this.consecutiveErrors, 6));
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.tick();
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.nextDelayMs());
        signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
      });
    }
  }
}

/** near-api-js 7.4.0 adapter (same calls as chain.ts, F-012). Only ever calls the fee view and update_price_feeds. */
export class NearPythChain implements PythChain {
  private readonly provider: Provider;
  private readonly account: Account;
  private readonly contractId: string;
  private readonly gas: bigint;

  constructor(provider: Provider, accountId: string, secretKey: `ed25519:${string}`, contractId: string, gasTgas: number) {
    this.provider = provider;
    this.account = new Account(accountId, this.provider, KeyPairSigner.fromSecretKey(secretKey));
    this.contractId = contractId;
    this.gas = BigInt(gasTgas) * 10n ** 12n;
  }

  async view(method: string, args: Record<string, unknown>): Promise<unknown> {
    const raw = await this.provider.callFunctionRaw({ contractId: this.contractId, method, args, blockQuery: { finality: 'final' } });
    const text = new TextDecoder().decode(new Uint8Array(raw.result));
    return text === '' ? null : (JSON.parse(text) as unknown);
  }

  async updatePriceFeeds(args: Record<string, string>, depositYocto: bigint): Promise<{ txHash: string; ok: boolean; failure: string | null }> {
    const res = await this.account.callFunctionRaw({
      contractId: this.contractId,
      methodName: 'update_price_feeds',
      args,
      deposit: depositYocto,
      gas: this.gas,
      waitUntil: 'EXECUTED_OPTIMISTIC',
    });
    const statuses = [res.status, ...res.receipts_outcome.map((r) => r.outcome.status)];
    const f = statuses.find((s) => typeof s === 'object' && s !== null && 'Failure' in s);
    return { txHash: res.transaction_outcome.id, ok: f === undefined, failure: f === undefined ? null : JSON.stringify(f) };
  }
}

/** Builds a ready updater from the environment, or returns why it is disabled (logged by the caller). */
export function createOracleUpdater(env: NodeJS.ProcessEnv, log: Logger): { updater: OracleUpdater } | { disabled: string } {
  let setup: UpdaterSetup;
  try {
    setup = loadUpdaterConfig(env);
  } catch (e) {
    return { disabled: errMsg(e) };
  }
  if (!setup.enabled) return { disabled: setup.reason };
  const cfg = setup.cfg;
  try {
    const apiKey = loadSecretFile(cfg.apiKeyPath, 'PYTH_API_KEY_PATH');
    const key = loadKeeperKey(cfg.keyPath, cfg.accountId, 'ORACLE_UPDATER_KEY_PATH', 'ORACLE_UPDATER_ACCOUNT_ID');
    const near = fallbackRpc({ urls: cfg.rpcUrls, log: (level, msg, f) => log[level](msg, f) });
    const chain = new NearPythChain(near.provider, cfg.accountId, key.secretKey, cfg.pythContractId, cfg.gasTgas);
    return { updater: new OracleUpdater(cfg, apiKey, fetchGet, chain, log) };
  } catch (e) {
    return { disabled: errMsg(e) };
  }
}
