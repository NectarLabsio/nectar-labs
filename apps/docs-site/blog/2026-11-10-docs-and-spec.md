---
title: Docs site and P0 specification published (pre-deploy)
slug: docs-and-spec
date: 2026-11-10
authors:
  - name: Nectar Labs
---

The docs site now carries the P0 specification: Pappus quotes, Cramér limits, the fee index, the contract interface, the trust model and the legal pages. **Nothing is deployed yet.** Gate G2 (testnet deploy) is pending, so every account id reads `TODO-G2` and every status cell reads "not deployed".

<!-- truncate -->

- Cramér limit and collateral parameters follow the PRD §4.2 model (decision D-009): `B_c = min(LTV_c · V_c, (1 − h_c)(Q_c + R_c + D_c))`, 70/20/10 fee split, 7-day minimum notice.
- Analytics are off by default. Even when a vendor is chosen (H4), nothing loads before the visitor accepts.
- Fonts are self-hosted, so the docs site contacts no third party by default.

From now on there is one entry per tag (`p0-green`, `p1-green`, `p2-green`, `submission-rc`).
