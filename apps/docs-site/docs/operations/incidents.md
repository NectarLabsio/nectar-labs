---
title: Incident response
slug: /operations/incidents
description: First action and follow-up per incident type.
---
# Incident response

<p className="verified">Verified against: F-015 (2026-11-09), F-019 (2026-11-10), F-052 (2026-11-09) · spec docs/PRD.md §16.4 · docs/work/interface-p0.md</p>
<p className="status">Status: playbooks for the P0 testnet deployment of 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). The phase is noted where a step needs P1 or P2 methods.</p>

| Incident | First action (owner) | Then |
| --- | --- | --- |
| Oracle wrong or stale | `pause()` | `propose_price` then `apply_price`, or switch source (G5); `unpause()`; note on the Evidence page |
| `oracle_rejected` events firing | check the source against Hermes | if the source is wrong, keep paused; if the move is real, use the two-step override |
| Quoter compromised or absurd (P1) | `set_quoter_pin("")`, settlement falls back to `max_discount_bps` | fix the WASM, republish, re-pin, record the new sha256 |
| Keeper key leaked | `set_keeper(new)`, then `near account delete-keys` for the old key (F-019) | rotate the key file, restart the keeper; a leaked key can burn at most the keeper's NEAR balance (F-015) |
| Position stuck in `Settling` (P2) | any keeper relays the signed message | after `expires`, owner `cancel_settlement` returns the position to `Open` (PROD path) |
| Gas reserve below 1 NEAR | `fund_gas_reserve` with 5 NEAR | alert threshold in the keeper |
| Contract bug | `pause()`; write an incident note | patch, sandbox migration test, redeploy to the same account (testnet) |
| Faucet or airdrop exhausted | retry with backoff, 5 times | handoff to the human owner (H-NEAR-FAUCET, H-SOL-AIRDROP) |

Pausing refuses every money path. Views keep working, and so does completion of a withdrawal whose notice has already elapsed. Buyers who gave notice are never trapped by a pause.

Commands: [Runbook](/operations/runbook).
