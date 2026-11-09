// Feed MCP server — STUB REGISTRATION ONLY (P0). Tool names and input shapes are fixed here so the
// web docs and the P1 work order code against one list; handlers, transports (stdio + HTTP) and the
// `@modelcontextprotocol/sdk` dependency land in P1 (version pinned at G9, PRD §10.3). Every tool is
// read-only and keyless.

export interface McpToolStub {
  name: 'get_feed' | 'get_asset' | 'get_quotes' | 'get_positions' | 'get_settlements' | 'explain_limit';
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, { type: 'string' | 'integer'; description: string }>; required: string[] };
  readOnly: true;
  /** Where the P1 handler will read from. */
  backing: string;
  status: 'stub-p1';
}

const sym = { type: 'string' as const, description: 'collateral symbol, e.g. NVDAx' };

export const MCP_TOOLS: readonly McpToolStub[] = [
  { name: 'get_feed', description: 'Committed exit capacity and effective limit for every asset.', inputSchema: { type: 'object', properties: {}, required: [] }, readOnly: true, backing: 'GET /api/feed', status: 'stub-p1' },
  { name: 'get_asset', description: 'One asset: latest capacity plus history.', inputSchema: { type: 'object', properties: { symbol: sym }, required: ['symbol'] }, readOnly: true, backing: 'GET /api/asset/{id}', status: 'stub-p1' },
  { name: 'get_quotes', description: 'Live quotes for an asset (ids and sizes only, no buyer identity).', inputSchema: { type: 'object', properties: { symbol: sym, limit: { type: 'integer', description: 'max items' } }, required: ['symbol'] }, readOnly: true, backing: 'view list_quotes', status: 'stub-p1' },
  { name: 'get_positions', description: 'Position health (no borrower identity).', inputSchema: { type: 'object', properties: { position_id: { type: 'string', description: 'optional id' } }, required: [] }, readOnly: true, backing: 'views list_positions / get_health', status: 'stub-p1' },
  { name: 'get_settlements', description: 'Recent pre-liquidation settlements.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'max items' } }, required: [] }, readOnly: true, backing: 'GET /api/settlements', status: 'stub-p1' },
  { name: 'explain_limit', description: 'The Cramér formula with live numbers substituted, as text.', inputSchema: { type: 'object', properties: { symbol: sym }, required: ['symbol'] }, readOnly: true, backing: 'view get_exit_capacity', status: 'stub-p1' },
];

export function mcpStubManifest(): { server: string; transports: string[]; implemented: false; tools: readonly McpToolStub[] } {
  return { server: 'nectar-feed', transports: ['stdio', 'http'], implemented: false, tools: MCP_TOOLS };
}
