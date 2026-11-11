# WO-42b — web — wallet/SDK guards + privacy copy (< 90 min; commit `fix(web): review 2 — amounts, intent, note transfer, network guards, privacy copy`)
Write only `apps/web/`, `packages/ui/`, `packages/sdk/`. Source: docs/work/review-2-findings.md (R2-01, R2-02, R2-06, R2-07, R2-09, R2-10). Read those sections.
1. **R2-01 copy** (ConsentBanner, Landing ~:652): "We never join wallet addresses to IP addresses in logs we control. Your browser talks directly to the NEAR
   and Solana RPC providers, which see your IP and the accounts you query." Banner storage line: mention the wallet connector keeps its own session storage.
2. **R2-02 copy** (Landing ~:510, ~:623): say that in this testnet build the OutLayer TEE prices with operator-set demo parameters (published in the docs)
   and that each settlement's discount reveals their product. No "your private parameters" promise.
3. **R2-06** `parseUnits`: commas only as thousands separators (`1,5` → error); review drawer shows the parsed amount (`formatUnits`); SignTxRows shows a decoded
   amount line for `ft_transfer_call`.
4. **R2-07** "Confirm in wallet" gated on `ready`; capture an intent hash at Review and close / force re-review if it changes; `useView` clears `data` when
   `fn` becomes null. (On-chain fee bound = contract, out of scope — not here.)
5. **R2-09** Note transfer: `view_account` before enabling Transfer, refuse UNKNOWN_ACCOUNT (implicit hex64 / `0x` excepted); retype-to-confirm for
   LOAN / QUOTE / RESERVE Notes.
6. **R2-10** reject mainnet NEAR/Solana RPC URLs at startup (pattern as services/x402/src/config.ts); refuse to sign unless the signer id ends `.testnet` or is
   implicit; replace the tautological `adapter.network()` check. Solana genesis-hash check only if the hash is already in docs/FACTS.md (it is not — skip it,
   say so in the report).
Tests for each (unit; e2e where a screen changes). `pnpm verify:quick`, web e2e and lighthouse (a11y ≥ 90, both themes) green; `node
scripts/check-no-branding-all.mjs` exit 0. Copy rules: never "insurance", "without liquidations", "live". NO Co-Authored-By. Never --no-verify. Report ≤ 10 lines.
