# WO-23b — contract — Nectar Reserve (R_c) (< 2 h; commit `feat(contract): v7 nectar reserve`)
Read first: PRD v7 §4.8, §6.11 (Reserve rows), interface-v7 §C (Notes: Reserve Notes use `r-<collateral>-<n>`), D-023. Write only contracts/.
1. `ft_on_transfer` `JoinNectarReserve{collateral}`: USDC only, ≥ 10,000,000 e6. It mints shares against `reserve.usdc_e6` (first deposit 1:1) and mints a Reserve Note
   `r-<collateral>-<n>` holding the shares. `CollateralConfig.reserve: {shares, usdc_e6, units, discount_bps, acc_fee_per_share_e18, acc_units_per_share_e18}`.
2. **R_c = `reserve.usdc_e6` − USDC of shares in notice.** It replaces the owner-set `nectar_reserve_usd_e6` in every limit, view and the aggregate check.
   Keep the owner setter only if v1 tests need it; otherwise remove it and say so.
3. Fees: the buyer share of every premium (and shield fee) is split between quotes and the Reserve in proportion to Q_c : R_c. The Reserve part accrues to
   `acc_fee_per_share_e18`.
4. Settlement waterfall: Pappus quotes by ascending discount, then the Reserve at `reserve_discount_bps` (owner `set_reserve_params{discount_bps}`, which must exceed
   every live quote ceiling: refuse a value ≤ the highest max_discount_bps). If the shortfall still remains, the position stays Settling.
   - Seized units accrue through `acc_units_per_share_e18`.
   - Each note has a `unit_debt` and a `fee_debt` (late depositors get nothing from earlier fills).
   - NEAR-held collateral only; remote positions never fill from the Reserve (PROD).
5. Exit: `initiate_reserve_exit(note_id)` (Note owner; the shares leave R_c at once); `complete_reserve_exit(note_id)` after 7 days pays the USDC share value,
   claimable units (ft_transfer of the collateral) and fees. Callbacks restore state on transfer failure. Note transfer is refused while in notice? No: allowed
   (the claim moves with the Note) but refused during a settlement that is filling from the Reserve.
6. Views: `get_reserve(symbol)` (incl. realised trailing 7-day APR from fee accruals — store a small ring of daily fee totals; never a promised rate),
   `get_reserve_note(note_id)`. Events: `reserve_joined`, `reserve_exiting`, `reserve_exited`.
Tests: unit tests for every panic path. Sandbox: the Reserve fills only after every quote; a late depositor gets no earlier units or fees; exit after notice pays
the exact amounts; $9.99 refused; a Note transfer moves the claim. `tests/model.py` gains Reserve rows (`--v7` flag per gates-v7: `python3 tests/model.py --check --v7`
must work). Gas < 100 Tgas each. Report ≤ 20 lines (tests, gas, wasm size).
