# WO-37c — docs — correct the remote.spec claim (< 20 min; commit `docs: the vault v2 screens were E2E-tested in the G3b re-run`)
Write only `README.md`, `apps/docs-site/docs/start/live-on-testnet.md`, `apps/docs-site/docs/project/evidence.md`.
WO-37a wrote that the vault v2 screens (withdraw, claim, Re-sign settlement, claim owed collateral) "have no verifier E2E record". That is wrong.
In the G3b re-run (EVIDENCE §G3b, 5083d30; `evidence/G3b/verifier-rerun-d027-20261111T0802Z/e2e.log`) the functional `remote.spec.ts` tests ran and passed on desktop
and phone — they are **mocked** (describe block "Solana remote borrow (mocked)"): e.g. remote.spec.ts:382 withdraw, :401 withdraw remainder, :411/:437/:446 claim,
:453/:465 Re-sign, :472 owed collateral. Only the screenshot-capture block (`remote screenshots`, `REMOTE_SCREENS` unset; 14 per project) was skipped; the same holds for
`NOTES_SCREENS` in notes.spec.ts. Fix README.md:33, live-on-testnet.md:33 and evidence.md:45 to say exactly that: mocked E2E passed in the G3b re-run (5083d30),
screenshot capture not run. Grep the log yourself before writing. Don't touch docs/DEMO_SCRIPT.md or docs/SUBMISSION.md. `pnpm --filter docs-site build` exits 0.
NO Co-Authored-By line. Never --no-verify. Report ≤ 4 lines.
