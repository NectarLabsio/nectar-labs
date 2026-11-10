// `pnpm --filter x402 demo:testnet` (PRD v7 §10.5, gate G14). Testnet only: refuses any mainnet hint.
// 1. Asks the Feed MCP (`open_protected_stock_loan`, FEED_MCP_URL) for the UNSIGNED borrow against mock NVDAx.
// 2. Signs and sends it from AGENT1_ACCOUNT_ID with the full-access key at AGENT1_KEY_PATH (near-api-js 7.4.0).
// 3. GETs the paid CSV (X402_URL): 402 -> NEP-366 SignedDelegate paying 0.01 mock USDC -> 200.
// Needs: the Feed (REST + MCP) and `pnpm --filter x402 start` running, agent1 funded with mock NVDAx and
// storage-registered on usdc-mock. DEMO_SKIP_BORROW=1 skips step 1-2 (agent already holds USDC).
// Logs carry tx hashes and outcome codes only; never the key.

import { createLocalNearSigner } from '@fastnear/x402/node';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Account, JsonRpcProvider, KeyPairSigner } from 'near-api-js';
import { payForResource } from './agent.ts';
import { DEFAULT_RPC, NETWORK, assertTestnet, yamlIds } from './config.ts';
import { loadFullAccessKey } from './keys.ts';
import { jsonLog as log } from './server.ts';

const env = process.env;
const mcpUrl = env.FEED_MCP_URL ?? 'http://127.0.0.1:8789/mcp';
const paidUrl = env.X402_URL ?? 'http://127.0.0.1:8790/api/feed/export.csv';
const rpcUrl = env.X402_RPC_URL ?? DEFAULT_RPC;
assertTestnet(env, [mcpUrl, paidUrl, rpcUrl]);

const y = yamlIds(env);
const accountId = env.AGENT1_ACCOUNT_ID !== undefined && env.AGENT1_ACCOUNT_ID !== '' ? env.AGENT1_ACCOUNT_ID : (y.get('v7.agent1') ?? '');
if (accountId === '' || !accountId.endsWith('.testnet')) throw new Error('AGENT1_ACCOUNT_ID must be a .testnet account');
const key = loadFullAccessKey(env.AGENT1_KEY_PATH, 'AGENT1_KEY_PATH', accountId, 'AGENT1_ACCOUNT_ID');

interface UnsignedCall { receiver_id: string; method: string; args: Record<string, unknown>; deposit: string; gas: string }

if (env.DEMO_SKIP_BORROW !== '1') {
  const mcp = new Client({ name: 'nectar-demo-agent', version: '0.1.0' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
  const r = (await mcp.callTool({
    name: 'open_protected_stock_loan',
    arguments: { account_id: accountId, collateral: env.DEMO_COLLATERAL ?? 'NVDAx', units: env.DEMO_UNITS ?? '1000000', borrow_usd: env.DEMO_BORROW_USD ?? '10' },
  })) as { content: Array<{ text: string }>; isError?: boolean };
  await mcp.close();
  const body = JSON.parse(r.content[0]?.text ?? '{}') as { call?: UnsignedCall; error?: string; detail?: string; preview?: { fees?: unknown } };
  if (r.isError === true || body.call === undefined) throw new Error(`open_protected_stock_loan refused: ${body.error ?? 'error'} ${body.detail ?? ''}`);
  log('borrow_built', { receiver_id: body.call.receiver_id, method: body.call.method, fees: JSON.stringify(body.preview?.fees ?? null) });
  const account = new Account(accountId, new JsonRpcProvider({ url: rpcUrl }), KeyPairSigner.fromSecretKey(key.secretKey));
  const res = await account.callFunctionRaw({
    contractId: body.call.receiver_id,
    methodName: body.call.method,
    args: body.call.args,
    deposit: BigInt(body.call.deposit),
    gas: BigInt(body.call.gas),
    waitUntil: 'FINAL',
  });
  const failed = [res.status, ...res.receipts_outcome.map((o) => o.outcome.status)].find((s) => typeof s === 'object' && s !== null && 'Failure' in s);
  log('borrow_sent', { tx: res.transaction_outcome.id, ok: failed === undefined, explorer: `https://testnet.nearblocks.io/txns/${res.transaction_outcome.id}` });
  if (failed !== undefined) throw new Error(`borrow failed: ${JSON.stringify(failed)}`);
}

const signer = createLocalNearSigner({ accountId, secretKey: key.secretKey, rpcUrls: { [NETWORK]: rpcUrl } });
const paid = await payForResource(paidUrl, signer);
log('challenge', { status: paid.challenge.status, network: paid.challenge.network, asset: paid.challenge.asset, amount: paid.challenge.amount, pay_to: paid.challenge.payTo });
log('paid_fetch', { status: paid.status, rows: Math.max(0, paid.body.trim().split('\n').length - 1), transaction: paid.transaction });
if (paid.status !== 200) process.exitCode = 1;
