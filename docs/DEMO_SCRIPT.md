# DEMO_SCRIPT.md — 3 minutes, exact clicks

Pre-state (seeded by scripts/40-seed-demo.sh): NVDAx mock at $185.00 (owner oracle or Pyth), two
Pappus quotes ($40k @ 180 bps / 7 d, $25k @ 250 bps / 7 d), lending pool $200k mock USDC, one open
position (borrower1: 300 NVDAx, debt $28k).

| t | Screen | Say / show |
| --- | --- | --- |
| 0:00 | `/feed` | "NVDAx on a normal lender gets 40 % LTV because DEX exit is thin. Here two buyers committed $65k, so the limit rises toward the 70 % ceiling." Point to the equation card: `B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c))` (PRD §4.2, D-009). Read live numbers; do not quote a % before G2. Badge: "Mock collateral · testnet". |
| 0:30 | `/quote/new` (buyer2 wallet) | Fill $10k, 200 bps, 7 d (minimum notice, D-009). Sign modal shows the exact `msg` JSON (`FundPappusQuote`). Sign. Toast "Quote funded"; Feed Q_c rises; limit bar grows. |
| 1:00 | `/borrow` (borrower1) | Add 100 NVDAx. Two bars: static limit vs Nectar limit; premium 300 bps shown; health preview at −5/−10/−20 %. Sign `LockCollateralAndBorrow`. Position page opens. |
| 1:30 | `/console` (owner) | "Testnet demo control, disclosed:" propose/apply price $150. Health drops below 1 (gauge turns critical). |
| 1:50 | `/keepers` → `/position/[id]` | Keeper log: `trigger_preliquidation`. P1: settlement row shows `disc_bps` from the TEE with the attestation link. P2: timeline shows NEAR signer response and the Solana tx with the Ed25519 verify instruction. |
| 2:30 | docs site + Claude Code | `explain_limit("NVDAx")` through the Feed MCP returns the equation with live numbers. |
| 2:50 | README "What is live" table | "Mock collateral, testnet, owner oracle fallback if Pyth absent; mainnet plan in docs." |

Capture: `pnpm demo:capture` (Playwright, 1440×900, captions from this table) → `evidence/demo.webm`.
Voice-over: H11.
