# WO-19 — contract — v7 P0 delta → nectar-core v2 layout (< 2 h; one commit `feat(contract): v7 P0 delta`)
Read first: `docs/process/work/interface-v7.md` §A (exact names; binding), PRD v7 §4.2, §4.6, §4.7, §4.11, §6.11 (only those sections), D-017, D-018.
Target: `nectar-core-v2.nectar.testnet`, a **fresh deploy with `new`** (no migrate, PRD §6.11). Introduce a V2 root state (versioned borsh). You may fold
the v1 raw-storage-key fields (quoter secrets ref, `__p2_*`) into the V2 root if that is cheap; otherwise keep them. v1 stays live and is not upgraded again.
contract_version() returns "2.0.0-v7".

Build:
1. Aggregate debt: `total_debt_usd_e6`, the two-sided check, updated on borrow, repay and settlement (A1). Nothing calls DEX depth R_c.
2. Weekend guard (A2): `session_calendar`, `set_session_calendar`, `force_session_closed`, `session_open` and `session_reason`, failing closed. Remove the
   owner `market_session_open` flag from v2 (the setter is gone; the view field is replaced by the computed one).
3. Multiplier (A3): fields, `set_multiplier` (increase ≤ +5%), `announce_corporate_action` (≥ 1 h ahead), `apply_corporate_action` (anyone, after
   the effective time; rescales the Underlying price, band reference reset), borrows refused while `ca_pending`, `entry_multiplier_e18` on Position.
   Valuation `units·M/1e18·price/10^d` (Underlying) everywhere V is computed, including health and settlement seize maths.
   mock-ft: `multiplier()` view + owner `update_multiplier`, stored under a raw key (live mocks take a code-only upgrade).
4. `pay_to` + `claimable_usdc` + `withdraw_claimable` + `get_claimable` (A4).
5. Referrers + origination fee (A5).
6. Views and events per A6. `preview_borrow` accepts optional `referrer` and returns the fee stack.
7. Reserved fields (present, unused): `weekend_ref_price_e6`, `weekend_ref_updated_ns`, `nectar_reserve_usd_e6` stays (R_c, 0 until WO-23b).

Tests (G1 additions, each in `tests/sandbox*.rs` against the real mock-ft; unit tests for every new panic path):
- two borrowers cannot both draw the full aggregate capacity; repay frees headroom; settlement reduces total debt;
- a price older than 900 s flips the asset to weekend parameters (D_c = 0, weekend haircut); an empty calendar means closed; forced closed; `false` cannot open
  outside a window;
- multiplier: +5% accepted, +5.01% refused, a decrease without an announcement refused, an announcement < 1 h refused, borrow refused while pending,
  a 2-for-1 split (M ×2, price ÷2 via apply) leaves LTV and V unchanged;
- `pay_to` to an account not registered on usdc-mock → `claimable_usdc[borrower]`, then `withdraw_claimable` pays it;
- referrer == borrower refused with the full refund; a registered referrer gets half the origination fee in claimable; an unregistered referrer → treasury;
- every v1 test still green (adapt it to the v2 layout; do not delete coverage).
`tests/model.py` + `model.csv`: add aggregate-debt and multiplier cases; views must match within 1 unit.
Gas: record per new method (all < 100 Tgas) in your report.
Run `cargo near build non-reproducible-wasm`, `cargo test -p nectar-core`, and the sandbox tests; pipe through `tail -n 40`.
Out of scope (later WOs, do not start them): remote lifecycle (WO-21), Shields/Profit-Lock (WO-23a), Notes (WO-22), Reserve (WO-23b).
Report ≤ 20 lines: changes, test counts, gas, wasm size, anything that contradicts FACTS or interface-v7.
