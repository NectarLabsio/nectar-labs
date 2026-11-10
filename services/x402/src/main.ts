// `pnpm --filter x402 start`: the paid Feed export on near:testnet (X402_PORT, default 8790) and, when
// X402_FACILITATOR_URL is unset, our own in-process facilitator whose relayer key comes from the 0600 file at
// X402_RELAYER_KEY_PATH (full-access key, F-328; never logged). X402_FACILITATOR_PORT (default off) also
// exposes that facilitator over HTTP (/verify, /settle, /supported). Needs the Feed REST on FEED_URL.

import { loadConfig } from './config.ts';
import { loadFullAccessKey } from './keys.ts';
import { buildFacilitator, createFacilitatorHttp, createPaidServer, feedUpstream, jsonLog } from './server.ts';

const cfg = loadConfig(process.env);
let facilitator: Parameters<typeof createPaidServer>[0]['facilitator'];
if (cfg.facilitatorUrl !== null) {
  facilitator = { url: cfg.facilitatorUrl };
} else {
  const key = loadFullAccessKey(cfg.relayerKeyPath, 'X402_RELAYER_KEY_PATH', cfg.relayerAccountId, 'X402_RELAYER_ACCOUNT_ID');
  const f = buildFacilitator({ relayers: [{ accountId: key.accountId, secretKey: key.secretKey }], rpcUrls: { [cfg.network]: cfg.rpcUrl } });
  facilitator = f;
  const fport = process.env.X402_FACILITATOR_PORT;
  if (fport !== undefined && fport !== '' && fport !== 'off') createFacilitatorHttp(f).listen(Number(fport), cfg.host);
}
const server = await createPaidServer({ cfg, facilitator, upstream: feedUpstream(cfg.feedUrl) });
server.listen(cfg.port, cfg.host);
jsonLog('x402_started', {
  port: cfg.port, network: cfg.network, asset: cfg.asset, amount: cfg.amount, pay_to: cfg.payTo,
  facilitator: cfg.facilitatorUrl ?? `in-process (relayer ${cfg.relayerAccountId})`, feed: cfg.feedUrl,
});
const stop = (): void => void server.close();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
