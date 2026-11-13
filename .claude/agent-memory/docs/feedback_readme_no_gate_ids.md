---
name: feedback-readme-no-gate-ids
description: Kunal's README brief (2026-11-13) — no internal ids (G#, WO-, H-, F-, §) in README; product-language claim/result/evidence; banned word list; evidence-or-it-goes
metadata:
  type: feedback
---

README carries no internal ids at all: no G#, WO-, H-, F-, § (also avoid D-, SR-, Q-, C-, and anchors/paths like `#g7` or `evidence/G7/...`). Evidence is a testnet tx link checked on RPC, a test name, or plain "docs/EVIDENCE.md". SUBMISSION.md and X_POST.md source brackets may keep ids.

**Why:** Kunal's full brief for WO-89 (2026-11-13): judges and the Claude Code/Codex screener must understand and try the product in under 2 minutes; ids are noise to them. Every factual sentence needs evidence or it goes; banned words: seamless, revolutionary, game-changing, unlock, empower, leverage (verb), robust, cutting-edge, next-generation, innovative, effortless, supercharge, harness, delve; never "powered by NEAR".

**How to apply:** after any README edit, regex-scan for ids and banned words; verify tx hashes with `EXPERIMENTAL_tx_status` on archival-rpc.testnet.fastnear.com (sender id needed; any account on the right shard works). Kunal's draft copy is also checked: "borrow all weekend" was softened because no closed-market borrow is recorded on testnet. Related: [[project-submission-idea-budget]].
