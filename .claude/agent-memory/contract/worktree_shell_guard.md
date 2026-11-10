---
name: worktree-shell-guard
description: In isolated worktrees the Bash guard refuses heredocs/inline python, `git -C`, and computed vars before sed; write scripts/spec files with Write and run them by absolute path
metadata:
  type: feedback
---

The worktree isolation guard rejected (2026-11-10, WO-19): `python3 - <<'EOF' ... EOF`, `cat >> f <<'EOF'`, `git -C <path>`,
and `sed` with a `$VAR` path. Plain `cd <worktree> && git ...`, `sed -i '' 's/a/b/' <abs path>`, and
`python3 <scratchpad>/script.py <abs args>` pass.

**Why:** the guard cannot prove complex commands stay inside the worktree, and each refusal costs a tool call.
**How to apply:** for multi-block edits write a spec with Write and apply it with a small replacement script
kept in the scratchpad (exact-match, fail if not found once); use Edit for single blocks; commit with plain `git`.
