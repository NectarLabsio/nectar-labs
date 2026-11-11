# Data inventory (measured)

Generated 2026-11-11T20:51:10.042Z by `apps/web/e2e/inventory.spec.ts`: real Chrome, a fresh profile per run, every route on both hosts
(SITE http://site.localhost:3961, APP http://app.localhost:3961, docs through APP /docs), dark and light theme, consent accepted and declined, and the near-connect
wallet selector opened on /borrow with one wallet's sandboxed iframe (NEAR CLI), not signed. Analytics are off
(no analytics id is set), so accepting consent loads nothing extra. The privacy and cookie pages are written from this table.

## Hosts the browser contacts

| Host | Request types | Who | Purpose | When | CSP directive |
| --- | --- | --- | --- | --- | --- |
| fonts.cdnfonts.com | stylesheet@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's web fonts (stylesheet + font files) | Only after you open Meteor Wallet in the selector | style-src |
| mc.meteorwallet.app | fetch@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's own API | Only after you open Meteor Wallet in the selector | connect-src |
| meteorwallet.app | image@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet images | Only after you open Meteor Wallet in the selector | img-src |
| rsms.me | stylesheet@iframe, font@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's web fonts (stylesheet + font files) | Only after you open Meteor Wallet in the selector | font-src, style-src |
| wallet.intear.tech | document@iframe, fetch | Intear Wallet (sandboxed frame, through near-connect) | Code, styles, fonts, images or API of Intear Wallet | Only after you open Intear Wallet in the selector | connect-src, frame-src |

## Cookies

None. No page, wallet selector or wallet frame set a cookie in any run.

## Browser storage

| Kind | Origin | Key | Who sets it | Purpose | Lifetime | Source |
| --- | --- | --- | --- | --- | --- | --- |
| indexedDB | http://app.localhost:3961 | `hot-connector/wallets` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3961 | `hot-connector/wallets/ethereum-wallets:0.1.4` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3961 | `hot-connector/wallets/intear-wallet:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3961 | `hot-connector/wallets/ledger:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3961 | `hot-connector/wallets/meteor-wallet:1.1.1` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3961 | `hot-connector/wallets/near-cli:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3961 | `hot-connector/wallets/nightly-wallet:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| localStorage | http://app.localhost:3961 | `meteor-wallet:<random id>` | the wallet you opened (through near-connect) | Wallet's own storage, proxied from its sandboxed frame and prefixed with its wallet id | Until disconnect or you clear site data | @hot-labs/near-connect build/SandboxedWallet/executor.js (storageSpace = manifest.id) |
| localStorage | http://app.localhost:3961 | `meteor-wallet:met_bridge_partner::<per-session ids>` | the wallet you opened (through near-connect) | Wallet's own storage, proxied from its sandboxed frame and prefixed with its wallet id | Until disconnect or you clear site data | @hot-labs/near-connect build/SandboxedWallet/executor.js (storageSpace = manifest.id) |
| localStorage | http://app.localhost:3961 | `nectar-consent` | our code | Your cookie/analytics choice ({v, analytics, at}) | Until you clear site data | packages/ui/src/ConsentBanner.tsx |
| localStorage | http://app.localhost:3961 | `selected-wallet` | near-connect 0.12.0 (wallet selector library) | Id of the wallet you picked | Set on connect, removed on disconnect | @hot-labs/near-connect build/NearConnector.js |

## Wallets in the selector (one by one, fresh profile each, not signed)

The selector alone contacts: app.localhost:3961, evm-on-near.dev, raw.githubusercontent.com, storage.herewallet.app, test.rpc.fastnear.com. Per wallet below: what it adds after you pick it. The wallet list is near-connect's
manifest, fetched unpinned at runtime, so a manifest change can add a wallet or a host before this table is re-measured.

| Wallet | Reached | Hosts its frame contacts (request types) | Windows it opens (not under our CSP) | Storage keys on our origin | CSP violations |
| --- | --- | --- | --- | --- | --- |
| Meteor Wallet | sandboxed frame loaded (1) | meteorwallet.app (image@iframe)<br>rsms.me (stylesheet@iframe)<br>fonts.cdnfonts.com (stylesheet@iframe)<br>mc.meteorwallet.app (fetch@iframe) | none | `localStorage meteor-wallet:<random id>`<br>`localStorage meteor-wallet:met_bridge_partner::<per-session ids>`<br>`localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Intear Wallet | sandboxed frame loaded (1) | wallet.intear.tech (document@iframe, fetch) | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Ledger | sandboxed frame loaded (1) | none beyond the selector | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Nightly Wallet | sandboxed frame loaded (1) | none beyond the selector | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Ethereum Wallets | sandboxed frame loaded (1); opened 1 window(s) | none beyond the selector | (blank) → evm-on-near.dev | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| NEAR CLI | sandboxed frame loaded (1) | rsms.me (font@iframe, stylesheet@iframe) | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |

## CSP violations in the console: 0

