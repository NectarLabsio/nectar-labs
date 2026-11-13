# WO-10c — contract — Pyth staleness + gas default (small: ≤ 20 tool calls). Context: D-015, FACTS (researcher adds the Pyth method row)
1. Replace `get_price` with `get_price_no_older_than(price_id, age)` (exact name/args/return from FACTS; if FACTS says the method does
   not exist, STOP and report — do not guess) passing the session-aware max age; keep our own age/conf/band checks as defence in depth.
   Update the stub + sandbox: closed-session price 2 h old is accepted, 25 h old is rejected; open-session 3 min old rejected.
2. Default quoter gas 80 Tgas; sandbox: Pyth + quoter + 8 distinct buyers passes the trigger's budget check at 80.
3. No V1 root-struct change (same rule as WO-10b); V1-fixture upgrade test stays green. Report wasm size. Commit `fix(contract):`.
