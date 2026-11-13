# X_POST.md — draft only; Kunal posts it himself (H3). Never posted by an agent.

Rules (docs/HACKATHON.md "2. The demo post"): lead with the user problem; say it was built at NEAR HACKATHON; tag @NEARProtocol and #NEARHackathon;
attach the video or screenshots; explain NEAR's role concretely; link the demo and the repo and ask a real question. Each post ≤ 280 characters
(X counts every link as 23). Started from Kunal's 3-post draft (WO-89, 2026-11-13); every claim checked against docs/EVIDENCE.md or testnet RPC
(source in brackets after each post; delete the brackets before posting). The URL of post 1 becomes `demoUrl` in docs/SUBMISSION.md: `TODO-H3`.
Media (WO-35): post 1 = the demo video, captioned, 1280×720; post 2 = screenshot 3 (borrow preview just after the close on 2026-11-13: Weekend Shield selected at 15 bps, limit $472, fees $0.45,
health 4.89; the borrow that opened loan #22), post 3 = screenshot 6 (agent terminal, 402 → 200, 168 rows, 2026-11-13T19:41Z),
both as 1600×900 JPG copies of docs/media/screens/03-borrow-weekend.png and 06-agent-402-200.png. Re-checked against the final README for WO-92 and WO-94.
Reply to post 1: the after-close video (1:28, take A, recorded 2026-11-13 21:00–21:04Z with the market closed), which shows the Weekend Shield borrow of loan #22.

## Thread (3 posts)
1/
Stock market closed for the weekend? Lenders lose their price, so they cut your limit or sell your shares.
Nectar: market makers escrow buy quotes on-chain, so you can borrow against tokenized stocks all weekend.
Built at NEAR HACKATHON on testnet. @NEARProtocol #NEARHackathon

[video; reply: the after-close video (1:28, take A). "so you can borrow against tokenized stocks all weekend" is Kunal's draft wording, restored
because the take-A borrow landed with the market closed: tx 9uwAk6Vyun9s2bi2wu1a7H5er3pRLpuVN3HYgYvsEfni (2026-11-13T21:02Z, after the New York close;
`shield_opened` Weekend 15 bps for loan #22, window to 2026-11-16 14:30 UTC; `position_opened` 5 NVDAx, $100 debt, $99.55 net), and 475VLHwE… (#24,
21:06Z); both SuccessValue on archival RPC, re-checked 2026-11-13T21:26Z. Quotes stay escrowed over a weekend because withdrawal needs 7 days'
notice (`min_notice_period_ns` 604800000000000 in `get_config`, read 2026-11-13). "On testnet": README first screen]

2/
What NEAR does here:
- one Rust contract escrows the quotes and enforces each loan's limit
- each loan is an NFT (NEP-171): transfer it and the loan's rights move with it
- agents pay for data over x402 with NEP-366 meta-transactions
- our price bot's key can call one method only

[screenshot 3. Contract: README "How NEAR is used" item 1, refusal tx 9ykovXkm… (`aggregate_limit`). NFT: tx GcHF75nW… `nft_mint p-4`; tests
`v7_notes_self_settle_by_new_loan_owner`, `v7_notes_residual_collateral_goes_to_loan_note_owner`; "rights" rather than "the loan moves", because
repay is permissionless and remote collateral is released to the depositor (SECURITY.md "What remains" item 12). x402: tx 6karZo8L… action
`Delegate` (2026-11-13T19:41Z) and 8bXCY34S… (12:28Z), verifier run 4vW2tPF5… (EVIDENCE §G14). Key: AddKey tx BHopF1cu…; `view_access_key_list nectar.testnet` on 2026-11-13
shows method_names [update_owner_price], receiver nectar-core-v2. All txs SuccessValue on testnet RPC, re-checked 2026-11-13T20:12Z]

3/
Try it (testnet, mock assets, no value): https://testnet.nectarlabs.io
Code: https://github.com/NectarLabsio/nectar-labs
Market makers: what notice period would you commit to on a weekend quote? @NEARProtocol #NEARHackathon

[screenshot 6. App: 200 on 2026-11-13 ~18:31Z and 20:13Z, production acceptance PASS 5/5 (EVIDENCE §"WO-34 production (web + docs c9fd56b, WO-85/86 brand)").
Repo: public, fresh clone from this URL PASS (EVIDENCE §G9 run 8). Mock assets: README "What is real, what is mock"]

Lengths as X counts them (links = 23), 2026-11-13: post 1 = 278, post 2 = 280, post 3 = 197. Recount after any edit.
