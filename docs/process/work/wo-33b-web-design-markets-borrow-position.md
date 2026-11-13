# WO-33b — web — design port part 2: RPC resilience + Markets, Borrow/Shield, Position (< 2 h; commit `feat(web): WO-33b markets, borrow, position (design v2)`)
Read: docs/process/work/wo-33-web-design-port.md (incl. the Orchestrator notes block), docs/ui/app/README.md, the artboards `Main.dc.html`, `Borrow.dc.html`,
`Position.dc.html` + `nectar-app.css`, docs/DESIGN_SYSTEM.md §3c. Shared components from WO-33a are in packages/ui (src/app.tsx, app.css `nx-`).
Write only apps/web, packages/ui, packages/sdk. NO Co-Authored-By line.
0. **RPC resilience (G9 stability):** the e2e run saw FastNEAR -429 on phone. In packages/sdk's NEAR view client: retry with jittered backoff on 429/5xx
   (max 3), then fall back through an ordered endpoint list (`NEAR_RPC_URL` / config first, then `https://test.rpc.fastnear.com`, then
   `https://rpc.testnet.fastnear.com` — both answer testnet `status`, FACTS F-369). Unit tests with a mocked fetch. `/api/health` uses the same client.
1. `/feed` = Main artboard: exit-capacity hero, week chart (from the Feed API history if configured, else the on-chain current value only — no fabricated
   history; label it), markets table with chain filter (NEAR / Solana live on testnet / Base "local fork"), account dock.
2. `/borrow` + `/shield` (preselects the Shield protection) = Borrow artboard: composer + live outcome, review drawer, "what your wallet signs" link to the
   existing sign modal content, pending, confirmed with toast + next step. Keep every existing flow (pay_to, referrer, remote chain selector NEAR/Solana; Base
   option shows "local fork, not live" and stays disabled unless `features.base`).
3. `/position/[id]` = Position artboard: price simulator, Repay / Add collateral (only if the contract supports it — else omit, do not invent) / Profit-Lock,
   status states open / at risk / settling / settled from real state; the DI-1 "Repay $X first" path when the Profit-Lock cap is exceeded (cap from views).
4. Every number from views via packages/sdk; artboard numbers only as test fixtures. Copy rules hold.
Acceptance: build; full `PW_CHANNEL=chrome pnpm --filter web e2e` green (update selectors where markup changed, keep coverage; add specs for the new
flows); sdk tests; a11y ≥ 90 both themes on the three routes; no horizontal scroll at 400 px; screenshots of each route 1440 + 400 px both themes to
evidence/G3/design/ with a one-line difference note per route in evidence/G3/design/NOTES.md. Do not commit other evidence/ screenshots. Report ≤ 15 lines.
