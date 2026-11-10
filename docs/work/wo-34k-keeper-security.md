# WO-34k — keeper — SR-2, SR-11, SR-12, SR-29, SR-31 + v2 layouts (< 2 h; commit `fix(keeper): strict relay validation + vault v2 layouts`)
Read docs/work/security-review-v7.md (SR-2, SR-11, SR-12, SR-28, SR-29, SR-31) and docs/work/interface-v7.md §E (binding: Solana position seeds with
depositor, nonce seeds with authority, NonceRecord v2 layout, claim/withdraw model; EVM positionOf(id, depositor) + extra depositor arg; contract
`remote.committed_depositor`). The solana/ and contracts/ changes are being built in parallel: code against §E exactly; if a detail is ambiguous, make it
a single constant and report it. Write only services/. NO Co-Authored-By line. Tests reproduce each SR failure scenario (system-owned nonce account must
NOT be accepted; a lying RPC pointing at another program is refused; deposits below reserved units do not trigger confirm). SR-28: if the quoter cannot
read Base, keep BASE_KEEPER_ATTEST explicit and make the non-attest default log a clear "unsupported" instead of looping. `pnpm verify:quick` green.
Report ≤ 15 lines.
