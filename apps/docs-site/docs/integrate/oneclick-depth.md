---
title: 1Click depth
slug: /integrate/oneclick-depth
description: Signed dry quotes from the 1Click API as a read-only depth signal.
---
# 1Click depth

<p className="verified">Verified against: F-002 (2026-11-09), F-060 (2026-11-10), F-061 (2026-11-10), F-062 (2026-11-09), F-063 (2026-11-10), F-064 / C-014 (2026-11-09) · docs/EVIDENCE.md G6 PASS 2026-11-09T22:58Z (fea52b7) · test `pnpm --filter feed test` "1Click live (NECTAR_IT=1; read-only, dry only)"</p>
<p className="status">Status on 2026-11-10: G6 PASS. Dry quotes only; nothing is ever deposited (no Intents testnet).</p>

## What it is

The Feed's sampler (`services/feed/src/oneclick.ts`) asks the 1Click Swap API (`https://1click.chaindefuser.com`, F-060) for quotes with `dry: true` every 5 minutes. The client can reach only `GET /v0/tokens` and `POST /v0/quote`, and it refuses any request body that is not dry. Every response must pass `verifyQuoteSignature` from the one-click SDK (F-062). If one signature in a set fails, the whole set is dropped.

## NVDAx: no route

The 1Click token list (216 tokens on 39 chains) has no NVDA or other tokenized equity (F-063). The Feed shows "no 1Click route" for NVDAx, and the contract uses `D_c` = 0. This status comes from the live token list, not a hard-coded badge.

## Reference pair

So the panel still shows a real, signed depth signal, the Feed samples **wNEAR → USDC** at three sizes ($500, $1,000, $2,000). Price impact is computed from base units (`amountIn`, `amountOut`, token decimals), never from `amountOutUsd` (C-014). The worst case uses `minAmountOut`. G6 live run: impact 0 bps at all three sizes, worst case about 100 bps (the slippage floor). This pair is deep, so the numbers show the plumbing works, not the depth of any equity market.

## Read it

```bash
pnpm --filter feed start                      # sampler + REST on :8788
curl http://127.0.0.1:8788/api/oneclick       # pairs, samples, NVDAx status
FEED_FIXTURES=1 pnpm --filter feed start      # replay recorded dry quotes, no network
```

The web app's `/feed` page renders the same API response. See also [Feed REST](/integrate/feed-rest).
