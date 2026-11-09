---
title: Quick start
slug: /start/quick-start
description: Five commands from a fresh clone, no keys.
---
# Quick start (no keys needed)

<p className="verified">Verified against: F-012 (2026-11-09), F-026 (2026-11-10), F-090 (2026-11-09) · root package.json scripts, scripts/50-verify.sh, evidence/G2/demo-testnet-20261109T2049Z.log (2026-11-09)</p>
<p className="status">Status: commands 2 to 5 work today; command 1 needs the public repo URL (H2). The contracts are deployed on testnet; G2 verification is pending.</p>

```bash
git clone <repo-url> nectar-labs && cd nectar-labs   # repo URL: TODO-H2 (private until Kunal publishes it)
pnpm i
pnpm demo:testnet            # read-only views against the testnet contract
pnpm --filter web dev        # web app on http://localhost:3000
pnpm --filter docs-site start
```

## Prerequisites

| Tool | Version | Why | Source |
| --- | --- | --- | --- |
| Node | ≥ 22.22.2 | everything TypeScript | F-012 |
| pnpm | 10.34.9 (pinned in `packageManager`; `corepack enable` picks it up) | workspace install | F-026 |
| network | outbound HTTPS | `pnpm demo:testnet` queries `https://rpc.testnet.near.org` (override with `NEAR_RPC_URL`); no near CLI, no yq | scripts/demo-testnet.mjs |

## What each command does today

| # | Command | Today (2026-11-10) |
| --- | --- | --- |
| 1 | `git clone` | works once the repo is public (H2) |
| 2 | `pnpm i` | works; installs from `pnpm-lock.yaml` |
| 3 | `pnpm demo:testnet` | works now: `scripts/50-verify.sh` runs `scripts/demo-testnet.mjs`, which reads the ids from `config.yaml` and prints contract version, exit capacity, pool, quotes, positions and explorer links (see [Live on testnet](/start/live-on-testnet)). |
| 4 | `pnpm --filter web dev` | starts `apps/web` (WO-3 merged; web gate G3 pending). |
| 5 | `pnpm --filter docs-site start` | works: this site on http://localhost:3000 |

`demo:testnet` reads public state only. It never signs, needs no key and costs nothing.

## Writing to testnet (after G2)

To post a quote or borrow you need a NEAR testnet account with faucet NEAR and mock tokens. Mock USDC and mock NVDAx are test tokens with no value. How to get them will be written here once the mock-token contracts are deployed (G2).
