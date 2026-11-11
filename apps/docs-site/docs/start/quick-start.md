---
title: Quick start
slug: /start/quick-start
description: Five commands from a fresh clone, no keys.
---
# Quick start (no keys needed)

<p className="verified">Verified against: F-012 (2026-11-09), F-026 (2026-11-10), F-090 (2026-11-09), F-369 (2026-11-10) · D-025 · root package.json scripts, scripts/50-verify.sh, evidence/G2/demo-testnet-20261109T2049Z.log (2026-11-09) · docs/EVIDENCE.md §G9 run 3 (2026-11-11T15:30Z–15:38Z, tested 3107a1a, recorded in 837cd12) and re-run (2026-11-11T08:57Z–09:00Z, tested 0af5cdd, recorded in 89f83ee), §G3 (2026-11-09T21:15Z), §G3b re-runs (2026-11-11: PASS on 3ab3026; re-run 2 PASS on fd6592d, recorded in 5770fa7)</p>
<p className="status">Status on 2026-11-11: commands 2 to 5 work; command 1 needs the public repo URL (H2). G9 PASS: in the verifier's latest fresh-clone run (docs/EVIDENCE.md §G9 run 3, tested 3107a1a, recorded in 837cd12) commands 2 and 3, `pnpm verify` and the docs build took about 2.3 minutes, all exit 0; command 4 was not run there (port 3100 was busy) and the app was checked with `next build && next start`. In the earlier re-run (recorded in 89f83ee) all 21 listed web routes answered in under 2 minutes. Contracts on testnet: G2 PASS 2026-11-09T20:55Z (5f27f44), nectar-core-v2 G2b PASS. Web: G3 PASS 2026-11-09T21:15Z (176914f); G3b re-run 2 PASS 2026-11-11 after the review 2 web fixes (tested fd6592d, recorded in 5770fa7: e2e 404 passed / 0 failed, screens.spec 76/76, Lighthouse 28/28 = 100); re-run 1 had failed on screenshot tests only, fixed in WO-49.</p>

```bash
git clone <repo-url> nectar-labs && cd nectar-labs   # repo URL: TODO-H2 (private until Kunal publishes it)
pnpm i
pnpm demo:testnet            # read-only views against the testnet contract
pnpm --filter web dev        # web app on http://localhost:3100
pnpm --filter docs-site start  # this site on http://localhost:3000/docs/
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
| 2 | `pnpm i` | works; installs from `pnpm-lock.yaml` (13 s in G9 run 3; a cold pnpm store is slower) |
| 3 | `pnpm demo:testnet` | works now: `scripts/50-verify.sh` runs `scripts/demo-testnet.mjs`, which reads the ids from `config.yaml` and prints contract version, exit capacity, pool, quotes, positions and explorer links (see [Live on testnet](/start/live-on-testnet)); 5 s in G9 run 3. |
| 4 | `pnpm --filter web dev` | starts `apps/web` on `http://localhost:3100` (`next dev -p 3100`; G3 PASS). |
| 5 | `pnpm --filter docs-site start` | works: this site on `http://localhost:3000/docs/` |

`demo:testnet` reads public state only. It never signs, needs no key and costs nothing.

## Pages to open

On `http://localhost:3100`: `/` (landing), `/borrow`, `/feed`, `/feed/NVDAx`, `/quote/new`, `/console`, `/notes`, `/reserve`, `/shield`, `/agents`, `/keepers`, `/security`, `/talk`, `/docs`, `/legal/privacy` (also `cookies`, `terms`, `disclaimers`). Per-object pages: `/position/<id>`, `/quote/<id>`, `/note/<token id>` (for example `/note/q-0`). Source: the `page.tsx` files under `apps/web/app`.

The Feed (`pnpm --filter feed start`) needs no env; ports, store path and MCP registration are on [Feed MCP](/integrate/feed-mcp).

## Writing to testnet

To post a quote or borrow you need a NEAR testnet account with faucet NEAR and mock tokens. Testnet NEAR comes from https://near-faucet.io/ (F-154). Mock USDC (`usdc-mock.nectar.testnet`) and mock NVDAx (`nvdax-mock.nectar.testnet`) are test tokens with no value; `mint` on both is owner-only (contracts/mock-ft/src/lib.rs), so there is no self-serve mint. The demo accounts on [Live on testnet](/start/live-on-testnet) are already funded.
