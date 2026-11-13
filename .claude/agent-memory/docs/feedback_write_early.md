---
name: feedback-write-early
description: On deadline doc rewrites, write the draft early and batch verification into one or two scripts; the coordinator halts agents that read for too long
metadata:
  type: feedback
---

Write the draft file early, then verify; do not spend most of the run reading code before any edit.

**Why:** WO-92 step 1 (2026-11-13) was halted by the coordinator after 71 tool calls with zero changes in the worktree: "research is done, write the edits now". Many single greps (Mermaid edges, toast behaviour, screenshot plan) ate the budget.

**How to apply:** for README-scale work, read the work order and the current file, write the full draft within ~20 calls, then run one python script for all chain/tx/host checks (archival RPC with 429 backoff) and one for links, ids and banned words. Related: [[bulk-edits-and-pending-records]], [[feedback-readme-no-gate-ids]].
