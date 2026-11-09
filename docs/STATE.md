# STATE.md — one screen for a returning human

Phase: **P0 — G0 in progress, BLOCKED on H-TOOLCHAIN**
Gates: G0 partial · G1 · G2 · G3 · G4 · G5 · G6 · G7 · G8 · G9 — pending
Blocking right now: **H-TOOLCHAIN** — the auto-mode classifier refused to run the toolchain installers.
  Kunal runs `bash scripts/01-toolchain.sh` (or allow-lists it), then replies `H-TOOLCHAIN done`.
Open handoffs: H-TOOLCHAIN (blocking), H4, H5, H7, H8, H9, H10, H11, H12 (see docs/HUMAN_HANDOFF.md)

Done (2026-11-10):
- `git init`, seed commit; `.gitignore` drops exFAT `._*` files; `core.fileMode false` (T7 is exFAT)
- G0 partial: node v22.23.4, git 2.50.1, python3 3.9.6, jq 1.7.1 present; rustc/cargo/near/cargo-near/
  solana/anchor/gitleaks/yq absent. Release pins read from GitHub: near-cli-rs v0.31.1, cargo-near v0.23.0.
- WO-0 partial: `scripts/01-toolchain.sh` (pinned installer), `packageManager` pnpm@10.34.9,
  Cargo workspace (P0 members only, edition 2024), `.githooks/pre-commit` (gitleaks or fallback scan),
  CI pins, `scripts/test-guard.sh` 10/10 PASS.
- D-009: Cramér formula + params follow PRD §4.2/§6.2; `config.yaml` rewritten (integers, 70/20/10, 7-day min notice).
- WO-1 researcher dispatched (FACTS seed; F-020 from near-cli-rs v0.31.1 source).

WO-0 still open: `pnpm i`, `pnpm verify:quick`, gitleaks pre-commit — need H-TOOLCHAIN.
Next action after H-TOOLCHAIN: re-run G0 (`--help` for F-020), finish WO-0, dispatch WO-2 ∥ WO-3 ∥ WO-4 ∥ WO-5.

Verified on: 2026-11-10
Last activity: 2026-11-09T19:37:33Z · commit ce90506
