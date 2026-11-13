# WO-23a — contract — Shields, Profit-Lock, fee stack, reservation deposit, OutLayer job hooks (< 2 h; commit `feat(contract): v7 shields and profit-lock`)
Read first: PRD v7 §4.9, §4.10, §4.11, §6.11 (only), `docs/process/work/interface-v7.md`, and the merged v2 code (WO-19 + WO-21). Write only contracts/.
1. **Shields (§4.9).** `LockCollateralAndBorrow` and `reserve_remote_position` accept `shield: {kind: "Weekend"|"Event", window_end_ns}`.
   - Sizing ignores the session: h = weekend haircut and D_c = 0 from the start.
   - A flat `shield_fee_bps` (owner `set_shield_params{weekend_fee_bps:15, event_fee_bps:25, event_window_end_ns}`) replaces the limit premium, with the same split.
   - Weekend windows end at the next calendar window open and are at most 65.5 h; event windows are at most 72 h and must not end after the curator's `event_window_end_ns`.
   - Inside the window, only committed-buyer settlement is allowed (no DEX route; P0 has none anyway, so record the window in the position and expose it).
   - Testnet minimum $5; at most 5 Shield opens per account per UTC day. Event `shield_opened`. `Position.shield: Option<Shield>`.
2. **Profit-Lock (§4.10).** `FundPappusQuote{…, accepts_voluntary_fills: bool}`. `self_settle(position_id)` (borrower; Note owner after WO-22):
   - requires health ≥ 1 and no `ca_pending`;
   - fills only from opted-in quotes in ascending discount, under `max_voluntary_fill_usd_e6_per_day` per asset (owner-set; daily counter resets at UTC day);
   - `Q_repaid = debt·(1+f_pl)·10^d / (P·M/1e18·(1−δ))`, rounded against the borrower; f_pl = 50 bps to treasury; the remainder stays with the borrower debt-free.
   - NEAR-held positions settle on NEAR. Remote positions sign the settle preimage with `|kind=SELF`.
   - Event `self_settled`. View `preview_self_settle(position_id)`.
3. **Fee stack (§4.11)** constants + `get_fee_stack()` view: premium, shield weekend/event, origination, profit-lock, keeper.
4. **Reservation spam (WO-21 open question 3).** `reserve_remote_position` becomes payable and requires `RESERVE_DEPOSIT = 0.05 NEAR`. The deposit is refunded on confirm,
   on expiry (to the borrower) or on a refused loan. Attaching less than the deposit is refused.
5. **OutLayer job hooks (for WO-24).** `request_session_check(symbol)` (anyone; 60 s cooldown) → OutLayer `{"job":"calendar",…}` → a callback that may only
   set `forced_closed = true` (never open; `force_closed:false` is ignored). `request_multiplier_read(symbol)` (anyone; cooldown) → `{"job":"multiplier",…}`
   → callback that applies `set_multiplier` bounds (≤ +5%, increase only; otherwise records `ca_suggested` and emits an event for the owner).
   Use the same OutLayer config/deposit path as vault_read. Owner `set_job_config(job, project/version)` if needed.
Tests: unit tests for every panic path. Sandbox:
- a shield sized at weekend parameters while in session, its fee replacing the premium, and the 6th open in a day refused;
- self-settle refused without opted-in capacity, above the daily cap, or with health < 1, and the happy path with exact units kept;
- the reservation deposit refunded on confirm and on expiry;
- a calendar job that cannot open a session; the multiplier job bounded.
Gas < 100 Tgas each (record). `tests/model.py`: add shield and self-settle rows. Report ≤ 20 lines.
