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
- `confirm_remote_deposit(position_id)` (anyone; the keeper key is allowed): calls OutLayer `vault_read` (WO-24 job; sandbox uses the stub). `on_deposit_verified`
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
- Program id: base58, written to `packages/config/config.yaml` `solana.vault_program` by the deploy script.
### Keeper (WO-16, after WO-14 merges; delta after WO-21)
On `settlement_signed` / `remote_release_signed` it builds `[Ed25519 verify ix (F-082 bytes by hand, F-186), settle|release ix]`, sends it to devnet with the
keeper fee-payer keypair (path in `.env`), confirms, then calls `relay_settlement_result`. It is idempotent on restart. Delta: after `remote_reserved`, it watches the
vault for the position PDA and calls `confirm_remote_deposit`.
