# WO-26b — web — /shield + Profit-Lock UI (< 2 h; commit `feat(web): shields and profit-lock screens`)
Read first: PRD v7 §4.9, §4.10, §12.1 (/shield, /position additions only), the merged contract (WO-23a): `preview_borrow(…, shield)`,
`get_shield`, `get_shield_opens_today`, `get_fee_stack`, `preview_self_settle`, `self_settle` (1 yocto), `FundPappusQuote.accepts_voluntary_fills`.
Write only apps/web, packages/ui, packages/sdk. Gate on v2 + `features.shields` / `features.profit_lock` (false today); E2E uses mocked v2 views.
1. `/shield`: Weekend and Event cards. Each card shows:
   - the amount (from $5) and a window countdown to the next calendar open (Monday 09:30 New York; from `get_session_calendar`);
   - the shield fee, the weekend limit and the committed backing, with the copy "sized at the weekend limit even while the market is open" and "a weekend-safe
     limit with committed buyers behind it" (never "insurance");
   - opens left today (5/day);
   - a testnet "Get demo NVDAx" faucet link beside the dry quote (label it as a testnet mock mint; a link only, no auto-mint).
2. `/position/[id]`: Profit-Lock panel (`preview_self_settle`: units sold, discount, units kept, 50 bps fee, daily cap left) → sign modal → `self_settle`.
   Disabled with a reason when health < 1, a CA is pending or there is no opted-in capacity.
3. `/quote/new`: an "Accept voluntary fills (Profit-Lock)" checkbox → `accepts_voluntary_fills`.
4. Landing: the Shield cards section is behind `data-feature="shields"` (already present from WO-20; wire it to the real components if needed).
Acceptance: build, e2e (PW_CHANNEL=chrome) and sdk tests green; axe clean; no horizontal scroll at 400 px. Do not commit regenerated evidence/ screenshots.
Report ≤ 20 lines.
