# WO-17b — web — copilot verifier corrections from FACTS F-074..F-078, C-018 (small: ≤ 20 tool calls)
1. Signature request path: `/v1/signature/<chat_id>?model=<model_id>&signing_algo=ecdsa` (F-076); retry 404 up to 5× with backoff (example does).
2. MRCONFIGID check = startswith("01" + sha256(app_compose)) (F-075); drop the "15 zero bytes" requirement.
3. NVIDIA GPU attestation (F-077): live mode only — POST `nvidia_payload` to https://nras.attestation.nvidia.com/v3/attest/gpu, pass iff
   `x-nvidia-overall-att-result === true` and eat_nonce/nonce equal ours; label it "NVIDIA NRAS (JWT signature not verified — same as the
   reference example)". Fixture mode: keep "not run". This is a new server-side origin (live mode only) — list it in the cookie/privacy note
   only if the docs mention outbound calls (they mention PCCS already; add NRAS beside it in apps/web, docs-site is not yours).
4. C-018: do not send `provider=near` or `x-no-aliasing` unless FACTS confirms them; make the attestation query
   `?model=<id>&signing_algo=ecdsa&nonce=<64hex>` per F-074/F-075 sources. Default model stays configurable (NEAR_AI_MODEL); show "model id
   unverified (F-078)" in the panel's checks list when the live model list is unavailable.
Tests updated for each change; test:copilot + e2e + lighthouse green. Commit `fix(web):`.
