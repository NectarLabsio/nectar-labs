// Feed MCP over stdio: `node --disable-warning=ExperimentalWarning src/mcp-stdio.ts`.
// stdout carries the MCP protocol, so this entrypoint never logs to stdout. Read-only, keyless:
// FEED_DB_PATH (SQLite written by `pnpm --filter feed start`), optional CORE_ACCOUNT_ID + NEAR_RPC_URL
// for live views.

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FeedDb } from './db.ts';
import { createMcpServer } from './mcp.ts';
import { NearViewReader } from './near.ts';

const env = process.env;
const unset = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-');
const home = (p: string): string => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

const db = new FeedDb(home(unset(env.FEED_DB_PATH) ? '~/.nectar/feed.sqlite' : (env.FEED_DB_PATH as string)));
const rpc = unset(env.NEAR_RPC_URL) ? 'https://rpc.testnet.near.org' : (env.NEAR_RPC_URL as string);
const views = unset(env.CORE_ACCOUNT_ID) ? null : new NearViewReader(rpc, env.CORE_ACCOUNT_ID as string);
await createMcpServer({ db, views }).connect(new StdioServerTransport());
process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'info', service: 'feed-mcp', msg: 'mcp_stdio_ready', live_views: views !== null }) + '\n');
