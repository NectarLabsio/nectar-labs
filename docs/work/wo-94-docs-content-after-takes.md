# WO-94 — README stills, Intear wording, post 1, docs-site method names (docs agent; WO-92 step 2). Base: main f790b8c.

Write early: draft every edit within ~20 tool calls, then verify in one batched pass. Text only: no pnpm install, no deploys, no git mv/rm of other files
(the repo cleanup is WO-95, after this merges).

1. README stills (Kunal: "the README screenshots come from" the after-close takes). New files on main, from take A (2026-11-13 21:00:50–21:03:59Z,
   market closed, `session_reason: outside_hours` at block 277562411):
   01-landing.png (landing hero) · 02-market.png (NVDAx market: "Weekend parameters", free to borrow $2,537, haircut 25 %) ·
   03-borrow-weekend.png (/borrow: 5 NVDAx, 100 USDC, Weekend Shield selected "15 bps, $0.15", limit $472, health 4.89, aggregate headroom
   $2,537.91, fees $0.45, receive $99.55) · 04-position.png (Loan #22 Open, health 4.89 at $135.00, Weekend Shield window ends Mon 09:30 New York ·
   2026-11-16 14:30 UTC, fee 15 bps $0.15, toast "Weekend Shield opened tx 9uwAk6Vy…") · 05-explorer.png (testnet.near.rocks, tx 9uwAk6Vy…,
   signer demo.nectar.testnet, NFT mint p-22, 5 NVDAx to nectar-core-v2).
   Put 03-borrow-weekend.png on the first screen in place of 03-borrow-preview.png, fill the screen-2 and screen-4 slots in the 60-second path
   (02, 04), and add 01/05 where they help. Alt text describes what is visible. Keep 06-agent-402-200.png (the README cites its 19:41Z run).
   Look at each PNG before writing its alt text. 03-borrow-preview.png then has no reference: list it for WO-95 removal, do not delete it.
2. Weekend borrow, verified (orchestrator, archival RPC 2026-11-13 ~21:02Z): tx 9uwAk6Vyun9s2bi2wu1a7H5er3pRLpuVN3HYgYvsEfni SuccessValue,
   events `shield_opened` {position 22, kind Weekend, fee_bps 15, fee_usd_e6 150000, window_end_ns 1794839400000000000} and `position_opened`
   {22, 5 NVDAx, debt $100, net $99.55}, with the market closed. Second one: 475VLHwE9Nvkgq2kc15NWVQJLDyLmvcyD2Y2fNAURF1W (#24, same shield).
   README "what we set out to prove" / claims: a borrow during a closed market is now recorded on testnet (cite 9uwAk6Vy…). Remove any line that
   says it is sandbox-tested only.
3. Intear toast: the README says the borrow notification has no tx hash with Intear. Tonight's two Weekend Shield borrows showed the hash; the
   afternoon's Standard borrows did not. Reword to: the notification may not include the hash; if not, open your account on nearblocks (newest
   ft_transfer_call to nvdax-mock). No product change.
4. docs/X_POST.md post 1: Kunal 2026-11-13: restore "so you can borrow against tokenized stocks all weekend" only if take A's weekend borrow lands;
   cite its tx. It landed: restore it, cite 9uwAk6Vy… in the bracket notes, keep post 1 ≤ 280 (links = 23), recount all three. Note in the file that
   the after-close video (1:28, take A) is the reply to post 1.
5. docs-site method names (apps/docs-site): fix every method name that is not in the contract's exports — `move_note` (private fn; callable:
   nft_transfer / nft_transfer_call), and check `on_repay`, `start_quoter`, `settle_remote`, `set_session`, the contract-reference "not in default
   build" error, and the position-notes "previous owner loses access at once" overstatement (old holder can still repay; collateral goes to the
   Note's holder; old holder cannot self_settle or re-transfer). Source of truth: `#[near]` pub fns in contracts/nectar-core/src/*.rs.
   Grep the built site's source (apps/docs-site/docs, src) — not the deployed site.

Checks: banned-word grep (wo-92 line 32); relative links resolve; branding check `node scripts/check-no-branding-all.mjs` 0; SUBMISSION idea ≤ 2000.
Commit (one or two `docs:` commits). NO Co-Authored-By. Report ≤ 15 lines: README lines changed, alt texts, post lengths, each docs-site fix
(file:line old → new), anything unverified.
