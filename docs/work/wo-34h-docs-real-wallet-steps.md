# WO-34h — docs — Kunal's real-wallet borrow steps on the hosted app (< 30 min; commit `docs: real-wallet borrow steps for the hosted app`)
Write only `docs/DEMO_SCRIPT.md` (new section "Real-wallet borrow on the hosted app"). Kunal does this himself after the deploy (WO-34 acceptance).
Use `<APP_URL>` as a placeholder. The orchestrator fills it in after the deploy. Do not add a README "Hosted demo" section: nothing is hosted yet.
Steps, each checkable, using only what the code does today:
- Prerequisites:
  - a testnet wallet from the near-connect selector (which wallets: data-inventory per-wallet table);
  - testnet NEAR for gas;
  - mock NVDAx: how a new account gets it, from scripts/README/RUNBOOK; if only the operator can mint, say so and give the exact command Kunal runs.
- Path: open `<APP_URL>/borrow` → dismiss or accept the consent banner → Connect wallet → pick the wallet → borrow composer values (small) →
  review the sign modal (receiver, method, amount, deposit) → sign in the wallet → wait for the tx → position page and Note.
- What success looks like:
  - explorer links;
  - the /status page;
  - Feed lag (the Feed indexes from near the head, so the new borrow appears within N blocks).
- If something fails: what to capture (tx hash, screenshot, console) and the fact that a fix means another G3b + G9.
- Settlement runs only while the operator's keeper is online (keeper local, H-KEYS).
Copy rules. No hackathon copy. `node scripts/check-no-branding-all.mjs` exit 0. NO Co-Authored-By. Never --no-verify. Report ≤ 4 lines.
