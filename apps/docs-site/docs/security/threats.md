---
title: Threat table
slug: /security/threats
description: Threats, controls and the test that proves each control.
---
# Threat table

<p className="verified">Verified against: F-013 (2026-11-09), F-015 (2026-11-09), F-031 (2026-11-09), F-052 (2026-11-09), F-080 (2026-11-09) · spec docs/process/prd.md §15 · D-003, D-005, D-010</p>
<p className="status">Status: controls are specified. The "Test" column names the planned test. Each becomes a real test name from contracts/nectar-core/tests after G1, or from the Anchor suite after G7. Nothing here is claimed as passing yet.</p>

| Threat | Control | Test (planned) |
| --- | --- | --- |
| Fake collateral or fake USDC credited | `ft_on_transfer` checks the predecessor against configured tokens; unknown tokens panic | unit: wrong predecessor panics |
| Oracle manipulation (Rhea-style, F-052) | named feed only, no DEX valuation, freshness, 1,500 bps band, two-step override | unit: band rejects; sandbox: stale price blocks borrow |
| Keeper makes the contract sign an arbitrary payload | keeper passes only `position_id`; preimage built from state (D-003, F-031) | unit: no method accepts a hash |
| Keeper key leak | function-call key for two methods, no deposits (F-015, D-010); `set_keeper` rotation | sandbox: `ft_transfer` with the keeper key fails |
| Quoter returns an absurd discount | clamp to `[0, max_discount_bps]`; price band; `quoter_fallback` | unit: 9,999 bps clamps |
| Quoter down | timeout leads to P0 pricing; event | sandbox: callback failure path |
| Escrow double use | `remaining_usd_e6` decremented before any promise; `Settling` lock | unit: two triggers on one position |
| Withdrawal race | `Q_c` decremented at initiate; notice period; settlement may consume during notice | unit: settle during notice |
| Fee accumulator drift | O(1) maths against a loop model; `fee_debt` set at fund and top-up | property test, 1,000 random ops |
| Storage griefing | 64 quotes per asset, $100 minimum, position cap | unit |
| Signature replay on Solana | nonce in program state, `expires`, program id in preimage, path per chain | Anchor test: second settle fails |
| Relay refusal | any keeper can relay a signed message; stuck position visible | integration |
| Wrong token amount semantics | `ft_transfer_call` with exactly 1 yoctoNEAR; refunds via return value (F-013) | sandbox: invalid msg refunds in full |
| Web supply chain | pinned versions, lockfile, `pnpm audit` in CI, no third-party script before consent | CI |
| Secrets in the repo | keys created by CLI into the OS keychain; `.env` holds paths only; gitleaks pre-commit | G9: `gitleaks detect --log-opts=--all` |
