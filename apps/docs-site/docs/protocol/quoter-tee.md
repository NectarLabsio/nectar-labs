---
title: Quoter (TEE) and fallback
slug: /protocol/quoter-tee
description: Hash-pinned OutLayer program computing the clearing discount.
---
# Quoter (TEE) and fallback

<p className="verified">Verified against: F-040 (2026-11-09), F-041 (2026-11-09), F-043 (2026-11-09), F-045 (2026-11-09), F-167 (2026-11-09), F-168 (2026-11-09), F-169 (2026-11-09), F-172 (2026-11-09), F-177 (2026-11-09), F-178 (2026-11-09), F-179 (2026-11-09), F-180 (2026-11-09) · D-004, D-014, D-015 (2026-11-10) · docs/EVIDENCE.md G4 PASS 2026-11-09T22:10Z (d87eef6) and addendum PASS 2026-11-09T22:51Z (fea52b7) · evidence/G4/run-C-20261109T2240Z.log, run-D-20261109T2245Z.log · output-inference and operator-set limits: docs/work/review-2-findings.md R2-02 (2026-11-11), source quoter/src/lib.rs, contracts/nectar-core/src/p1.rs (`get_vol_bps`, `quoter_result`), scripts/35-quoter-secrets.mjs</p>
<p className="status">Status on 2026-11-11: live on OutLayer testnet (G4 PASS). The market-maker inputs are operator-set demo values, published on this page, and each settlement's discount reveals their product (see Honest limits). The fallback is a permanent code path.</p>

## What is deployed

| Item | Value | Source |
| --- | --- | --- |
| OutLayer contract | `outlayer.testnet` `request_execution` | F-040 |
| Project | `nectar.testnet/nectar-quoter` | G4, `get_quoter_config` view |
| Pinned version | `version_key` `3ce17749ae1b997971d97efa8f79110b586273e39bf9ca00c61a2bdf14ea6cc2` = sha256 of the wasm (92,355 B), rebuilt by `bash quoter/build.sh` | F-045, G4 |
| Secrets | profile `mm-demo` of `nectar.testnet`, read by the quoter as env vars `MM_1_Q_BPS`, `MM_1_GAMMA_BPS` | F-043, F-180, G4 addendum |
| Access to secrets | `And[Whitelist[keeper.nectar.testnet], Predecessor(Whitelist[nectar-core.nectar.testnet]), WasmHash 3ce17749…]` | F-177, F-178 |
| Cost per execution | 0.001 to 0.00103 NEAR charged, rest of the 0.01 NEAR deposit refunded (requests 15145, 15148) | G4 addendum |

## Clearing discount (D-014)

```text
disc_bps = min( max_discount_bps ,  vol_bps + floor(q_bps · gamma_bps · vol_bps / 10^8) )
```

In the design, `q_bps` (inventory use) and `gamma_bps` (risk aversion) are the buyer's secrets inside OutLayer. In this build they are demo values set by the protocol owner (see Honest limits). `vol_bps` comes from contract config (`set_vol_bps`). D-014 corrects the PRD §4.5 divisor: three bps factors need `10^8`, not `10^6`. Integer maths only. Without secrets, a fill is priced at `max_discount_bps`.

Worked example from request 15148: `min(400, 150 + floor(3000 · 2000 · 150 / 10^8)) = min(400, 159) = 159` bps.

## Evidence

| Path | Request | Result |
| --- | --- | --- |
| Secrets path | 15148 (tx `BQscYSpn4qMzwD9fDehHbqc84gcpzs1vuK18yzVCvhBb`) | `execution_completed success:true`, `quoter_result` fill quote 1 at **159 bps** (cap 400), settled. [Attestation JSON](https://testnet-api.outlayer.ai/attestations/by-request/15148): `wasm_hash` = `3ce17749…`, `input_hash` = the contract's `input_sha256`, TDX quote present (F-168) |
| Denial → fallback | 15145 (tx `CS5KGXTBcZFY7QwxM8HDL9XBUFFnqupbPT8sQ9U23ZDd`) | secrets stored under a whitelist that did not admit the keeper signer, so OutLayer refused access (F-179). The contract emitted `quoter_fallback` and settled at the **400 bps cap** |
| Wrong pin → fallback | G4 run A (evidence/G4/run-A-20261109T2201Z.log) | pin set to a wrong `version_key`, OutLayer returned nothing usable, `quoter_fallback`, settled at the cap |

The OutLayer dashboard is `https://app.outlayer.ai/executions` (F-169). The API JSON above is the primary link because the dashboard is a client-rendered app.

## Output (≤ 900 bytes, F-043)

Shape from `quoter/src/lib.rs`. Values are illustrative except `vol_bps` and the fill, which match request 15148.

```json
{"v":1,"symbol":"NVDAx","position_id":"4","input_sha256":"c03a2bf9…","price_e6":"140000000","src":"oracle","depth_e6":"0","depth_src":"none","session_open":false,"vol_bps":150,"fills":[{"id":"1","disc_bps":159}],"model":"as-v1"}
```

Any input error gives `{"v":1,"error":"<short>"}` with exit code 0, and the contract falls back.

## What the contract does with it

- Checks that `input_sha256` matches the request it sent.
- Clamps every `disc_bps` to `[0, max_discount_bps]`. A faulty quoter can only make the **buyer** pay more, never the borrower.
- On failure, denial or timeout it falls back to the cap and emits `quoter_fallback`.
- Gas: the G4 runs attached 100 Tgas to `request_execution`. D-015 lowers this to 80 Tgas because OutLayer reserves 50 Tgas for its callback (F-172). The next live run re-measures it.

## Honest limits

- **What holds: the computation is verifiable.** The attestation JSON of each request names the pinned `wasm_hash` (request 15148 above), and the contract accepts a result only from that pinned program and clamps it. The secrets' access condition admits only the pinned program (`WasmHash`, F-177, F-178). This is a verifiability property, not a secrecy one: the next items say who has seen the inputs.
- **Demo inputs, set by the operator and published.** `MM_1_Q_BPS=3000` and `MM_1_GAMMA_BPS=2000` are demo values, not a real market maker's book. The protocol owner stores them (`scripts/35-quoter-secrets.mjs` signs `store_secrets` as `accounts.owner`), they are printed on this page and in docs/EVIDENCE.md, and the web app gives a market maker no way to submit its own.
- **The output reveals q·γ.** `vol_bps` is public (`get_vol_bps` view, `vol_set` event), and every fill's `disc_bps` is emitted in `quoter_result` and appears in the public attestation JSON. `q_bps` and `gamma_bps` enter the formula only as their product, so one settlement below the cap reveals q·γ to within floor rounding. Request 15148 (vol 150, disc 159) puts it in [6.0e6, 6.67e6); the demo product is 3000 · 2000 = 6.0e6.
- **Plaintext seen by the coordinator.** `scripts/35-quoter-secrets.mjs` sends the plaintext JSON to OutLayer's `/secrets/pubkey` endpoint before encrypting it on the client (F-167), so the OutLayer coordinator has seen these values. A real market maker would need a flow that never leaves plaintext with the coordinator.
- **PROD path (not built).** Each market maker stores its own secrets profile, encrypts on its own machine with no plaintext step, and the protocol publishes coarser or batched outputs so that one fill does not reveal q·γ.
- **No on-chain TDX check.** The contract cannot verify the TDX quote. It trusts `outlayer.testnet` to run the pinned hash. The attestation can be checked off-chain, but the verifier did not verify the TDX quote cryptographically.
- The owner can turn TEE pricing off with `set_quoter_pin`, which sends every settlement to the fallback.
- Outbound HTTP is off in the quoter (D-014). It uses the contract-supplied price (`src: "oracle"`).
