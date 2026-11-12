# WO-35w — web — production claims, honest empty states, counters (< 90 min; commit `fix(web): production claims, event empty states, counter a11y`)
Write only apps/web/ and packages/ui/. Kunal, 2026-11-12 (production claims check). Production = ca34111 on https://nectarlabs.vercel.app (SITE) and
https://nectarlabs-app.vercel.app (APP); a redeploy follows this WO. Each change cites its evidence (EVIDENCE section, FACTS id, config key or view).
1. Reserve. The Reserve IS deployed on nectar-core-v2 testnet (EVIDENCE §"v7 module runs": Reserve Note r-NVDAx-0; README row "Shields, Profit-Lock, Nectar
   Reserve"). apps/web/components/Formula.tsx says R_c is "0 until the Reserve ships" — wrong. List every Reserve mention in apps/web + packages/ui
   (landing, /reserve, formula, any earn/lend copy) and make each match the deployed state; show R from contract views, never a hard-coded number.
2. Landing section "Base holds the stock" (or equivalent): the section itself says "local fork" (Base Sepolia local fork, not Base Sepolia) while that is true.
3. Landing worked example uses haircut 4% / 12%; the app shows LTV 70% and haircut 10% / 25%. Align the example with the deployed parameters (read them from
   packages/config/config.yaml or the contract view the app uses), or label it "Illustrative — different parameters" with its own numbers. Prefer aligning.
4. TEE wording: every TEE line (apps/web, packages/ui) says the TEE makes the computation verifiable. Nothing says private/confidential/hidden.
5. Rolling digit counters: the digit columns are `aria-hidden="true"`, the value is in an `aria-label` (or visually-hidden text) on the wrapper. Check the rendered
   HTML of every page with a counter: the visible-to-crawlers text and the meta description contain no "0123456789". Show the check (e.g. curl + strip tags + grep).
6. Event-dependent screens: the hosted Feed runs `source: "views"` with `events_indexed: 0` (no event history). List every screen/section that needs Feed events
   (activity, history, triggers, counts derived from events…). When the Feed reports views mode or 0 events, each shows an honest empty state ("Event history
   isn't indexed on this host" + one line why), never zeros presented as real counts. Local mode with events stays as today.
7. e2e/shell.spec.ts:16 RPC allowlist: accept the TESTNET_RPC_FALLBACKS hosts (dRPC, Intear) — the G3b run 5 phone flake.
8. Do not change the footer email (kunal@nectarnetwork.fun) or canonical tags (already correct on SITE/APP/DOCS).
Tests: `pnpm verify:quick` 0; `pnpm --filter web build` + `node apps/web/scripts/check-trace.mjs` 0; e2e site-pages, screens, shell and any spec touching the
changed components (PW_CHANNEL=chrome; own ports, not the reserved list in earlier orders; stop your servers); a11y spot check on the landing.
NO Co-Authored-By. Never --no-verify. Report ≤ 10 lines: each item with file:line and the evidence it now matches.
