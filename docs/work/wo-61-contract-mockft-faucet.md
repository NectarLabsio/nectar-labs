# WO-61 — contract — capped public `faucet_mint` on mock-ft (< 2 h; commit `feat(mock-ft): capped public faucet_mint with cooldown (WO-61)`)
Write only contracts/mock-ft/ (and its tests/fixtures). nectar-core is untouched. No deploy: the orchestrator does a code-only upgrade of
usdc-mock.nectar.testnet and nvdax-mock.nectar.testnet (Kunal approved 2026-11-12; account ids, balances and state must survive).
Interface (the web button, WO-62c, builds against exactly this):
- `set_faucet(amount_per_claim: U128, cap_per_account: U128, cooldown_s: u64, enabled: bool)` owner-only. Default before it is called: disabled.
- `#[payable] faucet_mint()`: caller = predecessor. Requires enabled; `now ≥ last_claim + cooldown`; `claimed + amount ≤ cap`. Mints
  `amount_per_claim` to the caller, updates total_supply, emits NEP-141 `ft_mint` (owner_id = caller, memo "faucet"; format from WO-60 F-id or nomicon).
  Storage: measure the bytes this call adds (the balance entry if the caller is new, the claim record on first claim) and require
  `attached ≥ cost` ("attach the storage cost: <yocto>"); refund the rest to the caller. An existing claimant pays nothing extra and gets the attachment back.
  A faucet claim registers the caller (counts as registration for `registration_required`).
- Views: `faucet_config() -> {enabled, amount_per_claim, cap_per_account, cooldown_s}`;
  `faucet_status(account_id) -> {claimed, next_claim_at_ns, can_claim, storage_cost_yocto}` (cost the next claim would charge; 0 if none).
- No borsh layout change to the token struct: config under a raw storage key (like `__free_registrations`), claims in a LookupMap with a new,
  collision-free prefix. Owner `mint`, transfers, storage_deposit, multiplier: unchanged.
Tests: unit — happy path, cooldown refused, cap refused, disabled refused, non-owner `set_faucet` refused, storage charged and refunded exactly
(new account and existing account), view values. Sandbox — fetch the CURRENTLY DEPLOYED code of usdc-mock.nectar.testnet with an RPC `view_code`
(public, read-only) into tests/fixtures/mock-ft-deployed.wasm (record its sha256 in the test), deploy it, create balances, upgrade code-only to the
new wasm, assert balances/total_supply/metadata/storage_balance_of unchanged, then `set_faucet` + `faucet_mint` works and `ft_transfer_call` still works.
Report: gas for faucet_mint and set_faucet (receipt Tgas); new wasm bytes + sha256 vs the deployed size (the token accounts have ~0.10 NEAR free for
storage, so growth over ~8 KB needs a top-up: say so); test counts. Build: `cargo near build non-reproducible-wasm` (SDKROOT note in EVIDENCE §G2b).
`pnpm verify:quick` 0. DISK RULE: no pnpm install in the worktree (symlink node_modules from the main checkout). NO Co-Authored-By. Report ≤ 20 lines.
