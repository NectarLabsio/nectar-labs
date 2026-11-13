# G9 run 10b — FAIL (WO-99, commit 0c475f7)

One reason, step 2 (README claim vs source), text only. No product claim, command or link is affected.

README.md:19 (item 6, price-bot key) says the contract limits come from "`get_config` at block 277568411, 2026-11-13T22:10Z".
Block 277568411 has timestamp 2026-11-13T21:58:50.973Z (rpc.testnet.near.org `block` query, rpc-reads.json in this folder).
The commit that wrote the line, 0448e76, is dated 2026-11-13T22:03:18Z, which is before the stated time.

The values in the sentence are correct: at block 277568411 and at final block 277569424, `max_age_ns_session` = 120000000000 (120 s)
and `max_age_ns_closed` = 86400000000000 (86,400 s).

Fix (orchestrator or docs agent): change "2026-11-13T22:10Z" to "2026-11-13T21:59Z", or re-read `get_config` and cite the new block with
its own timestamp. Then re-run step 2 for that line only; every other WO-99 item passed (summary.txt).

Written here because this verifier may write only docs/EVIDENCE.md and evidence/; docs/process/gate-fail-g9-r10b.md was not created.
