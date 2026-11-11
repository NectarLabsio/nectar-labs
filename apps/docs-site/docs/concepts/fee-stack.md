---
title: Fee stack and referrals
slug: /concepts/fee-stack
description: Every fee a borrower pays, who receives it, and how a registered referrer earns half the origination fee.
---
# Fee stack and referrals

<p className="verified">Verified against: spec docs/PRD.md §4.3, §4.11 · docs/work/interface-v7.md §A4, §A5, §A6 · packages/config/config.yaml (`limit_premium_bps`, `fee_split`, `keeper_fee_bps`, `v7.origination_fee_bps`) · D-018, D-024 (2026-11-10) · contracts/nectar-core/src/shields.rs, src/reserve.rs · tests listed below (evidence/wo-21/cargo-test.log, 2026-11-10) · testnet: docs/EVIDENCE.md §G14 (2026-11-10T16:52Z), §v7 module runs (2026-11-10T17:20Z, 2bf99e1)</p>
<p className="status">Status: the 30 bps origination fee is live on testnet (EVIDENCE §G14: borrow tx GcHF75nW… opened position #4 for $10 with a $0.03 fee). Registered referrers and <code>pay_to</code> are built and tested in the sandbox; their product flags are off and they have no testnet run. The limit premium and keeper fee are live (G2; G7 v7 on nectar-core-v2). The Shield fee and the Profit-Lock fee ran on testnet on 2026-11-10 (EVIDENCE §v7 module runs: `get_shield` on position 5 shows 15 bps, $0.2835; the Profit-Lock state is checked, its `self_settled` event is not chain-confirmed). No settlement has paid the Reserve share on testnet.</p>

## The stack (testnet defaults)

| Fee | Charged on | Default | Paid to | State |
| --- | --- | --- | --- | --- |
| Limit premium | the part of a borrow above `base_ltv_bps × V` | 300 bps, up front from proceeds | 70% buyers, 20% lenders, 10% treasury (`fee_split`); in v2 the buyers' share is split between quotes and the Reserve as `Q_c : R_c` | live in v1; Reserve split v2, sandbox |
| Origination | the full borrow, rounded up | 30 bps (owner may set 0–100) | 50% to a registered referrer, the rest to treasury; all to treasury without one | v2, sandbox |
| Keeper | the repay amount at settlement | `keeper_fee_bps` = 50 | the keeper | live in v1 |
| Shield fee (replaces the premium) | the full borrow | 15 bps weekend, 25 bps event (owner may set 0–1,000) | same split as the premium | v2, sandbox ([Shields](/concepts/shields)) |
| Profit-Lock | debt repaid | 50 bps, fixed | treasury | v2, sandbox ([Profit-Lock](/concepts/profit-lock)) |

PRD §4.11 sends 70% of the premium to "buyers and Reserve". On the live v1 contract that share goes to quotes only. In v2 it is split `floor(buyers × Q_c / (Q_c + R_c))` to quotes and the rest to the [Nectar Reserve](/concepts/nectar-reserve) (`math::split_premium_qr`); if `Q_c + R_c` is 0 it goes to treasury so no USDC is orphaned. `get_fee_stack(symbol?)` returns every row above.

Net proceeds on v2 = borrow − limit premium − origination fee. `preview_borrow(symbol, units, borrow_usd_e6, referrer?)` returns `origination_fee_usd_e6`, `referrer_share_usd_e6`, `total_fees_usd_e6` and `net_proceeds_usd_e6`, so a client can show every fee before a wallet opens.

## Referrals

- The owner registers referrers on testnet: `register_referrer(account_id)`, `unregister_referrer(account_id)`, view `is_referrer(account_id)`.
- A borrow names one in its message (`referrer`). If it is registered, half the origination fee is credited to `claimable_usdc[referrer]` and the event `referrer_paid{referrer, position_id, amount_usd_e6}` is emitted.
- An unregistered referrer is not an error: the whole fee goes to treasury.
- `referrer == borrower` is refused before any state change, and the deposit is returned in full (`reason: "referrer_is_borrower"`).
- A borrower who refers himself through a second account gets 15 bps back. That is accepted and capped by the fee itself, not prevented (PRD §4.11).

Agents can use this. The Feed MCP tool `open_protected_stock_loan` takes `referrer` and refuses `referrer == account_id` before it reads any view ([Agent skill and x402](../integrate/agent-skill-x402.md)).

## Payable credit and claimable USDC

A borrow may carry `pay_to: {receiver_id, memo?}`. Net proceeds then go to that account (with `memo` on `ft_transfer`) instead of the borrower. If the transfer fails, the amount is credited to `claimable_usdc[borrower]` and `pay_to_failed` is emitted. `withdraw_claimable()` (1 yoctoNEAR) pays out all of the caller's claimable USDC, both referral earnings and failed `pay_to` proceeds. View: `get_claimable(account_id)`.

## Tests

- `tests_v7::registered_referrer_gets_half_the_origination_fee`, `tests_v7::unregistered_referrer_fee_goes_to_treasury`
- `tests_v7::referrer_equal_to_borrower_refused_with_full_refund`, `tests_v7::referrer_registry`, `register_referrer_owner_only`, `unregister_referrer_owner_only`
- `tests_v7::preview_with_registered_referrer_returns_fee_stack`
- `tests_v7::set_origination_fee_bps_bounds`, `set_origination_fee_bps_above_100_refused`, `set_origination_fee_bps_owner_only`
- `tests_v7::pay_to_failure_credits_borrower_claimable_then_withdraw`, `pay_to_memo_too_long_refunds`, `withdraw_claimable_requires_one_yocto`, `withdraw_claimable_nothing`, `get_claimable_default_zero`
- `math::tests::increase_bound_and_origination`, `math::tests::fee_index_matches_reference_loop`
- sandbox `pay_to_claimable_and_referrers` (contracts/nectar-core/tests/sandbox_v7.rs)
- Shield fee, Profit-Lock fee and Reserve split: `tests_v7b::fee_stack_view`, `tests_reserve::v7_reserve_premium_split_q_to_r_and_realised_apr`; tests on [Shields](/concepts/shields), [Profit-Lock](/concepts/profit-lock) and [Nectar Reserve](/concepts/nectar-reserve)
