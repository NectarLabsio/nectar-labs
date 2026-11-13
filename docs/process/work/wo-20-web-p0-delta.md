# WO-20 — web — v7 P0 delta + v7 landing (< 2 h; commit `feat(web): v7 P0 delta and landing`)
Read first: `docs/process/work/interface-v7.md` §A (names; binding), PRD v7 §12.1 (only), addendum `docs/process/build-prompt-v7.md` §5 (WO-20) and §10.
The live contract is still **v1** (`nectar-core.nectar.testnet`); v2 is not deployed yet (H-NEAR-FAUCET). Copy rule: never "live" before
EVIDENCE shows it. Therefore:
- `packages/sdk`: v2 types and msg builders (`pay_to`, `referrer`, the new views and owner methods). Feature-detect via `contract_version()`:
  `"2."` prefix ⇒ v2. The core account comes from config (`accounts.core`, and `v7.core_v2` when the orchestrator switches it).
- Each v7 control renders only when the connected contract is v2 **and** the `features.<name>` flag in `packages/config/config.yaml` is true
  (currently all false). Otherwise it is hidden; it is not shown as broken. E2E covers both the v1 path (today) and a mocked v2 view fixture.

Build:
1. Feed equation card per PRD §4.2 with live Q_c, R_c, D_c, h_c and, on v2, total debt + aggregate headroom. Labels: R_c **"Nectar Reserve"**, D_c
   **"verified DEX depth"** (C-107/C-108). The "Uplift" column stays (PRD §17 metric "Limit uplift").
2. Session badge on every asset: "In session" or "Weekend parameters" plus the reason (calendar / stale price / forced closed / no calendar). On v1, it derives from
   `market_session_open` + oracle age.
3. Sign modal: the fee stack (limit premium, origination, referrer share) and its total before the wallet opens. `/borrow`: a `pay_to` merchant field
   (receiver + memo) and `?ref=` → `referrer`. A multiplier line ("1 NVDAx = 1.02 shares after corporate actions") when M ≠ 1.
4. Landing v7 as the home page. The bundle's `landing/index.html` v7 is NOT in the repo (D-017), so build the sections from addendum §10:
   - hero "Borrow against stocks without fire-sales" (H17 default);
   - live limit card showing in-session vs weekend parameters;
   - three Shield cards, Reserve strip from $10, Spend-without-selling + Profit-Lock, Position Note preview;
   - NEAR hub with Solana + Base spokes, agent channel, FAQ, the shared footer.
   Each module section carries `data-feature="<name>"` and renders only when `features.<name>` is true. With all flags false, the page must still read as
   complete: hero, live card, how it works, FAQ, footer. Copy rules: never "insurance", never "without liquidations", testnet + mock collateral disclosed,
   no hackathon branding.
5. Do not touch `packages/ui/notes/` (WO-22 lane later).
Acceptance: `pnpm --filter web build`, `pnpm --filter web e2e` (PW_CHANNEL=chrome) green; Lighthouse a11y ≥ 90 on `/`, `/feed`, `/borrow` in both
themes; no horizontal scroll at 400 px. Report ≤ 20 lines.
