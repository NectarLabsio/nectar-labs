---
title: Notice periods
slug: /concepts/notice-periods
description: Two-step withdrawal; capacity drops at once, money leaves later.
---
# Notice periods

<p className="verified">Verified against: F-013 (2026-11-09) · spec docs/PRD.md §4.1, §6.4 · docs/work/interface-p0.md · D-009 (2026-11-10)</p>
<p className="status">Status: specification. Not deployed (G2 pending). Completion after 7 days is demonstrated in sandbox tests with time travel (G1), not live in the demo.</p>

A committed buyer cannot pull escrow at the moment it is needed most. Exit is two calls separated by the quote's `notice_period_ns`.

| Step | Method | Caller | Effect |
| --- | --- | --- | --- |
| 1 | `initiate_quote_withdrawal(quote_id)` | buyer, 1 yoctoNEAR | settles fees; `Q_c −= remaining` **immediately**; `unlock_ns = now + notice_period_ns`; emits `quote_exiting` |
| 2 | `complete_quote_withdrawal(quote_id)` | buyer, 1 yoctoNEAR, after `unlock_ns` | zeroes the quote, then `ft_transfer` of principal and fees; a callback restores the quote if the transfer fails; emits `quote_withdrawn` |

## Why capacity drops at step 1

New borrowing shrinks first, while existing positions stay backed by the escrow that is still in the contract. A quote in its notice period **can still be consumed** by a settlement. What is consumed is replaced by collateral delivered to the buyer.

## Values

| Parameter | Value | Source |
| --- | --- | --- |
| Minimum notice | 7 days (604,800 s), owner-set `min_notice_period_s` | PRD §4.1, D-009 |
| Presets in the UI | 7 days, 30 days | config.yaml `notice_presets_s` |

A 24-hour preset appeared in early drafts. D-009 rejected it because it violates the 7-day minimum.

When the contract is paused, all money paths refuse. Completing a withdrawal whose notice has already elapsed is still allowed (interface-p0).
