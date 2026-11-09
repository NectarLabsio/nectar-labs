# DECISIONS.md — irreversible or scope-shaping choices (ADR style)

Format: `D-nnn · date · decision · why · alternatives rejected · consequences · FACTS ids`.

D-001 · 2026-11-09 · Chains limited to NEAR testnet + Solana devnet · one strong cross-chain leg beats three thin ones; judges' agents must be able to run everything · Robinhood Chain, Base, Arbitrum, Stellar rejected for this hackathon · PRD §1; roadmap PROD lists them · F-001, F-003
D-002 · 2026-11-09 · Mock NEP-141 tokens (`usdc-mock`, `nvdax-mock`) on testnet · no tokenized equity exists on NEAR testnet; 1Click has no equity route (F-063) · bridging xStocks rejected (Q-007) · README discloses on first screen · F-002, F-063
D-003 · 2026-11-09 · Contract builds the signer preimage itself; keeper passes only `position_id` · a keeper that could pass a hash could sign arbitrary transfers from derived accounts · keeper-supplied hash rejected · keeper key is a function-call key; contract pays MPC deposit from gas reserve · F-015, F-031, F-033
D-004 · 2026-11-09 · P0 settlement prices at `max_discount_bps` (static) with owner oracle; TEE pricing is P1; cross-chain is P2 · P0 must be demoable on its own · building P1/P2 first rejected · fallbacks are permanent code paths and are disclosed · —
D-005 · 2026-11-09 · Oracle policy: Pyth via `pyth-oracle.testnet` if live, else OutLayer `price-oracle.testnet`, else owner `propose_price/apply_price` with on-page badge · C-001 conflict; Rhea exploit (F-052) · trusting one unverified source rejected · G5 decides; staleness + conf checks always on · F-050–F-053
D-006 · 2026-11-09 · Analytics default off; consent banner shipped; vendor is H4 · privacy track; GDPR-shaped defaults · GA4-by-default rejected · both code paths present · F-090
D-007 · 2026-11-09 · Agents never send, post, publish or deploy mainnet; `HUMAN_CONFIRMED=1` only from Kunal's shell; Bash hook enforces · hackathon rules + irreversibility · "ask in chat" rejected as insufficient · see .claude/hooks/guard.sh · F-004–F-007
D-008 · 2026-11-09 · Subagents in worktrees, ≤ 4 parallel, 1 h prompt-cache TTL, CLAUDE.md stable per phase · token economy · agent teams rejected as primary mode (experimental) · F-100–F-103
