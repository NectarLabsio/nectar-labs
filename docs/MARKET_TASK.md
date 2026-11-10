# MARKET_TASK.md — task text for market.near.ai (handoff H20, optional)

Kunal posts this himself from his own account (docs/HUMAN_HANDOFF.md H20). Agents never post it. Before posting, replace
`TODO-H2` (public repo URL) and `TODO-H20` (reward and deadline). Every claim in the task text is backed by docs/EVIDENCE.md:
nectar-core on NEAR testnet (G2 PASS), the Feed MCP server answering `initialize` and `tools/list` locally (G9 rehearsal,
2026-11-10). The task asks for testing. It does not claim that the v7 skill tools work on testnet (they are not deployed; README
"v7 in progress").

Word count of the task text below: 121 (limit 150).

---

**Title:** Test an MCP skill for stock-backed credit on NEAR testnet

**Task:**
Nectar Labs is testnet software. Its lending contract, `nectar-core.nectar.testnet`, is deployed on NEAR testnet with mock tokenized-stock collateral (mock NVDAx) and mock USDC. Nothing has real value.

Please:
1. Clone TODO-H2 and follow the README quick start.
2. Start the Feed MCP server (`pnpm --filter feed start`, MCP at `http://127.0.0.1:8789/mcp`) with `CORE_ACCOUNT_ID=nectar-core.nectar.testnet`.
3. Call `preview_borrow`, `quote_capacity` and `open_protected_stock_loan`. Compare their numbers with the contract's own views over public testnet RPC.
4. Report every mismatch, unclear error or missing field, with the exact input and output.

Do not sign or send any transaction. The tools return unsigned calls only.

**Deliverable:** a Markdown report with reproduction steps.
**Reward / deadline:** TODO-H20.
