# Final gate runs (G3b re-run 3 + G9 run 4) on the final commit — two verifiers in parallel, fresh clones, no secrets, own ports
Never stop host services (keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545). If a kill of your own server is refused, say so; don't work around it.
Budget ≤ 35 turns each — commit what you have and report before you run out.

**G3b (verifier A):** exactly docs/work/wo-50-verifier-g3b-rerun.md (full e2e desktop + phone incl. screens.spec, Lighthouse, headers, `pnpm verify`,
branding check). Plus: in real Chrome with the REAL near-connect selector (fresh profile, consent banner visible), /borrow → Connect wallet → every wallet
row fully visible (not covered by the banner) on desktop and phone viewports; screenshot to evidence. Do not sign. Row "G3b re-run 3" + section.

**G9 (verifier B):** docs/work/g9-final.md steps 1–7 + docs/work/g9-final-2.md steps 8–10, plus:
11. `node scripts/build-submission.mjs` (dry run only, never --send): `tracks` = ["defi","security","agents"]; no privacy-track framing left in SUBMISSION,
    README, X_POST (factual privacy statements may stay); X_POST may carry the hackathon wording its rules require (it is not product UI).
12. SECURITY.md known limitations include C-020 and the remote Loan Note release-to-depositor caveat, and each matches code (notes.rs move_note, remote.rs
    request_remote_release, SDK implicit-account regex). SECURITY.md zod line matches FACTS F-383–F-385.
Row "G9 run 4" + section.
Each: one commit `test: evidence — <gate> on the final commit` (no Co-Authored-By, never --no-verify). Report ≤ 12 lines incl. the clone commit.
