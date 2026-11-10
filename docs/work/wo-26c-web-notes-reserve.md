# WO-26c — web — /notes, /note/[id] (+ /reserve once WO-23b merges) (< 2 h; commit `feat(web): notes screens`)
Read first: interface-v7 §C (Notes views/calls), PRD v7 §12.1 (/notes, /note/[id], /reserve rows). Write only apps/web, packages/ui, packages/sdk.
Gate on v2 + `features.notes` (false today); E2E with mocked v2 views (add Note fixtures incl. an SVG string from the contract template
`contracts/nectar-core/assets/position-note.svg` with placeholders filled).
1. `/notes`: the connected account's Notes (`nft_tokens_for_owner`, pages of 20), type chips QUOTE / LOAN / RESERVE, live SVG thumbnails
   (`nft_token_svg`, rendered as an <img> from a sanitized data URI, never innerHTML).
2. `/note/[id]`: the live SVG, owner, the history (events from the Feed API if available, else "history not indexed yet"), and transfer (`nft_transfer`, 1 yocto,
   sign modal). Transfer is disabled with a reason when `nft_transfer_locked`. A "Share to X" link is a tweet-intent URL the user clicks (no automation).
   For a Quote Note owned by the viewer: `set_quote_remote_recipient`.
3. Link Notes from `/position/[id]` and `/quote/[id]`.
4. `/reserve` page skeleton behind `features.reserve`: deposit from $10 (`JoinNectarReserve`), R_c, realised trailing 7-day APR ("realised", never promised),
   notice countdown, claimable units, the viewer's Reserve Notes. Use the view names `get_reserve(symbol)` / `get_reserve_note(note_id)` and the msg
   `JoinNectarReserve{collateral}`, plus `initiate_reserve_exit` / `complete_reserve_exit` (being built in WO-23b; mock them).
Acceptance: build, e2e (PW_CHANNEL=chrome) and sdk tests green; axe clean; no horizontal scroll at 400 px. Do not commit evidence/ screenshots. Report ≤ 20 lines.
