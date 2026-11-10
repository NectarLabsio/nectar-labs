# WO-33 — web — port the approved landing and app design · DESIGN_SYSTEM §3b, §3c
> **Orchestrator notes (2026-11-10, repo state):** (1) "H19" in this file and in docs/ui/app/README.md means the design issue "Profit-Lock cap" →
> called **DI-1** here; repo H19 is the Base builder code (D-017). (2) Screenshots go to `evidence/G3/design/` (upper-case G3 — exFAT is
> case-insensitive and `g3`/`G3` collided before). (3) WO-3/20/26/31 are already merged and G3b passed (e2e 244/0, a11y 100): this is a
> restyle of working routes — every existing e2e spec must stay green (update selectors only where markup changes, keep coverage), and the
> verifier re-runs G3b afterwards. (4) Solana is live (G7 PASS) and Base runs on a local fork (D-026): Solana rows may say "live on testnet
> (devnet leg)", Base rows "local fork, not live". (5) Split into WO-33a (landing + tokens + fonts + shared components), WO-33b (Markets
> /feed, Borrow /borrow + /shield, Position), WO-33c (Portfolio /notes, Earn /quote + /reserve, Console, Agents; optional /feed/[symbol] last).
> (6) Commits carry no Co-Authored-By line (kunal-drall is the sole author).

Owner: `web` (writes only `apps/web/`, `packages/ui/`). Applies on top of WO-3, WO-20, WO-26 and WO-31: those orders
decide what each route does; this one decides how it looks and behaves. No new contract calls, no new scope except
the optional `/feed/[symbol]` page below. Phase rules hold: P1 screens are styled only when WO-26 runs.

## Read first (in this order)
1. `docs/DESIGN_SYSTEM.md` §1–3c (tokens, type, landing motion, app v2).
2. `docs/ui/app/README.md` (screens → routes, demo numbers, H19).
3. `landing/index.html` (complete standalone page; open it in Playwright, it runs as is).
4. The `docs/ui/app/<Screen>.dc.html` for the route you are building, plus `docs/ui/app/nectar-app.css`.

## How to read a `.dc.html` file
They are artboards from a design canvas, not app code. The canvas runtime (`support.js`) is not in the repo, so they do
not render on their own; do not try to run them and do not port `DCLogic`.
- Markup lives inside `<x-dc>`. `<helmet>` is head content (fonts) and is dropped in the app.
- `{{name}}` is filled by `renderVals()` in the `<script type="text/x-dc">` class at the bottom. Read that function to
  get every derived number, label, enabled/disabled rule and state transition (drawer open, pending, toast).
- `<sc-for list="{{xs}}" as="x">` is `xs.map(x => …)`. `<sc-if value="{{v}}">` is `{v && …}`. `hidden="{{h}}"` is a
  conditional row.
- `data-props` lists the canvas tweaks: `theme` (dark/light) → the real theme toggle; `session` (open/weekend) → the
  session badge from views; `status` on Position (open / at risk / settling / settled) → real position state;
  `viewer` on Console (read only / owner) → the connected account vs the contract owner.
- Links between artboards (`Main.dc.html`, …) map to routes via the table in `docs/ui/app/README.md`.

## Asset map (canvas blob → repo file)
| In the `.dc.html` | Repo file |
| --- | --- |
| `/_blob/76ae889d34e7e0e6ae8dd258fc05f2e1` | `packages/ui/logo/mark-flat.png` |
| `/_blob/8cbba3f678a4dfc9acd353e1c7a554d4` | `packages/ui/logo/wordmark-muted.png` (dark theme, class `od`) |
| `/_blob/b9ab938d8e4e19425a3f0c7a5fb2ab32` | `packages/ui/logo/wordmark-dark.png` (light theme, class `ol`) |
| `/_blob/35efc2e8a41bb153a0ef1e0cb09ba145` | `packages/ui/3d/tokA.webp` |
| `/_blob/e22dcedd1bf0724c8a88625cd14ecaae` | `packages/ui/3d/tokC.webp` (asset icon for NVDAx) |
| `/_blob/90551b2e707e9ae82f26f4d5f7c9d816` | `docs/ui/app/nectar-app.css` |

## Tokens: one source
`packages/ui/tokens.css` stays the only place colors live. `nectar-app.css` declares its own variables on `.nx`; map
them to the system tokens and add only what the system lacks:
| `nectar-app.css` | Use |
| --- | --- |
| `--mint`, `--pos` / `--mint-hover` / `--mint-soft` / `--mint-ink` | `--accent` / `--accent-hover` / `--accent-fill` / `--on-accent` |
| `--head` / `--text` / `--dim` / `--bg` | `--heading` / `--text` / `--dim` / `--bg` (system values win) |
| `--amber`, `--amber-soft` / `--coral`, `--coral-soft` / `--sky` | `--warn`, `--warn-fill` / `--danger`, `--danger-fill` / `--info` |
| `--panel`, `--panel2`, `--raise`, `--bg2`, `--line`, `--line2`, `--faint`, `--teal`, `--violet`, `--shadow`, `--glow` | new: add to `tokens.css` in both themes, values from `nectar-app.css` |
Where the canvas value differs from the system (dark `--bg`, light-theme mint fill), the system value wins. Record any
contrast problem in the G3 report rather than changing a system token.

## What to build
- `/`: port `landing/index.html` as the home page (WO-3, WO-20 item 4). three@0.160.0 pinned; `packages/ui/3d/nectar3d.js`
  for the live mark; `hero.webp` as first frame and reduced-motion fallback; keep every `id` the page script uses.
- App routes: per the table in `docs/ui/app/README.md`. Components go to `packages/ui` (Nav with session chip,
  Panel, Stat, Seg tabs, Slider, Drawer, Toast, Gauge, WeekChart, Ladder, Donut). Fonts DM Sans, DM Mono and Syne
  self-hosted in `packages/ui/fonts/` (not in the bundle yet; add the woff2 files, for example from the `@fontsource`
  packages, and record the version in FACTS); the app does not call Google Fonts.
- `/feed/[symbol]` (Market artboard) is new and optional: build it after the routes WO-3/WO-26 require; cut it first.
- Not drawn yet, keep the current system styling: `/keepers`, `/talk`, `/security`, `/legal/*`. Reach them from the
  footer, not the top bar.

## Data rules
- The canvas numbers are the PRD §4 demo state. Use them only as fixtures (tests, empty-state previews). On a real
  route every number comes from a view call through `packages/sdk`.
- Solana and Base rows show "Not live yet" until their gates pass. Never "insurance", never "without liquidations",
  never "live" before EVIDENCE shows it. No hackathon branding.
- H19 (Profit-Lock cap) is open: implement the "Repay $X first" path from the Position artboard; the cap value comes
  from config.

## Acceptance
`pnpm --filter web build`; Playwright screenshot of each ported route at 1440 px and 400 px, both themes, saved to
`evidence/G3/design/`, next to a one-line note per route listing any difference from the artboard and why; a11y ≥ 90;
no horizontal scroll at 400 px; reduced motion leaves everything visible.
