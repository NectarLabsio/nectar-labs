---
name: reference-nearai-cloud
description: Where NEAR AI Cloud attestation facts live (example vs full verifier repo) and endpoint flakiness
metadata:
  type: reference
---
- near-examples/nearai-cloud-verification-example: only nonce echo, NRAS GPU check, chat signature (ethers EIP-191). No TDX/report_data/mr_config (README defers).
- nearai/nearai-cloud-verifier (py/model_verifier.py): report_data padding (`ljust`, right-padded), mr_config `startswith("01"+compose_hash)`, TLS-binding mode.
- cloud-api.near.ai: gateway-only `/v1/attestation/report` is public (200, no key); `/v1/models` and model reports were 500/503 (DB pool) on 2026-11-09 — re-probe, don't assume.
- Model ids: docs.near.ai/cloud/models lists none; catalog at near.ai/models (JS-rendered, curl grep empty).
