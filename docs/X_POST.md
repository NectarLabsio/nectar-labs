# X_POST.md — draft only; Kunal posts it himself (H3). Never posted by an agent.

Rules (docs/HACKATHON.md "2. The demo post"): lead with the user problem; say it was built at NEAR HACKATHON; tag @NEARProtocol and #NEARHackathon;
attach the video or screenshots; explain NEAR's role concretely; link the demo and the repo and ask a real question. Each post ≤ 280 characters
(X counts every link as 23). Started from Kunal's 3-post draft (WO-89, 2026-11-13); every claim checked against docs/EVIDENCE.md or testnet RPC
(source in brackets after each post; delete the brackets before posting). The URL of post 1 becomes `demoUrl` in docs/SUBMISSION.md: `TODO-H3`.
Media (WO-35): post 1 = the demo video, captioned, 1280×720; post 2 = screenshot 3 (borrow with the Weekend Shield preview), post 3 = screenshot 6
(agent terminal, 402 → 200), both as 1600×900 JPG from docs/media/screens/.

## Thread (3 posts)
1/
Stock market closed for the weekend? Lenders lose their price, so they cut your limit or sell your shares.
Nectar: market makers escrow buy quotes on-chain, so your limit rests on committed buyers, weekend or not.
Built at NEAR HACKATHON on testnet. @NEARProtocol #NEARHackathon

[video. Changed from the draft: "so you can borrow against tokenized stocks all weekend" became "your limit rests on committed buyers, weekend or
not". No borrow during a closed market is recorded on testnet; the closed-market rule is sandbox-tested only. Quotes stay escrowed over a
weekend because withdrawal needs 7 days' notice (`min_notice_period_ns` 604800000000000 in `get_config`, read 2026-11-13). "On testnet": README first screen]

2/
What NEAR does here:
- one Rust contract escrows the quotes and enforces each loan's limit
- each loan is an NFT (NEP-171): transfer it and the loan's rights move with it
- agents pay for data over x402 with NEP-366 meta-transactions
- our price bot's key can call one method only

[screenshot 3. Contract: README "How NEAR is used" item 1, refusal tx 9ykovXkm… (`aggregate_limit`). NFT: tx GcHF75nW… `nft_mint p-4`; tests
`v7_notes_self_settle_by_new_loan_owner`, `v7_notes_residual_collateral_goes_to_loan_note_owner`; "rights" rather than "the loan moves", because
repay is permissionless and remote collateral is released to the depositor (SECURITY.md "What remains" item 12). x402: tx 8bXCY34S… action
`Delegate` (2026-11-13), verifier run 4vW2tPF5… (EVIDENCE §G14). Key: AddKey tx BHopF1cu…; `view_access_key_list nectar.testnet` on 2026-11-13
shows method_names [update_owner_price], receiver nectar-core-v2. All txs SuccessValue on testnet RPC, 2026-11-13 ~18:30Z]

3/
Try it (testnet, mock assets, no value): https://testnet.nectarlabs.io
Code: https://github.com/NectarLabsio/nectar-labs
Market makers: what notice period would you commit to on a weekend quote? @NEARProtocol #NEARHackathon

[screenshot 6. App: 200 on 2026-11-13 ~18:31Z, production acceptance PASS 5/5 (EVIDENCE §"WO-34 production (web + docs c9fd56b, WO-85/86 brand)").
Repo: public, fresh clone from this URL PASS (EVIDENCE §G9 run 8). Mock assets: README "What is real, what is mock"]

Lengths as X counts them (links = 23), 2026-11-13: post 1 = 278, post 2 = 280, post 3 = 197. Recount after any edit.
