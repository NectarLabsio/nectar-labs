# X_POST.md — draft only; Kunal posts it himself (H3). Never posted by an agent.

Rules (docs/HACKATHON.md "2. The demo post"): says built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, video (H11)
attached to post 1. Every number below appears in docs/EVIDENCE.md (source in brackets after each post; delete the brackets before posting).
Links: repo `TODO-H2`. Post 1 URL becomes `demoUrl` in docs/SUBMISSION.md. Each post ≤ 280 characters (links count as 23).

## Thread (5 posts)
1/ Lenders cap loans against tokenized stocks because DEX exit can vanish. Nectar Labs, built at NEAR HACKATHON: market makers escrow committed buy quotes on NEAR; borrowers get higher limits and pay the buyers a premium. Testnet, mock collateral. @NEARProtocol #NEARHackathon
[video H11; README first screen]

2/ How it works: quotes are escrowed USDC with a notice period. If a loan gets unhealthy, a keeper with a two-method function-call key triggers pre-liquidation and the collateral goes to the committed buyer at a capped discount, not to a DEX.
[G1, G2 PASS; D-010, D-012]

3/ The discount is priced inside an OutLayer TEE from encrypted market-maker inputs. The contract only accepts the pinned program and clamps the result. Testnet request 15148: 159 bps against a 400 bps cap. If the TEE call fails, it settles at the cap. Inputs are demo values.
[G4 PASS + addendum]

4/ Cross-chain, NEAR side: the contract builds the settlement message itself and NEAR Chain Signatures signs the raw bytes (Ed25519) for a derived Solana key. Verified on testnet. The Solana program that checks it is not built yet. Price: owner oracle for now (disclosed).
[G7 PARTIAL; G5 FALLBACK]

5/ Code, docs and every gate log with explorer links: TODO-H2. Feedback we want: would you lend against tokenized equities if the exit buyer were committed on-chain? What would you need to see first? @NearBuilders
[docs/EVIDENCE.md]

## Standalone post
Tokenized-stock loans are capped: exit liquidity can vanish. Nectar Labs, built at NEAR HACKATHON: committed market-maker quotes on NEAR raise the limit; a TEE prices settlement (159 vs 400 bps cap). Testnet, mock collateral. TODO-H2 @NEARProtocol #NEARHackathon
[G4 addendum]
