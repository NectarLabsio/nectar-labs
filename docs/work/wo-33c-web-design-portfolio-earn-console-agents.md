# WO-33c — web — design port part 3: Portfolio, Earn, Console, Agents (< 2 h; commit `feat(web): WO-33c portfolio, earn, console, agents (design v2)`)
Read: docs/work/wo-33-web-design-port.md (incl. Orchestrator notes), docs/ui/app/README.md, artboards `Portfolio.dc.html`, `Earn.dc.html`, `Console.dc.html`,
`Agents.dc.html` (+ optional `Market.dc.html`). Components in packages/ui (WO-33a/33b). Write only apps/web, packages/ui, packages/sdk. NO Co-Authored-By line; never --no-verify.
0. **Bug first (found in WO-33b):** live `get_quote` returns `quote_id` while `QuoteView` has `id`, so /quote/[id] likely crashes; fixtures hid it. Fix the mapping
   and audit EVERY view type in packages/sdk against contracts/nectar-core/src/types.rs for the same class of mismatch; add a test that reads the Rust structs
   and compares keys for every view (as WO-26d did for Reserve), and a live read-only e2e that opens one real /quote/[id] and /position/[id].
1. `/notes` (nav "Portfolio") = Portfolio artboard: net value, weekend outlook, tabs Loans / Deposits / Notes / Activity.
2. `/quote` + `/reserve` = Earn artboard: live ladder placement, fee share, Reserve waterfall, premium split. Keep /quote/new and /quote/[id] flows.
3. `/console` = Console artboard: what-if sliders with impact before signing, session, corporate actions, keepers, evidence; read-only for non-owners.
4. `/agents` = Agents artboard: replayable run of the four calls (fixture, labelled), connect config, tools, referrals.
5. Optional, last, cut first: `/feed/[symbol]` = Market artboard.
Every number from views via packages/sdk; artboard numbers only as fixtures. Copy rules hold. Acceptance as WO-33b: build, full e2e, sdk tests, a11y ≥ 90 both themes,
no scroll at 400 px, screenshots + NOTES.md lines in evidence/G3/design/. Report ≤ 15 lines.
