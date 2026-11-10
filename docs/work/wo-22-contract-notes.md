# WO-22 — contract — Position Notes (NEP-171/177/181) + G11 gas rows (< 2 h; commit `feat(contract): v7 position notes`)
Read first: PRD v7 §6.11 "Position Notes" and §10 (addendum `docs/BUILD_PROMPT_V7.md` §10 for the SVG spec only), FACTS F-337
(`near-contract-standards` 5.30.1 pairs with near-sdk ~5.30.1; `non_fungible_token::{core, metadata, enumeration, approval}`; the enumeration macro
is deprecated, so implement the trait by hand). Write only contracts/.
1. Notes inside nectar-core: token ids `q-<quote_id>`, `p-<position_id>` (`r-<collateral>-<n>` is reserved for WO-23b). Mint on quote funding and on
   position open (NEAR and remote). NEP-171 core + NEP-177 metadata + NEP-181 enumeration (by hand).
2. **Authority = Note owner** for: quote withdrawal initiate/complete, claim_fees, `self_settle`, receiving residual collateral on repay, self-settle
   and settlement remainder. Remote release goes to the depositor (unchanged; the vault pays the depositor). Anyone may repay. The original funder is kept
   in events only.
3. `nft_transfer` is refused while the quote or position is referenced by a pending settlement (Settling, a signed-but-unrelayed leg, or
   Releasing). Payout recipients are snapshotted when a settlement starts. Transferring a Quote Note clears `buyer_remote_recipient`.
4. `nft_token` media: a `data:image/svg+xml;base64` render of live state. `nft_token_svg(token_id) -> String` returns the raw SVG.
   - Template: a Rust const in `contracts/nectar-core/assets/position-note.svg`, 600×360, fixed palette (#0d0f12 / #16f3a9 / #e6e9ef / #8f96a3), ≤ 2 KB.
     The placeholders are those in addendum §10.
   - Metrics per type: LOAN = LTV, health, debt, backing (Q_c + R_c); QUOTE = remaining, max discount, unlock, claimable fees.
   - Only numbers and fixed words enter the SVG; account ids are XML-escaped. View gas < 30 Tgas.
   (The web agent renders it through the view; packages/ui/notes/ gets no copy — the contract file is the single source.)
5. Events: the standard NEP-297 `nft_mint` / `nft_transfer` (standard "nep171").
6. **G11 prep (verifier finding):** add sandbox gas rows for the 10 owner setters missing one (2 in remote.rs, 8 in p1.rs/p2.rs; grep the setters
   without a gas row in tests/sandbox*.rs output).
Tests:
- unit tests for every panic path;
- sandbox: authority follows the transfer (new owner withdraws the quote, the old owner is refused); transfer refused while Settling; transfer clears the remote recipient;
  residual collateral goes to the Loan Note owner; `nft_token_svg` under 30 Tgas plus an XML-escaping test.
Report ≤ 20 lines (test counts, gas, wasm size).
