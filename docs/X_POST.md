# X_POST.md — draft only; posted by Kunal (H3). Numbers only from docs/EVIDENCE.md.

Thread (≤ 280 chars each):
1/ Lenders cap LTV on tokenized stocks because DEX exit liquidity is revocable. Nectar Labs makes it committed: market makers escrow time-locked quotes on NEAR, and borrowers get a higher limit for a premium that pays the buyers. Built for the NEAR Hackathon. 🧵
2/ Built for NEAR testnet (live only after G2; edit before posting): Pappus quotes (escrowed USDC, notice period), Cramér limits (B_c = min(LTV·V, (1−h)(Q+R+D))), O(1) fee index, pre-liquidation that sells to the committed buyer instead of a DEX. Mock collateral, disclosed. [link TODO-H2]
3/ Pricing happens in a TEE: an OutLayer program computes the clearing discount from private market-maker parameters; the contract only accepts a pinned program and clamps the result. Every settlement links its attestation. [evidence link]
4/ Cross-chain without a bridge key: nectar-core builds the settlement message, NEAR Chain Signatures signs it (Ed25519), a Solana program verifies the signature on-chain before releasing collateral. The keeper only relays. [tx links]
5/ Open source, MIT, docs + Feed MCP for agents. Testnet only; mainnet is a roadmap item with audit first. Thanks to the NEAR, OutLayer and NEAR AI Cloud teams. [docs link]

Single post:
Nectar Labs: committed market-maker quotes → higher borrowing limits on thin-exit collateral. NEAR testnet, TEE-priced settlement, Chain-Signatures-signed Solana leg. Built for the NEAR Hackathon. [link]
