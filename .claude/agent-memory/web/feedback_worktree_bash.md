---
name: worktree-bash-guard
description: Worktree isolation guard rejects compound bash with git, heredoc appends (cat >>), or multi-step pipelines; split commands
metadata:
  type: feedback
---

In worktree-isolated runs the Bash guard refuses commands it cannot verify: `git` chained with other steps, `cat >> file <<EOF`, and python heredocs followed by git.

**Why:** the harness must prove git ops target the worktree; complex commands fail and waste turns (WO-26a lost ~4 calls).
`git -C <worktree>` is refused too; plain `git ...` already runs in the worktree. Multi-line patches: Write a script to the scratchpad, then run it alone.
Also refused (WO-34a): any bash heredoc (`cat > f <<EOF`, `python3 - <<EOF`), and grep patterns containing "github" (read as git). The scratchpad is shared with other agents: name scripts uniquely (another agent overwrote edit1.py).
Symlinked node_modules show as untracked (`node_modules/` in .gitignore matches dirs, not symlinks): `git add` explicit paths, never `-A`. A scratchpad heredoc (`cat > script <<EOF; python3 script`) with no git in the command passed on 2026-11-13 (WO-62d).
**How to apply:** run `git add`/`git commit` as standalone commands; new files via Write, multi-file edits via a uniquely named scratchpad script; append to files with Edit; use `python3 -c '...'` alone. Coordinators also enforce a turn budget, so WIP-commit early.
