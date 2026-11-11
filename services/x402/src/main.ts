// `pnpm --filter x402 start`: the paid Feed export on near:testnet (X402_PORT, else PORT, default 8790) and, when
// X402_FACILITATOR_URL is unset, our own in-process facilitator whose relayer key comes from the 0600 file at
// X402_RELAYER_KEY_PATH (full-access key, F-328; never logged) or from X402_RELAYER_KEY_JSON (env-held, hosted mode:
// refused unless view_access_key confirms it is NOT FullAccess — see hosted.ts for the F-328 consequence).
// X402_FACILITATOR_PORT (default off) also exposes that facilitator over HTTP (/verify, /settle, /supported) on
// X402_FACILITATOR_HOST (default 127.0.0.1), behind the bearer token in the 0600 file at X402_FACILITATOR_SECRET_PATH.
// Needs the Feed REST on FEED_URL. GET /health reports the upstream and the terms (never keys). X402_CORS_ORIGINS
// sets a CORS allowlist (unset = no CORS headers).

import { readFileSync } from 'node:fs';
import { loadConfig } from './config.ts';
import { assertEnvKeyNotFullAccess, feedHealthProbe, healthReply, nearAccessKeyViewer, parseEnvKey } from './hosted.ts';
import { loadFullAccessKey, loadSharedSecret, type LoadedKey } from './keys.ts';
import { buildFacilitator, createFacilitatorHttp, createPaidServer, facilitatorEndpoint, feedUpstream, jsonLog } from './server.ts';

const cfg = loadConfig(process.env);
let facilitator: Parameters<typeof createPaidServer>[0]['facilitator'];
if (cfg.facilitatorUrl !== null) {
  const secret = cfg.facilitatorSecretPath === null ? null : loadSharedSecret(cfg.facilitatorSecretPath, 'X402_FACILITATOR_SECRET_PATH');
  facilitator = facilitatorEndpoint(cfg.facilitatorUrl, secret);
} else {
  let key: LoadedKey;
  if (cfg.relayerKeyFromEnv) {
    const envKey = parseEnvKey(process.env.X402_RELAYER_KEY_JSON as string, cfg.relayerAccountId);
    delete process.env.X402_RELAYER_KEY_JSON; // not inherited by anything this process spawns
    try {
      await assertEnvKeyNotFullAccess(envKey, await nearAccessKeyViewer(cfg.rpcUrl));
    } catch (e) {
      jsonLog('relayer_key_refused', { reason: e instanceof Error ? e.message : 'refused' });
      process.exit(1);
    }
    key = envKey;
  } else {
    key = loadFullAccessKey(cfg.relayerKeyPath, 'X402_RELAYER_KEY_PATH', cfg.relayerAccountId, 'X402_RELAYER_ACCOUNT_ID');
  }
  const f = buildFacilitator({ relayers: [{ accountId: key.accountId, secretKey: key.secretKey }], rpcUrls: { [cfg.network]: cfg.rpcUrl } });
  facilitator = f;
  if (cfg.facilitatorPort !== null) {
    const secret = loadSharedSecret(cfg.facilitatorSecretPath, 'X402_FACILITATOR_SECRET_PATH');
    createFacilitatorHttp(f, { cfg, secret }).listen(cfg.facilitatorPort, cfg.facilitatorHost);
  }
}
const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
const server = await createPaidServer({
  cfg,
  facilitator,
  upstream: feedUpstream(cfg.feedUrl),
  cors: cfg.corsOrigins === null ? undefined : { origins: cfg.corsOrigins, legacyWildcard: false, methods: 'GET, OPTIONS' },
  health: () =>
    healthReply({
      network: cfg.network, asset: cfg.asset, amount: cfg.amount, payTo: cfg.payTo,
      facilitator: cfg.facilitatorUrl === null ? 'in-process' : 'remote',
      relayerAccountId: cfg.facilitatorUrl === null ? cfg.relayerAccountId : null,
      version, feedStatus: feedHealthProbe(cfg.feedUrl),
    }),
});
server.listen(cfg.port, cfg.host);
jsonLog('x402_started', {
  port: cfg.port, network: cfg.network, asset: cfg.asset, amount: cfg.amount, pay_to: cfg.payTo,
  facilitator: cfg.facilitatorUrl === null ? `in-process (relayer ${cfg.relayerAccountId}, key ${cfg.relayerKeyFromEnv ? 'env' : 'file'})` : 'remote',
  feed: cfg.feedUrl,
  facilitator_http: cfg.facilitatorPort === null ? 'off' : `${cfg.facilitatorHost}:${cfg.facilitatorPort}`,
  cors: cfg.corsOrigins === null ? 'off' : `${cfg.corsOrigins.size} origin(s)`,
});
const stop = (): void => void server.close();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
