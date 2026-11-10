# v7 module testnet runs on nectar-core-v2 — 2026-11-10 ~17:05Z (scripts/61-v7-modules-testnet.sh; owner price $150, disclosed demo control)
- Profit-Lock: self_settle(position 0) by borrower1 — preview legs [{quote 1, 250 bps, fill $4,522.50, 30.923077 NVDAx}], fee $22.50 (50 bps) →
  event self_settled {debt_repaid $4,500, units_repaid 30.923077, units kept by the borrower}; daily cap $5,000 (used $4,522.50).
- Reserve: buyer2 JoinNectarReserve $10 → nft_mint r-NVDAx-0, reserve_joined {shares 10,000,000}; get_reserve r_usd_e6 10,000,000, discount 600, notice 7 d.
- Shield: first attempt refused by the aggregate check (weekend-sized capacity below drawn debt — correct); buyer2 funded quote #3 ($5,000 @ 450 bps);
  Weekend Shield opened = position 5 {2 NVDAx, debt $189, window_end_ns 1794407400000000000 = next NYSE open, fee 15 bps $0.2835 replacing the premium}, Note p-5.
- Notes: every quote/position/reserve deposit minted a Note on testnet (q-0…q-3, p-0…p-5, r-NVDAx-0).
