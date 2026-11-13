# Demo takes (WO-35c)

`take.mjs` records the five sections of the demo (docs/process/work/wo-35-demo-video.md, docs/DEMO_SCRIPT.md) as one continuous take each, with
the WO-35a capture tooling (`../capture/recorder.mjs`, `human.mjs`, `gapcheck.mjs`, `terminal/server.mjs`), then writes `edit.json` for
`../capture/compose.mjs` (WO-35b, `../capture/EDIT.md`).

```sh
# rehearsal: Standard protection, every wallet popup opened and cancelled, section 5 runs "echo dry-run"
node scripts/demo/takes/take.mjs --mode rehearsal --section all
# real take (after the 21:00 UTC close, Kunal's decision 2026-11-13): headed Chrome, Weekend Shield, wallet approvals, the agent command
CAPTURE_HEADED=1 node scripts/demo/takes/take.mjs --mode take --section all --sign --out ~/.nectar/demo-capture/take-a
```

| Option | Meaning |
| --- | --- |
| `--mode rehearsal\|take` | `take`: Weekend Shield and the caption "Market closed: weekend limits apply."; `rehearsal`: Standard and "Standard protection (rehearsal)." |
| `--section 1..5\|all` | One section or all, in order. A section run on its own starts from where the previous one ends (opened off camera). |
| `--sign` | The only switch that approves anything: the Intear popup's **Approve** (faucet in 2, borrow in 3) and the real agent command in 5 (signs as agent1.nectar.testnet, pays 0.01 mock USDC). Without it every popup is probed and **Cancel**led. |
| `--out dir` | Default `~/.nectar/demo-capture/wo35c-<mode>-<UTC stamp>`. Writes `s1/` … `s5/` (shared take format), `edit.json`, `run.json`. |
| dev only | `--profile tmp\|dir` (throwaway profile instead of `~/.nectar/demo-chrome-profile`; no wallet), `--tx <hash>` and `--position <id>` (stand-ins for the explorer tab and the position page when the run made no transaction), `--cmd "<cmd>"` (section 5 dry-run command; the agent command is refused without `--sign`). |

Launch: `CAPTURE_LAUNCH` (1920×1080, DSF 2, dark) on the dedicated profile, which holds the connected Intear wallet. The profile is only browsed
(no settings, no disconnect, no import); Chrome is closed at the end (profile lock). Headless fails gapcheck on app pages; real takes run
with `CAPTURE_HEADED=1` (CAPTURE.md).

Cursor and pacing (WO-35d): takes default to `CURSOR_POST=1` (no DOM cursor; compose draws it from the logged samples; `CURSOR_POST=0` brings
the DOM cursor back). The `#sim` drag is 14 even steps over ~1.2 s with a rendered frame awaited after each; typed amounts are followed by a
settle on `[data-testid=borrow-outcome]` (unchanged for 500 ms, smooth frames); every click that opens a page, panel, modal or wallet window
is followed by a settle until the page paints smoothly, and every box + hold starts with one. Settles are logged as waits ("settle …").

## Sections

| # | Start | On camera | Holds / marks |
| --- | --- | --- | --- |
| 1 Market | /feed | hero capacity → NVDAx row → /feed/NVDAx: `[data-testid=market-exit]`, first `[data-testid=market-ladder] tbody tr`, next row, zoom out | caption carries the URL and the 7-day notice (the ladder has no tooltip) |
| 2 Test assets | /feed/NVDAx | nav **Borrow** (the app then scrolls /borrow down by itself; the take scrolls back up) → `wallet-button` = demo.nectar.testnet → **Get test assets** → "Review: Get test assets" modal → **Open wallet to sign** → Intear popup → Approve (`--sign`) / Cancel → result notice → "Balance … NVDAx" | `mark tx` per faucet tx. With `--sign` and ≥ 5 mock NVDAx already held, the section is skipped (WO-35). |
| 3 Borrow | /borrow | type 5 units and 100 USDC (key by key) → `borrow-limit` → protection (`protection-weekend` in take mode, `protection-standard` in rehearsal) → `borrow-outcome`, `preview-fees` → **Review borrow** → drawer → **Show what your wallet signs** → **Confirm in wallet** → app sign modal → **Open wallet to sign** → Intear popup → Approve / Cancel → toast `tx <hash>` | zoom on the hash, `mark tx`; reads "View loan #N" for section 4 |
| 4 Position | drawer "View loan #N" | `/position/N`: health ring ("Health at the simulated price"), one paced drag of `#sim` (35 % down the track, 14 steps), ring again → new tab on the explorer, 2 s on the tx | without a new loan: stand-in position opened off camera |
| 5 Agent | terminal page | types `pnpm -s --filter x402 demo:testnet` (no localhost, no paths on screen); env from `~/.nectar/demo-x402.env` (created 0600 if missing: `X402_URL`, `AGENT1_KEY_PATH`, `FEED_MCP_URL`, paths and ids only) → holds on `borrow_sent`, `challenge` 402, `paid_fetch` 200 → explorer tab on the agent's borrow tx | `mark tx` for the borrow and the x402 payment |

Explorer: testnet.nearblocks.io answers this automated Chrome (headless and headed) with a Cloudflare "Just a moment..." wall (HTTP 403),
so the script checks it once off camera and otherwise opens **testnet.near.rocks/tx/<hash>** (FastNear's explorer, dark with the system
theme). explorer.testnet.near.org is only a light-themed chooser (Near Rocks recommended, Nearblocks). Near Rocks shows no "Success"
label: the summary card (hash, signer, receiver, block) is held 2 s. Marks keep the nearblocks link as `explorer` and add `shown`.

Section 5 needs the local x402 server on :8791 against the hosted Feed (DEMO_SCRIPT step 6) and a funded agent1; the script never starts
or stops host services.

## Outputs

- `s<N>/`: frames, `frames.jsonl`, `events.jsonl` (section, box, hold, wait, mark, popup, cursor, click, motion events), `take.json`; gapcheck runs
  per section (motion ≤ 100 ms, holds ≤ 120 ms, transitions reported; CAPTURE.md).
- `edit.json`: intro → recorded sections (caption per section start) → end card ("Testnet with mock collateral", 4 URLs). Then
  `node scripts/demo/capture/compose.mjs <out>/edit.json <frames dir> --captions`.
- `run.json`: per section selectors found, duration, gapcheck, tx hashes, wallet popup probe (title, headings, button labels; never input values), notes.
