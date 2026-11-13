# WO-76 — verifier — G9 run 8 from the PUBLIC repo URL (< 45 min; commit `test: evidence — G9 run 8 from the public URL (WO-76)`)
Clone https://github.com/NectarLabsio/nectar-labs.git (HTTPS, anonymous) into a temp dir outside /Volumes/T7 — never the local path. Record `git rev-parse HEAD`
(expected b6d6f41 = what Kunal pushed; a later README TODO-H2 fill reaches GitHub with the submission-rc tag). Run G9 as in run 7 (EVIDENCE §G9 run 7):
README quick start < 15 min with every command, claims vs EVIDENCE and live hosts, gitleaks on the cloned history, branding, host grep, submission dry run,
handoffs. Also: the clone contains no file > 50 MB, no .env with values, no ~/.nectar paths, no key material (gitleaks + grep). Note the README's TODO-H2 line as
"filled in a later commit" if still present. Write only docs/EVIDENCE.md, evidence/. NO Co-Authored-By. Don't touch host services. Report ≤ 10 lines.
