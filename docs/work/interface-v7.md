# interface-v7.md — names every v7 agent builds against (orchestrator, 2026-11-10; D-017, D-018)
PRD v7 is the spec (`docs/PRD.md` §4.2, 4.6, 4.7, 4.11, 6.11, 9B). This file fixes the exact names, so the contract, web, keeper and solana
agents can work in parallel. Any deviation goes in the agent's report, and the orchestrator updates this file. JSON numbers above 2^53
are strings (U128/U64), as in v1.
Target: **`nectar-core-v2.nectar.testnet`**, a fresh deploy with `new` and no migrate (PRD §6.11). The borsh layout is versioned (V2 root).
v1 stays live and untouched.

## A. P0 delta (WO-19 contract · WO-20 web)
### A1 Aggregate debt (PRD §4.2)
`CollateralConfig.total_debt_usd_e6: U128`: + on borrow, − on repay, − debt repaid at settlement. A borrow passes only if **both** hold:
`position_debt ≤ max_nectar_ltv_bps·V_position/1e4` and `total_debt + borrow ≤ (1e4−h_c)·(Q_c+R_c+D_c)/1e4`, with floors against the
borrower. Naming is canonical (C-107/C-108): **R_c = `nectar_reserve_usd_e6`** (Nectar Reserve, 0 until WO-23b) and **D_c = `verified_dex_depth_usd_e6`**
(verified DEX depth). No code may call 1Click depth "R_c".
### A2 Weekend guard (PRD §4.7) — fails closed
- Contract state `session_calendar: Vec<(u64,u64)>`: sorted, non-overlapping NYSE session windows `[open_ns, close_ns)` (regular days and early
  closes; holidays are simply absent). Owner `set_session_calendar(windows: Vec<[U64;2]>)` replaces the whole list. It panics unless the list
  is sorted and non-overlapping, with ≤ 600 windows. The data comes from `packages/config/nyse-calendar.json` (WO-18) through `scripts/22-session-calendar.mjs`.
- `session_open(c) = window contains now ∧ now − oracle_updated_ns ≤ 900 s ∧ ¬forced_closed`. An empty calendar means closed.
  `session_reason ∈ "open" | "no_calendar" | "outside_hours" | "stale_price" | "forced_closed"`, checked in that order of precedence after "no_calendar".
- Closed ⇒ D_c = 0 and h_c = `weekend_haircut_bps`. Borrows still work at weekend parameters, under the existing oracle-freshness rule.
- Owner `force_session_closed(symbol, closed: bool)`: `true` forces closed; `false` only clears the force and can never open outside the
  calendar or with a stale price. The v1 owner flag `market_session_open` is removed from v2. `CollateralConfig.forced_closed: bool`.
- Fields reserved for later work (present, unused in P0): `weekend_ref_price_e6: U128`, `weekend_ref_updated_ns: U64`.
### A3 Multiplier (PRD §4.6)
- `CollateralConfig += multiplier_e18: U128` (default `"1000000000000000000"`), `multiplier_updated_ns: U64`,
  `price_kind: "Underlying" | "TokenIncludesMultiplier"` (default Underlying), `ca_pending: bool`, `ca_effective_ns: U64`, `ca_multiplier_e18: U128`.
- `V = units·M/1e18·price/10^decimals` for Underlying; M is ignored (treated as 1e18) for TokenIncludesMultiplier. `Position.entry_multiplier_e18: U128` is for display only.
- Owner `set_multiplier(symbol, multiplier_e18)`: increase only, at most +5% per call (`new ≤ old·10500/10000`), refused while `ca_pending`.
- Owner `announce_corporate_action(symbol, multiplier_e18, effective_ns)`: requires `effective_ns ≥ now + 3600 s` and sets `ca_pending`. Any change
  (a decrease or more than +5%) goes through this path. **Anyone** may call `apply_corporate_action(symbol)` once `now ≥ ca_effective_ns`. It sets M, clears `ca_pending` and,
  for Underlying, rescales the stored price by `old_M/new_M` (floor) and resets the band reference, so V is continuous (a 2-for-1 split: M ×2, price ÷2).
- While `ca_pending`, new borrows are refused (`reason: "ca_pending"`). Repay and settlement continue.
- mock-ft (both tokens): view `multiplier() -> U128` (default 1e18), owner `update_multiplier(multiplier_e18: U128)`. It is stored under a raw storage key, so
  the live mock accounts take a code-only upgrade.
### A4 `pay_to` + `claimable_usdc` (PRD §6.11)
`LockCollateralAndBorrow{collateral, borrow_usd_e6, pre_liq_ltv_bps, pay_to?: {receiver_id, memo?}, referrer?}`. Net proceeds go to
`pay_to.receiver_id` (with `memo` on `ft_transfer`) instead of the borrower. On transfer failure the callback credits `claimable_usdc[borrower]` and
emits `pay_to_failed`. `withdraw_claimable()` (1 yocto) pays all of the caller's claimable USDC and restores it if the transfer fails. View `get_claimable(account_id) -> U128`.
### A5 Referrer + origination (PRD §4.11)
- Owner `register_referrer(account_id)`, `unregister_referrer(account_id)`; view `is_referrer(account_id) -> bool`.
- `origination_fee_bps` (default 30, owner `set_origination_fee_bps(bps)`, at most 100) on the full borrow, rounded up. If `referrer` is registered,
  half goes to `claimable_usdc[referrer]` (event `referrer_paid{referrer, position_id, amount_usd_e6}`) and the rest to treasury; otherwise all of it goes to treasury.
- `referrer == borrower` is refused before any state change (the full amount is returned). An unregistered referrer is not an error (treasury).
- net proceeds = borrow − limit premium − origination fee.
### A6 Views (existing fields unchanged; additions)
- `get_exit_capacity(symbol)` adds: `session_open, session_reason, total_debt_usd_e6, aggregate_capacity_usd_e6` (= (1−h)(Q+R+D)),
  `aggregate_headroom_usd_e6, multiplier_e18, price_kind, ca_pending, ca_effective_ns, forced_closed`.
- `preview_borrow(symbol, units, borrow_usd_e6, referrer?)` adds: `origination_fee_usd_e6, referrer_share_usd_e6, total_fees_usd_e6,
  net_proceeds_usd_e6, aggregate_headroom_usd_e6, multiplier_e18, session_open`. New `reason` codes: `aggregate_limit`, `ca_pending`, `referrer_is_borrower`.
- `get_session_calendar(from_index, limit)`, `contract_version()` → `"2.0.0-v7"`.
- Events (NEP-297, standard "nectar", version "2.0.0"): `multiplier_updated`, `corporate_action_announced`, `session_forced_closed`,
  `referrer_paid`, `pay_to_failed`, `claimable_withdrawn`, plus every v1 event.

## B. Remote lifecycle (WO-21 contract · WO-14 solana · WO-16 keeper; PRD §9, §9B)
- Path per position: **`solana-devnet/pos/<id>`** (domain 1) or `base-sepolia/pos/<id>` (domain 0, P2b). This replaces the single path
  `solana-devnet-v1` (D-016) for v2 positions.
- `reserve_remote_position(collateral, units, borrow_usd_e6, pre_liq_ltv_bps, pay_to?, referrer?) -> U64` (borrower, 0 deposit) does the following:
  - position `remote.status = "AwaitingDeposit"`;
  - calls `<signer>.derived_public_key({path, predecessor: <nectar-core>, domain_id})` (args per addendum F-138 = F-338, G10);
  - `on_authority` stores `remote.authority`: for Solana, `"ed25519:<base58>"`; for Base, the 0x address (keccak of x‖y, last 20 bytes);
  - the reservation expires 30 min after it is made (`expire_remote_reservation(id)`, anyone).
- `confirm_remote_deposit(position_id)` (borrower, keeper or owner since 2.2, SR-6): calls OutLayer `vault_read` (WO-24 job; sandbox uses the stub). `on_deposit_verified`
  requires `authority == remote.authority`, `units ≥ reserved units` and the depositor recorded. It re-checks both limits with a fresh price, then pays (or `pay_to`),
  sets `remote.status = "Open"` and emits `remote_deposit_confirmed{position_id, units, depositor, source: "outlayer"}`.
- `keeper_attest_deposit(position_id, tx_ref, depositor)`: keeper only, only while the owner flag `allow_keeper_deposit_attestation` is set (owner
  `set_allow_keeper_deposit_attestation(bool)`). Same checks without the attested read; `source: "keeper"`; the Feed labels these positions "keeper-attested".
- Settle preimage (v2) = the v1 preimage + `|kind=PRELIQ` (or `|kind=SELF` for Profit-Lock), signed with the position's own path:
  `NECTAR_SETTLE_V1|chain=solana-devnet|program=<vault>|pos=<id>|quote=<qid>|repay_e6=<n>|seize_units=<n>|recipient=<b58>|nonce=<n>|expires=<unix_s>|kind=PRELIQ`
- `request_remote_release(position_id)` (anyone, after debt = 0): `remote.status = "Releasing"`; signs
  `NECTAR_RELEASE_V1|chain=solana-devnet|vault=<vault>|pos=<id>|recipient=<depositor b58>|nonce=<n>|expires=<unix_s>` (raw bytes, Eddsa, domain 1,
  1 yocto). It stores `PendingRelease{message, signature_hex, nonce, expires}` (view `get_pending_release(position_id)`) and emits `remote_release_signed`.
- Nonces come from one contract-wide counter shared by settle and release.
### Solana `nectar_vault` (WO-14; Anchor 0.32.1)
- `init_vault(symbol: String, mint)` creates a vault PDA plus a token account owned by the program. No global authority.
- `open_position(position_id: u64, authority: [u8;32], amount: u64)`: the depositor signs and transfers the SPL tokens. It creates the position PDA
  `[b"pos", vault, position_id.to_le_bytes()]` with `{authority, depositor, amount, status}`. The authority comes from NEAR's `derived_public_key` (v2) or is the
  v1 single-path key; the program does not care which.
- `settle(position_id, quote_id, repay_e6: u64, seize_units: u64, recipient: Pubkey, nonce: u64, expires: i64, kind: u8)`: kind 0 = v1 legacy preimage
  (no `|kind=` suffix, which lets G7 run against the live v1 if the v2 deploy is blocked), 1 = PRELIQ, 2 = SELF. It requires the **previous** instruction to be the Ed25519
  program over the rebuilt preimage bytes with `position.authority` (F-082: num=1, the three indexes = u16::MAX, byte-compare pubkey/sig/msg). It also
  requires `expires > now` and an unused nonce (nonce PDA `[b"nonce", vault, nonce.to_le_bytes()]`, init fails if it exists). It then pays
  `seize_units` to the recipient's ATA and the remainder to the depositor, and closes the position.
- `release(position_id, nonce: u64, expires: i64)`: the same verification over the rebuilt `NECTAR_RELEASE_V1` with `recipient = position.depositor`. It pays all
  units to the depositor and closes the position. **`cancel_position` does not exist.**
- **v2 switch (WO-20 accepted):** point `accounts.core` at `nectar-core-v2.nectar.testnet`; web/sdk detect v2 via `contract_version()`. Unconfirmed until G1b: v2 event field names other than `referrer_paid`, pay_to memo cap 256 chars.
- Program id: base58, written to `packages/config/config.yaml` `solana.vault_program` by the deploy script.
### Keeper (WO-16, after WO-14 merges; delta after WO-21)
On `settlement_signed` / `remote_release_signed` it builds `[Ed25519 verify ix (F-082 bytes by hand, F-186), settle|release ix]`, sends it to devnet with the
keeper fee-payer keypair (path in `.env`), confirms, then calls `relay_settlement_result`. It is idempotent on restart. Delta: after `remote_reserved`, it watches the
vault for the position PDA and calls `confirm_remote_deposit`.

## C. Position Notes (WO-22, merged)
Token ids `q-<quote_id>`, `p-<position_id>` (`r-<collateral>-<n>` reserved for WO-23b). Owner = `Quote.buyer` / `Position.borrower` (a transfer rewrites it).
Views: NEP-171 `nft_token`, NEP-181 `nft_tokens` / `nft_tokens_for_owner` / `nft_total_supply` (pages capped at 20), `nft_token_svg(token_id) -> String`,
`nft_transfer_locked(token_id) -> bool`. Calls: `nft_transfer`, `nft_transfer_call`, `set_quote_remote_recipient(quote_id, recipient?)` (Note owner;
refused while locked). Events: NEP-297 standard "nep171" `nft_mint` / `nft_transfer`; nectar `quote_remote_recipient_cleared` / `_set`.

## D. Base spoke (P2b, D-026)
- Remote chain `{chain_id:"base-sepolia", vault_program:<0x vault address>, mpc_domain_id:0}` per collateral (a second remote chain per symbol is a list
  or a separate symbol `NVDAx-base`; contract agent picks the smaller change and reports it). Path `base-sepolia/pos/<id>`. Authority = 0x address =
  last 20 bytes of keccak256(x‖y) of `derived_public_key(path, predecessor core, domain_id 0)` (`secp256k1:<b58 64 B>`, F-338/F-339).
- EIP-712 domain `{name:"NectarVault", version:"1", chainId:84532, verifyingContract:<vault>}`. Types:
  `Settle(uint64 positionId,uint64 quoteId,uint256 repayE6,uint256 seizeRaw,address recipient,uint64 nonce,uint64 expires,uint8 kind)` (kind 1 PRELIQ, 2 SELF)
  `Release(uint64 positionId,address recipient,uint64 nonce,uint64 expires)`. Digest built on-chain in nectar-core with `env::keccak256_array` (F-339);
  `sign({path, payload_v2:{Ecdsa:<64 hex digest>}, domain_id:0})`, 1 yocto (F-330/F-331). Response `{scheme:"Secp256k1", big_r:{affine_point:<66 hex>},
  s:{scalar:<64 hex>}, recovery_id}` (F-332) → stored; r = affine_point[2..66] (x), v = 27 + recovery_id. Pending views return `{digest, r, s, v, typed fields}`.
- Quote recipient: a `0x…` 40-hex `buyer_remote_recipient` can fill Base positions; a base58 one fills Solana positions.
- `NectarVaultBase.sol`: `openPosition(uint64 id, address authority, uint256 amount)` (depositor = msg.sender, `transferFrom`), `settle(Settle, uint8 v,
  bytes32 r, bytes32 s)`, `release(Release, uint8 v, bytes32 r, bytes32 s)`; checks `ecrecover(digest) == positions[id].authority`, nonce unused, not expired,
  low-s (reject s > n/2 unless the contract normalises; test both), and `PolicyRegistry.isAuthorized(policyId, recipient)` before the transfer; view
  `positions(id) → (authority, depositor, amount, status)` for vault_read.
- Keeper: viem on 84532 (RPC from config `base.rpc_url`), Foundry keystore account (never --private-key), relays settle/release, then `relay_settlement_result`
  / `relay_release_result`; ERC-8021 suffix appended only when `BASE_BUILDER_CODE` is set (H19).

## E. Security fix wave (D-027; findings in docs/work/security-review-v7.md) — binding for contract, solana, evm, keeper, quoter, web
**Depositor commitment (SR-8).** `reserve_remote_position(…, chain?, depositor: String)` — the borrower's remote address (Solana base58 32-byte
on-curve key, or EVM 0x address ≠ zero). Stored in a NEW raw-key map (code-only upgrade; no change to existing structs), exposed as
`get_position(id).remote.committed_depositor`. `on_deposit_verified` / `keeper_attest_deposit` require depositor == committed. OutLayer `vault_read`
input gains `"depositor"`.
**Solana vault v2 layout (program upgrade in place; no open positions).**
- Position PDA `[b"pos", vault, position_id.to_le_bytes(), depositor]` (SR-8).
- Nonce PDA `[b"nonce", position.key(), nonce.to_le_bytes()]` (SR-1; amended 2026-11-11: scoped to the depositor-bound slot, not the authority — with authority scope an attacker could open the same id with NEAR's public authority under its own wallet and relay NEAR's signature there, burning the honest slot's nonce). `NonceRecord` v2 = disc · `version u8 (=2)` · `vault Pubkey` ·
  `authority [u8;32]` · `nonce u64` · `position_id u64` · `op u8` (0 settle, 1 release) · `kind u8`. The keeper validates owner = program, length,
  discriminator and every field (SR-2).
- Payouts never depend on an account a third party controls (SR-4): settle pays `seize_units` to the recipient's ATA when that account is valid
  (owner = recipient, mint, not frozen, no transfer-blocking extension); otherwise it records a program-owned `Claim` PDA `[b"claim", vault, recipient]`
  (recipient-signed `claim`). The remainder (and the whole amount on release) is recorded on the position as `withdrawable`, and the depositor signs
  `withdraw(position_id)` to ANY token account of the mint. The position closes when withdrawn. Settle and release still verify the Ed25519 ix exactly as now.
  The solana agent publishes discriminators, account orders and byte layouts in solana/deploy.md.
**EVM vault (redeploy on the fork).** `nonceUsed[slotKey][nonce]` where `slotKey = keccak256(abi.encode(id, depositor))` (SR-1, same amendment). Slots keyed `keccak256(abi.encode(id, depositor))` with depositor = msg.sender
at `openPosition` (SR-8). `settle`/`release` take an extra `depositor` argument; the signer must equal that slot's authority (the typed data and NEAR's
digest are UNCHANGED). View `positionOf(uint64 id, address depositor)`. Expiry valid while `block.timestamp < expires` (SR-30, aligns with NEAR/Solana).
Phantom-token guard per the review's lost finding (keep B20 precompile tokens working: they have no code, F-347).
**Contract (code-only upgrade → 2.2.0-v7).** SR-3: a fresh-nonce re-sign of the identical leg once `now >= expires` and unrelayed (no blind rollback).
SR-5: remote sizing excludes R_c/D_c, uses fitting non-exiting quotes, and caps at the largest single fitting quote remaining while settle is single-leg;
settlement filters by recipient fit BEFORE the 8-candidate truncation. SR-7: recipient validity (Solana on-curve 32-byte; EVM non-zero; reject otherwise
at funding and at `set_quote_remote_recipient`). SR-10: rounding-tolerant remote leg check. SR-17: a claim path for `owed_collateral`. SR-18: record a
short deposit so it can be released.
**Keeper.** New PDAs (depositor in position seeds; nonce seeds = position PDA + nonce), SR-2 strict nonce-record and tx validation (a leg counts as landed only if the tx touched the slot `["pos", vault, id, committed_depositor]`), SR-11 (compare against
`remote.reserved_units`), SR-12/SR-31 (vault program + mint pinned from config by default; refuse mismatches), SR-29 (log scan from the reservation block,
not the last 10k), EVM `positionOf(id, depositor)` + extra `depositor` arg.
