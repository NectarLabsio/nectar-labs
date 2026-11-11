# WO-46r — researcher — facts behind the Note-transfer receiver check (< 20 min; FACTS only)
WO-42b (merged 313f660) uses two facts not yet in docs/FACTS.md. Verify each from a primary source read this session and add F-entries (date, URL, quote):
1. NEAR JSON-RPC `query` / `view_account` for a non-existent account: the error shape (e.g. `error.cause.name == "UNKNOWN_ACCOUNT"`, HTTP status, where the
   name sits). Primary: NEAR docs RPC accounts page / nearcore error schema. Compare with packages/sdk/src (grep UNKNOWN_ACCOUNT) and say if the code matches.
2. NEAR implicit account id formats: NEAR-implicit = 64 lowercase hex chars; ETH-implicit = `0x` + 40 lowercase hex (NEP-518 / docs "Account ID").
   Compare with the SDK's implicit-account regex.
Any mismatch with the code → FACTS CONFLICTS + report. Report ≤ 8 lines (F-ids, match / mismatch).
