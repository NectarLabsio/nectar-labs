# WO-37b — docs — demo re-seed list + submission prose on the 2.2.1 stack (< 1 h; commit `docs: demo re-seed list and submission prose for 2.2.1`)
Write only `docs/DEMO_SCRIPT.md` and `docs/SUBMISSION.md`. Run no transaction (read-only RPC views are fine). Sources of truth: `docs/EVIDENCE.md` (latest b8784c1),
`SECURITY.md`, `packages/config/config.yaml`, `scripts/`.

1. DEMO_SCRIPT "Before recording: v2 state and re-seed" — rewrite for live `nectar-core-v2` **2.2.1-v7**:
   a. A dated snapshot of live state from public views on nectar-core-v2 (`list_quotes`, `list_positions`, `get_pool`; RPC test.rpc.fastnear.com, D-025).
      At 2026-11-11 ~08:30Z: local quotes buyer1 $5,477 @250, buyer2 $5,000 @400 and $5,000 @450; remote quotes buyer1 Solana ~$259, Base ~$383; pool $40.8k available.
   b. Background services before recording: keeper-v2 daemon (env var NAMES only, from README/RUNBOOK or services/keeper/README; never key contents), Feed :8788/:8789,
      x402 :8791, anvil fork :8545 (chain 84532).
   c. The Base fork is ephemeral: if anvil restarted, vault `0xC64b…1226` is gone → `bash scripts/29-security-upgrade.sh 6` (redeploy via scripts/26 + swap the extra
      remote chain), then `bash scripts/62-g13-base.sh setup`. Say on screen and in the script that Base runs on a local fork of Base Sepolia (D-026).
   d. Remote quotes: `bash scripts/58-g7-v2.sh prep` and `bash scripts/62-g13-base.sh setup` now fund a fresh $1,000 quote when the matching remote quote has < $1,000 left.
   e. The remote lifecycle as it works on 2.2.1, using the script subcommands as the commands: reserve requires a `depositor` + 0.05 NEAR; deposit; keeper confirms + relays;
      repay → release, or price drop → settle; then the depositor runs `withdraw` (vault v2 pull payouts); `resign` for an expired unrelayed leg.
   f. `scripts/40-seed-demo.sh` / `41-seed-v2-fixup.sh` only if local quotes are drained.
   Grep `scripts/` for every command and subcommand you name; do not name one that does not exist.
2. Check the camera segments against 2.2.1 behaviour (depositor required, withdraw step, Base = local fork, disclosed). Copy rules: never "insurance", never
   "without liquidations", "live" only where EVIDENCE shows it; no hackathon branding in any UI segment.
3. SUBMISSION.md: refresh the prose (description, "How NEAR fits", gate references) to EVIDENCE as of b8784c1: 2.2.1-v7, the pre-submission review + SECURITY.md,
   Base spoke on a local fork (disclosed), G7/G13/G14 re-runs after the rollout. **Do not change** the `tracks` value, `website` (stays empty), or any field marked
   approved or `TODO-H*`. Keep the H16 proposal; fix its gate references if stale. A claim without an EVIDENCE row says "verifier record pending" instead.
NO Co-Authored-By line. Never --no-verify. Report ≤ 10 lines: what changed, any DEMO_SCRIPT step you could not tie to a script, any SUBMISSION claim without evidence.
