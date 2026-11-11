# G7 re-run after the D-027 security rollout — 2026-11-11 07:08–07:50Z (nectar-core-v2 2.2.0 → 2.2.1-v7, Solana vault v2, quoter 5f9bb287)
- Position 8 (2.2.0): OutLayer-attested deposit proven, loan refused `aggregate_limit` (SR-5 regression, fixed in WO-36c → 2.2.1); reservation deposit refunded; signed release relayed
  (keeper, Solana tx 4rn4VdeK…); depositor `withdraw` returned 3 NVDAx (4.45402 → 7.45402); slot closed.
- Position 9 (2.2.1, release path): authority = derived_public_key(solana-devnet/pos/9) (check-9.log); deposit → OutLayer confirm → paid $364.695480; repay $370.44 → release signed → relayed → withdraw.
- Position 10 (2.2.1, settle path): authority match; paid $364.695480; owner price 180 → 160 (disclosed demo control) → LTV 7718 > 7500 → keeper trigger → TEE quoter → MPC Ed25519 sign
  `NECTAR_SETTLE_V1|…|pos=10|quote=2|repay_e6=370440000|seize_units=2386856|recipient=FtWQZk7K…|nonce=9|…|kind=PRELIQ` → relayed; recipient +2.386856 NVDAx (= 370.44 / (160 × 0.97)),
  depositor withdrew the 0.613144 remainder; position Closed. Logs in this folder; Solana tx signatures redacted in logs (public; recoverable from get_pending_* views).
