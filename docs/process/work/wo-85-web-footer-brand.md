# WO-85 — web — footer brand "A Nectar Labs product" (Kunal 2026-11-13 ~16:00Z) (< 20 min; commit `fix(ui): footer brand = Nectar Labs (WO-85)`)
Write only packages/ui/** (and apps/web tests/snapshots that assert the footer text, if any). Kunal chose: "A Nectar Labs product · testnet · mock collateral"
(brand changed, disclosures kept, CLAUDE.md UI-disclosure rule). Change packages/ui/src/Nav.tsx:111 from "A Nectar Network product · testnet · mock collateral".
Grep apps/ packages/ landing/ for any other "Nectar Network product" UI string and any test asserting it; update tests to the new text.
DEPLOY AFTER TONIGHT'S TAKES (Kunal): commit on your branch only; the orchestrator merges + deploys after the takes. `pnpm --filter web test` 0, `pnpm verify:quick` 0,
`next build --webpack` exit 0, branding check 0. Symlink node_modules. NO Co-Authored-By. Report ≤ 4 lines.
