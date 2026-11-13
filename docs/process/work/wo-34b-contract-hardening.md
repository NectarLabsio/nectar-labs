# WO-34b — contract — hardening (after WO-34a merges) (< 2 h; commit `fix(contract): SR-6/9/13-16/19-27 hardening`)
Read docs/process/work/security-review-v7.md: SR-6, SR-9, SR-13, SR-14, SR-15, SR-16, SR-19, SR-20, SR-21, SR-22, SR-23, SR-24, SR-25, SR-26, SR-27 (mock-ft) and
the "Spec gaps" coverage item (lending liquidity / treasury / lenders fees have no withdrawal path — add owner-gated withdrawals or document). Write only
contracts/. Still a code-only upgrade over live 2.1.0 (and over 2.2.0 from WO-34a): new raw keys only; extend the upgrade test. contract_version stays
"2.2.0-v7" unless WO-34a already shipped, then "2.2.1-v7". One reproducing test per SR (`srN_*`). If a fix would change behaviour the PRD documents as
intended, implement the safer behaviour and say so in the report. NO Co-Authored-By line. Report ≤ 20 lines, one line per SR.
