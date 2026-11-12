# Data inventory (measured)

Generated 2026-11-12T11:17:54.362Z by `apps/web/e2e/inventory.spec.ts`: real Chrome, a fresh profile per run, every route on both hosts
(SITE http://site.localhost:3953, APP http://app.localhost:3953, docs through APP /docs), dark and light theme, consent accepted and declined, and the near-connect
wallet selector opened on /borrow with one wallet's sandboxed iframe (NEAR CLI), not signed. Analytics are off
(no analytics id is set), so accepting consent loads nothing extra. The privacy and cookie pages are written from this table.

## Hosts the browser contacts

| Host | Request types | Who | Purpose | When | CSP directive |
| --- | --- | --- | --- | --- | --- |
| app.localhost:3953 | document, fetch, font, image, other, script, stylesheet | our code | This site: pages, scripts, styles, fonts, same-origin API routes, docs via the /docs rewrite | Every page | connect-src, font-src, frame-src, img-src, script-src, style-src |
| evm-on-near.dev | image, document, fetch | near-connect 0.12.0 (wallet selector library) | Wallet icons named in the wallet list | After you press Connect wallet | connect-src, frame-src, img-src |
| fonts.cdnfonts.com | stylesheet@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's web fonts (stylesheet + font files) | Only after you open Meteor Wallet in the selector | style-src |
| mc.meteorwallet.app | fetch@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's own API | Only after you open Meteor Wallet in the selector | connect-src |
| meteorwallet.app | image@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet images | Only after you open Meteor Wallet in the selector | img-src |
| near-testnet.drpc.org | fetch | our code | RPC fallback (contacted only when FastNEAR refuses): NEAR testnet contract views (@nectar/sdk TESTNET_RPC_FALLBACKS, F-369) | App pages that read the contracts, only while both FastNEAR hosts refuse or fail | connect-src |
| raw.githubusercontent.com | fetch, image | near-connect 0.12.0 (wallet selector library) | Wallet list (manifest.json) | After you press Connect wallet | connect-src, img-src |
| rpc.testnet.fastnear.com | fetch | our code | NEAR testnet RPC fallback (@nectar/sdk TESTNET_RPC_FALLBACKS) | App pages that read the contracts | connect-src |
| rsms.me | stylesheet@iframe, font@iframe | Meteor Wallet (sandboxed frame) | Meteor Wallet's web fonts (stylesheet + font files) | Only after you open Meteor Wallet in the selector | font-src, style-src |
| site.localhost:3953 | document, fetch, font, image, other, script, stylesheet | our code | This site: pages, scripts, styles, fonts, same-origin API routes, docs via the /docs rewrite | Every page | connect-src, font-src, frame-src, img-src, script-src, style-src |
| storage.herewallet.app | image, image@iframe | near-connect 0.12.0 (wallet selector library) | Wallet icons named in the wallet list | After you press Connect wallet | img-src |
| test.rpc.fastnear.com | fetch | our code | NEAR testnet RPC: contract views, transaction status | App pages that read the contracts; wallet selector | connect-src |
| testnet-rpc.intea.rs | fetch | our code | RPC fallback (contacted only when FastNEAR refuses): NEAR testnet contract views (@nectar/sdk TESTNET_RPC_FALLBACKS, F-369) | App pages that read the contracts, only while both FastNEAR hosts refuse or fail | connect-src |
| wallet.intear.tech | document@iframe, fetch | Intear Wallet (sandboxed frame, through near-connect) | Code, styles, fonts, images or API of Intear Wallet | Only after you open Intear Wallet in the selector | connect-src, frame-src |

## Cookies

None. No page, wallet selector or wallet frame set a cookie in any run.

## Browser storage

| Kind | Origin | Key | Who sets it | Purpose | Lifetime | Source |
| --- | --- | --- | --- | --- | --- | --- |
| indexedDB | http://app.localhost:3953 | `hot-connector/wallets` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3953 | `hot-connector/wallets/ethereum-wallets:0.1.4` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3953 | `hot-connector/wallets/intear-wallet:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3953 | `hot-connector/wallets/ledger:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3953 | `hot-connector/wallets/meteor-wallet:1.1.1` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3953 | `hot-connector/wallets/near-cli:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| indexedDB | http://app.localhost:3953 | `hot-connector/wallets/nightly-wallet:1.0.0` | near-connect 0.12.0 (wallet selector library) | Cache of the sandboxed wallet's code, keyed <wallet id>:<manifest version> | Until you clear site data (replaced on a new wallet version) | @hot-labs/near-connect build/helpers/indexdb.js, SandboxedWallet/executor.js |
| localStorage | http://app.localhost:3953 | `meteor-wallet:<random id>` | the wallet you opened (through near-connect) | Wallet's own storage, proxied from its sandboxed frame and prefixed with its wallet id | Until disconnect or you clear site data | @hot-labs/near-connect build/SandboxedWallet/executor.js (storageSpace = manifest.id) |
| localStorage | http://app.localhost:3953 | `meteor-wallet:met_bridge_partner::<per-session ids>` | the wallet you opened (through near-connect) | Wallet's own storage, proxied from its sandboxed frame and prefixed with its wallet id | Until disconnect or you clear site data | @hot-labs/near-connect build/SandboxedWallet/executor.js (storageSpace = manifest.id) |
| localStorage | http://app.localhost:3953 | `nectar-consent` | our code | Your cookie/analytics choice ({v, analytics, at}) | Until you clear site data | packages/ui/src/ConsentBanner.tsx |
| localStorage | http://app.localhost:3953 | `nectar-theme` | our code | Remembers dark or light theme | Until you clear site data | packages/ui/src/theme.tsx |
| localStorage | http://app.localhost:3953 | `selected-wallet` | near-connect 0.12.0 (wallet selector library) | Id of the wallet you picked | Set on connect, removed on disconnect | @hot-labs/near-connect build/NearConnector.js |
| localStorage | http://site.localhost:3953 | `nectar-consent` | our code | Your cookie/analytics choice ({v, analytics, at}) | Until you clear site data | packages/ui/src/ConsentBanner.tsx |
| localStorage | http://site.localhost:3953 | `nectar-theme` | our code | Remembers dark or light theme | Until you clear site data | packages/ui/src/theme.tsx |

## Wallets in the selector (one by one, fresh profile each, not signed)

The selector alone contacts: app.localhost:3953, evm-on-near.dev, near-testnet.drpc.org, raw.githubusercontent.com, rpc.testnet.fastnear.com, storage.herewallet.app, test.rpc.fastnear.com. Per wallet below: what it adds after you pick it. The wallet list is near-connect's
manifest, fetched unpinned at runtime, so a manifest change can add a wallet or a host before this table is re-measured.

| Wallet | Reached | Hosts its frame contacts (request types) | Windows it opens (not under our CSP) | Storage keys on our origin | CSP violations |
| --- | --- | --- | --- | --- | --- |
| Meteor Wallet | sandboxed frame loaded (1) | meteorwallet.app (image@iframe)<br>rsms.me (stylesheet@iframe)<br>fonts.cdnfonts.com (stylesheet@iframe)<br>mc.meteorwallet.app (fetch@iframe) | none | `localStorage meteor-wallet:<random id>`<br>`localStorage meteor-wallet:met_bridge_partner::<per-session ids>`<br>`localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Intear Wallet | sandboxed frame loaded (1); shows: "CONNECT INTEAR WALLET Choose your preferred wallet connection method 🌐 Web 📱💻 App 🧪 Web (Beta) 🔧 Self-Hosted Close" | wallet.intear.tech (document@iframe, fetch) | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Ledger | sandboxed frame loaded (1); shows: "Connect Ledger Before continuing, please ensure the NEAR app is installed on your Ledger device. You may install it via Ledger Live. USB Wir" | none beyond the selector | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Nightly Wallet | sandboxed frame loaded (1); shows: "Nightly Wallet Download Nightly Download" | storage.herewallet.app (image@iframe) | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| Ethereum Wallets | sandboxed frame loaded (1); opened 1 window(s); shows: ":root { --background-color: rgb(40, 40, 40); --text-color: rgb(255, 255, 255); --border-color: rgb(209, 209, 209); } * { font-family: system" | evm-on-near.dev (document, fetch) | https://evm-on-near.dev/ → evm-on-near.dev | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |
| NEAR CLI | sandboxed frame loaded (1); shows: "STEP 1 OF 2 Connect with NEAR CLI Enter your NEAR account ID Next" | rsms.me (font@iframe, stylesheet@iframe) | none | `localStorage nectar-consent`<br>`localStorage selected-wallet` | 0 |

## CSP violations in the console: 0

