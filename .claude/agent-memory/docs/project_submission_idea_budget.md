---
name: submission-idea-budget
description: SUBMISSION.md `idea` block sits near the 2000-char cap enforced by scripts/build-submission.mjs; any added disclosure must trim elsewhere
metadata:
  type: project
---
The `idea` fenced block in docs/SUBMISSION.md was 1995/2000 chars after WO-43 (2026-11-11); scripts/build-submission.mjs fails on `idea.length > 2000`.
**Why:** WO-43 first overshot to 2036 chars by adding privacy disclosures; had to compress the copilot and quoter wording.
**How to apply:** after any edit to the idea block, measure it (python: text between "### idea\n```text\n" and the next "\n```"). Put long disclosures in the Tracks/claim-table prose, not in `idea`. Privacy-claim wording rules are in [[bulk-edits-and-pending-records]] context: never claim copilot request binding until WO-42a lands.
