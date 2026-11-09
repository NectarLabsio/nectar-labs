 Problem Statement, Verified Market Facts (`FACTS.md`) & Thesis

DeFi lending protocols (Aave, Morpho, Euler, Kamino Lend, Jupiter Lend, Blend, Rhea Finance) cap Loan-to-Value (LTV) on tokenized stocks, Principal Tokens (PTs), and institutional credit assets because **public DEX and prop-AMM liquidity is revocable**—it vanishes on weekends and during market crashes.

**Nectar Labs** turns time-committed, escrowed market-maker quotes (`Pappus`) into higher borrowing limits (`Cramér`) and charges borrowers a rate premium for the extra capacity.

### 1.1 Verified Facts Registry (`FACTS.md` — Every Claim Sourced for `README.md`)

| Metric / Claim | Verified Value (As of Nov 9, 2026) | Primary Verifiable Source URL / Citation | Role in Nectar Labs |
| :--- | :--- | :--- | :--- |
| **NEAR Intents Cumulative Volume & TVL** | **$37.006B** cumulative volume (**$3.715B** 30d; **$912.18M** 7d; **$87.67M** 24h); **$189.13M** TVL (ATH **$267.08M** on Sep 28, 2026) | DefiLlama (Nov 9, 2026): `https://defillama.com/protocol/near-intents` | Proves NEAR Intents has deep solver flow that Nectar converts into time-committed credit backstops. |
| **NEAR Intents Revenue & Solver Payouts** | **Q3 2026:** **$14.43M** Swap Fees ($11.37M to solvers & distribution channels; **$3.07M** Gross Profit / NEAR Buyback). **Oct 2026:** **$6.39M** Fees / **$2.19M** Revenue | DefiLlama Income Statement (Nov 9, 2026): `https://defillama.com/protocol/near-intents` | Anchors our `thesis` track model comparing spot swap margins (~13 bps gross / ~2.7 bps net) vs. 300 bps credit limit premiums. |
| **Rhea Finance (NEAR Flagship DEX + Lending)** | **$235.99M** TVL (#1 protocol on NEAR); **$18,589** 24h fees; **$4,604** 24h revenue | DefiLlama NEAR Chain (Nov 9, 2026): `https://defillama.com/chain/near` | Primary on-chain NEAR venue for reading verified public DEX depth $D_c$ and integrating Cramér LTV hooks. |
| **Global RWA Onchain AUM vs. DeFi Utilization** | **$33.609B** Total RWA Onchain AUM ($30.239B Active), with only **$4.09B** in DeFi Active TVL (**13.5% utilization**) | DefiLlama RWA Dashboard (Nov 9, 2026): `https://defillama.com/rwa` | Quantifies the **$29.5B gap** of on-chain RWAs blocked from DeFi lending by thin exit liquidity. |
| **Top RWA-in-DeFi Lending Protocols** | **Morpho Blue ($829.2M)**, **Kamino Lend ($423.5M)**, **Grove ($395.6M)**, **Pendle V2 ($383.4M)**, **Aave V3 ($337.5M)**, **Aave Horizon ($96.7M)**, **Euler V2 ($94.8M)**, **Aave V4 ($92.8M)** | DefiLlama RWA Dashboard (Nov 9, 2026): `https://defillama.com/rwa` | Validates Nectar Labs' exact module targets (`Morpho`, `Kamino Lend`, `Aave V4`, `Euler V2`). |
| **Solana Tokenized Equities (`xStocks` & `Opening Bell`)** | **~$196M** total `xStocks` supply with **>$182M on Solana (~93% share)**, **>$3B** cumulative onchain volume, **>$517M** DEX volume; Kamino collateral pools live; Superstate `Opening Bell` SEC-registered shares live on Solana (`FWDI`) | Solana Case Study (RWA.xyz / Dune): `https://solana.com/news/case-study-xstocks` & Nasdaq Superstate release | Proves Solana is the #1 tokenized-equity hub for Nectar's `Ed25519` (`domain_id = 1`) MPC rescue module. |
| **Robinhood Chain, Base, Arc, Arbitrum & Stellar Research Baseline** | **Robinhood Chain:** $1.70M stock loans / $3.91M col (62.5% LTV) & Rialto $2.2M prop vault ($8.31M weekday vs. $136K Oct 24–25 weekend); **Base Aave V4 Equities Hub:** $5.1M; **Arc cirBTC:** $178M vs. $24M DEX; **Arbitrum syrupUSDG:** $102.5M; **Stellar Blend:** $39.5M | Nectar Product Brief (Oct 26, 2026 baseline citing Steakhouse Oct 22 post, Aavescan, ChainCatcher & SCF #42) | Disclosed under Rule `Q-002` as Nectar Labs' pre-hackathon empirical research baseline. |

---

