---
title: Brand assets
slug: /project/brand
description: Logo files, colours and type.
---
# Brand assets

<p className="verified">Verified against: F-092 (2026-11-09) · packages/ui/tokens.css · docs/DESIGN_SYSTEM.md</p>

Nectar Labs is a product under the Nectar Network design system (F-092). Nothing here is new design. It is the system, applied.

## Logo

Three mint hexagons in a triangular cluster with the lowercase "nectar" wordmark. Nectar Labs adds "labs" in the dim colour. Source files are in `packages/ui/logo/` in the repository (PNG lockups for dark and light backgrounds, mark, wordmarks). Vector versions are produced by the web work order and checked against the PNG at G3.

## Colours

| Token | Dark (default) | Light |
| --- | --- | --- |
| `--bg` | `#0d0f12` | `#f9fafb` |
| `--surface` | `#16181d` | `#ffffff` |
| `--text` | `#bcc3d2` | `#202632` |
| `--heading` | `#e6e9ef` | `#141924` |
| `--accent` | `#16f3a9` | `#15845f` |
| `--warn` | `#faaf2e` | `#9a5f00` |
| `--info` | `#51b8ec` | `#17699a` |

The full set is in `packages/ui/tokens.css`, the only place colours are defined.

## Type

Syne 600/700 for headings and the wordmark, DM Mono 400/500 for everything else. Both are licensed under the SIL Open Font License 1.1. This site serves them itself from `/fonts/` (license texts: `/fonts/OFL-Syne.txt`, `/fonts/OFL-DM-Mono.txt`), so no font CDN is contacted.

## Use

Do not imply endorsement by NEAR, Solana, OutLayer or any other protocol named in these docs. "Testnet" and "mock collateral" must stay visible wherever balances or limits are shown.
