---
title: Cookie policy
slug: /legal/cookies
description: Every browser storage key the Nectar Labs sites use.
---
# Cookie and storage policy

_Last updated 2026-11-11_

By default this documentation site sets **no cookies** and loads **no analytics**. It keeps two small values in your browser's localStorage. Analytics can only load in a production build where a vendor has been configured (TODO-H4), and only after you click "Accept analytics".

## Documentation site (this site)

| Key | Type | Set by | Purpose | Lifetime | Category |
| --- | --- | --- | --- | --- | --- |
| `nectar-consent` | localStorage | our consent banner | your Accept or Decline choice: `{v, analytics, at}` | 180 days, then asked again; a new version also re-asks | strictly necessary |
| `theme` | localStorage | Docusaurus colour-mode switch | light or dark, if you toggle it | until you clear site data | strictly necessary |
| GA4 cookies | first-party cookies | Google Analytics 4 | analytics, **only** if H4 = GA4 **and** you accepted | per Google's defaults (listed here when H4 is decided) | analytics (consent) |
| — | — | Plausible | cookieless; if H4 = Plausible no analytics cookie is set, and the script still loads only after you accept | — | analytics (consent) |

On 2026-11-10 no analytics vendor is configured, so the last two rows do not apply to any deployed build. The keys above were checked against the installed site code (Docusaurus 3.10.2 colour mode uses `theme`; the consent component uses `nectar-consent`). Docusaurus can also store `docusaurus.tab.*`, `docusaurus.announcement.*` and `docs-preferred-version-*`, but only for tabs, announcement bars and versioned docs. This site uses none of those, so they are never set.

## Web app

Keys checked against the web app code on 2026-11-10 (`packages/ui/src/ConsentBanner.tsx`, `packages/ui/src/theme.tsx`, `apps/web/lib/wallet/near-connect.ts`):

| Key | Storage | Set by | What it holds | Lifetime | Category |
| --- | --- | --- | --- | --- | --- |
| `nectar-consent` | localStorage | our consent banner | your Accept or Decline choice: `{v, analytics, at}` | 180 days, then asked again | strictly necessary |
| `nectar-theme` | localStorage | theme switch | `light` or `dark`, if you toggle it | until you clear site data | strictly necessary |
| `nectar-wallet-connected` | localStorage | wallet adapter | `1` after you connect a wallet, removed when you disconnect | until you disconnect or clear site data | strictly necessary |

The wallet connector (`@hot-labs/near-connect`) loads only after you press **Connect wallet** (or connected on an earlier visit) and keeps its own entries in localStorage and IndexedDB, recording the wallet you chose. The wallet's sandboxed code can keep its own localStorage entries too. Those entries are set by that library and the wallet, not by our code, and are not yet listed here by name.

## Cookie settings {#cookie-settings}

Open this page with `#cookie-settings` in the address (the footer link **Cookie settings** does this) to bring back the banner and change your choice. Declining after an earlier accept stops analytics from loading on later visits. Reload the page, or clear site data in your browser, to remove anything already loaded. Clearing site data also resets the choice.
