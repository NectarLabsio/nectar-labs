# WO-30c — docs — truthful "what is live" after G2b/G7/G14 + RPC (< 1 h; commit `docs: v7 live status after G2b/G7/G14`)
Read docs/EVIDENCE.md (§G2b re-run, §G7 (v7), §G14, §G11 re-run), evidence/v7-modules/summary.md, D-024, D-025. Copy rules apply.
1. README: "What is live" gains rows for nectar-core-v2 (testnet, link), Solana remote lifecycle (devnet program + the two round-trip txs from EVIDENCE §G7),
   OutLayer-attested deposits + TEE quoter on v2, x402 paid export (G14 txs), Shields / Profit-Lock / Reserve / Notes (testnet runs in
   evidence/v7-modules/summary.md). v1 stays listed as the earlier deployment (kept as evidence). "v7 in progress" keeps only what is NOT live:
   multiplier, pay_to, referrals (built + sandbox-tested, no testnet run), Base spoke (not built). Quick start commands unchanged.
2. Replace `rpc.testnet.near.org` with `https://rpc.testnet.fastnear.com` in apps/docs-site/docs/integrate/run-a-keeper.md and start/quick-start.md (D-025).
3. docs/DEMO_SCRIPT.md and docs/SUBMISSION.md: remove the "Solana leg not built" claims; DEMO_SCRIPT gets the v2 re-seed list (scripts/21, 30 pin,
   40/41 seed, 58 G7 steps, 61 module runs) and points at nectar-core-v2. SUBMISSION track proposal (H16): defi, security, privacy + agents (G14 +
   Feed MCP) + nfts (Position Notes minted on testnet) — mark realworld as "not proposed" (pay_to has no testnet run) — Kunal decides (H16).
4. Docs site pages for the modules: change the status line to "live on testnet (EVIDENCE §…)" where a testnet run exists.
`pnpm --filter docs-site build` green. Write apps/docs-site, docs/*.md (not FACTS/EVIDENCE), README.md. Report ≤ 12 lines.
