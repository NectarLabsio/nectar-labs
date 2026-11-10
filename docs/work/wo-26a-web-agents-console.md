# WO-26a — web — /agents page + /console v7 owner controls (< 2 h; commit `feat(web): agents page and v7 console`)
Read first: PRD v7 §10.5 and §12.1 (/agents, /console rows only), `services/feed/src/skill.ts` (tool names and inputs), `services/x402/` README or
`demo-agent.ts` (the paid flow), `docs/work/interface-v7.md` (owner methods; WO-21 adds `set_vault_read_config`,
`set_allow_keeper_deposit_attestation`). Write only apps/web, packages/ui, packages/sdk.
1. `/agents`: the MCP install snippet (stdio `pnpm -s --filter feed mcp` and HTTP :8789/mcp), an `open_protected_stock_loan` example (input plus the
   returned unsigned call, rendered from a fixture, labelled "example"), the x402 walkthrough (402 → pay 0.01 mock USDC → 200) labelled "not run on testnet
   yet" until `features.x402` is true, and referral stats on v2 (claimable for a referrer). Copy: no "live" claims (G14 pending).
2. `/console` (owner, v2 only, every write previewed in the sign modal):
   - multiplier: set (≤ +5%), announce corporate action (≥ 1 h), apply;
   - session: calendar status from `get_session_calendar`, plus force closed / clear;
   - referrers: register / unregister, plus the origination fee;
   - remote: keeper-attestation flag and vault_read config.
   Read-only for non-owners.
3. Nav link to /agents. E2E (mocked v2 fixtures) for both pages, a11y ≥ 90, no horizontal scroll at 400 px. Do not commit regenerated evidence/G3 screenshots.
Report ≤ 20 lines.
