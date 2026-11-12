// Feed MCP over stdio: `node --disable-warning=ExperimentalWarning src/mcp-stdio.ts`.
// stdout carries the MCP protocol, so this entrypoint never logs to stdout. Read-only, keyless:
// FEED_DB_PATH (SQLite written by `pnpm --filter feed start`), CORE_ACCOUNT_ID (default accounts.core
// in packages/config/config.yaml) + NEAR_RPC_URL for live views; no env needed for read-only use.
// Launch with `node` directly or `pnpm -s --filter feed mcp` (without -s pnpm prints a banner to stdout).

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FeedDb } from './db.ts';
import { createMcpServer } from './mcp.ts';
import { NearViewReader, rpcUrls } from './near.ts';
import { fallbackRpc } from './near-rpc.ts';
import { loadRepoIds } from './repo-config.ts';

const env = process.env;
const unset = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-');
const home = (p: string): string => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

const db = new FeedDb(home(unset(env.FEED_DB_PATH) ? '~/.nectar/feed.sqlite' : (env.FEED_DB_PATH as string)));
const core = loadRepoIds(env).core;
const views = core === null ? null : new NearViewReader(fallbackRpc({ urls: rpcUrls(env) }).provider, core);
await createMcpServer({ db, views, coreId: core }).connect(new StdioServerTransport());
process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'info', service: 'feed-mcp', msg: 'mcp_stdio_ready', live_views: views !== null }) + '\n');
