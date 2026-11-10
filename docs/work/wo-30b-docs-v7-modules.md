# WO-30b — docs — v7 second pass (< 1.5 h; commit `docs: v7 shields, profit-lock, notes, reserve`)
Read first: D-022–D-024, interface-v7 §C, the merged contract sources for exact method names (`contracts/nectar-core/src/{shields,jobs,notes,reserve}.rs`),
and CLAUDE.md copy rules (never "insurance", never "without liquidations", never "live" before EVIDENCE). Write apps/docs-site, docs/*.md (not FACTS/EVIDENCE), README.md.
1. Docs pages: Shields (weekend-safe limit with committed buyers behind it), Profit-Lock (self-settlement), Position Notes (authority follows the Note; locks),
   Nectar Reserve (waterfall after quotes; 7-day notice; realised fee APR only). Each page carries the status line "built and tested in the sandbox; testnet deployment pending".
2. Remove or correct every mention of `set_reserve` / owner-set R_c (R_c is now the Reserve pool). Legal pages: add Notes and Reserve to Terms/Disclaimers as testnet
   software with mock assets and no investment offer.
3. README "v7 in progress": update the rows for Shields, Profit-Lock, Notes and Reserve to "built + tested (sandbox)", plus the OutLayer jobs row ("built; publish pending").
4. `pnpm --filter docs-site build` green. Report ≤ 15 lines.
