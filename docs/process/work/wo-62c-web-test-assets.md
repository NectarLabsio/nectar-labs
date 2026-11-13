# WO-62c — web — "Get test assets" button (< 2 h; commit `feat(web): Get test assets — wallet-signed mock faucet (WO-62c)`)
Timebox (Kunal): dropped if not green by 2026-11-13 12:00 UTC. Write only apps/web/ and packages/sdk/.
Contract interface (WO-61, mock-ft, deployed by the orchestrator to usdc-mock / nvdax-mock with the same ids):
`#[payable] faucet_mint()` (mints `amount_per_claim` to the caller; requires attached ≥ `storage_cost_yocto`, refunds the rest);
views `faucet_config() -> {enabled, amount_per_claim, cap_per_account, cooldown_s}`,
`faucet_status(account_id) -> {claimed, next_claim_at_ns, can_claim, storage_cost_yocto}`. Params mirrored in config.yaml `faucet`.
1. Button "Get test assets" on the testnet app only (APP host; also local mode; never on SITE), with the label "Mock assets, no value" next to it.
   Place it where a newly connected user starts (wallet area / borrow page). Not shown when no wallet is connected (say "Connect a wallet first").
2. On click: read both faucet_status views; sign ONE wallet request with two transactions (wallet-selector signAndSendTransactions): `faucet_mint` on
   nvdax-mock and usdc-mock, each with deposit = its storage_cost_yocto, 30 Tgas. Skip a token that cannot claim and say why.
3. Honest errors: faucet disabled; cooldown (show the time until next claim); cap reached; wallet rejected; not enough NEAR for storage/gas → link the
   official testnet faucet from config `faucet.gas_faucet` (F-154, re-verified in WO-60). Success shows amounts from the views and both tx links.
4. SDK: typed view readers + action builders for the two methods (packages/sdk), unit-tested.
Tests: Playwright with mocked wallet + mocked RPC (happy path, cooldown, cap, disabled, rejected, low balance; button absent on SITE host);
`pnpm verify:quick` 0; branding 0; Lighthouse a11y of the page with the button ≥ 90. The real on-chain call is recorded in EVIDENCE after deploy.
DISK RULE: no pnpm install in the worktree (symlink node_modules). NO Co-Authored-By. Report ≤ 20 lines.
