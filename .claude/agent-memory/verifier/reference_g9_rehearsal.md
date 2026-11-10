---
name: g9-rehearsal-recipe
description: How to run G9 fresh-clone rehearsal fast; Feed MCP env trap (CORE_ACCOUNT_ID), handoff blocker rule, port cleanup
metadata:
  type: reference
---

G9 rehearsal recipe (first done 2026-11-10, pre-check at 5cd7364; whole run ~5 min).

- Steps: pnpm i, demo:testnet, verify, docs-site build, web dev (curl / and /feed), docs-site start, gitleaks detect --log-opts=--all.
- `pkill -f 'docusaurus start'` does NOT kill the docs server (pnpm wrapper); check `lsof -iTCP:3000 -sTCP:LISTEN -t` and kill the pid.
- Feed MCP: test with a tiny node stdio client (initialize → notifications/initialized → tools/list → tools/call). HTTP at :8789/mcp returns SSE; send accept: application/json, text/event-stream.
- Trap: without CORE_ACCOUNT_ID the Feed/MCP is empty (polling off, healthz 503). Root README never names it. Re-check this before final G9 and the `agents` claim.
- Set FEED_DB_PATH to scratch so the host's ~/.nectar is left alone.
- Spot checks: RPC view_account code_hash, keeper access keys, EXPERIMENTAL_tx_status with sender keeper.nectar.testnet, GET outlayer attestation by-request. nearblocks 403 (see [[explorer-webfetch-403]]).
- Final G9 allows only H1/H2/H3/H10/H11 OPEN; list every other OPEN handoff as a blocker.
- EVIDENCE: the "G2 … 2026-11-10T19:42Z … 3f9c1a2" near the top is the template example inside a code block, not a real entry.
