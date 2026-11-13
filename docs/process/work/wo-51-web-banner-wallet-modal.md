# WO-51 — web — cookie banner must not cover the wallet selector (< 45 min; commit `fix(web): consent banner stays under the wallet selector`)
Write only `apps/web/`, `packages/ui/`. Found by G9 run 3 (EVIDENCE §G9 run 3, connect-wallet.png): with the consent banner open, near-connect's "Select
wallet" modal is partly covered at the bottom. Kunal: wallet modal above the banner, or hide the banner while the modal is open.
1. Find near-connect's modal root and z-index (node_modules/@hot-labs/near-connect build, or inspect in Chrome) and the ConsentBanner z-index. Prefer the
   simplest robust fix: banner z-index below the wallet modal, or hide the banner while the near-connect modal is open (connector events / DOM observer),
   and restore it after. The Solana wallet flow, if it shows a modal, must not be covered either.
2. Verify in real Chrome (Playwright, PW_CHANNEL=chrome) with the REAL near-connect selector (not the e2e mock): fresh profile (banner visible) → /borrow →
   Connect wallet → every wallet row fully visible and clickable; screenshot to your scratchpad (do not commit). Phone viewport too. Do not sign anything.
3. e2e for the banner (existing specs) + a new check if it can run without network; `pnpm verify:quick`; Lighthouse a11y ≥ 90 both themes.
Own port (not 3000/3100/3217/3291/3471/8788–8791/8891); stop your server. NO Co-Authored-By. Never --no-verify. Report ≤ 5 lines.
