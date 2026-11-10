# WO-26d — web — reconcile Reserve + v2 shapes with the merged contract (< 1 h; commit `fix(web): reconcile reserve views with v2`)
The contract (WO-23b, merged 67a5426) removed `set_reserve` and `nectar_reserve_usd_e6` (R_c is now the Reserve pool: `usdc_e6 − notice_usdc_e6`).
It adds `get_reserve(symbol)` / `get_reserve_note(note_id)` plus the events `reserve_joined/exiting/exited`, `settled_reserve`, `reserve_params_set`. Read the exact
JSON shapes from `contracts/nectar-core/src/reserve.rs` and `types.rs`.
1. packages/sdk: make `ReserveView`/`ReserveNoteView` match the contract exactly. Remove the `setReserve` builder and the `nectar_reserve_usd_e6` input (keep reading it
   from v1 views for the live v1 contract). Add `set_reserve_params{symbol, discount_bps, notice_ns?}` to the owner builders.
2. apps/web: the /reserve page and the Notes RESERVE type use the real shapes. Label the return "realised fee APR (trailing 7 days)" (D-024). The console's
   v2 Reserve card calls `set_reserve_params`; the v1 console path keeps `set_reserve` only for v1.
3. Regenerate the e2e v2 fixtures from the real shapes. Build + e2e (PW_CHANNEL=chrome) + sdk tests green. Write only apps/web, packages/ui, packages/sdk.
Report ≤ 15 lines.
