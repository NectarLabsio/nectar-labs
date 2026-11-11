---
title: Cookie policy
slug: /legal/cookies
description: The service sets no cookies. Every browser storage key it uses, with purpose, lifetime and who sets it.
# Sources (YAML comment, not rendered): apps/web/content/data-inventory.json + .md (generated 2026-11-11T21:04:52Z by apps/web/e2e/inventory.spec.ts, WO-34f: all 6 selector wallets, CSP enforced);
# keys not seen in that run, from code: nectar-wallet-connected (apps/web/lib/wallet/near-connect.ts), theme (Docusaurus colour mode);
# consent: packages/ui/src/ConsentBanner.tsx (MAX_AGE_MS 180 days), apps/docs-site/src/theme/Root.tsx; analytics gate: apps/docs-site/docusaurus.config.ts.
---
# Cookie and storage policy

_Last updated 2026-11-12_

**The service sets no cookies.** No page, no wallet selector and no wallet frame set a cookie in any measured run. This covers the site, the web app and this documentation. Instead, your browser keeps a few values in localStorage and IndexedDB. Every key is listed below. They stay in your browser, and none of them is sent to our servers.

## Storage keys

| Key | Kind | Host | Set by | Purpose | Lifetime | Category |
| --- | --- | --- | --- | --- | --- | --- |
| `nectar-consent` | localStorage | site and app | our consent banner | your Accept or Decline choice: `{v, analytics, at}` | until you clear site data; the banner asks again after 180 days, or when its version changes | strictly necessary |
| `nectar-theme` | localStorage | site and app | our theme switch | `light` or `dark` | until you clear site data | strictly necessary |
| `nectar-wallet-connected` | localStorage | app | our wallet adapter | `1` after a wallet connects, so the app reconnects on your next visit | set on connect, removed on disconnect | strictly necessary |
| `theme` | localStorage | app (this documentation) | Docusaurus colour mode | light or dark, only if you use the documentation colour switch | until you clear site data | strictly necessary |
| `selected-wallet` | localStorage | app | near-connect 0.12.0 (wallet selector library) | id of the wallet you picked | set on connect, removed on disconnect | needed for the wallet you chose |
| `hot-connector/wallets`, `hot-connector/wallets/<wallet id>:<version>` (measured: `ethereum-wallets:0.1.4`, `intear-wallet:1.0.0`, `ledger:1.0.0`, `meteor-wallet:1.1.1`, `near-cli:1.0.0`, `nightly-wallet:1.0.0`) | IndexedDB | app | near-connect 0.12.0 | cache of the sandboxed wallet's code | until you clear site data; replaced on a new wallet version | needed for the wallet you chose |
| `<wallet id>:…` (measured: `meteor-wallet:<random id>`, `meteor-wallet:met_bridge_partner::<per-session ids>`) | localStorage | app | the wallet you opened, through near-connect | the wallet's own storage, passed out of its sandboxed frame and prefixed with its wallet id | until you disconnect or clear site data | needed for the wallet you chose |

"Site" is the landing, about, legal, security, status, changelog, brand and talk pages. "App" is the web app and this documentation, which share one host. On the site host only `nectar-consent` and `nectar-theme` appear.

How this was measured: on 2026-11-11, real Chrome with a fresh profile visited every route on both hosts in dark and light theme, with consent accepted and declined, and opened each of the six wallets in the selector one at a time, in a fresh profile, with our content security policy enforced and without signing. `nectar-wallet-connected` and `theme` did not appear in that run because it never completed a connect or used the documentation colour switch. They are listed from the code. Docusaurus can also store `docusaurus.tab.*`, `docusaurus.announcement.*` and `docs-preferred-version-*`, but only for tabs, announcement bars and versioned docs. This documentation uses none of those, so they are never set. In the measured run only Meteor Wallet wrote entries of its own. Opening any wallet sets `selected-wallet` and caches that wallet's code in IndexedDB. Other wallets may add entries under their own wallet id prefix once you connect.

## Your consent choice

The consent banner stores your Accept or Decline in `nectar-consent`, and that choice gates everything non-essential. Analytics are the only non-essential item the code knows about. They can load only in a production build where an analytics vendor has been configured, and only after you click Accept. **Today nothing non-essential is configured**: no analytics vendor is set, so Accept and Decline load exactly the same things, and neither sets a cookie. If that changes, this page will list the new cookies or keys before they are used.

## Cookie settings

Open this page with `#cookie-settings` in the address (the footer link **Cookie settings** does this) to bring back the banner and change your choice. Declining after an earlier Accept stops anything non-essential from loading on later visits. Clearing site data in your browser removes every key in the table above and resets the choice.
