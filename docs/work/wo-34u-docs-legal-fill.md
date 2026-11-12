# WO-34u — docs — fill the operator fields (H-LEGAL answered) (< 40 min; commit `docs: H-LEGAL — operator fields in the legal pages`)
Write only `apps/docs-site/docs/legal/` and `docs/HUMAN_HANDOFF.md`.
Kunal, 2026-11-12, in this session: operator "nectar labs", country "United States/India", contact "kunal@nectarnetwork.funm", X "xNectarNetwork".
Follow-ups he answered: **omit the governing-law clause**; X handle is **@xNectarNetwork** as typed. The orchestrator corrected the obvious contact typo
(.funm → .fun, the address the site already uses) and capitalised the product name. packages/config/config.yaml `site:` now holds exactly:
operator "Nectar Labs" · country "United States / India" · contact "kunal@nectarnetwork.fun" · x_handle "@xNectarNetwork".

1. Replace every `TODO-H-LEGAL` in apps/docs-site/docs/legal/*.md (disclaimers, privacy, terms; grep for any others) with those exact values.
   Contact as a mailto link where the page already links addresses.
2. terms.md: remove the "Governing law and venue" line, and any other sentence that names a governing law or venue. Do not invent a replacement clause.
   Keep the "Draft, not legal advice" note. Bump "Last updated" only where you changed text (2026-11-12).
3. privacy.md: the operator sentence (line ~20) names Nectar Labs, operated from the United States / India. Keep the DPDP/GDPR rights paragraph as it is.
4. docs/HUMAN_HANDOFF.md: H-LEGAL → `status: CLOSED 2026-11-12` with the values, the typo correction and "no governing-law clause (Kunal)".
   H9 (entity name) → CLOSED by the same answer ("Nectar Labs"). Do not touch other handoffs.
5. Copy rules: no hackathon wording; never "insurance"; never "live" beyond what EVIDENCE shows.
Tests: `git grep -n "TODO-H-LEGAL" -- apps/docs-site` → nothing; `pnpm --filter docs-site build` → 0; `pnpm verify:quick` → 0.
NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines.
