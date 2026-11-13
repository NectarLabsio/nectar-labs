# WO-35 Weekend Shield video: independent frame review (WO-96)

Reviewer: verifier. Finished 2026-11-13 at about 21:35Z. I had not seen the edit before this review. The tx check is in weekend-txcheck-20261113T213157Z.log.
Inputs, read-only, outside the repo (demo media folder `demo/weekend/`): nectar-demo.mp4 (1920x1080, 30 fps, 88.23 s),
nectar-demo-captions.mp4 (same length), shotlist.md, nectar-demo.srt; raw take tx lists raw/take-a/txs.json and raw/take-b/txs.json.

## Method

- One frame per second from the master, t = 0 … 87 s (88 frames). I read them all as 3x3 contact sheets (640 px tiles),
  and re-read 0, 3, 5, 12, 24, 38, 40, 42, 53, 55, 56, 64, 66, 76, 81 and 84 s at full resolution, cropped.
- Between-sample check: scene detection (score > 0.012). It found 33 change points, and the 1 fps frames cover all of them;
  I extracted sub-second frames at 23.5, 44.7, 48.0 and 52.7 s.
- Overlay sweep over **every frame** (2,647) of the master and the captioned version: I looked for pale-yellow
  browser/DevTools banner pixels (R,G > 225; B 130–220). The 720p master shows the same 48.0 s hit.
- Captions: I read the captioned version at 1.7, 14.0, 29.0, 56.1 and 67.8 s, then compared the text and timing with
  shotlist.md and nectar-demo.srt.

## Findings by timestamp (master; the captioned version is the same picture)

| t | Severity | Finding |
| --- | --- | --- |
| 0:48.000–0:48.067 (2 frames) | **fix before sending** | Chrome banner "Debugger paused in another tab, click to switch to that tab." (yellow, top centre, over the Review: Open Weekend Shield modal) appears as the wallet popup opens. It is in the master, the captioned version and the 720p master. The sweep found no other frame with it. Cut those 2 frames, or freeze 0:47.967 over them. |
| 0:03–0:04 | minor | The NVDAx market page shows an empty loading skeleton (3 grey bars) for about 1.5 s, with the full footer visible. |
| 0:03–0:04, 0:55 | review | The site footer shows the contact address `kunal@nectarnetwork.fun`, a personal first-name address on an old-brand domain. It is public on the production site, but you may not want it in the video. |
| 0:05–0:11 | review | An amber price badge `owner · 62s · no conf` sits next to $135.00. It does not say "stale", but it is amber and says "no conf". It matches the owner oracle in shotlist.md. |
| 0:05–0:11 | cosmetic | "Who stands behind NVDAx" table: the right-hand column header ("Cu…") and "counts as zero while the market…" are cut off at the card edge. |
| 0:12–0:15 | expected | Amber empty-state notice "No NVDAx (mock) balance" before the faucet (section 2). It is not the copilot "Key missing" notice. |
| 0:22–0:23, 0:51–0:52, 1:10–1:14 | note | A small "4×"/"3×" speed badge in the top right during sped-up waits. The edit adds it on purpose. |
| 0:27.3–0:30.8 (captioned only) | cosmetic | The caption "Market closed: Weekend Shield." covers the lower part of the Weekend Shield card, and Standard is still selected until 0:33. |
| 0:37–0:38 | cosmetic | Fees row: "Weekend Shield fee … $0.15" wraps as "$0." / "15". |
| 0:38 | note | Aggregate headroom shows $2,537.91. shotlist.md has $2,537.92 at block 277562411; the UI reading is about 1 min later. |
| 0:53–0:54 | minor | Behind the blurred "Loan opened" drawer, the form now shows a red "More than your balance" error on "You lock 5" and the amber "No NVDAx (mock) balance" notice again. The balance is 0 after the lock. |
| 0:55 | minor | The Loan #22 page shows a loading skeleton for about 0.7 s. |
| 0:56–1:01 | minor | Loan #22: flag price $27.59 (strip and slider), but "Flag price after $27.57" in the Repay panel, on the same screen. The borrow page used $27.57. |
| 1:02–1:03, 1:20 | minor | near.rocks shows an empty "Loading transaction…" panel for about 1.5 s each time. At 1:04 and 1:21, "transferred ◌ to" shows a spinner before the amount appears. |
| 1:06–1:08 | minor | An almost empty black terminal (only `$`, then the command being typed). The prompt shows no home path, user or host. |
| 1:15 | cosmetic | The terminal log lines `challenge` (402) and `paid_fetch` (200) have the same timestamp, 21:03:50.797Z. |

No error toasts, no localhost URLs, no wrong hosts, no hackathon branding, and no copilot "Key missing" notice in any reviewed frame.
The amber notices seen are the "Weekend parameters" badge and card, the no-balance notice and the shield "window open" pill.
URLs on screen: testnet.nectarlabs.io (wallet "Request from"), testnet.nearblocks.io (terminal), NEAR Rocks testnet,
and on the end card https://testnet.nectarlabs.io · https://github.com/NectarLabsio/nectar-labs.

## On-screen numbers vs shotlist.md

| Shotlist item | On screen | Match |
| --- | --- | --- |
| Faucet txs 35FK4ZjN…, G68Lvp41… | "Test assets sent" box at 0:24 (full hashes) | yes |
| Loan #22, 5 NVDAx, $100 debt | Review / Loan opened drawers 0:39–0:54; Loan #22 page 0:56 | yes |
| Weekend Shield 15 bps / $0.15 | Protection card 0:33+, fees row 0:37, Loan #22 shield panel 0:56 | yes |
| $99.55 net | You receive 0:34+, drawers, modal 0:45 | yes (origination 30 bps $0.30, total $0.45) |
| Window ends 2026-11-16 14:30 UTC | Loan #22 shield panel; window_end_ns 1794839400000000000 in msg 0:40–0:47 | yes |
| Borrow tx 9uwAk6Vy… | toast 0:56–1:01; NEAR Rocks 1:04 (block 277,562,578, NFTMint p-22) | yes |
| Haircut 25 %, free to borrow $2,537 | 0:00 and 0:05 | yes |
| Agent borrow 8QrZ9cSX… by agent1 | terminal 1:12; NEAR Rocks 1:21 (p-23, $10 borrow) | yes |
| x402 402 → 200, AJ1Tf7f3… | terminal 1:15: challenge status 402 (0.01 mock USDC, 10000 base units), paid_fetch status 200, rows 168, transaction AJ1Tf7f3… | yes |

## Captions (captioned version vs shotlist.md and srt)

All 5 captions match shotlist.md word for word and appear at the srt times (0:00.0, 0:12.3, 0:27.267, 0:54.367, 1:06.033),
about 0.33 s after each section start because of the 10-frame dissolve. The end card has no caption; its text is part of the
card, as shotlist.md lists. Caption position is bottom left. Only the overlap at 0:27–0:31 is noted (above).

## Verdict

1 item to fix before sending: the 2-frame Chrome debugger banner at 0:48.0. Everything else is minor or cosmetic, or needs
Kunal to decide (footer email, amber oracle badge).
