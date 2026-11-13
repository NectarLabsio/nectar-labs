# WO-4e — docs — README + docs truthful for P1 (≤ 25 tool calls)
Sources: docs/EVIDENCE.md (G4 PASS incl. addendum, G6 PASS), docs/process/state.md, docs/process/decisions.md D-013..D-015, packages/config/config.yaml.
README "Live on testnet" + docs-site live-on-testnet, quoter, oracle, 1Click pages:
- Quoter: live on OutLayer testnet, project nectar.testnet/nectar-quoter, version_key 3ce17749…; settlement discount computed in a TEE
  from encrypted market-maker inputs (demo values, disclosed; plaintext passes OutLayer's pubkey endpoint, F-167); attestation link
  https://testnet-api.outlayer.ai/attestations/by-request/15148 (159 bps < 400 bps cap); fallback to the quote cap if the quoter fails
  (request 15145 / G4 run A shown). Secrets access And[keeper signer, nectar-core caller, wasm hash].
- Oracle: **owner oracle (disclosed)** for NVDAx today; Pyth path built (get_price_no_older_than, staleness/conf/band checks, sandbox-
  tested) but Hermes requires an API key (C-007, handoff H13) so pyth-oracle.testnet has no NVDA price; price-oracle.testnet does not
  serve NVDA (C-012). Say G5 status exactly as EVIDENCE has it (do not claim live Pyth).
- 1Click: NVDAx has no 1Click route (F-063); the Feed shows signed dry-quote depth for a reference pair (wNEAR→USDC, impact from base
  units at 3 sizes); dry quotes only, no deposits (Q-007).
- Contract: upgraded twice on testnet (P0→V1 migrate; V1 code-only), current code_hash HqZaadxy…; RUNBOOK: scripts/25, 26, 30, 35, 45.
- Feed MCP: how to register (FACTS F-161/F-162), read-only tools.
No hackathon wording in docs-site. docs-site build green. Commit `docs:`.
