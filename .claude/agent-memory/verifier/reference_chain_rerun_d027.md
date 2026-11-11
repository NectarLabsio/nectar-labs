---
name: chain-rerun-d027-recipe
description: Combined G2b/G7/G13/G14 read-only chain re-run (after D-027, 2026-11-11); host SDK linker trap, bash 3.2 trap, where tx hashes live
metadata:
  type: reference
---
Run 2026-11-11 (3ab3026 → EVIDENCE b8784c1): all four PASS in ~33 tool calls.
- `cargo near build` failed on host: CLT default SDK MacOSX27.0 .tbd "unknown architecture arm64e.x1-macos" for ld-1267. Workaround (env only, not a repo fix): `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`. Record as host open item.
- /bin/bash is 3.2: no `declare -A`, `mapfile`, `${x,,}`; no `timeout` binary. `cast to-uint256 ""` blocks on stdin; add `</dev/null`. Piping long scripts through `cut` buffers output; tee to a file.
- list_quotes / get_remote_chains need `{"symbol":"NVDAx"}`.
- Full NEAR tx hashes + Solana sigs: evidence/rollout/keeper-*.log (JSON lines); get_pending_release/settlement carry solana_tx_sig (EVM tx hash too, same field).
- Withdraw sigs redacted in logs: use getSignaturesForAddress(position PDA) → OpenPosition/Release|Settle/Withdraw with token deltas.
- ProgramData space = 45 B header + ELF size.
- Reusable scripts committed under evidence/{G7,G13,G14}/verifier-20261111T080154Z/. See [[g7-v7-and-g14-recipe]], [[g12-g13-base-fork-recipe]].
