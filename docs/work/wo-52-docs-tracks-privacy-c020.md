# WO-52 — docs — H16 tracks, privacy-track framing out, C-020 + remote Loan Note limits (< 60 min; commit `docs: H16 tracks defi/security/agents; privacy framing out; known limitations`)
Write only `docs/SUBMISSION.md`, `README.md`, `docs/X_POST.md`, `SECURITY.md`, `docs/HUMAN_HANDOFF.md`, `docs/DECISIONS.md`, `apps/docs-site/docs/**`.
**Kunal confirmed in session (2026-11-11): "H16 defi security agents (I'll decide nfts after item 3)"; "C-020: keep the current behaviour; add it to SECURITY.md
as a known limitation"; "Remove privacy-track framing from SUBMISSION.md, README and X_POST.md".**
1. SUBMISSION `tracks` field (column 2) = `["defi","security","agents"]`; update the explanation column and the "Tracks" section (privacy dropped by Kunal,
   nfts pending his decision). `node scripts/build-submission.mjs` (dry run only, never --send) must build with that array.
2. Remove privacy-track framing (track pitch, "privacy track" wording, privacy as a headline selling point) from SUBMISSION, README, X_POST. Keep the factual,
   corrected privacy statements and honest limits where they describe behaviour (README security/privacy facts, docs-site legal/privacy, quoter-tee limits).
   SUBMISSION `idea` must stay ≤ 2000 chars. X_POST: copy rules; no "live" beyond EVIDENCE.
3. SECURITY.md known limitation **C-020** (FACTS C-020, F-380–382): the Note-transfer receiver check treats only 64-hex and `0x` ids as implicit; `0s`/`0u`
   ids go through `view_account`, so a Note cannot be sent to a `0s`/`0u` account that does not exist yet (safe direction; kept by Kunal's decision).
4. Remote Loan Notes (verified in code): `nft_transfer` → `move_note` (contracts/nectar-core/src/notes.rs:332-349) sets `position.borrower` to the new owner;
   repay is permissionless (`on_repay`, lib.rs:824); for NEAR collateral the full-repay release goes to the current Note owner (lib.rs:852-858). For REMOTE
   (Solana / Base) positions `request_remote_release` (remote.rs:957) signs the release to the **depositor recorded at deposit**, not the Note owner. If any
   README / docs-site Notes page says the collateral release follows the Note without that caveat, add it; also list it in SECURITY.md known limitations.
5. HUMAN_HANDOFF H16 → DONE (defi/security/agents; nfts open, Kunal decides). DECISIONS: D-0xx H16 tracks (overrides CLAUDE.md §1 "privacy always"),
   D-0xx C-020 kept.
`node scripts/check-no-branding-all.mjs`, `pnpm --filter docs-site build` exit 0. NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines.
