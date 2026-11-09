---
title: Post quotes programmatically
slug: /integrate/post-quotes
description: Fund a Pappus quote with one ft_transfer_call.
---
# Post quotes programmatically

<p className="verified">Verified against: F-013 (2026-11-09), F-018 (2026-11-10) · docs/work/interface-p0.md (2026-11-10) · D-009 (2026-11-10)</p>
<p className="status">Status: deployed on testnet 2026-11-09 (G2 verification pending). Core `nectar-core.nectar.testnet`, mock USDC `usdc-mock.nectar.testnet`. Whether the mock token needs storage registration first is confirmed at G2.</p>

A quote is funded by sending mock USDC to `nectar-core` with `ft_transfer_call` and a `FundPappusQuote` message. NEP-141 requires exactly 1 yoctoNEAR attached (F-013).

```bash
near contract call-function as-transaction <usdc_mock> ft_transfer_call \
  json-args '{"receiver_id":"<nectar_core>","amount":"50000000000","msg":"{\"FundPappusQuote\":{\"collateral\":\"NVDAx\",\"max_discount_bps\":250,\"notice_period_ns\":\"604800000000000\",\"buyer_remote_recipient\":null}}"}' \
  prepaid-gas '100 Tgas' attached-deposit '0.000000000000000000000001 NEAR' \
  sign-as <buyer> network-config testnet sign-with-keychain send
```

- `amount` is $50,000 with 6 decimals. The minimum is $100.
- `notice_period_ns` is 7 days in nanoseconds, the minimum allowed (D-009).
- The deposit `0.000000000000000000000001 NEAR` is 1 yoctoNEAR, written in the `<x> NEAR` form F-018 documents.
- If any rule fails, the contract returns the full amount and the token refunds you (F-013).

## Check it

```bash
near contract call-function as-read-only <nectar_core> list_quotes json-args '{"symbol":"NVDAx","from_index":0,"limit":16}' network-config testnet now
```

## Manage it

`claim_fees`, `initiate_quote_withdrawal` and `complete_quote_withdrawal` each take `quote_id` and 1 yoctoNEAR. See [Notice periods](/concepts/notice-periods).
