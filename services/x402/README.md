# x402 — paid Feed export on `near:testnet`

PRD v7 §10.5. The Feed's `/api/feed/export.csv` served as an x402 route priced at **0.01 mock USDC**
(`{amount: "10000", asset: "usdc-mock.nectar.testnet"}`, F-329) on `near:testnet`, `payTo` = treasury
(`accounts.treasury` in config.yaml, else `accounts.owner`; must be storage-registered on usdc-mock, F-328).
Built on `@fastnear/x402` 2.5.0 (`@x402/core`/`@x402/near` 2.18.0). Testnet only: any mainnet hint is refused.

Status: **built and unit-tested against mocks**. The relayer and agent accounts do not exist yet
(H-NEAR-FAUCET); the live settle is gate G14.

```bash
pnpm --filter feed start                 # Feed REST :8788 + MCP :8789 (upstream for the paid route)
X402_RELAYER_KEY_PATH=~/.nectar/keys/x402-relayer.json pnpm --filter x402 start   # paid route :8790
AGENT1_KEY_PATH=~/.nectar/keys/agent1.json pnpm --filter x402 demo:testnet        # borrow -> 402 -> pay -> 200
pnpm --filter x402 test                  # mocked facilitator chain + mocked NEAR RPC
```

- `src/server.ts`: resource server (`x402HTTPResourceServer` over `node:http`). The CSV is fetched from the Feed
  **before** settlement, so a Feed outage never charges the payer. `createFacilitatorHttp` exposes our
  facilitator at `/verify`, `/settle`, `/supported` (`X402_FACILITATOR_PORT`, default off; see below).
- Facilitator: `createNearFacilitator`, relayer `x402-relayer.nectar.testnet`, key from the 0600 file at
  `X402_RELAYER_KEY_PATH` (full-access; never logged). In-process is the default. `X402_FACILITATOR_URL` uses a
  remote one instead; set `X402_FACILITATOR_SECRET_PATH` as well to send it a bearer token.
- HTTP facilitator (SR-32): the relayer pays gas for every settle, so the listener refuses to start without
  `X402_FACILITATOR_SECRET_PATH`, a 0600 file holding one token of at least 32 characters (`openssl rand -hex 32`).
  Every request needs `Authorization: Bearer <token>` (else 401). `/verify` and `/settle` accept only this service's
  route terms: scheme, network, asset, amount, `payTo`, timeout (else 403). It binds `127.0.0.1` whatever `X402_HOST`
  says; `X402_FACILITATOR_HOST` overrides that, and a non-loopback bind needs TLS in front because the token is a
  plain header.
- `src/demo-agent.ts`: gets the unsigned borrow from the Feed MCP tool `open_protected_stock_loan`, verifies it
  (`src/borrow-guard.ts`, below), signs its own rebuild with `AGENT1_KEY_PATH` (near-api-js 7.4.0), then pays the
  402 with a NEP-366 SignedDelegate. Env: `FEED_MCP_URL`, `X402_URL`, `X402_RPC_URL` (default
  `https://test.rpc.fastnear.com`), `DEMO_UNITS` (1000000 = 1 NVDAx), `DEMO_BORROW_USD` (10), `DEMO_COLLATERAL`
  (NVDAx), `DEMO_PRE_LIQ_LTV_BPS` (optional, pins the value), `CORE_ACCOUNT_ID` / `DEMO_COLLATERAL_TOKEN` (else
  `accounts.core` / `collateral.<k>.token` in config.yaml), `DEMO_SKIP_BORROW=1`.
- `src/borrow-guard.ts`: MCP output is untrusted. The agent signs only if the MCP call matches what it asked for:
  receiver = collateral token from config, `ft_transfer_call`, `args.receiver_id` = nectar-core from config,
  `args.amount` = `DEMO_UNITS`, msg byte-equal to `{"LockCollateralAndBorrow":{collateral, borrow_usd_e6,
  pre_liq_ltv_bps}}` (no `pay_to`, `referrer`, `shield`), deposit `"1"`, gas ≤ 300 Tgas. A mismatch exits with code 3
  and signs nothing. Agents built on this pattern should do the same, and use a limited key where they can.
