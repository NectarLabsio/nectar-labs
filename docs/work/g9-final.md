# G9 — final fresh-clone rehearsal (verifier; fresh clone of local main, no secrets; budget ≤ 35 turns — commit what you have and report before you run out)
Commands are gates.md line "G9" plus host notes there (clone source `/Volumes/T7/nectar-labs`, never push; SDKROOT note; PW_CHANNEL=chrome).
1. Time the README quick start top to bottom as a stranger would (≤ 15 min). Write down every guess you had to make.
2. `pnpm demo:testnet` · `pnpm verify` · `pnpm --filter docs-site build` · `gitleaks detect --log-opts=--all` (whole history). Full logs → `evidence/G9/<UTC>/`.
3. Claims: every "PASS / live / deployed / verified" statement in README.md and SECURITY.md cites an EVIDENCE row that says so; "pending" or "not run" only where EVIDENCE lacks it.
   Live ids in README match `packages/config/config.yaml` and answer on public RPC (testnet / devnet; Base is a local fork — check only that it is disclosed as such).
4. Copy rules: never "insurance", never "without liquidations"; no NEAR Hackathon branding in the product UI (apps/web, landing/, docs-site navigation and pages) —
   hackathon context only in README.md, docs/EVIDENCE.md, docs/SUBMISSION.md. UI disclosures say "testnet" and "mock collateral".
5. Feed MCP from the root README alone (this decides whether `agents` is claimable): stdio and HTTP answer `initialize` + `tools/list` with live data.
6. `node scripts/build-submission.mjs` (dry run only; never `--send`): payload builds; `website` empty; list every TODO-H* field still open.
7. docs/HUMAN_HANDOFF.md: classify each item DONE / DEFAULT-AT-DEADLINE / KUNAL-ONLY (send, publish, video, team, payout, tracks) / OTHER-OPEN. Kunal-only items do not fail G9
   by themselves; OTHER-OPEN items that leave a README claim unbacked do.
Verdict PASS / FAIL in docs/EVIDENCE.md (G9 row + section), one commit (author kunal-drall, no Co-Authored-By, never --no-verify; if gitleaks flags a public value in
a log, redact that line and say so). Report ≤ 15 lines: verdict, quick-start minutes, guesses, unbacked claims, open TODO-H fields, handoff classification counts.
