# WO-71 step 1 — nectar-core v1 (1.0.0) vs v2 (2.0.0) event fields, against what services/feed reads

Written 2026-11-13, before any services/feed code change.

Sources:
- v2 emits: `contracts/nectar-core/src/*.rs` at HEAD edc0bd5 (`events.rs:8` VERSION "2.0.0"); every `emit("<name>", json!({..}))` call
  listed with a parser over all non-test files.
- v1 emits: the same files at c7fa925^ (the last commit with VERSION "1.0.0"; c7fa925 "v7 P0 delta" bumped it).
- Feed reads: `services/feed/src/events.ts` (`NECTAR_EVENTS`, `parseEventLog`), `db.ts` `apply()` case arms and their `str()`/`num()`
  reads. `api.ts` REST + `exportCsv` and `mcp.ts` read only the `quotes` / `settlements` / `asset_snapshots` tables. The CSV columns
  come from `get_exit_capacity` view snapshots, not from events. So the event fields that reach users are the `apply()` reads below.
- Real v2 lines: archival-rpc.testnet.fastnear.com `tx` (wait_until FINAL), fetched 2026-11-13. They are copied into
  `services/feed/test/fixtures/nectar-core-v2-events.json`.

`str()` takes a JSON string or a finite number. `num()` takes a number or a decimal-digit string. U64/U128 serialise as JSON strings,
u16/u32 as numbers, and that holds in both versions.

## A. Events the Feed applies (db.ts case arms)

| Event | v1 fields read by the Feed | v2 fields emitted (file:line) | Difference | Feed action |
| --- | --- | --- | --- | --- |
| quote_funded | quote_id (U64 str), collateral (str), amount_usd_e6 (U128 str), max_discount_bps (u16 num) | quote_id, buyer, collateral, amount_usd_e6, max_discount_bps, **accepts_voluntary_fills** (bool) — lib.rs:539 | new: `accepts_voluntary_fills` (not read). Read fields: same names, same types | none. Real: 7XGiZJKg… → quote 0, NVDAx, 5000000000, 400 |
| quote_topped_up | quote_id, amount_usd_e6 | quote_id, amount_usd_e6 — lib.rs:585 | identical | none |
| quote_exiting | quote_id | quote_id (U64), unlock_ns — lib.rs:1519 | identical | none |
| quote_withdrawn | quote_id | quote_id, principal_usd_e6, fees_usd_e6 — lib.rs:1539 | identical | none |
| position_opened | position_id (U64 str), collateral (str) | position_id, borrower, collateral, units, debt_usd_e6, premium_usd_e6, **origination_fee_usd_e6, net_proceeds_usd_e6, pay_to, referrer, remote** — lib.rs:720 (one emitter, also used for remote positions on deposit confirmation) | new: 5 fields (not read). Read fields identical | none. Real: EeZmHGNs… (local, pos 0) and 8XXvnBVN… (remote:true, pos 2) |
| preliq_triggered | position_id | position_id, keeper — lib.rs:1587, :1593 | identical | none. Real: HrpQsuMW… (pos 3) |
| settled_near | position_id, quote_id, disc_bps (u16 num), repay_usd_e6, seize_units (+ batch receipt id, tx hash, height) | position_id, quote_id, disc_bps, repay_usd_e6, seize_units, buyer, **dust_usd_e6** — lib.rs:1048 | new: `dust_usd_e6` (not read). Read fields identical | none. **No real v2 line exists**: the settled_near runs in EVIDENCE (A–D) are on v1 nectar-core. The only v2 settlement (pos 3, HrpQsuMW…) is remote and takes the `settle()` remote branch (lib.rs:945) → `settlement_sign_requested`. The test uses a line built from the lib.rs:1048 shape |

## B. Events the Feed stores but does not apply (in NECTAR_EVENTS, no case arm; they count toward events_indexed)

| Event | v1 fields | v2 fields emitted | Difference | Feed action |
| --- | --- | --- | --- | --- |
| liquidity_supplied | account, amount_usd_e6 | same — lib.rs:472 | identical | store only |
| fees_claimed | quote_id, amount_usd_e6 | same — lib.rs:1566 | identical | store only |
| repaid | position_id, amount_usd_e6, remaining_debt_usd_e6 | same — lib.rs:847, :1657 | identical names/types. Semantics: a remote position stays Open at debt 0 (lib.rs:852) | store only. Status comes from `list_positions` views. Real: 54eukmJT… (pos 2, remaining 0) |
| oracle_updated | symbol, price_usd_e6 (owner); + source, publish_ns (Pyth) | same two shapes — lib.rs:1454, :1477, p1.rs:534 | identical | store only. Real: De6aVqqN… (NVDAx 135000000, block 277503817) |
| oracle_rejected | symbol, price_usd_e6, last_usd_e6 / symbol, position_id, reason | same two shapes — lib.rs:1444, p1.rs:528 | identical | store only |
| collateral_upserted | symbol | symbol — lib.rs:1395 | identical | store only |
| paused / unpaused | {} | {} — lib.rs:1483, :1489 | identical | store only |

**1.0.0 is kept.** For every event the Feed reads (A) and stores (B), the field names and JSON types are the same in v1 and v2. v2 only
adds fields that the Feed does not read. The Feed accepts `version` ∈ {"1.0.0", "2.0.0"}. Anything else stays `bad_version`.

## C. v2 events the Feed does not know: index or ignore

| v2 event(s) (file) | Fields | Decision | Why |
| --- | --- | --- | --- |
| **settled_reserve** (lib.rs:1060) | position_id, collateral, disc_bps, repay_usd_e6, seize_units | **INDEX** as a `settlements` row (source `event`, `quote_id` NULL) | It is a filled settlement leg, the Reserve filling at `reserve.discount_bps`. Each field maps by name onto an existing column, and the Reserve is not a quote, so `quote_id` NULL is correct, not a guess (the openapi `Settlement.quote_id` is already nullable). Without it, `/api/settlements` would leave out Reserve fills. No real line exists (no Reserve fill on testnet in EVIDENCE), so the test line uses the lib.rs:1060 shape |
| self_settled (shields.rs:320) | position_id, borrower, debt_repaid_usd_e6, fee_usd_e6, fill_usd_e6, units_repaid, units_kept, legs[], remote, status | ignore | One aggregate over several legs, with no per-leg disc_bps/seize, so it does not fit the per-leg `settlements` row. The views poller records the status change |
| bad_debt_written_off (lib.rs:1631) | position_id, collateral, debt_usd_e6 | ignore | No fill. The views poller records the Closed status |
| settlement_sign_requested / _signed / _sign_failed / _resign_requested / _resign_failed / settlement_relayed (p2.rs) | position_id, quote_id, nonce, preimage, repay_usd_e6, seize_units, path, kind, … (no disc_bps) | ignore | A remote leg is a signature request followed by a Solana/Base tx, not a fill on NEAR. Storing it as a `settlements` event row would report a request as a fill. Settling/Closed comes from views (follow-up if remote legs are wanted) |
| remote_reserved, remote_authority_set, remote_deposit_check_requested, remote_deposit_confirmed, remote_deposit_rejected, remote_loan_refused, remote_reservation_failed, remote_reservation_expired, reservation_deposit_refunded, remote_release_requested / _signed / _sign_failed / _relayed, keeper_deposit_attestation_set (remote.rs) | lifecycle before open / after close | ignore | The open is already visible: `position_opened` is emitted when the deposit is confirmed (real 8XXvnBVN…). The rest are pre-open or post-close steps with no Feed table |
| quoter_requested, quoter_result, quoter_fallback, pyth_price_requested, settlement_aborted, settlement_cancelled (lib.rs, p1.rs) | keeper/quoter internals | ignore | No Feed table. After an abort or cancel, the views poller rewrites the position status back to Open |
| referrer_paid, pay_to_failed, payout_failed, claimable_withdrawn, owed_collateral_claimed, treasury_withdrawn, lender_fees_withdrawn, liquidity_withdrawn | account-level money moves | ignore | The Feed keeps no account tables, by design (REST never returns account ids) |
| shield_opened, reserve_joined / _exiting / _exited / _epoch_closed, quote_remote_recipient_set / _cleared | module state | ignore | No Feed table. The web reads these modules through views |
| signer_config_set, remote_chain_set, extra_remote_chain_set / _removed, vault_read_config_set, job_requested / _config_set / _failed, multiplier_source_set / _updated / _read_result, corporate_action_announced / _suggested, session_forced_closed / _check_result / _calendar_set, quoter_secrets_ref_set / _pin_set / _config_set, vol_set, oracle_source_set, reserve_params_set, shield_params_set, voluntary_fill_cap_set, origination_fee_set, referrer_registered / _unregistered | owner/job config | ignore | Capacity, session and multiplier reach the Feed through `get_exit_capacity` view snapshots |
| nep171 `nft_mint` / `nft_transfer` (`emit_standard`, events.rs:24) | owner_id, token_ids | ignore (unchanged) | Foreign standard (`foreign_standard`) |

## D. Root cause and fix

`events.ts:7,34` accepted only `version === "1.0.0"`. nectar-core-v2 emits "2.0.0", so every v2 line was `bad_version`, nothing was
stored, and `events_indexed` stayed 0 on the hosted Feed. Fix: accept {"1.0.0", "2.0.0"}, add `settled_reserve` (C), leave everything
else unchanged.
