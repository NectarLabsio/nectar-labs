---
name: worktree-bash-guard
description: Worktree isolation guard rejects compound bash with git, heredoc appends (cat >>), or multi-step pipelines; split commands
metadata:
  type: feedback
---

In worktree-isolated runs the Bash guard refuses commands it cannot verify: `git` chained with other steps, `cat >> file <<EOF`, and python heredocs followed by git.

**Why:** the harness must prove git ops target the worktree; complex commands fail and waste turns (WO-26a lost ~4 calls).
`git -C <worktree>` is refused too; plain `git ...` already runs in the worktree. Multi-line patches: Write a script to the scratchpad, then run it alone.
**How to apply:** run `git add`/`git commit` as standalone commands; append to files with Edit; use `python3 -c '...'` alone. Coordinators also enforce a turn budget, so WIP-commit early.
