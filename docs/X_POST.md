# X_POST.md — draft only; Kunal posts it himself (H3). Never posted by an agent.

Rules (docs/HACKATHON.md "2. The demo post"): says built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, video (H11)
attached to post 1. Every number below appears in docs/EVIDENCE.md (source in brackets after each post; delete the brackets before posting).
Links: repo `TODO-H2`; production URLs SITE https://nectarlabs.vercel.app, APP https://nectarlabs-app.vercel.app, DOCS https://nectarlabs-app.vercel.app/docs. They must not change after the post (nectarlabs.io is not registered, F-395). Post 1 URL becomes `demoUrl` in docs/SUBMISSION.md. Each post ≤ 280 characters (links count as 23).

## Thread (5 posts)
1/ Lenders cap loans against tokenized stocks because DEX exit can vanish. Nectar Labs, built at NEAR HACKATHON: market makers escrow committed buy quotes on NEAR; borrowers get higher limits and pay the buyers a premium. Testnet, mock collateral. @NEARProtocol #NEARHackathon
[video H11; README first screen]

2/ How it works: quotes are escrowed USDC with a notice period. If a loan gets unhealthy, a keeper with only a function-call key triggers pre-liquidation and the collateral goes to the committed buyer at a capped discount, not to a DEX.
[G1, G2 PASS; G2b keeper-v2 one function-call key; D-010, D-012, D-019]

3/ A hash-pinned OutLayer TEE program prices the discount, so the computation is verifiable. The contract accepts only that program and clamps the result. Testnet request 15148: 159 bps vs a 400 bps cap. If the call fails, it settles at the cap. Inputs: operator-set demo values.
[G4 PASS + addendum]

4/ Cross-chain: the contract builds each settlement or release message and NEAR Chain Signatures signs it with a key derived per position. A Solana devnet vault checks the Ed25519 signature before it pays the buyer or releases collateral. Price: owner oracle for now (disclosed).
[G7 PASS, re-run after D-027; G5 FALLBACK]

5/ Try it: https://nectarlabs-app.vercel.app · docs: https://nectarlabs-app.vercel.app/docs · code and every gate log with explorer links: TODO-H2. Feedback we want: would you lend against tokenized equities if the exit buyer were committed on-chain? What would you need to see first? @NearBuilders
[docs/EVIDENCE.md; README "Hosted demo"]

## Standalone post
Tokenized-stock loans are capped: exit liquidity can vanish. Nectar Labs, built at NEAR HACKATHON: committed market-maker quotes raise limits; a TEE prices settlement verifiably (159 vs 400 bps cap). Testnet, mock collateral. https://nectarlabs-app.vercel.app @NEARProtocol #NEARHackathon
[G4 addendum]
