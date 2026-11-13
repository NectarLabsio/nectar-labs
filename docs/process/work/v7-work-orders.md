# v7 work-order queue (D-018 order; files written when dispatched). Max 4 build agents in parallel.
Round 1 (2026-11-10): WO-18 researcher (G10 + WO-28) · WO-19 contract (P0 delta) · WO-20 web (P0 delta + landing) · WO-14 solana (vault, v7 shape).
Round 2: WO-21 contract (remote lifecycle, interface-v7 §B) · WO-16 keeper (relay + deposit watcher; feed `R_c`→`D_c` comment rename) · WO-31 web (remote borrow flow).
Round 3: WO-23a contract (Shields, Profit-Lock, fee stack) · WO-25 keeper (MCP skill tools; x402 if F-329 allows) · WO-26 web (v7 screens) · WO-30 docs.
Round 4: WO-22 contract or contract-b (Position Notes, NEP-171/177/181; F-337) · WO-23b (Reserve) · WO-24 quoter+keeper (OutLayer jobs: calendar, multiplier, vault_read).
Then: WO-6a orchestrator (scripts/21-deploy-v2.sh, keeper-v2 per D-019, reseed) → G1/G11/G2b/G3b → G7 (+ lifecycle) → P2b (WO-27, WO-29a/b/c, WO-31 Base) only after G7.
Optional: WO-32 thesis only if H18 = yes, after P2a.
