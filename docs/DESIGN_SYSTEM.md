# DESIGN_SYSTEM.md — Nectar Network system, applied to Nectar Labs

Source: tokens, type, motion and layout decoded from the Nectar Network redesign bundle
(2026-11-09). Nectar Labs is a product under this system; nothing here is invented where the
system already decides. Implementation: `packages/ui/tokens.css` (the only place colors live),
`landing/index.html` (reference page), `apps/docs-site/src/css/custom.css` (Infima mapping).

## 1. Color tokens

| Token | Dark (default) | Light (`[data-theme=light]`) | Use |
| --- | --- | --- | --- |
| `--bg` | `#0d0f12` | `#f9fafb` | page |
| `--surface` | `#16181d` | `#ffffff` | cards, nav, footer |
| `--surface-2` | `#202327` | `#f0f2f4` | inputs, code, table head |
| `--border` | `#23272f` | `#d6dae0` | hairlines |
| `--border-strong` | `#303541` | `#cbcfd8` | focused/hover borders |
| `--text` | `#bcc3d2` | `#202632` | body |
| `--heading` | `#e6e9ef` | `#141924` | headings, values |
| `--dim` | `#8f96a3` | `#5e6778` | labels, captions |
| `--wordmark` | `#b4bccc` | `#141924` | logo word |
| `--accent` | `#16f3a9` | `#15845f` | primary actions, live |
| `--accent-hover` | `#77f3ca` | `#106046` | |
| `--on-accent` | `#0d0f12` | `#ffffff` | text on accent |
| `--accent-fill` | `rgba(0,229,160,.08)` | `rgba(24,149,108,.08)` | tinted panels |
| `--accent-glow` | `rgba(22,243,169,.45)` | `rgba(21,132,95,.35)` | focus ring, pulse |
| `--accent-deep` | `#09aa74` | `#8fdcbf` | bars, secondary accent |
| `--warn` | `#faaf2e` | `#9a5f00` | warnings text |
| `--warn-bar` | `#faaf2e` | `#dc8f09` | warning bars |
| `--warn-fill` | `rgba(245,158,11,.08)` | `rgba(220,143,9,.10)` | warning panels |
| `--info` | `#51b8ec` | `#17699a` | info |
| `--grid` | `rgba(122,184,163,.043)` | `rgba(110,122,145,.07)` | 24 px background grid |

Semantic (derived, both themes): `--good` = `--accent`; `--danger` = `#ff8a80` dark / `#b3261e` light and
`--danger-fill` = `rgba(255,138,128,.10)` (PRD §13: the only new tokens; used for health < 1).

## 2. Type
- Display/headings/wordmark: **Syne** 600/700. Body/UI/data: **DM Mono** 400/500. Self-hosted woff2 in
  `packages/ui/fonts/` (the artifact landing page loads Google Fonts; the app does not call Google).
- Scale (px): 12 caption · 13 small · 14 body · 16 lead · 20 h4 · 28 h3 · 40 h2 · 56 h1 (phone: 32/40).
- Line height 1.5 body, 1.1 display. Uppercase labels: 11–12 px, letter-spacing .08em, `--dim`.
- Numbers: `font-variant-numeric: tabular-nums` wherever they align.

## 3. Shape, space, motion
- Radius 8 (controls), 12 (cards). Hairline borders 1 px `--border`. No shadows in dark; light uses a
  1 px border instead of shadow.
- Spacing unit 8; sections 64–96 vertical; container max 1120, side gutter `max(16px, env(safe-area-inset-*))`.
- Background: `--bg` with the 24 px `--grid` lines (two `linear-gradient`s).
- Motion: `rise` (opacity 0→1, translateY 8→0, 320 ms ease-out, staggered 60 ms) · `grow` (bar
  scaleX 0→1, 600 ms) · `pulse` (live dot, 2 s) · `dash` (SVG stroke-dashoffset) · `float` (hex marks,
  6 s ease-in-out). All wrapped in `@media (prefers-reduced-motion: no-preference)`; resting state is
  fully visible.
- Responsive: container query / media at 760 px; tables switch to `.rt` stacked rows with
  `data-label` cells; nav collapses to a menu button.

## 4. Logo
Three mint hexagons in a triangular cluster — one on top, two below, edges nearly touching — with a soft
mint glow in the source file, plus the lowercase rounded geometric "nectar" wordmark (white on dark). Source:
`packages/ui/logo/source.png` (Kunal's file, 2026-11-10). The wordmark is close to Syne/Quicksand-style rounded
forms; use the traced SVG, never retype it in a font.
Lockup is the mark + "nectar" wordmark only; "labs" is never appended to the logo (Kunal, 2026-11-10). The product name "Nectar Labs" appears in text, titles and metadata, not in the lockup.
Files (cropped from `source.png`, transparent PNG, 2026-11-10): `packages/ui/logo/mark.png` (with glow, for hero/OG
images), `mark-flat.png` (glow removed — use this at nav/footer sizes, both themes), `wordmark-white.png`,
`wordmark-muted.png` (`--wordmark` tone, dark theme), `wordmark-dark.png` (light theme), `lockup-dark.png`,
`lockup-light.png`, plus `-100.png` variants at 100 px height. Theme swap via `.only-dark` / `.only-light`
(the redesign's convention); see landing/index.html. The web agent may trace `mark.svg` from `mark-flat.png` for
favicon/OG use; the wordmark stays a bitmap unless traced carefully — never retype it in a font. Clear space = one hexagon width. Never recolor the mark
except monochrome `--heading` on busy backgrounds.

## 5. Components (packages/ui)
Button (primary / ghost / danger / icon; loading) · Card (header, body, footer; `data-live`) · Stat
(label, value, delta, sparkline slot) · Table (sortable; `.rt` responsive) · Badge (mock · live ·
fallback · verified · unverified · paused) · Banner (info / warn) · Field (label, hint, error, unit) ·
Modal (sign preview: `msg` JSON, gas, deposit) · Tabs · Toast · Sparkline (SVG, tokens) · Hexmark ·
ThemeToggle · ConsentBanner · Nav · Footer.

States every interactive component has: default, hover, focus-visible (2 px `--accent-glow` ring),
active, disabled (opacity .5), loading.

## 6. Voice
No hackathon branding in the UI: no "NEAR Hackathon" banner, badge or copy on the landing, app or docs nav.
Say "testnet" and "mock collateral" instead; hackathon context is for README, EVIDENCE and SUBMISSION only.

Short sentences. Name things by what people recognize (a "quote", a "limit", a "settlement"). Every
action button says what happens ("Fund quote", then toast "Quote funded"). Numbers carry units and
bps. Disclosures are plain: "Mock collateral on testnet", "Owner oracle active", "Fallback pricing".

## 7. Accessibility
Contrast ≥ 4.5:1 for text in both themes (checked at G3), focus visible everywhere, all controls
keyboard reachable, `aria-live` on toasts and health changes, reduced motion respected, no
information carried by color alone (badges have text).

## 8. Footer (shared)
Columns: Products (Nectar Labs, Nectar Feed, Keepers, Post a quote) · Protocols (NEAR, Solana, Chain
Signatures, OutLayer, NEAR Intents) · Build (Docs, SDK, Feed MCP, GitHub, Status) · Resources
(Whitepaper, Security, Changelog, Brand assets, Evidence) · Company (About, Talk to us, X,
kunal@nectarnetwork.fun) · Legal (Privacy, Cookies, Terms, Disclaimers).
Principle line under the lockup: "Committed liquidity, verifiable settlement."
Bottom bar: "© 2026 Nectar Network · MIT License" · theme toggle · "Cookie settings".
(IA informed by morpho.org's footer pattern; no copy or imagery reused.)
