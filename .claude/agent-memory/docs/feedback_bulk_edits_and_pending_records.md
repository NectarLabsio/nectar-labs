---
name: bulk-edits-and-pending-records
description: How to do multi-file doc edits and git under the worktree guard, and how to label or cite runs relative to docs/EVIDENCE.md
metadata:
  type: feedback
---
Bulk doc edits: write a Python script to the scratchpad with Write, then run `python3 <script>`. Inline heredocs, for-loops with `sed "$f"`, `git -C <dir>`, and `cd … && git …` chains all get refused by the worktree-isolation guard. Run git as plain single commands (`git add …`, then `git commit …`) with no cd, no -C, no redirects.
**Why:** WO-35d and WO-37a (2026-11-11) lost tool calls to refused commands. The orchestrator caps runs at about 25 calls per WIP commit.
**How to apply:** batch all page edits into one or two scripts that use exact-match asserts (count == 1). Skip AppleDouble `._*` files on the T7 drive when globbing (they are not UTF-8).

Agent re-runs under `evidence/*/rerun/` that are not in docs/EVIDENCE.md are labelled "verifier record pending". Once the verifier records them, replace each note with "EVIDENCE §<gate> re-run … (recorded in <EVIDENCE commit>)"; EVIDENCE rows list the tested commit, so name the recording commit explicitly to avoid confusion. Keep "pending" only for what the EVIDENCE block says was NOT RUN, and quote the verifier's caveats (scope skipped, specs skipped, not chain-confirmed).
**Why:** only the verifier writes EVIDENCE; README must not claim a verified state it lacks, nor hide one it has.
**How to apply:** read the EVIDENCE block itself (Verdict + Notes lines) before writing PASS; check skipped specs (e.g. REMOTE_SCREENS) and "not re-run" scopes.
