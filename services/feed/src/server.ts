// Single-port Feed server (FEED_SINGLE_PORT=1, WO-34k): `/mcp` (POST and its preflight) goes to the stateless MCP
// handler, everything else to the REST handler. One public port for platforms that expose exactly one.

import { createServer, type Server } from 'node:http';
import { apiHandler, type ApiOptions } from './api.ts';
import type { FeedDb } from './db.ts';
import { mcpHandler, type McpDeps } from './mcp.ts';

export function createFeedServer(db: FeedDb, opts: ApiOptions, mcp: McpDeps | null): Server {
  const rest = apiHandler(db, opts);
  const cors = opts.cors === undefined ? undefined : { ...opts.cors, methods: 'POST, OPTIONS' };
  const tools = mcp === null ? null : mcpHandler(mcp, cors);
  return createServer((req, res) => {
    const path = ((req.url ?? '/').split('?')[0] ?? '/').replace(/\/+$/, '');
    if (path === '/mcp' && tools !== null) tools(req, res);
    else rest(req, res);
  });
}
