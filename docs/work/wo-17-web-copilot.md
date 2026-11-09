# WO-17 — web — NEAR AI copilot with verification (P2; ≤ 45 tool calls). Spec: BUILD_PROMPT §8 WO-17, PRD §11, FACTS F-070..F-073.
Server route calls NEAR AI Cloud (OpenAI-compatible) with NEAR_AI_API_KEY (H7; absent → UI "key missing"); browser shows an answer only
after verification: signature text per F-072 recovered (EIP-191) to the attested signing_address; attestation report per F-071 with nonce,
report_data check, quote verified with @phala/dcap-qvl 0.7.1 in a server route. "Verified" panel lists each check passed/not run — never a
bare tick. System prompt forbids prices/amounts. `pnpm --filter web test:copilot` runs on a recorded fixture (create one: if the live API
is reachable without a key, record /v1/models + an attestation report; otherwise build the fixture from the near-examples verification
example repo's test data and say so). A `--live` flag runs only with the key. No hackathon branding. e2e + lighthouse stay green. Commit `feat(web):`.
