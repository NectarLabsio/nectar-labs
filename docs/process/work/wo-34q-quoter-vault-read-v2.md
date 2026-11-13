# WO-34q — quoter — vault_read for Solana vault v2 (after WO-34s merges) (< 1 h; commit `fix(quoter): vault_read v2 layout (depositor-bound slots)`)
Read docs/process/work/interface-v7.md §E and the merged solana/deploy.md (Position v2 byte offsets, seeds `[pos, vault, id_le, depositor]`). The contract passes
`"depositor"` in the vault_read input. Derive the v2 PDA, decode Position v2, keep every existing check (owner, discriminator, status, vault, position_id) and
add depositor == input depositor. Vectors for the new layout (generator + recorded RPC response), output ≤ 900 B. Do not publish (orchestrator re-pins).
Optional (SR-28): Base vault_read via eth_call `positionOf(id, depositor)` if cheap; else return a clear "unsupported" error. NO Co-Authored-By line. Report ≤ 12 lines.
