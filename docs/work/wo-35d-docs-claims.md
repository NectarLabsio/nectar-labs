# WO-35d — docs — pre-freeze docs claims, handoffs, SECURITY reachability (< 75 min; commit `docs: pre-freeze claims, handoffs, advisory reachability`)
Write only apps/docs-site/, README.md, docs/*.md except FACTS/EVIDENCE, SECURITY.md. Kunal, 2026-11-12. Facts: F-395, F-444–F-451, EVIDENCE §v7 module runs.
1. docs/X_POST.md (and SUBMISSION.md if it has URLs): use the production URLs — SITE https://nectarlabs.vercel.app, APP https://nectarlabs-app.vercel.app,
   DOCS https://nectarlabs-app.vercel.app/docs. These must not change after the X post (nectarlabs.io is unregistered, F-395).
2. Claims in the docs site, README, SUBMISSION.md, X_POST.md (each change cites its evidence):
   - Reserve: it IS deployed on nectar-core-v2 testnet (EVIDENCE §v7 module runs; Reserve Note r-NVDAx-0). Anything saying it ships later, or presenting it
     beyond what the evidence shows, is corrected.
   - TEE: every line says the TEE makes the computation verifiable; nothing says private/confidential/hidden.
   - Base: "local fork" (Base Sepolia local fork) wherever Base is described as working.
   - Any worked example with haircuts 4% / 12%: align with the deployed parameters (LTV 70%, haircut 10% / 25%, from packages/config/config.yaml) or label
     "Illustrative — different parameters".
   - Footer/contact email stays kunal@nectarnetwork.fun.
3. docs/HUMAN_HANDOFF.md:
   - H17 → CLOSED 2026-11-12: "fire-sales" (landing already reads "Borrow against stocks without fire-sales").
   - H16 → CLOSED 2026-11-12: `nfts` NOT added. Kunal's condition ("move_note test asserts the new owner can repay and close and the old owner cannot") is not
     met: repay is permissionless by design (contracts/nectar-core/src/tests_notes.rs `v7_notes_residual_collateral_goes_to_loan_note_owner`: a stranger
     repays, residual collateral goes to the new owner); self-settle follows the Note (`v7_notes_self_settle_by_new_loan_owner`) and the old owner is refused
     (`v7_notes_self_settle_old_owner_refused`). Tracks stay defi, security, agents. README "Tracks and why" `nfts` line → not submitted, one-line reason.
   - H-NEARDATA (create or update): F-448 — key from dashboard.fastnear.com (exact click path not verified: the dashboard answers a Cloudflare challenge to
     scripts), sent as `Authorization: Bearer <key>`. Kunal's step: create the key, then in Railway → project nectar-labs → service feed → Variables add
     `FEED_NEARDATA_API_KEY` (sealed). The orchestrator then switches `FEED_INDEXER` from `views` to neardata and checks /health. Default if silent: views mode,
     event history shown as unavailable (honest empty states).
4. SECURITY.md:
   - Docusaurus advisories (F-449/F-450: tinypool ×2 critical, serialize-javascript high/moderate/low, uuid moderate, deepmerge low; no 3.10.x patch): prove
     reachability — run `pnpm --filter docs-site build`, then grep apps/docs-site/build for each package's name and a distinctive symbol; record per advisory
     "build-time only (absent from the static output: <grep command → 0 matches>)" or "shipped". No version bump (each fix needs a major bump; out of scope
     before the freeze).
   - zod GHSA-mrhx-c7xc-m3w5 (F-451): 3.25.76 only via @x402/core; our zod import (services/feed/src/mcp.ts) resolves 4.6.7. Check the two `@x402/core/http`
     decoders used in services/x402/src/agent.ts: grep node_modules/@x402/core's http entry for zod usage; record whether untrusted input reaches the
     vulnerable API (grep evidence inline).
5. No absolute home-directory paths in any file you own (keep ~/.nectar).
Tests: `pnpm --filter docs-site build` 0; `pnpm verify:quick` 0; branding check 0. NO Co-Authored-By. Never --no-verify. Report ≤ 8 lines.
