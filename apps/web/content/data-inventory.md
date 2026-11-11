# Data inventory (measured)

Generated 2026-11-11T20:34:35.253Z by `apps/web/e2e/inventory.spec.ts`: real Chrome, a fresh profile per run, every route on both hosts
(SITE http://site.localhost:3741, APP http://app.localhost:3741, docs through APP /docs), dark and light theme, consent accepted and declined, and the near-connect
wallet selector opened on /borrow with one wallet's sandboxed iframe (Meteor Wallet), not signed. Analytics are off
(no analytics id is set), so accepting consent loads nothing extra. The privacy and cookie pages are written from this table.

## Hosts the browser contacts

| Host | Request types | Who | Purpose | When | CSP directive |
| --- | --- | --- | --- | --- | --- |
| app.localhost:3741 | fetch, document, font, image, other, script, stylesheet | our code | This site: pages, scripts, styles, fonts, same-origin API routes, docs via the /docs rewrite | Every page | connect-src, font-src, frame-src, img-src, script-src, style-src |
| evm-on-near.dev | image | near-connect 0.12.0 (wallet selector library) | Wallet icons named in the wallet list | After you press Connect wallet | img-src |
| fonts.cdnfonts.com | stylesheet@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's web fonts (stylesheet + font files) | Only after you open Meteor Wallet in the selector | style-src |
| mc.meteorwallet.app | fetch@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's own API | Only after you open Meteor Wallet in the selector | connect-src |
| meteorwallet.app | image@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet images | Only after you open Meteor Wallet in the selector | img-src |
| raw.githubusercontent.com | fetch, image | near-connect 0.12.0 (wallet selector library) | Wallet list (manifest.json) | After you press Connect wallet | connect-src, img-src |
| rpc.testnet.fastnear.com | fetch | our code | NEAR testnet RPC fallback (@nectar/sdk TESTNET_RPC_FALLBACKS) | App pages that read the contracts | connect-src |
| rsms.me | stylesheet@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's web fonts (stylesheet + font files) | Only after you open Meteor Wallet in the selector | style-src |
| site.localhost:3741 | document, fetch, font, image, other, script, stylesheet | our code | This site: pages, scripts, styles, fonts, same-origin API routes, docs via the /docs rewrite | Every page | connect-src, font-src, frame-src, img-src, script-src, style-src |
| storage.herewallet.app | image | near-connect 0.12.0 (wallet selector library) | Wallet icons named in the wallet list | After you press Connect wallet | img-src |
| test.rpc.fastnear.com | fetch | our code | NEAR testnet RPC: contract views, transaction status | App pages that read the contracts; wallet selector | connect-src |

## Cookies

None. No page, wallet selector or wallet frame set a cookie in any run.

## Browser storage

| Kind | Origin | Key | Who sets it | Purpose | Lifetime | Source |
| --- | --- | --- | --- | --- | --- | --- |
| indexedDB | http://app.localhost:3741 | `hot-connector/wallets` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3741 | `hot-connector/wallets/meteor-wallet:1.1.1` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| localStorage | http://app.localhost:3741 | `meteor-wallet:<random id>` | the wallet you opened (through near-connect) | Wallet's own storage, proxied from its sandboxed frame and prefixed with its wallet id | Until disconnect or you clear site data | @hot-labs/near-connect build/SandboxedWallet/executor.js (storageSpace = manifest.id) |
| localStorage | http://app.localhost:3741 | `meteor-wallet:met_bridge_partner::<per-session ids>` | the wallet you opened (through near-connect) | Wallet's own storage, proxied from its sandboxed frame and prefixed with its wallet id | Until disconnect or you clear site data | @hot-labs/near-connect build/SandboxedWallet/executor.js (storageSpace = manifest.id) |
| localStorage | http://app.localhost:3741 | `nectar-consent` | our code | Your cookie/analytics choice ({v, analytics, at}) | Until you clear site data | packages/ui/src/ConsentBanner.tsx |
| localStorage | http://app.localhost:3741 | `nectar-theme` | our code | Remembers dark or light theme | Until you clear site data | packages/ui/src/theme.tsx |
| localStorage | http://app.localhost:3741 | `selected-wallet` | near-connect 0.12.0 (wallet selector library) | Id of the wallet you picked | Set on connect, removed on disconnect | @hot-labs/near-connect build/NearConnector.js |
| localStorage | http://site.localhost:3741 | `nectar-consent` | our code | Your cookie/analytics choice ({v, analytics, at}) | Until you clear site data | packages/ui/src/ConsentBanner.tsx |
| localStorage | http://site.localhost:3741 | `nectar-theme` | our code | Remembers dark or light theme | Until you clear site data | packages/ui/src/theme.tsx |

## CSP violations in the console: 0

