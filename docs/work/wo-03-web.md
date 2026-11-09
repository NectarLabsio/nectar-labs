# WO-3 — web — shell + P0 pages (P0)
Goal: packages/ui (tokens, components), packages/sdk (views, msg builders, preimage.ts), apps/web routes /, /feed, /quote/new, /quote/[id], /borrow, /position/[id], /console, /keepers, /talk, /legal/*; wallet-selector (MyNearWallet, Meteor testnet); theme toggle; ConsentBanner (off by default); sign modal with msg JSON; landing page ported from landing/index.html.
Acceptance: `pnpm --filter web build`; Playwright E2E against testnet ids from config (read-only + one write with demo borrower key from env); a11y ≥ 90; no horizontal scroll at 400 px; screenshots in evidence/.
FACTS: F-012, F-013, F-092.
