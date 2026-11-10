# G14 x402 paid call — orchestrator run 2026-11-10 16:48Z (to be verified read-only by the verifier)
Accounts (scripts/60-x402-accounts.sh): x402-relayer.nectar.testnet (1 NEAR, full-access key ed25519:GVaHZ4…, F-328), agent1.nectar.testnet
(0.5 NEAR, full-access key ed25519:3zyEty…), both storage-registered on both mocks; agent1 minted 2 mock NVDAx.
Servers: Feed :8788/:8789 (MCP), x402 paid route :8791 (`/api/feed/export.csv`, 0.01 mock USDC = 10000 e6, asset usdc-mock.nectar.testnet,
network near:testnet, payTo nectar.testnet), in-process facilitator with the relayer key. Unpaid GET → 402 (x402-server log).
Demo (`pnpm --filter x402 demo:testnet`, evidence/G14/demo-*.log):
1. MCP `open_protected_stock_loan` → unsigned ft_transfer_call; agent1 signs → borrow NEAR tx GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt
   (1 NVDAx, $10, origination fee $0.03 → v2 `pay_to`/fee stack path).
2. GET export.csv → 402 challenge {near:testnet, usdc-mock, 10000, payTo nectar.testnet}.
3. NEP-366 SignedDelegate (agent1) → facilitator relays → NEAR tx 5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx → 200 with the CSV (2 rows).
G14 criterion: one paid response with the NEAR transfer hash and the facilitator's relay transaction.
