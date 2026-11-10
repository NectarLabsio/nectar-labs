# WO-34w — web — sdk/web for vault v2 + depositor commitment (after WO-34s/34a/34e merge) (< 1.5 h; commit `fix(web): vault v2 layouts, depositor commitment, claim/withdraw`)
Read docs/work/interface-v7.md §E, solana/deploy.md (v2), evm/src/NectarVaultBase.sol (positionOf + depositor arg). packages/sdk: Solana PDA helpers
(depositor in position seeds; authority in nonce seeds), open_position builder, new `withdraw(position_id)` and recipient `claim` builders; EVM positionOf +
the extra depositor arg; `reserve_remote_position` gains `depositor` (the connected Solana/EVM wallet address). apps/web: Borrow remote flow commits the
connected wallet as depositor; Position page shows "Withdraw on Solana" (depositor) after settle/release, and a buyer-side "Claim" when a claim exists.
Tests + e2e green; byte-exact tests against solana/client helpers. NO Co-Authored-By line. Report ≤ 12 lines.
