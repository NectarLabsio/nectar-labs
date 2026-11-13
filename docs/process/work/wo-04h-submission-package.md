# WO-4h — docs — submission package drafts (≤ 30 tool calls). NOTHING is sent or posted (CLAUDE.md §1; H1/H3 are Kunal's).
Sources: README.md, docs/EVIDENCE.md (gate table), docs/process/hackathon.md (submission API fields), docs/process/decisions.md, docs/process/state.md.
1. docs/SUBMISSION.md: every field of the submission API from HACKATHON.md filled from the repo; tracks `defi, security, privacy`
   (+ `agents` ONLY if the Feed MCP server is listed as working in EVIDENCE/README — say why it is or is not included); repo URL
   `TODO-H2`; demo video `TODO-H11`; team `TODO-H10`; `website` EMPTY (spam trap, F-007); baseline disclosure (Q-002/Q-005) text from
   README "Prior work" (marked draft until H12). Every claim must have an EVIDENCE gate or test behind it; quote gate status exactly
   (G5 FALLBACK, G7 PARTIAL, G8 PASS fixture).
2. The submit script under scripts/ belongs to the orchestrator: do not edit it; list in SUBMISSION.md which fields it must read
   (the orchestrator wires it; it only ever runs in dry-run mode for agents).
3. docs/DEMO_SCRIPT.md v2 (3 min, exact clicks/commands) matching what is LIVE today: Feed (Q_c, limit vs static, oracle badge, 1Click panel),
   post a quote, borrow, owner price drop (disclosed demo control), keeper trigger → OutLayer quoter (attestation link) → settlement;
   Chain Signatures NEAR-side signed message (position #6 evidence) — say the Solana leg is not built; copilot "key missing"/fixture.
   Note: demo state must be RE-SEEDED before recording (owner needs testnet NEAR, H-NEAR-FAUCET) — write the re-seed steps as a list.
4. docs/process/x-post.md: one 5-post thread (≤ 280 chars each) + one standalone post; only numbers that appear in EVIDENCE; links TODO-H2.
No hackathon branding inside apps/docs-site. Commit `docs:`.
