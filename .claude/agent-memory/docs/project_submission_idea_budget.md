---
name: submission-idea-budget
description: SUBMISSION.md `idea` block sits near the 2000-char cap enforced by scripts/build-submission.mjs; any added disclosure must trim elsewhere
metadata:
  type: project
---
The `idea` fenced block in docs/SUBMISSION.md is 1843/2000 after WO-92 (2026-11-13; "premium goes to the buyers" became "limit premium for the extra capacity", unverified split). It was 1995/2000 chars after WO-43 (2026-11-11); scripts/build-submission.mjs fails on `idea.length > 2000`.
**Why:** WO-43 first overshot to 2036 chars by adding privacy disclosures; had to compress the copilot and quoter wording.
**How to apply:** after any edit to the idea block, measure it (python: text between "### idea\n```text\n" and the next "\n```"). Put long disclosures in the Tracks/claim-table prose, not in `idea`. WO-43b (2026-11-11) added copilot binding ("signed for the question typed") and paid for it by trimming "a 7-day notice period", "instead of on a DEX", "and are never deposited" — still 1995. Binding is now real (WO-42a merged 2111b71). Related: [[bulk-edits-and-pending-records]].
