---
title: Quick start
slug: /start/quick-start
description: Five commands from a fresh clone, no keys.
---
# Quick start (no keys needed)

<p className="verified">Verified against: F-012 (2026-11-09), F-026 (2026-11-10), F-090 (2026-11-09), F-369 (2026-11-10) · D-025 · root package.json scripts, scripts/50-verify.sh, evidence/G2/demo-testnet-20261109T2049Z.log (2026-11-09) · docs/EVIDENCE.md §G9 re-run (2026-11-11T08:57Z–09:00Z, tested 0af5cdd, recorded in 89f83ee), §G3 (2026-11-09T21:15Z), §G3b re-run (2026-11-11)</p>
<p className="status">Status on 2026-11-11: commands 2 to 5 work; command 1 needs the public repo URL (H2). G9 PASS: in the verifier's fresh-clone re-run (docs/EVIDENCE.md §G9, recorded in 89f83ee) clone to all 21 listed web routes answering took under 2 minutes. Contracts on testnet: G2 PASS 2026-11-09T20:55Z (5f27f44), nectar-core-v2 G2b PASS. Web: G3 PASS 2026-11-09T21:15Z (176914f), G3b re-run PASS 2026-11-11.</p>

```bash
git clone <repo-url> nectar-labs && cd nectar-labs   # repo URL: TODO-H2 (private until Kunal publishes it)
pnpm i
pnpm demo:testnet            # read-only views against the testnet contract
pnpm --filter web dev        # web app on http://localhost:3100
pnpm --filter docs-site start  # this site on http://localhost:3000
```

## Prerequisites

| Tool | Version | Why | Source |
| --- | --- | --- | --- |
| Node | ≥ 22.22.2 | everything TypeScript | F-012 |
| pnpm | 10.34.9 (pinned in `packageManager`; `corepack enable` picks it up) | workspace install | F-026 |
| network | outbound HTTPS | `pnpm demo:testnet` queries `https://test.rpc.fastnear.com` (D-025, F-369; override with `NEAR_RPC_URL`); no near CLI, no yq | scripts/demo-testnet.mjs |

## What each command does today

| # | Command | Today (2026-11-11) |
| --- | --- | --- |
| 1 | `git clone` | works once the repo is public (H2) |
| 2 | `pnpm i` | works; installs from `pnpm-lock.yaml` (6 s on a warm pnpm store in the G9 re-run; a cold machine is slower) |
| 3 | `pnpm demo:testnet` | works now: `scripts/50-verify.sh` runs `scripts/demo-testnet.mjs`, which reads the ids from `config.yaml` and prints contract version, exit capacity, pool, quotes, positions and explorer links (see [Live on testnet](/start/live-on-testnet)); 3 s in the G9 re-run. |
| 4 | `pnpm --filter web dev` | starts `apps/web` on http://localhost:3100 (`next dev -p 3100`; G3 PASS). |
| 5 | `pnpm --filter docs-site start` | works: this site on http://localhost:3000 |

`demo:testnet` reads public state only. It never signs, needs no key and costs nothing.

## Pages to open

On http://localhost:3100: `/` (landing), `/borrow`, `/feed`, `/feed/NVDAx`, `/quote/new`, `/console`, `/notes`, `/reserve`, `/shield`, `/agents`, `/keepers`, `/security`, `/talk`, `/docs`, `/legal/privacy` (also `cookies`, `terms`, `disclaimers`). Per-object pages: `/position/<id>`, `/quote/<id>`, `/note/<token id>` (for example `/note/q-0`). Source: the `page.tsx` files under `apps/web/app`.

The Feed (`pnpm --filter feed start`) needs no env; ports, store path and MCP registration are on [Feed MCP](/integrate/feed-mcp).

## Writing to testnet

To post a quote or borrow you need a NEAR testnet account with faucet NEAR and mock tokens. Testnet NEAR comes from https://near-faucet.io/ (F-154). Mock USDC (`usdc-mock.nectar.testnet`) and mock NVDAx (`nvdax-mock.nectar.testnet`) are test tokens with no value; `mint` on both is owner-only (contracts/mock-ft/src/lib.rs), so there is no self-serve mint. The demo accounts on [Live on testnet](/start/live-on-testnet) are already funded.
