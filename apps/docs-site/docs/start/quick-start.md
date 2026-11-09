---
title: Quick start
slug: /start/quick-start
---
# Quick start (no keys needed)

```bash
git clone TODO-H2 && cd nectar-labs
pnpm i
pnpm demo:testnet            # read-only views against the live testnet contract
pnpm --filter web dev        # http://localhost:3000
pnpm --filter docs-site start
```
To post a quote or borrow you need a NEAR testnet wallet (MyNearWallet or Meteor) with faucet NEAR and mock tokens; the app's Faucet panel mints mock USDC/NVDAx to your account on testnet.
