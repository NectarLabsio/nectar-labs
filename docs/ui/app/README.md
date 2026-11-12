# Testnet app design v2 (reference for the `web` agent)

Source of truth for the look and behaviour of `apps/web` app routes (2026-11-10, v2 after Kunal's "looks AI-ish"
review). The `.dc.html` files are canvas artboards, not app code: port the markup to React components in
`packages/ui`, move `nectar-app.css` into `packages/ui` as component styles, and wire every number to a view call.

How to build from these files (reading the `.dc.html` format, the `/_blob/…` → repo asset map, token mapping,
acceptance): `docs/work/wo-33-web-design-port.md`. Files here are the canvas as last saved on 2026-11-10.

## What changed from v1, and why
- Type: DM Sans for UI text, DM Mono only for numbers and addresses, Syne for titles and hero numbers (v1 set
  everything in mono).
- Surfaces: layered panels with soft elevation and one radius scale (22 / 16 / 12) instead of identical bordered cards.
- Navigation: top bar with four tasks (Markets, Borrow, Earn, Portfolio) plus Agents and Curator. Shields became the
  Protection choice inside Borrow; quotes and Reserve share Earn; Notes live in Portfolio.
- Every screen leads with one visual: week chart of exit capacity, buy-side ladder, health gauge with stress bars,
  price simulator, live ladder placement, what-if sliders, replayable agent run.
- Flows: live previews, inline validation, review drawer, "what your wallet signs" behind a link, pending state,
  toast with the next step. Proactive notices (weekend outlook, Profit-Lock cap fix that pre-fills the repay).

## Screens → routes (PRD v7 §12, §12.1)

| Artboard | Route(s) | Notes |
| --- | --- | --- |
| Main | `/feed` | exit capacity hero, week chart, markets table with chain filter, account dock |
| Market | `/feed/[symbol]` (new detail page) | buy-side ladder by discount, limit composition donut, parameters, activity |
| Borrow | `/borrow`, `/shield` (preselects the Shield) | composer + outcome, review drawer, pending, confirmed |
| Portfolio | `/notes` (renamed Portfolio in nav) | net value, weekend outlook, tabs Loans / Deposits / Notes / Activity |
| Position | `/position/[id]` | price simulator, Repay / Add collateral / Profit-Lock; status tweak for open, at risk, settling, settled |
| Earn | `/quote`, `/reserve` | live ladder placement, fee share, Reserve waterfall, premium split |
| Console | `/console` | what-if sliders with impact before signing, session, corporate actions, keepers, evidence |
| Agents | `/agents` | replayable run of the four calls, connect config, tools, referrals |

`/keepers`, `/talk`, `/security`, `/legal/*` and dedicated phone frames are still to draw. Pages reflow at phone width.

## Demo numbers (Illustrative — different parameters)
These mock-up numbers use h 4% / 12%. The deployed testnet parameters are LTV ceiling 70%, haircut 10% in session and 25% closed
(packages/config/config.yaml `max_nectar_ltv_bps` 7000, `base_haircut_bps` 1000, `weekend_haircut_bps` 2500).
300 mock NVDAx at $185. Q $65,000 (q-1 $40,000 at 2.50%, q-2 $25,000 at 3.50%), R $5,000, D $12,000 in session / $0
closed, h 4% / 12%, $28,000 drawn by p-1. Exit capacity $78,720 / $61,600. p-1 health 1.59, flag price $116.67.
Buy-side ladder: 221.76 + 140.04 + 28.15 = 389.95 NVDAx at ≤ 4%. Borrow example: second loan of 300 NVDAx with a
Weekend Shield, limit $33,600, $20,000 borrowed, fees $90, health 2.22.

## Open issue (H19)
Profit-Lock on p-1 needs $28,140 of voluntary fills; the daily cap is $20,000. The Position screen offers "Repay
$8,099.50 first", which switches to Repay with the amount filled in.
