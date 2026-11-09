# EVIDENCE.md — written by the verifier agent only

| Gate | Status | UTC | Commit | Evidence |
| --- | --- | --- | --- | --- |
| G0 toolchain + facts | pending | | | |
| G1 contract tests | pending | | | |
| G2 testnet deploy | pending | | | |
| G3 web E2E | pending | | | |
| G4 OutLayer | pending | | | |
| G5 oracle | pending | | | |
| G6 1Click depth | pending | | | |
| G7 Solana + signer | pending | | | |
| G8 copilot | pending | | | |
| G9 fresh-clone rehearsal | pending | | | |

Block format (one per run, newest first within a gate):

```
### G2 — testnet deploy — PASS — 2026-11-10T19:42Z — commit 3f9c1a2
$ scripts/20-deploy-testnet.sh
... (≤ 40 lines)
Explorer: https://testnet.nearblocks.io/address/nectar-core.nectar.testnet  (opened: shows contract code hash …)
Views: get_collateral → {...}
Notes: faucet rate-limited once; retried after 90 s.
```
