// `pnpm --filter x402 start`: the paid Feed export on near:testnet (X402_PORT, default 8790) and, when
// X402_FACILITATOR_URL is unset, our own in-process facilitator whose relayer key comes from the 0600 file at
// X402_RELAYER_KEY_PATH (full-access key, F-328; never logged). X402_FACILITATOR_PORT (default off) also
// exposes that facilitator over HTTP (/verify, /settle, /supported) on X402_FACILITATOR_HOST (default 127.0.0.1),
// behind the bearer token in the 0600 file at X402_FACILITATOR_SECRET_PATH. Needs the Feed REST on FEED_URL.

import { loadConfig } from './config.ts';
import { loadFullAccessKey, loadSharedSecret } from './keys.ts';
import { buildFacilitator, createFacilitatorHttp, createPaidServer, facilitatorEndpoint, feedUpstream, jsonLog } from './server.ts';

const cfg = loadConfig(process.env);
let facilitator: Parameters<typeof createPaidServer>[0]['facilitator'];
if (cfg.facilitatorUrl !== null) {
  const secret = cfg.facilitatorSecretPath === null ? null : loadSharedSecret(cfg.facilitatorSecretPath, 'X402_FACILITATOR_SECRET_PATH');
  facilitator = facilitatorEndpoint(cfg.facilitatorUrl, secret);
} else {
  const key = loadFullAccessKey(cfg.relayerKeyPath, 'X402_RELAYER_KEY_PATH', cfg.relayerAccountId, 'X402_RELAYER_ACCOUNT_ID');
  const f = buildFacilitator({ relayers: [{ accountId: key.accountId, secretKey: key.secretKey }], rpcUrls: { [cfg.network]: cfg.rpcUrl } });
  facilitator = f;
  if (cfg.facilitatorPort !== null) {
    const secret = loadSharedSecret(cfg.facilitatorSecretPath, 'X402_FACILITATOR_SECRET_PATH');
    createFacilitatorHttp(f, { cfg, secret }).listen(cfg.facilitatorPort, cfg.facilitatorHost);
  }
}
const server = await createPaidServer({ cfg, facilitator, upstream: feedUpstream(cfg.feedUrl) });
server.listen(cfg.port, cfg.host);
jsonLog('x402_started', {
  port: cfg.port, network: cfg.network, asset: cfg.asset, amount: cfg.amount, pay_to: cfg.payTo,
  facilitator: cfg.facilitatorUrl ?? `in-process (relayer ${cfg.relayerAccountId})`, feed: cfg.feedUrl,
  facilitator_http: cfg.facilitatorPort === null ? 'off' : `${cfg.facilitatorHost}:${cfg.facilitatorPort}`,
});
const stop = (): void => void server.close();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
