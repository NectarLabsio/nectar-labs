# WO-34s — solana — vault v2 layout: SR-1, SR-4, SR-8 (< 2 h; commit `fix(solana): vault v2 — authority-scoped nonces, depositor-bound slots, pull payouts`)
Read docs/work/security-review-v7.md (SR-1, SR-4, SR-8; also the Solana parts of the coverage gaps) and docs/work/interface-v7.md §E (binding seeds,
NonceRecord v2 layout, claim/withdraw model). Write only solana/. NO Co-Authored-By line. Keep the Ed25519 verification exactly as strict as now.
Tests (anchor test): the SR-1 attack (attacker burns nonces under its own authority) no longer blocks an honest settle/release with the same nonce;
SR-4 (depositor reassigns its ATA owner / recipient ATA invalid) settle still succeeds, recipient claim + depositor withdraw work; SR-8 (attacker opens
the same id with another depositor) does not block the honest depositor; every previous negative test kept (adapted to v2). Update solana/client/*.ts
(PDA helpers, ix builders) and solana/deploy.md (discriminators, account orders, NonceRecord v2 and Position v2 byte offsets) — the keeper, quoter and
web build against those. It is deployed as an in-place program upgrade by the orchestrator (do not deploy). Report ≤ 20 lines.
