---
title: SDK
slug: /integrate/sdk
description: Typed views, calls and message builders shared by web, keeper and tests.
---
# SDK (`packages/sdk`)

<p className="verified">Verified against: F-012 (2026-11-09), F-013 (2026-11-09), F-018 (2026-11-10) · docs/work/interface-p0.md (2026-11-10)</p>
<p className="status">Status: not built (WO-3). The API below is the plan. The package README becomes the source of truth once it exists.</p>

`packages/sdk` is TypeScript, typed against [the P0 interface](/protocol/contract-reference), on `near-api-js` 7.4.0 and Node ≥ 22.22.2 (F-012). The web app, the keeper and the tests import it, so nobody re-derives encodings by hand.

## Planned surface

| Area | Contents |
| --- | --- |
| Views | `getExitCapacity`, `getQuote`, `listQuotes`, `getPosition`, `getHealth`, `getPool`, `previewBorrow` |
| Messages | builders for the five `ft_on_transfer` messages, serialised exactly as the contract parses them |
| Calls | `ft_transfer_call` wrapper that always attaches 1 yoctoNEAR (F-013) |
| Units | `U128` strings, `_usd_e6` helpers, bps formatting |
| Maths | reads `contracts/nectar-core/tests/model.csv` vectors in tests; no float maths |

## Without the SDK

Every view is reachable with near-cli-rs (F-018). See [Feed REST](/integrate/feed-rest) for examples, and [Post quotes programmatically](/integrate/post-quotes) for a raw `ft_transfer_call`.
