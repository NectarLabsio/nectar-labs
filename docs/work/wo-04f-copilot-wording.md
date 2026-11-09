# WO-4f — docs — copilot wording (G8 fix; ≤ 12 tool calls). Context: docs/GATE_FAIL_G8.md, EVIDENCE §G8
README + docs-site: the copilot is BUILT; it shows an answer only after signature + attestation checks pass; no live NEAR AI answer has been
verified yet (H7 key absent; NEAR AI Cloud returned 500 on 2026-11-09); tests run on a fixture made from a real Intel-signed sample TDX
quote (Phala dcap-qvl, MIT) plus a throwaway-key chat, which correctly ends "unverified — hidden". DCAP quote verification runs on the
server; EIP-191 signer recovery and report_data/nonce checks run in the browser. Never write "verified" for answers. Also add NVIDIA NRAS and
Phala PCCS as live-mode-only outbound calls in the privacy page. Commit `docs:`.
