---
title: Quick start
slug: /start/quick-start
description: Five commands from a fresh clone, no keys.
---
# Quick start (no keys needed)

<p className="verified">Verified against: F-012 (2026-11-09), F-018 (2026-11-10), F-022 (2026-11-10), F-026 (2026-11-10), F-090 (2026-11-09) · root package.json scripts as of 2026-11-10</p>
<p className="status">Status: commands 1, 2 and 5 work today. Commands 3 and 4 need the testnet deploy (G2) and the web app (WO-3), neither of which exists yet.</p>

```bash
git clone <repo-url> nectar-labs && cd nectar-labs   # repo URL: TODO-H2 (private until Kunal publishes it)
pnpm i
pnpm demo:testnet            # read-only views against the testnet contract (needs G2)
pnpm --filter web dev        # web app on http://localhost:3000 (needs WO-3)
pnpm --filter docs-site start
```

## Prerequisites

| Tool | Version | Why | Source |
| --- | --- | --- | --- |
| Node | ≥ 22.22.2 | everything TypeScript | F-012 |
| pnpm | 10.34.9 (pinned in `packageManager`; `corepack enable` picks it up) | workspace install | F-026 |
| near-cli-rs (`near`) | v0.31.1 | `pnpm demo:testnet` runs `near contract call-function as-read-only` | F-018, F-022 |
| yq | any v4 | `scripts/_lib.sh` reads `packages/config/config.yaml` | scripts/_lib.sh |

## What each command does today

| # | Command | Today (2026-11-10) |
| --- | --- | --- |
| 1 | `git clone` | works once the repo is public (H2) |
| 2 | `pnpm i` | works; installs from `pnpm-lock.yaml` |
| 3 | `pnpm demo:testnet` | runs `scripts/50-verify.sh`, which reads account ids from `config.yaml`. They are `TODO-G2` until deploy, so the script exits with an error. **Not deployed (G2 pending).** |
| 4 | `pnpm --filter web dev` | `apps/web` is not built yet (WO-3). No project matches the filter. |
| 5 | `pnpm --filter docs-site start` | works: this site on http://localhost:3000 |

`demo:testnet` reads public state only. It never signs, needs no key and costs nothing.

## Writing to testnet (after G2)

To post a quote or borrow you need a NEAR testnet account with faucet NEAR and mock tokens. Mock USDC and mock NVDAx are test tokens with no value. How to get them will be written here once the mock-token contracts are deployed (G2).
