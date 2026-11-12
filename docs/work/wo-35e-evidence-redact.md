# WO-35e — verifier — redact absolute home paths in evidence (Kunal 2026-11-12: "Keep ~/.nectar paths; remove any absolute /Users/<name> paths")
Write only evidence/ and docs/EVIDENCE.md. ≤ 12 turns. Commit `chore(evidence): redact absolute home paths` (no Co-Authored-By, never --no-verify).
1. `git grep -l "/Users/" -- evidence docs/EVIDENCE.md` (tracked text files only; skip binaries such as .png/.wasm).
2. In each file replace `/Users/<name>/` with `~/` (only that prefix; nothing else changes). Do not touch files a host service is still appending to
   (they show as modified-but-uncommitted in `git status` in the main repo: evidence/G13/keeper-*, evidence/G14/*, evidence/rollout/*): list them instead.
3. docs/EVIDENCE.md: one line under the log notes: "2026-11-12: absolute home-directory paths in evidence logs replaced by `~/` at Kunal's request; no
   other content changed." Then `git grep -c "/Users/" -- evidence docs/EVIDENCE.md` → only the listed live files (if any).
4. Not in scope: contracts/nectar-core/tests/fixtures/*.wasm (byte-identical to deployed code; the orchestrator told Kunal) and git history.
Report ≤ 4 lines: files changed, files skipped (live), the final grep count.
