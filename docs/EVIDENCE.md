# EVIDENCE.md — written by the verifier agent only

| Gate | Status | UTC | Commit | Evidence |
| --- | --- | --- | --- | --- |
| G0 toolchain + facts | PASS | 2026-11-09T23:09Z | b3a9090 | evidence/G0/verifier-20261109T230923Z/ (re-record: F-181/F-182/F-183 now record installed rustc/cargo 1.95.0 and node v22.23.4; network probes reused from verifier-20261109T230153Z; anchor/solana absent = P2 dependency H-TOOLCHAIN-SOLANA; prior FAIL 23:01Z 90af048: see §G0) |
| G1 contract tests | PASS | 2026-11-09T20:43Z | b721641 | evidence/G1/verifier-20261109T2043Z.log, evidence/G1/verifier-gas-20261109T2043Z.csv (prior FAIL 20:33Z, 3bc0de8: see §G1 history) |
| G2 testnet deploy | PASS | 2026-11-09T20:55Z | 5f27f44 | evidence/G2/verifier-20261109T2055Z.log (explorer pages returned HTTP 403 to WebFetch; see §G2) |
| G3 web E2E | PASS | 2026-11-09T21:15Z | 176914f | evidence/G3/verifier-20261109T2115Z/ (e2e 112 pass / 0 fail / 2 skip = write spec; LH 12/12 = 100; write flow cited from 20:57Z run, not repeated; prior FAIL 20:57Z c940dec: see §G3) |
| G4 OutLayer | PASS | 2026-11-09T22:10Z | d87eef6 | evidence/G4/verifier-20261109T2210Z/ (attestation via testnet-api.outlayer.ai/attestations/by-request/15114, TDX quote present, not verified; gates.md get_settlement view missing, criterion checked from events; fills = max until WO-10b) |
| G5 oracle | FALLBACK (disclosed) | 2026-11-09T22:55Z | 706d940 | evidence/G5/verifier-20261109T2254Z/ (no live Pyth price: pyth-oracle.testnet NVDA → null, Hermes 401, H13 key absent; nectar-core source = Owner; Pyth defences tested: unit 157/0 + sandbox 5/0 + sandbox_p1 4/0; gates.md filter `oracle_rejects` matches 0 tests; README $180 vs on-chain $112; see §G5) |
| G6 1Click depth | PASS | 2026-11-09T22:58Z | fea52b7 | evidence/G6/verifier-20261109T224955Z/ (re-run after FAIL at 578b006: 3-size live dry quotes verify, impact from base units, no amountIn/OutUsd use; GET /api/oneclick fixture + live match shape; /feed panel and NVDAx route status come from the API; web e2e 128 passed / 0 failed; see §G6) |
| G7 Solana + signer (v7) | PASS — release + settle round trip verified from both chains (read-only) | 2026-11-10T16:45Z–16:52Z | 91db9ea | evidence/G7/verifier-v7-20261110T1645Z/ (a) pos 2/3 stored authority == live derived_public_key (HRf3…/APU8…); (b) confirm txs 8XXv…/8hNq… source outlayer, trigger HrpQ… execution_completed + quoter_result + settlement_signed, 0 failed receipts; (c) devnet 5fTi… (Release) + 3cdc… (Settle) finalized err null, ix0 Ed25519SigVerify (pubkey = authority, msg = NEAR preimage) → ix1 ENZa…; PDAs FDUb…/E26i… null; recipient 2.54598, depositor 7.45402; (d) both sigs valid off-chain, 2 negative controls false; explorers: nearblocks 403, solana explorer 429; see §G7) |
| G7 Solana + signer (v6) | PARTIAL — superseded by G7 (v7) above | 2026-11-09T23:57Z | 97382fd | evidence/G7/verifier-20261109T2357Z/ (both gates.md commands fail: anchor absent, solana/ empty, no keeper test:settle-devnet script = H-TOOLCHAIN-SOLANA; NEAR side: trigger tx FCtApD2… → v1.signer-prod.testnet sign (payload_v2 Eddsa, domain_id 1) → SignatureResponse Ed25519 → settlement_signed; preimage event == get_pending_settlement; Ed25519 sig valid vs derived_public_key == config authority; tampered preimage → invalid; rebuild code hash == on-chain CFTfzY4…; cargo test 210/0 incl. sandbox_p2 3/0 + golden vectors; program id PLACEHOLDER, recipient throwaway, #6 stays Settling; see §G7) |
| G8 copilot | PASS (fixture) (re-run; earlier FAIL 2b49f42 was docs wording) | 2026-11-09T23:56Z | df4706f | evidence/G8/verifier-20261109T235453Z/ (fixture 10 pass / 0 fail / 1 skip = live; --live without key exit 1; e2e copilot 4/4 with exact "Key missing" banner; README/docs-site say built, no live answer verified, fixture = Phala sample + throwaway key; panel says browser vs server checks; live round trip not performed: H7 key absent, /v1/models HTTP 500) |
| G1 (v7 additions) | PASS | 2026-11-10T13:34Z–14:05Z | 09c4316 | evidence/G1/verifier-v7-20261110T1334Z/ (unit 318/0, sandbox 5/0, sandbox_p1 5/0, sandbox_p2 3/0, sandbox_v7 4/0, mock-ft 17/0, model.csv OK 87 rows; all 9 v7.rs methods gas-measured, max 8.93 Tgas; 10 owner setters (2 remote.rs, 8 p1/p2) lack a gas row, G11 scope, see §G1) |
| G10 v7 facts + toolchain | PASS with open items (F-351, F-352, F-353) | 2026-11-10T13:44Z | 09c4316 | evidence/G10/verifier-20261110T1334Z/g10.log (FACTS F-328/329/337/338/339/340–361 present; calendar source+retrieved; solana 2.3.0 / anchor 0.32.1 / forge 1.9.0 == F-340/F-341/F-343; live derived_public_key == F-338) |
| G7 prep (not G7) | RECORDED: vault deployed + 25 anchor tests | 2026-11-10T13:44Z | 09c4316 | evidence/G7/prep-verifier-20261110T1334Z/ (program ENZa… on devnet, vault PDA HGSF… owned by it; test:unit 7/0, test:anchor 25/0; G7 stays pending: needs v2 on testnet) |
| G11 v7 contract (re-run after D-027) | PASS — 608 unit + 50 sandbox + mock-ft 23 green; wasm hash = deployed 2.2.1-v7; max receipt 67.69 Tgas; every SR-1…33 has an sr-named test | 2026-11-11T08:02Z–08:20Z | 3ab3026 | evidence/G11/verifier-rerun-d027-20261111T0802Z/ (forge 105/0/3, Solana 10 cargo + 55 TS, keeper 293, x402 17, feed 63, sdk 178) |
| G11 v7 contract | PASS with open item (F-352) — re-run after WO-23c; prior FAIL block kept | 2026-11-10T15:47Z–16:12Z | 53f1e63 | evidence/G11/verifier-rerun-20261110T1547Z/ (unit 453/0 incl. tests_p2::deposit_forged_authority_refused, sandbox 5+5+4+2+9+4 = 29/0, mock-ft 17/0, model --v7 OK 132 rows; 81 v7_* + 103 tests_v7/v7b; wasm 734784 B sha256 252a6abe… (unchanged); set_shield_params 2.67 / set_job_config 2.57 Tgas; every non-private change method gas-measured, max 68.94 Tgas; see §G11) |
| G2b testnet deploy v2 | PASS (re-run after WO-16b; prior FAIL block kept) | 2026-11-10T16:45Z–16:52Z | 91db9ea | evidence/G2b/verifier-rerun-20261110T1645Z/ (pnpm i exit 0; pnpm verify exit 0: keeper 168/0, feed 57/0, x402 9/0, sdk 77/0 + lint/typecheck; demo:testnet exit 0; code_hash 3W5bif…31ey unchanged, contract_version 2.0.0-v7; live state 3 quotes / 4 positions (#2,#3 Closed = G7 v2, expected); see §G2b) |
| G2b (first run) | FAIL — superseded by re-run above | 2026-11-10T16:34Z–16:45Z | 1c4cdb3 | evidence/G2b/verifier-20261110T163415Z/ (rebuild sha256 252a6abe… == view_code == code_hash 3W5bif…; keeper-v2 one FC key, 5 methods; views OK; calendar 287; demo:testnet exit 0; live state drifted to 3 quotes / 3 positions during run (concurrent G7 v2 work); nearblocks 403; see §G2b) |
| G14 x402 | PASS (1–2 hold; F-328 keys hold) | 2026-11-10T16:48Z–16:52Z | 91db9ea (clone; tests) / 6ba1b09 (summary) | evidence/G14/verifier-20261110T1645Z/ (borrow tx GcHF… agent1 → nvdax-mock ft_transfer_call → v2 position_opened #4 $10, fee $0.03; relay tx 5VL1… signer x402-relayer, Delegate by agent1 (pk 3zyEty…) → usdc-mock ft_transfer 10000 → nectar.testnet, 0 failed receipts; no ft_transfer event log (mock-ft emits none) — transfer proven by the receipt; agent1 + x402-relayer each 1 FullAccess key; x402 test 9/0; rpc.testnet.near.org returned -429 deprecation, fastnear used; see §G14) |
| G3b web E2E (re-run after D-027 + design port) | PASS — e2e 392/0/82 exit 0; LH 22/22 ≥ 90 (21×100, home-light 97); 400 px no h-scroll 22/22 | 2026-11-11T08:08Z–08:24Z | 3ab3026 | evidence/G3b/verifier-rerun-d027-20261111T0802Z/ |
| G3b web E2E (v2) | PASS (re-run after WO-26f; prior FAIL block kept) | 2026-11-10T17:39Z–17:48Z | 0ed567f | evidence/G3b/verifier-rerun-20261110T1740Z/ (e2e exit 0: 244 passed / 0 failed / 18 skipped, 0 flaky; write spec ×2 skipped, no key; LH a11y 20/20 = 100 on 10 routes × 2 themes; 400 px no-scroll; /api/feed live (as_of = request time, age_s 0, matches RPC get_exit_capacity); /feed 0 5xx, 0 console errors without NEXT_PUBLIC_FEED_URL; see §G3b) |
| G3b (first run) | FAIL — superseded by re-run above; e2e 214/14/18 (7 flags-off/v1 specs × 2 projects); LH 20/20 ≥ 90; live v2 data OK | 2026-11-10T16:56Z–17:25Z | 2bf99e1 | evidence/G3b/verifier-20261110T1656Z/ (failing specs listed in §G3b; write spec skipped, no key; /notes list needs wallet) |
| v7 module runs | PASS (Profit-Lock state only; self_settled tx hash not recorded) | 2026-11-10T17:20Z | 2bf99e1 | §v7 module runs (pos 0 Closed, quote 1 −$4,522.50; reserve r 10,000,000, r-NVDAx-0 → buyer2; shield pos 5 Weekend 15 bps) |
| G12 Base toolchain + collateral | PASS — local fork of Base Sepolia (D-026), not Base Sepolia; scripts/06 + 26 NOT RUN by verifier; real Base Sepolia deploy pending H15 | 2026-11-10T18:03Z–18:04Z | 7bface5 | evidence/G12/verifier-20261110T180307Z/ (forge test 74 pass / 0 fail / 1 skip = test_createB20_localPrecompiles "B20 precompiles absent"; local fork of Base Sepolia (D-026) chain-id 84532; vault/MockB20/registry have code on the local fork of Base Sepolia (D-026); createB20 eth_call re-run on real Base Sepolia: no revert from 0x…dEaD and 0x1111…; no explorer for a local fork; see §G12) |
| G13 Base round trip | PASS — local fork of Base Sepolia (D-026), not Base Sepolia; ERC-8021 suffix not appended (D-026/H19); Solana-domain revert via forge tests only | 2026-11-10T18:03Z–18:05Z | 7bface5 | evidence/G13/verifier-20261110T180307Z/ ((a) authority pos 6/7 == last20(keccak(x‖y)) of live derived_public_key domain 0; (b) relay txs 0x759a…694b / 0x20d1…e4bb status 1 on the local fork of Base Sepolia (D-026), to vault, release/settle selectors, vault hashRelease/hashSettle == NEAR digest, ecrecover 0x01 == authority; (c) positions(6) status 3 Released, positions(7) status 2 Settled, buyer1 2357389, borrower1 7642611; (d) replay → NonceUsed(2) / NonceUsed(6); (e) NEAR pos 6/7 Closed, contract_version 2.1.0-v7; see §G13) |
| G2b testnet deploy v2 (after D-027) | PASS — supersedes the 16:45Z row as current state; open item: rebuild needed SDKROOT=MacOSX26.5.sdk on this host | 2026-11-11T08:02Z–08:25Z | 3ab3026 | evidence/G2b/verifier-20261111T080154Z/ (contract_version 2.2.1-v7; rebuilt wasm sha256 2938ebf8… == view_code, byte-identical, code_hash 3mv4LRm6…; keeper-v2 one FC key, 5 methods, receiver core-v2; get_config, get_exit_capacity, list_quotes {symbol} 5, get_remote_chains {symbol} solana ENZa… + base 0xC64b…, get_quoter_config pin 5f9bb287…; see §G2b) |
| G7 Solana + signer (re-run after D-027) | PASS — read-only, both chains | 2026-11-11T08:02Z–08:25Z | 3ab3026 | evidence/G7/verifier-20261111T080154Z/ (pos 8/9/10 authority == live derived_public_key domain 1; confirm txs source "outlayer", funded false/true/true, pos 8 refused aggregate_limit + refund; 3 Solana txs finalized, ix0 Ed25519 → ix1 vault, pubkey == authority, sig valid, tampered msg invalid; ProgramData 426,837 B = 45 B header + 426,792 B ELF; recipient +2.386856, depositor withdrew 3 / 3 / 0.613144; PDAs closed; NEAR Closed; see §G7) |
| G13 Base round trip (re-run after D-027) | PASS — local fork of Base Sepolia (D-026), not Base Sepolia; earlier caveats (ERC-8021, Solana-domain revert in forge only) stand, not re-checked | 2026-11-11T08:02Z–08:25Z | 3ab3026 | evidence/G13/verifier-20261111T080154Z/ (pos 11/12 authority == keccak addr of derived key domain 0; relay txs 0x12f5…0cd5 / 0xa2fe…c648 status 1; hashRelease/hashSettle == NEAR digest; ecrecover == authority; positionOf 3 / 2; borrower1 7→10→7.642611, buyer1 +2.357389; replay → NonceUsed(10) / NonceUsed(14); nonceUsed[slotKey] true; see §G13) |
| G14 x402 (re-run after D-027) | PASS for the chain claims; the HTTP 402 → 200 leg was not re-run by the verifier | 2026-11-11T08:02Z–08:25Z | 3ab3026 | evidence/G14/verifier-20261111T080154Z/ (borrow HvFX6… agent1 → nvdax-mock ft_transfer_call → core-v2 position_opened #13 $10; relay BemztvL… x402-relayer → Delegate agent1 → usdc-mock ft_transfer {nectar.testnet, 10000}, all receipts success; see §G14) |
| G9 fresh-clone rehearsal (re-run after WO-38) | PASS — quick start under 2 min; demo:testnet, verify (ui 7, feed 63, keeper 293, x402 17, sdk 178; 0 failed), verify:quick (repo-wide branding check first), docs build and gitleaks (272 commits, no leaks) all exit 0; no "hackathon" in the product sources, the built docs site or search-index.json; 21 README routes 200; Feed MCP stdio + HTTP live; no unbacked claim; payload builds with `website` absent | 2026-11-11T08:57Z–09:00Z | 0af5cdd | evidence/G9/20261111T085721Z/ (see §G9 re-run) |
| G9 (first run) | FAIL — superseded by the re-run above; one copy-rule breach: docs-site page Project › Evidence (`apps/docs-site/docs/project/evidence.md:11`, built to /project/evidence) says "built for the NEAR Hackathon". Everything else passed: quick start in about 3 min, demo:testnet / verify / docs build / gitleaks (268 commits) exit 0, Feed MCP stdio + HTTP live with no env, ids answer on RPC | 2026-11-11T08:43Z–08:50Z | c5f6349 | evidence/G9/20261111T084317Z/ (see §G9) |

Block format (one per run, newest first within a gate):

```
### G2 — testnet deploy — PASS — 2026-11-10T19:42Z — commit 3f9c1a2
$ scripts/20-deploy-testnet.sh
... (≤ 40 lines)
Explorer: https://testnet.nearblocks.io/address/nectar-core.nectar.testnet  (opened: shows contract code hash …)
Views: get_collateral → {...}
Notes: faucet rate-limited once; retried after 90 s.
```

## G13

### G13 — Base round trip — RE-RUN after D-027 — PASS, local fork of Base Sepolia (D-026), not Base Sepolia — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. EVM = local fork at http://127.0.0.1:8545, chain 84532, block 57050724; redeployed vault 0xC64b…1226 (5,805 B code), MockB20 0x634F…af81d. NEAR via https://test.rpc.fastnear.com.
Claims checked: evidence/G13/rerun/summary.md. Commands: evidence/G13/verifier-20261111T080154Z/g13.sh (+ nv.sh). Output: fork.log.
```
derived_public_key(base-sepolia/pos/11, domain 0) = secp256k1:4FUssYkR… -> keccak addr 0x9de489d1…77246fe ; NEAR authority 0x9de489d1…77246fe ; MATCH
relay tx 0x12f5c29b…00600cd5 status=0x1 block=57050721 from=0xe4a5…c991 to=vault
decoded: struct=(11, 0x85D0…F30A, 10, 1794387383) depositor=0x85D0…F30A v=27
vault digest 0xfc9d2e23…945d1c49 ; NEAR signed message 0xfc9d2e23…945d1c49 ; EQUAL
ecrecover(digest,v,r,s) = 0x9de489d1…77246fe ; MATCH
positionOf(11, depositor) = 0x9DE4… 0x85D0… 3000000 3            (3 = Released)
nonceUsed(slotKey=0xa627…6269, nonce=10) = true
token balance borrower1 0x85D0… @57050720 7000000 -> @57050721 10000000
replay relay calldata from keeper EOA: execution reverted: NonceUsed(10)
derived_public_key(base-sepolia/pos/12, domain 0) = secp256k1:4RuhNCkk… -> keccak addr 0x8a8a0125…98c313 ; MATCH
relay tx 0xa2fea901…7839c648 status=0x1 block=57050724
decoded: struct=(12, 4, 308700000, 2357389, 0xcA61…1fa1, 14, 1794387594, 1) depositor=0x85D0…F30A v=27
vault digest 0x088c5a6f…1a4153 ; NEAR signed message 0x088c5a6f…1a4153 ; EQUAL
ecrecover(digest,v,r,s) = 0x8a8a0125…98c313 ; MATCH
positionOf(12, depositor) = 0x8A8A… 0x85D0… 3000000 2            (2 = Settled)
nonceUsed(slotKey=0x5a83…3960, nonce=14) = true
token balance borrower1 @57050723 7000000 -> @57050724 7642611 ; buyer1 0xcA61… 0 -> 2357389 (latest same)
replay relay calldata from keeper EOA: execution reverted: NonceUsed(14)   (selector 0x6d9650be = NonceUsed(uint64))
NEAR: get_position 11/12 status Closed, remote.source "keeper" (attest mode, as labelled), committed_depositor 0x85D0…F30A
```
Explorer: N/A (local fork).
Verdict: **PASS on the local fork of Base Sepolia (D-026), not Base Sepolia.** Every claim in the summary holds: authorities (domain 0), relay status 1, on-chain digest == NEAR digest,
ecrecover == authority, positionOf 3/2, balances (borrower1 back to 10.000000, then 7.642611; buyer1 +2.357389), replay → NonceUsed(14) (and NonceUsed(10) for the release).
The new slot-scoped nonce map (D-027 SR-1) is set for both slots. Notes: positionOf keeps amount 3000000 after a terminal status (status field is the guard). Earlier caveats are not
re-checked this run and still stand: no ERC-8021 suffix (D-026/H19), Solana-domain revert shown only in forge tests, real Base Sepolia pending H15.

### G13 — Base round trip — PASS, local fork of Base Sepolia (D-026), not Base Sepolia — 2026-11-10T18:03Z–18:05Z — commit 7bface5
Fresh clone /tmp/verify-G12G13-20261110T180307Z. Read-only. No secrets. EVM = local fork of Base Sepolia (D-026) at 127.0.0.1:8545, chain 84532, block 57050713. NEAR = public testnet via https://test.rpc.fastnear.com (finality final). Each claim in evidence/G13/summary.md was checked against the chains, not taken from the summary.
Commands (full output in evidence/G13/verifier-20261110T180307Z/):
```
# NEAR views (near-views.log): contract_version; get_position {"position_id":"6"|"7"} (U64 is a string: integer arg panics);
#   get_pending_release_evm {"position_id":"6"}; get_pending_settlement_evm {"position_id":"7"};
#   v1.signer-prod.testnet derived_public_key {"path":"base-sepolia/pos/<id>","predecessor":"nectar-core-v2.nectar.testnet","domain_id":0}
# base58 → 64-byte x‖y → cast keccak → last 20 bytes (authority-check.log)
# local fork of Base Sepolia (D-026) (fork-checks.log): cast receipt/tx; cast decode-calldata release(...)/settle(...);
#   cast call vault hashRelease/hashSettle(decoded struct); cast call 0x…01 (digest‖v‖r‖s); cast call vault <same calldata> --from <keeper>;
#   cast call vault positions(uint64); cast call MockB20 balanceOf(buyer1|borrower1)
contract_version "2.1.0-v7"
pos 6: NEAR status Closed, remote.status Closed, authority 0xd4189b46e51e93fee716b78ccf0325e622f0bdb5
       derived keccak 0x7d53…d4189b46e51e93fee716b78ccf0325e622f0bdb5 → 0xd4189b46…0bdb5  MATCH
pos 7: NEAR status Closed, remote.status Closed, authority 0xad6bc65253be35ca23696396f791bbbb83f6a31b
       derived keccak 0x7d21…ad6bc65253be35ca23696396f791bbbb83f6a31b → 0xad6bc652…a31b   MATCH
release 6: pending txHash 0x759a9a8b956831b054648605932ea8af72c5bfbc73b77e4f679591f96788694b status Relayed, digest 0xf5f93f43…c769 v 28
  receipt status true, block 57050710, from 0xe4A5…C991 (keeper) to vault 0xC4f4…3d09, selector 0xf8ac3116 = release((uint64,address,uint64,uint64),uint8,bytes32,bytes32)
  decoded (6, 0x85D0…F30A, nonce 2, expires 1794337122); vault.hashRelease = 0xf5f93f43…c769 (== NEAR digest)
  ecrecover precompile 0x01 → 0xd4189b46e51e93fee716b78ccf0325e622f0bdb5 == authority 6
  replay eth_call → custom error 0x6d9650be = NonceUsed(uint64), arg 2
settle 7:  pending txHash 0x20d13922df857bd352bde1e30bafde868c1c76d8cedd3bd33acbe38eda6fe4bb status Relayed, digest 0x260c067c…f2f3 v 27
  receipt status true, block 57050713, same keeper → vault, selector 0x29b82ac2 = settle((uint64,uint64,uint256,uint256,address,uint64,uint64,uint8),uint8,bytes32,bytes32)
  decoded (7, quote 4, repay 308700000, seize 2357389, 0xcA61…fa1, nonce 6, expires 1794337295, kind 1); vault.hashSettle = 0x260c067c…f2f3 (== NEAR digest)
  ecrecover precompile 0x01 → 0xad6bc65253be35ca23696396f791bbbb83f6a31b == authority 7
  replay eth_call → NonceUsed(uint64), arg 6
positions(6) = (0xd418…bdb5, 0x85D0…F30A, 3000000, 3)  enum 3 = Released
positions(7) = (0xaD6b…A31B, 0x85D0…F30A, 3000000, 2)  enum 2 = Settled
MockB20 balanceOf buyer1   0xcA61FE6F57a6A36Dedf2b99E1D4D8923b1D71fa1 = 2357389
MockB20 balanceOf borrower1 0x85D051D8CD3fEe54FdE043499C75fa95eeB9F30A = 7642611
```
Explorer links opened: none. The local fork of Base Sepolia (D-026) has no explorer; NEAR txs were checked by RPC view only.
Verdict: **PASS on the local fork of Base Sepolia (D-026), not Base Sepolia.** Claims (a) to (e) all hold. Points measured against gates-v7.md G13:
- "confirmed on 84532": confirmed on the local fork of Base Sepolia (D-026, chain id 84532), not on Base Sepolia. A real run is pending H15.
- "settle with ERC-8021 suffix": NOT MET, disclosed. The settle calldata is 714 hex chars, which is exact ABI length with no suffix. D-026 says "ERC-8021 suffix only if H19"; F-351 records the format as unverified.
- "Solana-domain signature revert": shown only by forge tests (test_settle_solanaMessageSignedBySameKey_reverts and test_settle_ed25519SignatureBytes_reverts PASS in §G12). No such revert was sent on the local fork of Base Sepolia (D-026).
- "ecrecover on-chain": ecrecover was run through the 0x01 precompile on the local fork of Base Sepolia (D-026). Both relay txs also have status 1, and the vault checks ecrecover == authority inside `_consume`.

## G12

### G12 — Base toolchain + collateral — PASS, local fork of Base Sepolia (D-026), not Base Sepolia — 2026-11-10T18:03Z–18:04Z — commit 7bface5
Fresh clone /tmp/verify-G12G13-20261110T180307Z. Read-only. No secrets. Foundry at ~/.foundry/bin (forge/cast/anvil).
Commands (full output in evidence/G12/verifier-20261110T180307Z/):
```
$ cd evm && find . -name '._*' -delete && forge test          # forge-test.log, exit 0
[SKIP: B20 precompiles absent: run `forge test --network base`] test_createB20_localPrecompiles() (gas: 0)
Suite result: ok. 12 passed / 2 passed / 1 passed / 59 passed (NectarVaultBase suite), 0 failed
Ran 5 test suites: 74 tests passed, 0 failed, 1 skipped (75 total tests)
$ cast chain-id --rpc-url http://127.0.0.1:8545                # local fork of Base Sepolia (D-026)
84532                                                           (block 57050713)
$ cast code <addr> --rpc-url http://127.0.0.1:8545              # fork-code.log; addresses = config.yaml base.*
vault      0xC4f46D859f9B555D95b68DC28564C5201F743d09  5383 B  keccak 0xd6070445…c946
collateral 0xD83A1571Ac3431A498f657512439B744c35CAd7E  3771 B  keccak 0x10731af1…0380 (MockB20)
registry   0x5A87057522B19A6B757a6FB1A7888d2AF5AA52D5  1297 B  keccak 0xb1d6f637…27e5
$ cast call 0xB20f000000000000000000000000000000000000 "createB20(uint8,bytes32,bytes,bytes[])(address)" 0 <fresh salt> \
    $(cast abi-encode "f((uint8,string,string,address,uint8))" "(1,Nectar Probe,NPRB,<from>,18)") "[]" --from <from> \
    --rpc-url https://sepolia.base.org                          # createB20-sim.log, 18:03:41Z, real Base Sepolia, chain 84532, block 57059770
from 0x…dEaD  → 0xB20000000000000000000026C5e93ECDE4629b7c   (no revert)
from 0x1111…  → 0xB2000000000000000000001F2281452A54ef1fc1   (no revert)
factory eth_getCode = 0 bytes (precompile, so no EVM bytecode)
```
Explorer links opened: none. A local fork of Base Sepolia (D-026) has no explorer, and nothing was deployed to real Base Sepolia.
Verdict: **PASS on the local fork of Base Sepolia (D-026), not Base Sepolia.** forge test is green (74/0/1); the skip is the B20-precompile test, which needs `--network base`. Chain id is 84532 and all three config.yaml base.* contracts have code on the local fork of Base Sepolia (D-026). The F-348 read-only createB20 simulation reproduces on real Base Sepolia from two arbitrary senders. Points measured against gates-v7.md G12:
- scripts/06-base.sh (keystores) and scripts/26-deploy-base.sh: NOT RUN by the verifier. Keystores are a secret, and these scripts send txs, so they fall outside a read-only check. The deployed result was checked by `cast code` instead.
- H15 funding: OPEN. Real Base Sepolia deployment is pending, and the collateral on the local fork of Base Sepolia (D-026) is MockB20 (DeployMock path, because B20 precompiles are absent on anvil).
- "addresses on explorer": N/A for a local fork of Base Sepolia (D-026).

## G3b

### G3b — web E2E after the design port (WO-33a/b/c, WO-34w) — RE-RUN after D-027 — PASS — 2026-11-11T08:08Z–08:24Z — commit 3ab3026

- Same fresh clone as the G11 re-run (main@3ab3026). No secrets: no NECTAR_E2E_BORROWER_KEY, no Feed URL. Live testnet reads went through FastNEAR. Runs were sequential, never overlapping.
- Commands:
```
pnpm i && pnpm --filter web build
PW_CHANNEL=chrome pnpm --filter web e2e
cd apps/web && npx next start -p 3100 &
node scripts/lh-d027.mjs     # copy of scripts/lighthouse.mjs: ROUTES = the 11 gate routes, outDir evidence/G3b/rerun-d027/lighthouse (evidence/G3b/verifier-rerun-d027-20261111T0802Z/lh-d027.mjs)
node probe-d027.mjs          # 400x860, colorScheme dark + light, documentElement.scrollWidth <= clientWidth (evidence/G3b/verifier-rerun-d027-20261111T0802Z/probe-d027.mjs)
```
- Output (trimmed):
```
pnpm i EXIT=0 · web build EXIT=0 (30 app routes)
e2e: 392 passed, 0 failed, 82 skipped (9.5m)  EXIT=0   08:08:58Z → 08:18:28Z
  skips (e2e-skips-by-spec.txt): testnet write spec 1 desktop + 1 phone (no key) · remote.spec 14x2 (REMOTE_SCREENS unset) ·
  notes.spec 2x2 (NOTES_SCREENS unset) · phone copies of desktop-only specs: design-app 40, design 5, live-views 3
  live reads passed on desktop: live-views x3 (real /quote/[id], open /position/[id], closed remote position), testnet read-only x2
/api/health: deployed true · core nectar-core-v2.nectar.testnet · version 2.2.1-v7
Lighthouse a11y          dark  light
  /                       100    97   (only deduction: color-contrast on <span class="nx-delta up">)
  /feed /feed/NVDAx /borrow /shield /position/10 /notes /quote /reserve /console /agents   100 / 100 each
  lighthouse.log EXIT=0 (22/22 >= 90)
400 px probe: 22/22 route x theme noHScroll=true (scrollW 400 = clientW 400); 0 responses >= 500
  dark body-bg rgb(13, 15, 18) · light body-bg rgb(249, 250, 251)  -> both themes render
```
- Screenshot: evidence/G3b/verifier-rerun-d027-20261111T0802Z/borrow-400px-dark.png. The 22 LH JSON reports (4.8 MB) stay in the clone. Scores are in lighthouse-scores.tsv.
- Explorer links opened: none (this gate sends no transactions).
- Verdict: **PASS**. Advisory: the home page fails light-theme contrast on `.nx-delta.up` (97, above the 90 threshold).

### G3b — web E2E against nectar-core-v2 — PASS (re-run after WO-26f) — 2026-11-10T17:39Z–17:48Z — commit 0ed567f
Fresh clone /tmp/verify-G3b-20261110T173957Z (git clone /Volumes/T7/nectar-labs, main HEAD 0ed567f), no secrets; NECTAR_E2E_BORROWER_KEY, NEXT_PUBLIC_E2E_KEY_ADAPTER, NEXT_PUBLIC_FEED_URL all unset. Config unchanged: core nectar-core-v2, 8 flags on.
$ pnpm i                                   → exit 0 (pnpm 10.34.9)
$ pnpm --filter web build                  → exit 0; /api/feed is now ƒ (dynamic), was prerendered in the FAIL run
$ PW_CHANNEL=chrome pnpm --filter web e2e  → exit 0: 244 passed / 0 failed / 18 skipped (3.7 m), no flaky/retried tests
  The 7 specs that failed before now pass on both projects, under new titles that pin flag state, e.g. v7.spec.ts:45 "flags off: … no module sections", :58 "flags on: every module section renders",
  :98/:112 "v1 path (mocked v1 contract, every flag on)", shields.spec.ts:175/:242, notes flags-off, agents-console x402. They also pass against live config with flags on.
  Skipped 18: testnet write "borrow with demo key" ×2 (SKIPPED: no key, as expected); notes screenshots ×4 and remote screenshots ×12 (capture-only).
  400 px: shell.spec.ts "/<route> renders in dark|light, no horizontal scroll, axe clean" passes on phone (400×860) and desktop for every route.
$ LH_START=1 pnpm --filter web lighthouse  → exit 0: / /feed /borrow /quote/new /console /agents /keepers = 100/100 (dark/light)
$ LH_START=1 node scripts/lh-g3b-extra.mjs → exit 0: /shield /reserve /notes = 100/100. This is a verifier copy of the repo script with only ROUTES/outDir changed; the repo script still leaves out these 3 routes.
  All 20 = 100, no failing a11y audit (heading-order from the FAIL run is gone). Theme proof (mean brightness of the LH screenshot, dark/light): home 33/242, feed 33/235, shield 33/243, reserve 32/244, notes 32/244.
Live probe (next start :3100, RPC https://test.rpc.fastnear.com, 17:47Z), g3b-rerun-probe.mjs:
  GET /api/health → core nectar-core-v2.nectar.testnet, version "2.0.0-v7"
  GET /api/feed ×3, 8 s apart → HTTP 200, cache-control no-store, as_of = request time (17:47:07.439Z / :16.057Z / :24.452Z), age_s 0, stale false.
    NVDAx: session_open false, "stale_price", haircut 2500, q 16,107.06, r 10.00, debt 9,199.00, capacity 12,087.795. oracle_age_s 3101 → 3109 → 3118 tracks the chain,
    and each read equals RPC get_exit_capacity at the same moment. Not a build-time snapshot.
  GET /api/indexer/api/oneclick → HTTP 200 {"configured":false,"error":"Feed indexer not configured"}
  /feed in Chrome, 15 s settle → 0 responses ≥ 500, 0 console errors; the 1Click panel says "Feed indexer not configured … Set NEXT_PUBLIC_FEED_URL and run pnpm --filter feed start".
Screenshot: evidence/G3b/verifier-rerun-20261110T1740Z/feed-live-no-feed-url-dark.png
Evidence: evidence/G3b/verifier-rerun-20261110T1740Z/ (install, build, e2e, lighthouse-script, lighthouse-extra logs; lighthouse-scores.tsv; theme-brightness.txt; live-probe.log; probe + LH-copy scripts). LH JSON not committed.
Explorer links: none opened (G3b has no explorer criterion; nearblocks returns 403 to WebFetch, see §G2).
Verdict: PASS. e2e exit 0, LH a11y 100 on all 10 routes × 2 themes, 400 px no-scroll, /api/feed live with as_of/age_s, /feed clean without a Feed URL.
Open (not gate criteria): the repo LH script leaves out /shield /reserve /notes; the Notes list needs a wallet (not UI-verified); write flow verified only by skip.

### G3b — web E2E against nectar-core-v2 — FAIL — 2026-11-10T16:56Z–17:25Z — commit 2bf99e1
Fresh clone /tmp/verify-G3b-20261110T165651Z (git clone /Volumes/T7/nectar-labs), no secrets. config.yaml: core nectar-core-v2.nectar.testnet; features on = weekend_guard, shields, profit_lock, notes, reserve, agent_skill, x402, solana_remote (multiplier, pay_to, referrals, base off).
$ pnpm i                                   → exit 0 (pnpm 10.34.9; ignored build scripts core-js, secp256k1)
$ pnpm --filter web build                  → exit 0 (26 routes incl. /shield /reserve /notes /note/[id]; 2 Turbopack "dynamic fs tracing" warnings)
$ PW_CHANNEL=chrome pnpm --filter web e2e  → exit 1: 214 passed / 14 failed / 18 skipped (10.0 m, 1 worker, retries 1)
  Failed (each on desktop AND phone, failed on retry too):
  e2e/agents-console.spec.ts:48  /agents › … x402 not run yet …     getByTestId('agents-x402').getByText('not run on testnet yet') not found
  e2e/notes.spec.ts:147          /notes › flags off: honest disabled states, no nav links   'Position Notes are not enabled on this deployment' not found
  e2e/shields.spec.ts:175        /shield › flags off: honest disabled state, no Shields nav link   'Shields are not enabled on this deployment' not found
  e2e/shields.spec.ts:242        /quote/new voluntary fills › flag off: no checkbox      getByTestId('voluntary-fills') count expected 0, got 1
  e2e/v7.spec.ts:33              landing v7 › … no module sections while flags are off …  locator('[data-feature]') expected 0, got 8
  e2e/v7.spec.ts:64              v1 path (live contract) › feed equation card … no v2 aggregate rows   eq-total-debt expected 0, got 1
  e2e/v7.spec.ts:78              v1 path (live contract) › borrow: fee stack …           expected "the v1 contract charges none", got "Limit premium … $0.00 Origination (30 bps) $0.03 Total fees $0.03"
  Cause (observed, not fixed): these specs assert flags-off / v1-contract behaviour; the committed config now enables the flags and points at v2, so the app shows the v7 UI and the specs fail. No test was edited.
  Skipped 18: testnet write spec ×2 (NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER unset, as expected); notes screenshots ×4, remote screenshots ×12 (capture-only specs).
  No horizontal scroll at 400 px: shell.spec.ts "/<route> renders …, no horizontal scroll, axe clean" + notes/shield h-scroll checks all passed (desktop + phone 400×860).
$ LH_START=1 pnpm --filter web lighthouse  → exit 0. Script routes: / 100/100, /feed 100/100, /borrow 98/98, /quote/new 100/100, /console 98/98, /agents 100/100, /keepers 100/100 (dark/light)
  /shield /reserve /notes are not in the script's ROUTES; verifier ran an unmodified copy with only ROUTES/outDir changed (evidence lh-g3b-extra.mjs, untracked in clone):
  /shield 98/98, /reserve 100/100, /notes 100/100. All 20 ≥ 90. Only failing audit anywhere: heading-order (/borrow, /console, /shield).
  Theme proof (LH full-page screenshot mean brightness, dark/light): home 33/242, shield 33/243, reserve 32/244, notes 32/244.
Live testnet render (next start on :3100, Chrome, 17:13Z–17:22Z; RPC https://test.rpc.fastnear.com):
  contract_version (RPC) "2.0.0-v7", get_state_version 2; GET /api/health {"core":"nectar-core-v2.nectar.testnet","version":"2.0.0-v7"}. Pages show "v2" on /feed; the 2.0.0-v7 string itself appears only via /api/health.
  4 quotes: list_quotes {"symbol":"NVDAx"} → ids 0–3, remaining 5,000 + 5,477.50 + 629.56 + 5,000 = $16,107.06; /feed, / show "Qc committed quotes $16,107" (aggregate; no per-quote list on /feed).
  Reserve: /reserve "R_c (counts toward limits) $10.00", share price $1.00, discount 600 bps; /feed and / show "Rc $10".
  Session badge: renders "Weekend parameters · stale price (> 15 min)" on /, /feed, /borrow; matches get_exit_capacity at 17:2xZ (session_open false, session_reason "stale_price", haircut 2500, oracle_age_s 1046).
  Notes: /notes shows "Connect a wallet to see your Notes" (no wallet in a stranger run, so the list itself is NOT verified in UI); /note/r-NVDAx-0, /note/q-1, /note/p-5 → HTTP 200 with the Note titles; chain nft_total_supply 11.
  Observations: /api/feed is prerendered (revalidate 10 s) and on first hit returned the build-time snapshot (session_open true, oracle_age 113 s) while the chain said stale_price; browser console 2× HTTP 503 on /feed (1Click panel: "Feed API not configured (NEXT_PUBLIC_FEED_URL)").
Screenshot: evidence/G3b/verifier-20261110T1656Z/feed-live-desktop-dark.png
Evidence: evidence/G3b/verifier-20261110T1656Z/ (build.log, e2e.log, lighthouse-script.log, lighthouse-extra.log, lighthouse-scores.tsv, theme-brightness.txt, live-probe.log, probe scripts). LH JSON reports not committed (3.9 MB).
Explorer links: none opened (G3b has no explorer criterion; nearblocks returns 403 to WebFetch, see §G2).
Verdict: FAIL — the gate's e2e command exits 1 (14 failures, 7 specs × 2 projects). Lighthouse 20/20 ≥ 90, both themes, 400 px no-scroll, and live v2 data (version, Q_c from 4 quotes, R_c $10, session badge) PASS. Open: Notes list needs a wallet; heading-order on 3 routes.

## v7 module runs

### v7 module runs — read-only chain check of evidence/v7-modules/summary.md — PASS (Profit-Lock event not chain-confirmed) — 2026-11-10T17:20Z — commit 2bf99e1
RPC https://test.rpc.fastnear.com, account nectar-core-v2.nectar.testnet, finality final.
Profit-Lock — PASS (state): get_position {"position_id":"0"} → status "Closed", units 0, debt 0. list_quotes NVDAx → quote 1 committed 10,000,000,000 / remaining 5,477,500,000 = 10,000 − 4,522.50 ✓.
  self_settled event: present only in the repo log (evidence/v7-modules/profitlock-20261110T165420Z.log EVENT_JSON {position_id 0, debt_repaid 4,500,000,000, fee 22,500,000, fill 4,522,500,000, units_repaid 30,923,077}); the log records no tx hash (only signer key + signature), so the event could not be fetched from chain. Open item.
Reserve — PASS: get_reserve {"symbol":"NVDAx"} → r_usd_e6 "10000000", shares 10,000,000, discount_bps 600, notice 604800 s. nft_token {"token_id":"r-NVDAx-0"} → owner_id "buyer2.nectar.testnet", title "Reserve Note r-NVDAx-0".
Shield — PASS: get_shield {"position_id":"5"} → kind "Weekend", fee_bps 15, fee_usd_e6 283500, window_end_ns "1794407400000000000", active true.
Notes — PASS: nft_total_supply "11"; nft_tokens lists q-0…q-3, p-0…p-4, r-NVDAx-0 (+ p-5 via /note/p-5 page 200).
Evidence: commands and outputs in this block; G3b live-probe.log.

## G14

### G14 — x402 paid call — RE-RUN after D-027 — PASS (chain claims) — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. Claims checked: evidence/G14/rerun/summary.md. Command: node evidence/G14/verifier-20261111T080154Z/g14.mjs
(EXPERIMENTAL_tx_status on https://test.rpc.fastnear.com). Output: chain.log.
```
tx HvFX6YRaY64YWss7KBQSpucM1vnVUtHFraQvqjGs6Q1V signer=agent1.nectar.testnet receiver=nvdax-mock.nectar.testnet final=SuccessValue failed_receipts=0
  FunctionCall ft_transfer_call args={"receiver_id":"nectar-core-v2.nectar.testnet","amount":"1000000","msg":"{\"LockCollateralAndBorrow\":{\"collateral\":\"NVDAx\",\"borrow_usd_e6\":\"10000000\",\"pre_liq_ltv_bps\":8000}}"} deposit=1
  receipt executor=nectar-core-v2.nectar.testnet status=SuccessValue logs: EVENT_JSON position_opened {position_id 13, borrower agent1, units 1000000, debt_usd_e6 10000000, origination_fee 30000} ;; nft_mint
tx BemztvL9jzTCm5wzbA8tD7Kj3q7qKEe9fJTLA8Zsn35G signer=x402-relayer.nectar.testnet receiver=agent1.nectar.testnet final=SuccessValue failed_receipts=0
  Delegate sender=agent1.nectar.testnet receiver=usdc-mock.nectar.testnet nonce=277093880000004 max_block_height=277187802
    inner FunctionCall ft_transfer args={"receiver_id":"nectar.testnet","amount":"10000"} deposit=1
  receipt executor=agent1.nectar.testnet SuccessValue · usdc-mock.nectar.testnet SuccessValue · x402-relayer.nectar.testnet SuccessValue ×2
```
Explorer: not opened this run (nearblocks returns 403 to WebFetch, see §G2); RPC proof above.
Verdict: **PASS for the chain claims.** The borrow (position #13, $10, agent1) and the NEP-366 delegate relay (ft_transfer of 10000 usdc-mock base units = $0.01 to nectar.testnet,
signed by agent1, relayed by x402-relayer) are on chain and succeeded. Not re-run by the verifier: the HTTP leg (unpaid GET → 402, paid → 200 CSV 37 rows); that rests on
evidence/G14/rerun/demo-20261111T080042Z.log. mock-ft emits no ft_transfer event, so the transfer is proven by the decoded delegate action plus the successful usdc-mock receipt.

### G14 — x402 paid call — PASS — 2026-11-10T16:48Z–16:52Z — clone 91db9ea (tests), summary at 6ba1b09
Verified evidence/G14/summary.md against the chain, read-only. rpc.testnet.near.org answered `-429 "THIS ENDPOINT IS DEPRECATED"`, so
the reads used https://rpc.testnet.fastnear.com (the repo's other configured RPC). Logs: evidence/G14/verifier-20261110T1645Z/.
```
$ pnpm --filter x402 test → exit 0  # tests 9 # pass 9 # fail 0
$ EXPERIMENTAL_tx_status GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt sender agent1.nectar.testnet
  signer agent1 → nvdax-mock ft_transfer_call {receiver nectar-core-v2, amount 1000000, LockCollateralAndBorrow NVDAx borrow 10000000, pre_liq 8000}
  status SuccessValue, 0 failed receipts
  nectar-core-v2 position_opened {position_id 4, borrower agent1, units 1000000, debt_usd_e6 10000000, origination_fee 30000, net 9970000, remote false}
  nectar-core-v2 nft_mint p-4
$ EXPERIMENTAL_tx_status 5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx sender x402-relayer.nectar.testnet
  signer x402-relayer → receiver agent1, actions [Delegate]; status SuccessValue, 0 failed receipts
  delegate_action sender agent1, pk ed25519:3zyEtyWb… (agent1's key), receiver usdc-mock: ft_transfer {receiver nectar.testnet, amount 10000}
  receipts: agent1 (Delegate) → usdc-mock FunctionCall (pred agent1) SuccessValue → relayer gas refunds
$ view_access_key_list agent1        → [ed25519:3zyEtyWb2BJzYZdTEsQeBNhnoqrNFw6KeQLjJQE925hm FullAccess]
$ view_access_key_list x402-relayer  → [ed25519:GVaHZ4FfWf3DnJXLXfnjXN3rDCjiTSfd1KT4GCdmWuXR FullAccess]
```
Discrepancy (not a fail): no `ft_transfer` EVENT_JSON in the relay tx — contracts/mock-ft emits no NEP-141 event logs at all; the transfer is
proven by the successful usdc-mock `ft_transfer` receipt with the decoded args. The 402 → 200 HTTP leg is off-chain (summary/server log only; not re-run).
**PASS** — (1) borrow tx opened position #4 for $10; (2) relay tx carries agent1's SignedDelegate paying 10000 usdc-mock e6 to nectar.testnet; (3) one FullAccess key each.

## G2b

### G2b — testnet deploy v2 — RE-RUN after D-027 (2.2.1-v7) — PASS — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. NEAR RPC https://test.rpc.fastnear.com. Scope as asked: version, code-hash rebuild, keeper key, views (pnpm verify not re-run).
```
$ cd contracts/nectar-core && cargo near build non-reproducible-wasm
  exit 1: host build scripts fail to link — ld-1267: "/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk/usr/lib/libSystem.B.tbd: unknown architecture arm64e.x1-macos"
  (build-default-sdk-FAILED.log; this host's default SDK, not the repo)
$ SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo near build non-reproducible-wasm   → exit 0, 1m 23s (build-sdk26.5.log)
local  sha256 2938ebf84c3d89cb66c39be98184befd8908a55543eaa1c2e60e7e27cb2df78d  (818,668 B)
deploy sha256 2938ebf84c3d89cb66c39be98184befd8908a55543eaa1c2e60e7e27cb2df78d  (view_code) → cmp: BYTE-IDENTICAL; base58 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk == view_account code_hash
contract_version → "2.2.1-v7"; get_config.contract_version "2.2.1-v7", keeper keeper-v2.nectar.testnet, paused false
get_exit_capacity {symbol:NVDAx} → q 16119220000, oracle 135000000 (Owner, fresh, age 264 s), session_open false (outside_hours), capacity 12096915000, total_debt 9209000000
list_quotes {} → panics "missing field symbol"; list_quotes {symbol:NVDAx} → 5 quotes
get_remote_chains {} → panics "missing field symbol"; {symbol:NVDAx} → solana-devnet ENZa…pubW domain 1 primary; base-sepolia 0xC64b…1226 domain 0, 84532, rpc 127.0.0.1:8545
get_quoter_config → enabled, outlayer.testnet, nectar.testnet/nectar-quoter, version_key 5f9bb28796c6c355522444252be380f09e0a1067a453a6d48e06724f581bc062
keeper-v2 access keys → 1 key ed25519:7GknDBk6…, FunctionCall receiver nectar-core-v2.nectar.testnet, methods [trigger_preliquidation, relay_settlement_result,
  confirm_remote_deposit, keeper_attest_deposit, relay_release_result]
```
Explorer: not opened this run (nearblocks 403 to WebFetch, §G2); code proven by view_code above.
Verdict: **PASS.** Deployed code is byte-identical to the clone's build; version, keeper key and every requested view hold. Open item (host, not repo): on this Mac the default
Command Line Tools SDK 27.0 cannot be read by the installed linker, so the plain build command fails until SDKROOT points at an older SDK; a stranger on the same setup hits this.
list_quotes and get_remote_chains need `{"symbol":"NVDAx"}`.

### G2b — testnet deploy v2 — RE-RUN — PASS — 2026-11-10T16:45Z–16:52Z — commit 91db9ea
Fresh clone /tmp/verify-G2b-G7-20261110T164524Z (main 91db9ea, includes WO-16b 12e8347). No secrets. Logs: evidence/G2b/verifier-rerun-20261110T1645Z/.
```
$ pnpm i                 → exit 0 (Done in 4.5s, pnpm 10.34.9)
$ pnpm verify            → exit 0   (= verify:quick [lint, typecheck, pnpm -r test] + scripts/50-verify.sh)
  services/keeper  # tests 168 # pass 168 # fail 0
  services/feed    # tests 57  # pass 57  # fail 0    (incl. "repo config defaults" — the GATE_FAIL_G2b test, now green)
  services/x402    # tests 9   # pass 9   # fail 0
  packages/sdk     Test Files 6 passed, Tests 77 passed
$ pnpm demo:testnet      → exit 0
  account nectar-core-v2.nectar.testnet  version 2.0.0-v7
  Q_c $15,629.56  R_c $0.00  D_c $0.00  haircut 1000 bps  session open
  oracle $150.00 (age 306s, STALE)  effective limit 7000 bps
  pool available $36,500.00 utilised $13,500.00 treasury $49.04
  quotes #0 $5,000 400 bps · #1 $10,000 250 bps · #2 $629.56 300 bps (all live)
  positions #0 Open $4,500 · #1 Open $9,000 · #2 Closed · #3 Closed
$ view_account nectar-core-v2 (final, block 277093894) → code_hash 3W5bifwgurTNyZwHsseLU8NmJxaW5Dt2221CfhvQ31ey (== first run)
$ contract_version {} → "2.0.0-v7"
```
Note: oracle shows STALE (age > max) at read time — the owner price push from the G7 demo is aging; display-only, not a G2b criterion.
State drift vs first run is the deliberate G7 work (positions #2/#3 Closed, quote #2 drawn). Explorer: not re-opened (403 in first run).
**PASS** — the only first-run failure (`pnpm verify` exit 1) is fixed; code hash and version unchanged.


### G2b — testnet deploy v2 (nectar-core-v2) — FAIL — 2026-11-10T16:34Z–16:45Z — commit 1c4cdb3
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G2b-20261110T163415Z (HEAD 1c4cdb3); public RPC https://rpc.testnet.near.org, read-only;
  no secrets, no transactions. Logs: evidence/G2b/verifier-20261110T163415Z/ (accounts-code.log, views.log, demo.log, verify.log, pnpm-i.log).
1. Accounts (view_account, final, block ~277092673): nectar-core-v2 code_hash 3W5bifwgurTNyZwHsseLU8NmJxaW5Dt2221CfhvQ31ey (== expected);
   keeper-v2 exists, no code; usdc-mock + nvdax-mock exist, code_hash 55hvEq… . view_code → 734784 B, sha256 252a6abe1803b262…29e8937a,
   base58(sha256) = 3W5bif…31ey. $ (contracts/nectar-core) SDKROOT=…/MacOSX26.5.sdk cargo near build non-reproducible-wasm → exit 0 (37 s);
   target/near/nectar_core/nectar_core.wasm 734784 B sha256 252a6abe… — byte-identical to deployed code. HOLDS.
2. keeper-v2 view_access_key_list → exactly 1 key ed25519:7GknDB…, FunctionCall, receiver nectar-core-v2.nectar.testnet, allowance 0.4 NEAR,
   methods [trigger_preliquidation, relay_settlement_result, confirm_remote_deposit, keeper_attest_deposit, relay_release_result]; no full-access key. HOLDS (D-019).
3. Views (call_function, final): contract_version "2.0.0-v7" · get_config (keeper keeper-v2, usdc usdc-mock, paused false) · get_pool
   (available $36,500 / utilised $13,500 at first read) · get_collateral NVDAx + list_collaterals (1: NVDAx, remote_chain solana-devnet ENZa…, domain 1)
   · get_exit_capacity NVDAx first read: session_open true, reason "open", Q $15,000, R $0, D $0, total debt $13,500, aggregate capacity $13,500,
     headroom $0, oracle Owner $180 (age 161 s, fresh false); second read: Q $16,000, headroom $900, oracle fresh
   · list_quotes first read: #0 $5,000 @400 buyer2 voluntary=false; #1 $10,000 @250 buyer1 voluntary=true (next_quote_id 2)
   · list_positions first read: #0 $4,500 Open; #1 $9,000 Open (next_position_id 2)
   · get_session_calendar: page cap 100 → 100+100+87 = 287 windows (first [1794321000…,1794344400…], last [1807018200…,1807041600…])
   · get_fee_stack (premium 300, origination 30, keeper 50, split 7000/2000/1000) · get_reserve NVDAx (empty, discount 600, share price 1.000000)
   · nft_tokens: q-0 buyer2, p-0 borrower1, q-1 buyer1, p-1 borrower1 (+ q-2 after drift) · nft_token_svg p-1: 1280 B, xmllint --noout OK
   · get_quoter_config version_key 5d90edb8840bb292…0f891fc9, enabled · get_remote_config vault_read_version_key 5d90edb8… (same), keeper deposit attestation allowed.
   NOTE drift: within ~4 min of the first reads, quote #2 ($1,000 @300 buyer1, Solana recipient) and position #2 (remote_path solana-devnet/pos/2) appeared
   (next ids 3/3; untracked evidence/G7/v2-*.log in the main worktree at 16:35–16:38Z = concurrent G7 v2 run). Expected 2/2 seed state held at first read.
4. $ pnpm i → exit 0 (4.8 s). $ pnpm demo:testnet → exit 0, reads v2: "account nectar-core-v2.nectar.testnet version 2.0.0-v7", Q_c $16,000,
   quotes #0–#2, positions #0–#2 (#2 debt $370.44), explorer links for core-v2/usdc-mock/nvdax-mock.
   $ pnpm verify → exit 1 (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL), so scripts/50-verify.sh never runs inside verify:
     services/feed test/defaults.test.ts:21 "reads config.yaml with no env…" expected 'nectar-core.nectar.testnet', actual 'nectar-core-v2.nectar.testnet'
     services/keeper test/keyfile.test.ts:43 "treats TODO-* ids as unset and falls back to config.yaml" — same assertion
     (both tests hard-code the v1 core id; config.yaml now points at v2). Other suites in the log ran green.
5. Explorer links (WebFetch tried on the first; HTTP 403, same as G2 v1 — human browser check still open):
   https://testnet.nearblocks.io/address/nectar-core-v2.nectar.testnet (403) · https://testnet.nearblocks.io/address/keeper-v2.nectar.testnet
   · https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet · https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet (not opened)
Verdict: FAIL — reason: `pnpm verify` exits 1 (2 stale v1-id assertions in services/feed + services/keeper tests). Criteria 1–3 and demo:testnet hold.
  Observations (not failure reasons): config.yaml line 79–80 comments still say "TODO-G2b (not created yet; needs H-NEAR-FAUCET)" though v2 exists;
  live state moves under concurrent G7 work, so later checks will see ≥ 3 quotes/positions.

## G11

### G11 — v7 contract — RE-RUN after the D-027 security wave — PASS — 2026-11-11T08:02Z–08:20Z — commit 3ab3026

- Fresh clone `/tmp/verify-G11-G3b-20261111T080207Z` (APFS) of main@3ab3026. Main later moved to 54cca8d; 3ab3026..54cca8d changes no code outside apps/docs-site. No secrets. SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk.
- Commands (scripts: evidence/G11/verifier-rerun-d027-20261111T0802Z/g11.sh, solevm.sh):
```
cargo test -p nectar-core --no-fail-fast -- --nocapture      # unit + all 7 sandbox targets
cargo test -p mock-ft
python3 contracts/nectar-core/tests/model.py --check --v7
(cd contracts/nectar-core && cargo near build non-reproducible-wasm); shasum -a 256 target/near/nectar_core/nectar_core.wasm
curl rpc.testnet.fastnear.com view_account nectar-core-v2.nectar.testnet          # deployed code_hash
cd evm && find . -name '._*' -delete && forge test
cd solana && pnpm install --ignore-workspace && pnpm run test:unit && pnpm run test:anchor   # PATH += ~/.avm/bin, solana active_release/bin
pnpm --filter keeper|x402|feed|@nectar/sdk test                                    # SR tests outside contracts/
```
- Output (trimmed):
```
unittests src/lib.rs        608 passed; 0 failed
sandbox.rs 5 · sandbox_evm.rs 19 · sandbox_p1.rs 5 · sandbox_p2.rs 6 · sandbox_reserve.rs 2 · sandbox_v7.rs 9 · sandbox_v7b.rs 4   (50, 0 failed)
cargo test -p nectar-core   EXIT=0   (08:02:40Z → ~08:19Z)
mock-ft                     23 passed; 0 failed   EXIT=0
model.py --check --v7       model.csv OK (132 rows)   EXIT=0
cargo near build            EXIT=0   nectar_core.wasm 818668 bytes
  sha256 2938ebf84c3d89cb66c39be98184befd8908a55543eaa1c2e60e7e27cb2df78d = base58 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk
  RPC view_account nectar-core-v2 (block 277189948) code_hash 3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk  -> MATCH (/api/health version 2.2.1-v7)
GAS (1264 rows, gas-summary.txt / gas-rows.csv):
  per-receipt max 67.69 Tgas confirm_remote_deposit(64 fitting quotes); next 19.86 trigger+sign(64 fitting quotes)
  tx-total max 78.72 Tgas (same call); label-only max 55.73 Tgas trigger_preliquidation(8 legs)
  rows >= 100 Tgas: 0   (4 `attached,300T` prepaid rows excluded)
forge test                  105 passed, 0 failed, 3 skipped (108)   EXIT=0   incl. 16 test_SR* (SR-1 x4, SR-8 x8, SR-30 x4)
solana test:unit            10 passed (cargo)   EXIT=0
solana test:anchor          # tests 55 # pass 55 # fail 0   EXIT=0
keeper 293/0 · x402 17/0 · feed 63/0 · @nectar/sdk 178/0   (all EXIT=0)
sr*-named contract tests that ran and printed ok: 124
```
- Security findings → reproducing tests (names in evidence/G11/verifier-rerun-d027-20261111T0802Z/sr-test-names.txt, counts in sr-map.txt; status per SECURITY.md at 54cca8d). Every finding SR-1…SR-33 has at least one test named after it, so **no fixed finding lacks a test**. Counts: SR-1 3 TS + 4 forge · SR-2 1 · SR-3 15 · SR-4 1 (Solana; EVM part open) · SR-5 29 (partial) · SR-6 10 (partial) · SR-7 6 (partial) · SR-8 10 + 8 forge · SR-9 8 · SR-10 3 · SR-11 1 · SR-12 2 · SR-13 1 · SR-14 6 · SR-15 2 · SR-16 4 · SR-17 6 · SR-18 3 · SR-19 5 · SR-20 6 · SR-21 1 · SR-22 3 · SR-23 1 · SR-24 3 · SR-25 1 · SR-26 3 · SR-27 7 · SR-28 1 · SR-29 2 · SR-30 4 forge · SR-31 4 · SR-32 1 · SR-33 1.
- Notes: (1) SR-28 is mitigated only on the keeper side (base.test.ts:511 "deposit reported unsupported, never confirmed"). quoter/src/jobs.rs:9 still says "base-sepolia (SR-28 not implemented)". (2) I ran the tests on the fixed code only. I did not re-run them on the pre-fix code to show they fail there. The EVM `_v1_` variants (SR-1, SR-8, SR-30) are the only in-suite old-path reproductions. (3) The G1 method-vs-GAS-label coverage diff was NOT RUN in this re-run. Only the 100 Tgas ceiling was checked.
- Log edit: line 9893 of cargo-test-nectar-core.log (a sandbox EVENT_JSON with the public anvil test account #1 address as `token`) is elided, because gitleaks flagged it as generic-api-key, a false positive. It is not a secret. No other change.
- Explorer links opened: none. The code hash comes from RPC (nearblocks returns 403 to WebFetch).
- Verdict: **PASS**.

### G11 — v7 contract — RE-RUN — PASS with open item F-352 — 2026-11-10T15:47Z–16:12Z — commit 53f1e63
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G11-20261110T154726Z (HEAD 53f1e63); SDKROOT=.../MacOSX26.5.sdk; no secrets.
Exit codes captured by a bash script (ev/status). Trimmed logs: evidence/G11/verifier-rerun-20261110T1547Z/ (unit-tests.txt, sandbox*.txt,
  mock-ft.txt, model.txt, build.txt, gas-max.csv, status).
$ cargo test -p nectar-core                       → exit 0: unit 453/0 · sandbox 5/0 · sandbox_p1 5/0 · sandbox_p2 4/0 · sandbox_reserve 2/0 ·
                                                      sandbox_v7 9/0 · sandbox_v7b 4/0 · doc 0 → 482 passed, 0 failed, 0 ignored
     v7: 81 unit tests named *v7_* (the `cargo test -p nectar-core v7_` filter set) + 103 in tests_v7/tests_v7b; new unit test
         tests_p2::deposit_forged_authority_refused ... ok
$ cargo test -p nectar-core --test <t> -- --nocapture  for t in sandbox sandbox_p1 sandbox_p2 sandbox_reserve sandbox_v7 sandbox_v7b
     5/0 · 5/0 · 4/0 · 2/0 · 9/0 (167–279 s) · 4/0 — all exit 0; 591 GAS rows ("attached,…" prepaid rows excluded)
$ cargo test -p mock-ft                           → 17 passed; 0 failed, exit 0
$ python3 contracts/nectar-core/tests/model.py --check --v7 → model.csv OK (132 rows), exit 0
$ (contracts/nectar-core) cargo near build non-reproducible-wasm → exit 0
     -                  Size: 734.8 KB (734784 bytes)
     - SHA-256 checksum hex : 252a6abe1803b2628b0adadb7b5ec120853ddbd8e1f698dddf4f629a29e8937a  (identical to 74ce8be: fix touched tests only)
$ git diff --stat add9427 53f1e63                 → src/tests_p2.rs +25, tests/sandbox_v7b.rs +23, docs only otherwise (no product code)
$ git status --short (clone, after runs)          → only ?? ev/ (verifier scratch)
Gas: previously missing rows now present (sandbox_v7b): GAS,set_shield_params,2672958059192 (2.67 Tgas);
  GAS,set_job_config,2558697971305 / 2565438983317 (2.56 / 2.57 Tgas; two jobs). Test asserts < 100 Tgas for both.
  Method diff: 68 `pub fn …(&mut self` in contracts/nectar-core/src/*.rs (non-test) vs GAS labels → every method measured except the 10
  #[private] callbacks (on_payout, on_pyth_price, on_quoter_result, on_signature, nft_resolve_transfer, on_session_check, on_multiplier_read,
  on_authority, on_deposit_verified, on_release_signature; counted inside caller totals) and ft_on_transfer (NEP-141 receiver, measured via the
  ft_transfer_call:* rows, e.g. LockCollateralAndBorrow 13.00–13.48, JoinNectarReserve 7.85, FundPappusQuote 7.99).
  Max label total 68.94 Tgas (trigger+pyth+quoter+8legs); no label >= 100 Tgas. All v7 method values from the FAIL run are reproduced in gas-max.csv.
PRD §6.11 tests: same mapping as the FAIL block below, all green again; forged deposit attestation now has a unit test
  (tests_p2::deposit_forged_authority_refused) in addition to sandbox_p2 remote_refusals_attestation_and_expiry. Missing: none.
F-352 (supersedes F-327): still "GATE G11 open" in docs/FACTS.md — xStocks multiplier mechanism unverified. Listed, not a FAIL reason
  (criterion is "F-327 answered or open").
Explorer: none (local sandbox).
Result: PASS — the only prior FAIL reason (no gas row for set_shield_params / set_job_config) is closed; all tests, model --v7 and build green.
  Open: F-352.

### G11 — v7 contract — FAIL (2 owner setters without a gas row; every test and PRD §6.11 criterion green) — 2026-11-10T15:12Z–15:39Z — commit 74ce8be
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G11-20261110T151225Z (HEAD 74ce8bea59d5); SDKROOT=.../MacOSX26.5.sdk; no secrets.
Exit codes via bash -c. Trimmed logs: evidence/G11/verifier-20261110T1512Z/ (unit-tests.txt, sandbox*.txt, gas-max.csv, coverage.txt).
$ cargo test -p nectar-core                       → exit 0: unit 452/0 · sandbox 5/0 · sandbox_p1 5/0 · sandbox_p2 4/0 · sandbox_reserve 2/0 ·
                                                      sandbox_v7 9/0 · sandbox_v7b 3/0 · doc 0 → total 480 passed, 0 failed
     v7: 81 tests named v7_* (tests_notes 43 + tests_reserve 38; = `cargo test -p nectar-core v7_` filter) + 103 in tests_v7/tests_v7b
         (names without the prefix) + 14 sandbox v7 tests (sandbox_v7 9 incl. tests/v7/notes.rs, sandbox_v7b 3, sandbox_reserve 2)
$ cargo test -p nectar-core --test <t> -- --nocapture  (targets listed from contracts/nectar-core/tests/*.rs)
     sandbox 5/0 · sandbox_p1 5/0 · sandbox_p2 4/0 · sandbox_v7 9/0 (181.9 s) · sandbox_v7b 3/0 · sandbox_reserve 2/0 — all exit 0
$ cargo test -p mock-ft                           → 17 passed; 0 failed, exit 0
$ python3 contracts/nectar-core/tests/model.py --check --v7 → model.csv OK (132 rows), exit 0 (--v7 asserts shield/self/reserve + agg_/mult_ rows)
$ (contracts/nectar-core) cargo near build non-reproducible-wasm → exit 0
     -                  Size: 734.8 KB (734784 bytes)
     - SHA-256 checksum hex : 252a6abe1803b2628b0adadb7b5ec120853ddbd8e1f698dddf4f629a29e8937a
$ git status --short (clone, after runs)          → only ?? ev/ (verifier scratch logs)
PRD v7 §6.11 "Tests added before any v7 service code" → passing test(s):
  two borrowers vs aggregate capacity — tests_v7::two_borrowers_cannot_both_draw_full_capacity; sandbox_v7 aggregate_debt_two_borrowers_repay_settle
  2-for-1 split leaves LTV unchanged — tests_v7::split_two_for_one_leaves_ltv_and_value_unchanged; sandbox_v7 multiplier_bounds_announce_and_split
  price > 900 s → weekend parameters — tests_v7::price_older_than_900s_flips_to_weekend_parameters; sandbox_v7 weekend_guard_calendar_stale_and_forced
  Reserve fills only after every quote — tests_reserve::v7_reserve_fills_only_after_every_quote; sandbox_reserve reserve_waterfall_late_depositor_transfer_and_exit
  Note transfer moves authority / refused while Settling — tests_notes::v7_notes_quote_authority_moves_with_transfer,
    v7_notes_loan_transfer_refused_while_settling, v7_notes_candidate_quote_transfer_refused_while_settling;
    sandbox_v7 notes::notes_authority_follows_transfer, notes::notes_transfer_refused_while_settling
  voluntary-fill cap holds — tests_v7b::self_settle_above_daily_cap (should panic), self_settle_daily_cap_resets_next_day; sandbox_v7b self_settle_refusals_and_exact_units
  referrer == borrower refused — tests_v7::referrer_equal_to_borrower_refused_with_full_refund; sandbox_v7 pay_to_claimable_and_referrers
  failed pay_to credits claimable_usdc — tests_v7::pay_to_failure_credits_borrower_claimable_then_withdraw; sandbox_v7 pay_to_claimable_and_referrers
  forged deposit attestation (wrong authority) refused — sandbox_p2 remote_refusals_attestation_and_expiry (reason authority_mismatch,
    borrower USDC 0); no unit test named for it. Missing: none.
Gas (max total per label from sandbox --nocapture GAS rows; 129 labels; max receipt chain trigger+pyth+quoter+8legs 68.94 total / 14.24 per receipt;
  "attached,300" rows are prepaid, excluded). New v7 methods: set_session_calendar 9.16 · force_session_closed 2.63 · set_multiplier 2.68 ·
  announce_corporate_action 2.67 · apply_corporate_action 2.74 · register_referrer 2.47 · unregister_referrer 2.47 · set_origination_fee_bps 2.35 ·
  withdraw_claimable 7.58 · nft_transfer 3.65 · nft_transfer_call 9.12 · set_quote_remote_recipient 2.68 · set_reserve_params 2.81 ·
  initiate_reserve_exit 2.91 · complete_reserve_exit 12.61 · ft_transfer_call(JoinNectarReserve) 7.82 · trigger_preliquidation(reserve) 17.93 ·
  set_max_voluntary_fill 2.64 · self_settle(remote)+sign 18.81 · LockCollateralAndBorrow(shield) 13.42 · set_multiplier_source 2.64 ·
  request_session_check+calendar 8.11 · request_multiplier_read+multiplier 8.47. G1-flagged owner setters now measured: set_allow_keeper_deposit_attestation
  2.45 · set_vault_read_config 2.55 · set_max_conf_bps 2.31 · set_oracle_source 2.57 · set_outlayer_account 2.31 · set_quoter_pin 2.42 ·
  set_quoter_secrets_ref 2.51 · set_vol_bps 2.66 · set_remote_chain 2.72 · set_signer_config 2.53 (+ set_quoter_config 2.39). All measured < 100 Tgas.
  MISSING gas row (never called in any sandbox target; grep of tests/*.rs + tests/v7/ finds no call): shields.rs set_shield_params,
  jobs.rs set_job_config (both owner setters, unit-tested only). Private callbacks excepted (nft_resolve_transfer, on_session_check,
  on_multiplier_read, on_authority, on_deposit_verified, on_release_signature).
F-327 → superseded by F-352: OPEN ("GATE G11 open": xStocks multiplier mechanism not verified; no primary source ties xStocks mints to
  Token-2022 ScaledUiAmount).
Explorer: none (local sandbox).
Result: FAIL — reason: set_shield_params and set_job_config have no recorded sandbox gas (criterion "gas per new v7 method < 100 Tgas,
  recorded from sandbox output, include the owner setters"). All tests, model --v7 and build green; F-352 open (listed, not a FAIL reason).

## G10

### G10 — v7 facts + toolchain — PASS with open items — 2026-11-10T13:44Z — commit 09c4316
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-v7-20261110T133401Z (HEAD 09c4316). No secrets. Read-only.
FACTS rows present (docs/FACTS.md:212–242): F-328, F-329 (x402), F-336 (superseded → F-353), F-337 (near-contract-standards 5.30.1),
  F-338 (derived_public_key, live), F-339 (keccak256_array), F-340…F-361 all present, dated 2026-11-10.
packages/config/nyse-calendar.json: "source": "https://www.nyse.com/markets/hours-calendars", "source_resolved": ".../trade/hours-calendars",
  "retrieved": "2026-11-10T11:45:14Z" (matches F-342).
$ solana --version  → solana-cli 2.3.0 (src:a2e21dda; feat:3640012085, client:Agave)   == F-340/F-341
$ anchor --version  → anchor-cli 0.32.1 (also printed "info: uninstalling toolchain solana" — avm side effect)   == F-340
$ forge --version   → forge Version: 1.9.0 (6056c58, built 2026-11-02)   == F-343
$ near contract call-function as-read-only v1.signer-prod.testnet derived_public_key json-args
    '{"path":"solana-devnet/pos/0","predecessor":"nectar-core-v2.nectar.testnet","domain_id":1}' network-config testnet now
  → "ed25519:2fhY3GjCcp4LU75uiiChUqQg9fS6xCtptLYZUdKJibpN"   == F-338 (exact match)
Code use of open items: grep of *.rs/*.ts/*.tsx/*.mjs/*.sol/*.yaml/*.json (excluding docs/, evidence/, lockfile) for
  8021 / ref-finance / rhea / burrow / ScaledUiAmount → only services/feed/test/fixtures/oneclick-tokens.json (1Click token list fixture).
  No product code depends on F-351/F-352/F-353.
Explorer: none opened (G10 is facts + read-only RPC).
Result: PASS with open items F-351 (ERC-8021 format, G12/G13 scope), F-352 (xStocks multiplier, G11), F-353 (Rhea ids). None used in code.

## G9

### G9 — final fresh-clone rehearsal — RE-RUN after WO-38 — PASS — 2026-11-11T08:57Z–09:00Z — commit 0af5cdd
Fresh clone `/tmp/verify-G9r-1794387441` of the local repo (main HEAD 0af5cdd: WO-38 b143b72 merged as d0e8465, plus 0af5cdd, which adds `scripts/check-no-branding-all.mjs` to `verify:quick`). No remote, nothing pushed, no keys.
Since c5f6349 nothing changed in packages/config, contracts/, services/ or apps/web. The changes are in README, docs-site pages, HUMAN_HANDOFF and the new scan script.
The host Feed on :8788/:8789 (pid 56878) was left running. My Feed used FEED_PORT=18788, FEED_MCP_PORT=18789 and FEED_DB_PATH inside the clone. Full logs: evidence/G9/20261111T085721Z/.
```
quick start (README §Quick start; clone 08:57:25Z → every README route answering 08:58:43Z)
$ pnpm i                              exit 0   6 s                                                                pnpm-i.log
$ pnpm demo:testnet                   exit 0   3 s   2.2.1-v7; Q_c $16,119.22 R_c $10; pool $40,791 / $9,209;       demo-testnet.log
                                                    quotes #0–#4; positions #0–#13, Open #1 #4 #5 #13 (= README line 47)
$ pnpm verify                         exit 0  15 s   check-no-branding-all ("no hackathon branding in landing, web app   verify.log
                                                    or docs site") → lint → typecheck → ui 7/0, feed 63/0, keeper 293/0, x402 17/0, sdk 178/0 → views
$ pnpm --filter web dev               21 README routes 200 (/, /borrow, /feed, /feed/NVDAx, /quote/new, /console, /notes, /reserve,   web-dev-curl.txt
                                      /shield, /agents, /keepers, /security, /talk, /docs, /legal/{privacy,cookies,terms,disclaimers},
                                      /position/1, /quote/0, /note/q-0); /markets and /earn 404 as README says; every page: hackathon 0, testnet ≥ 16, "mock collateral" ≥ 8
optional / gate
$ pnpm verify:quick                   exit 0   8 s   branding scan runs first                                           verify-quick.log
$ pnpm --filter docs-site build       exit 0  10 s   "[SUCCESS] Generated static files in build"                        docs-build.log
$ gitleaks detect --log-opts=--all    exit 0   1 s   "272 commits scanned … no leaks found"                            gitleaks.log
$ node scripts/build-submission.mjs   exit 0   dry run, no --send; `website` key absent                         build-submission.log
```
Guesses: one. The clone URL is TODO-H2, so I used the local path. The other five guesses from the first run are now answered in the README:
the Feed env line, the optional FEED_PORT / FEED_MCP_PORT / FEED_DB_PATH variables and the EADDRINUSE behaviour, a pointer to the MCP client snippets plus the accept header, the route list, and current timings.

Copy rules / branding (step 4): **PASS.**
- `grep -ri hackathon` over apps/web, apps/docs-site, landing and packages/ui (excluding node_modules and build output) finds only apps/web/scripts/check-no-branding.mjs and the e2e negative assertions.
- The built docs site, including build/search-index.json (971 kB) and build/project/evidence.html, has 0 files containing "hackathon".
- "insurance" and "without liquidations" appear only in code comments and e2e negative assertions; the built docs site has 0 hits.
- The new check-no-branding-all.mjs covers landing, apps/web/{app,components,lib,public}, packages/ui and the docs-site docs/blog/src/static/sidebars/config.

Feed MCP (step 5): **PASS** using only the README commands.
- stdio `pnpm -s --filter feed mcp` on an empty store: initialize nectar-feed 0.3.0 (2025-06-18). tools/list returns 8 tools. get_exit_capacity source "view", block 277193574, q_usd_e6 16119220000. list_quotes is live.
- HTTP :18789/mcp from the clone's own `pnpm --filter feed start` (pid 59708, cwd = clone): the same answers, block 277193596. `feed_started core nectar-core-v2.nectar.testnet` with no CORE_ACCOUNT_ID. REST /healthz 200 `ok:true`.

Claims (step 3): **PASS.**
- The README and docs-site wording added in WO-38 (Feed env, routes, timings, demo state, the `agents` line "scripted JSON-RPC client, not an LLM agent", G9 FAIL / re-run pending) matches §G9 and this run.
- Ids and config are unchanged since the first run. Spot check: nectar-core-v2 code_hash is still 3mv4LRm6…ovFvk.
- The first-run claim trace still holds, including the mock-ft code_hash record.
- README and docs-site still say "G9 FAIL … re-run pending". That understates this result; it does not overclaim.

Submission (step 6): the payload builds and `website` is absent. Tracks are defi, security, privacy. Open fields: leadName / email / size = TODO-H10 · nearAddress / consent = TODO-H14 · projectUrl = TODO-H2 · demoUrl = TODO-H3.

Handoffs (step 7), 26 entries:
- DONE 4: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-SOL-AIRDROP, H-NEAR-FAUCET (now DONE, citing the §G2b deploy).
- KUNAL-ONLY 7: H1, H2, H3, H10, H11, H14, H16.
- DEFAULT-AT-DEADLINE 13: H-EXPLORER, H4, H5, H7, H8, H9, H12, H13, H15, H17, H18, H19, H20.
- Not in scope 1: H6.
- OTHER-OPEN 1: H-GUARD-V7, marked "Kunal-only; no product claim depends on it". No README claim rests on it.

Explorer links: none opened. Ids were proven by RPC, as in the first run.
Result: **PASS.** The only reason for the first run's FAIL (hackathon copy on a docs-site page) is fixed. Every other step passes again.

### G9 — final fresh-clone rehearsal — FAIL (one copy-rule breach in the docs site; every command and claim check passed) — 2026-11-11T08:43Z–08:50Z — commit c5f6349
Fresh clone `/tmp/verify-G9-1794386597` of the local repo (`git clone /Volumes/T7/nectar-labs`, main HEAD c5f6349; no remote, nothing pushed). Node v22.23.4, pnpm 10.34.9,
PATH per the gates.md host notes. No keys or env, except `FEED_DB_PATH=<scratch>` for the Feed so this host's ~/.nectar store was not used (a new machine has none). Full logs: evidence/G9/20261111T084317Z/.
```
quick start (README §Quick start, followed in order; clone 08:43:20Z → web app answering ~08:47Z, about 3 min of wall clock including reading)
$ pnpm i                              exit 0   7 s   (pnpm store already warm on this host)             pnpm-i.log
$ pnpm demo:testnet                   exit 0   5 s   2.2.1-v7; Q_c $16,119.22 R_c $10 D_c $0; owner oracle $135 fresh;   demo-testnet.log
                                                    pool $40,791 / $9,209; quotes #0–#4; positions #0–#13 (#1 #4 #5 #13 Open)
$ pnpm verify                         exit 0  18 s   lint + typecheck + tests: ui 7/0, feed 63/0, keeper 293/0, x402 17/0,        verify.log
                                                    sdk 178/0; then the testnet views again
$ pnpm --filter web dev               GET / 200 (75 kB; "testnet" ×38, "mock collateral" ×12, "hackathon" 0) · GET /feed 200   web-dev-curl.txt
optional
$ pnpm --filter docs-site build       exit 0   9 s   "[SUCCESS] Generated static files in build"                docs-build.log
$ gitleaks detect --log-opts=--all    exit 0   1 s   "268 commits scanned … no leaks found"                   gitleaks.log
$ node scripts/build-submission.mjs   exit 0   dry run, --send NOT used; `website` key absent (= empty)       build-submission.log
```
Guesses a stranger has to make:
1. The clone URL is `TODO-H2`; I used the local path from the host notes.
2. README line 68 is out of date. It says that without `CORE_ACCOUNT_ID` the Feed does not poll and MCP reads the local SQLite store. In fact the Feed falls back to
   `accounts.core` in config.yaml (`feed_started core nectar-core-v2.nectar.testnet`, healthz `ok:true`, source `views+neardata`). This understates what works; it does not overclaim.
3. The root README names no port or DB variables. On this host 8788/8789 were already held by an older Feed process (pid 30818, last poll 08:04Z), so my
   `pnpm --filter feed start` failed with EADDRINUSE and my first HTTP probe reached that older process. I stopped it and re-ran against the clone's own Feed (feed-mcp.log notes this).
4. The root README shows no MCP client snippet; it points to services/feed/README.md. I used a minimal JSON-RPC client. HTTP needs `accept: application/json, text/event-stream`.
5. Which web routes exist: the README names only http://localhost:3100. /markets and /earn (my guesses) return 404.
6. "What works today (2026-11-10)" and "`pnpm verify` 39 s" are a day old. Today verify took 18 s.

Feed MCP (step 5, decides `agents`): **PASS.** Using only the root README commands:
- stdio `pnpm -s --filter feed mcp`, before any `feed start`, on an empty store: initialize → nectar-feed 0.3.0, protocol 2025-06-18.
  tools/list returns 8 tools. get_exit_capacity {NVDAx} → source "view", block 277192292, q_usd_e6 16119220000 (= demo:testnet).
- HTTP http://127.0.0.1:8789/mcp, served by the clone's `pnpm --filter feed start`: same initialize and tools/list answers. get_exit_capacity block 277192360, list_quotes live; notification HTTP 202; REST /healthz 200 `ok:true`.
- README lines 31 and 101 ("no gate has run the MCP server with an agent client") are now conservative. G9 ran a scripted client, not an LLM agent.

Live ids (step 3): README ids == packages/config/config.yaml and all answer on public RPC (https://test.rpc.fastnear.com, devnet api.devnet.solana.com):
nectar-core-v2 code_hash 3mv4LRm6…ovFvk (= README) · keeper-v2 no code, one FunctionCall key → nectar-core-v2, 5 methods (trigger_preliquidation, relay_settlement_result,
confirm_remote_deposit, keeper_attest_deposit, relay_release_result) · usdc-mock + nvdax-mock code_hash HnZj9etb…k4TrM · nectar.testnet, x402-relayer, agent1 exist ·
v1.signer-prod.testnet code CpGX8ywX… · v1 nectar-core CFTfzY4A… (= README) · keeper (v1) exists · ENZaNF…pubW executable, BPFLoaderUpgradeable, ProgramData authority 3pF3vKew… ·
nft_tokens on v2: 19 Notes (q-0…q-4, p-0…p-7, p-9…p-13, r-NVDAx-0; position 8 was refused and has no Note) · Base ids == config `base.*`, which is disclosed as `local-fork-of-base-sepolia` (not checked on chain, by design).
Explorer links: none opened this run. NearBlocks returns 403 to WebFetch (§G2) and H-EXPLORER is still OPEN. Every id above is proven by RPC instead.

Claims (step 3): every PASS / live / deployed / verified statement in README.md and SECURITY.md was traced to an EVIDENCE row (summary rows G0–G8, G1 v7, G10, G11 re-run, G12,
G2b/G7/G13/G14 re-runs, G3b re-run, §v7 module runs; Notes → §G2b `nft_tokens`/`nft_token_svg` and §G14 `nft_mint p-4`; vault slot 521021977 → evidence/G7/verifier-20261111T080154Z/chain.log).
"Pending" is used only where EVIDENCE lacks a record: the G14 402 → 200 step, the 2.2.1 gas-row check, and G9 itself.
One gap closed here. Before this run no EVIDENCE row recorded the mock-ft upgrade (README line 17; SECURITY SR-27 "fixed and deployed"). It is now recorded: the on-chain code_hash of
usdc-mock and nvdax-mock, HnZj9etb…k4TrM, equals the mock_ft.wasm checksum built in the verifier's G11 re-run (evidence/G11/verifier-rerun-d027-20261111T0802Z/cargo-test-nectar-core.log:10405).

Copy rules (step 4): no "insurance" and no "without liquidations" in README, SECURITY, SUBMISSION, apps/, landing/ or packages/ui; the only hits are code comments and e2e assertions that check the words are absent.
apps/web and landing/ have no hackathon wording; only the check-no-branding script and the e2e negative assertions mention it. Disclosures say "testnet" and "mock collateral" (landing, SiteChrome, layout).
**FAIL:** `apps/docs-site/docs/project/evidence.md:11` reads "Nectar Labs is being built for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC, F-001)…". The page sits in the docs-site
sidebar (Project › Evidence, sidebars.ts:12) and ships in build/project/evidence.html and search-index.json. Hackathon context may appear only in README.md, docs/EVIDENCE.md and docs/SUBMISSION.md.
apps/web/scripts/check-no-branding.mjs scans web/ui sources only, so it does not cover the docs site.

Submission dry run (step 6): payload keys requestId, projectName, leadName, email, size, tracks, nearAddress, projectUrl, demoUrl, idea, consent. `website` is absent.
Open fields: leadName / email / size = TODO-H10 · nearAddress / consent = TODO-H14 · projectUrl = TODO-H2 · demoUrl = TODO-H3. The tracks field holds the core three (defi, security, privacy); README proposes
five pending H16.

Handoffs (step 7), 26 entries:
- DONE 3: H-TOOLCHAIN, H-TOOLCHAIN-SOLANA, H-SOL-AIRDROP.
- KUNAL-ONLY 7: H1 send, H2 publish, H3 X post, H10 team, H11 video, H14 payout, H16 tracks.
- DEFAULT-AT-DEADLINE 13: H-EXPLORER (RPC proof; README says a browser check is open), H4, H5, H7, H8, H9, H12, H13, H15, H17, H18, H19, H20.
- Not in scope 1: H6.
- OTHER-OPEN 2: H-NEAR-FAUCET (still OPEN although v2 deployed) and H-GUARD-V7 (default "P2b does not start", yet P2b ran on the fork). Both are stale bookkeeping and no README claim depends on them.

Result: **FAIL** for one reason: NEAR Hackathon copy on a docs-site page (step 4). Steps 1–3 and 5–7 pass.
Host side effect: I stopped the older Feed process that held :8788/:8789 (pid 30818).

### G9 rehearsal (pre-check) — NOT the G9 gate (G9 row stays pending) — 2026-11-10T00:23Z–00:28Z — commit 5cd7364
Fresh clone `/tmp/verify-G9pre-1794270192` of the local repo (main HEAD 5cd7364). PATH per gates.md host notes. No keys. Logs: evidence/G9/rehearsal-20261110T0027Z/
```
$ pnpm i                         exit 0   9 s   (pnpm store already warm on this host; a cold machine will be slower)
$ pnpm demo:testnet              exit 0  22 s   p2 contract; Q_c $3,850; oracle $89 Owner; quotes #1-#3; positions #0-#6 (#1 Open $10, #6 Settling)
$ pnpm verify                    exit 0  39 s   lint+typecheck+test: keeper 101/0, feed 38/0, sdk 18/0; then demo views again
$ pnpm --filter docs-site build  exit 0  22 s   no warnings, no broken links
$ pnpm --filter web dev          ready 4 s; GET / 200 (50 KB), GET /feed 200 (24 KB); "testnet" + "mock collateral" present, "hackathon" absent; stopped
$ pnpm --filter docs-site start  ready 10 s; GET / 200; "hackathon" absent; stopped
$ gitleaks detect --log-opts=--all   exit 0; 123 commits (all non-merge), 9.46 MB, "no leaks found" (.gitleaks.toml = defaults + narrow 64-hex content-hash allowlist)
Quick start wall clock from clone start: 154 s. Whole rehearsal incl. checks: 285 s (target < 900 s)
```
Spot checks (evidence/G9/rehearsal-20261110T0027Z/08-spotchecks.log):
1. RPC view_account nectar-core.nectar.testnet → code_hash `CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t` = README. usdc-mock / nvdax-mock / v1.signer-prod.testnet exist (have code).
2. RPC view_access_key_list keeper.nectar.testnet → one FunctionCall key, receiver nectar-core, methods [trigger_preliquidation, relay_settlement_result], no full-access key = README (D-012).
3. RPC EXPERIMENTAL_tx_status FCtApD2L…MHhe → SuccessValue, keeper → nectar-core `trigger_preliquidation`, receipts touch outlayer.testnet + v1.signer-prod.testnet, log `settlement_signed` position 6 = README.
4. GET testnet-api.outlayer.ai/attestations/by-request/15148 → HTTP 200, request_id 15148, caller keeper.nectar.testnet, project nectar.testnet/nectar-quoter, wasm_hash 3ce17749…6cc2 = README version_key. (159 bps itself is backed by EVIDENCE §G4 / F-179, not visible in the attestation, which carries only output_hash.)
5. Explorer: WebFetch https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe → HTTP 403; curl to the nectar-core address page → 403. Proven by RPC instead (items 1-3).
README figures: $50,000 pool, $11,250 / $7,200 limits, quotes #0/#1 → evidence/G2/demo-testnet-20261109T2049Z.log + EVIDENCE §G2 model check. Upgrade log, G2–G8 evidence paths in the table: all exist. No README claim found without a backing.
EVIDENCE table: G0–G8 each have a status, UTC, commit and evidence path. They agree with the README banner and the README Evidence section (G0–G4, G6 PASS; G5 FALLBACK; G7 PARTIAL; G8 PASS fixture; G9 pending).
HUMAN_HANDOFF OPEN items: H-TOOLCHAIN-SOLANA, H-EXPLORER, H13, H-NEAR-FAUCET, H4, H5, H7, H8, H9, H10, H11, H12, H2, H1, H3, H14 (H6 not in scope; H-TOOLCHAIN DONE).
Final-G9 blockers (OPEN, not in H1/H2/H3/H10/H11): H-TOOLCHAIN-SOLANA, H-EXPLORER, H13, H-NEAR-FAUCET, H4, H5, H7, H8, H9, H12, H14. They must each be DONE, DEFAULTED or explicitly cut before the final G9.
Feed MCP (decides `agents`): runnable YES. stdio (`pnpm --filter feed mcp`) and HTTP (`pnpm --filter feed start`, :8789/mcp) both answer initialize (nectar-feed 0.2.0, protocol 2025-06-18) and tools/list = get_exit_capacity, preview_borrow, list_quotes, explain_limit (09/10/12 logs).
With CORE_ACCOUNT_ID=nectar-core.nectar.testnet the tools return live views (Q_c 3850000000, oracle Owner $89, quotes #1-#3).
As the root README literally says (no env): polling disabled ("CORE_ACCOUNT_ID unset (TODO-G2)"), /healthz 503, get_exit_capacity → isError "no data for NVDAx", list_quotes → []. Only services/feed/README names CORE_ACCOUNT_ID.
Guesses / confusion a stranger hits:
- Quick start lists `git clone <repo-url>` (TODO-H2) and `docs-site start`; it does not list `pnpm verify` or `docs-site build` (gates.md does). Ran both anyway.
- Root README `pnpm --filter feed start` gives an empty Feed/MCP unless you know CORE_ACCOUNT_ID; the stale "TODO-G2" in services/feed/src/main.ts log text points at a gate that already passed.
- `pnpm --filter feed mcp` prints the pnpm banner on stdout before the JSON-RPC stream; a strict stdio client may reject it (registration snippets use `node … mcp-stdio.ts` directly, which avoids this).
- services/feed/README still carries "TODO-FACTS: … claude mcp add flags … Verify them before G9".
- `pnpm --filter web dev` writes an untracked apps/web/AGENTS.md into the clone (Next.js agentRules default).
- Feed uses ~/.nectar/feed.sqlite by default; this rehearsal set FEED_DB_PATH to a scratch dir to leave the host alone.
Rehearsal verdict: quick start PASS in time; gitleaks clean; claims backed. Final G9 is not yet passable: 11 handoff blockers above, plus the Feed env gap if `agents` is to be claimed.

## G7

### G7 — Solana + signer — RE-RUN after D-027 (2.2.1-v7, vault v2) — PASS — 2026-11-11T08:02Z–08:25Z — commit 3ab3026
Fresh clone /tmp/verify-chain-20261111T080154Z. Read-only. No secrets. NEAR https://test.rpc.fastnear.com · Solana https://api.devnet.solana.com. Claims: evidence/G7/rerun/summary.md.
Command: node evidence/G7/verifier-20261111T080154Z/g7.mjs <clone> (tx hashes from evidence/rollout/keeper-20261111T070745Z.log; Solana sigs cross-checked with get_pending_*). Output: chain.log.
```
pos 8/9/10: status=Closed; remote.authority == derived_public_key(solana-devnet/pos/<id>, nectar-core-v2.nectar.testnet, domain 1): 3N1d7fSw… / 3DAHsvVA… / BCnWuATG… MATCH ×3
  committed_depositor 2s7mnWvg…zKS (all three)
confirm_remote_deposit (keeper-v2) 9ykov…/9R8Bd…/DkYpn… SuccessValue, 0 failed receipts; OutLayer execution_completed wasm hash 5f9bb287…
  remote_deposit_confirmed pos 8 source "outlayer" funded false → remote_loan_refused aggregate_limit → reservation_deposit_refunded 0.04403 NEAR (loan_refused)
  remote_deposit_confirmed pos 9 / pos 10 source "outlayer" funded true → position_opened debt 370440000, net_proceeds 364695480 (×2)
trigger_preliquidation 6TKH… → quoter_result fills [{quote 2, disc 300 bps}] → settlement_signed preimage NECTAR_SETTLE_V1|…|pos=10|quote=2|repay_e6=370440000|seize_units=2386856|…|nonce=9|…|kind=PRELIQ
relay_release_result E7qp… (8), 7t1t… (9); relay_settlement_result 9s8H… (10, status Closed) — all SuccessValue
get_pending_release(8/9).solana_tx_sig, get_pending_settlement(10).solana_tx_sig == keeper-log sigs 4rn4VdeK…, 5vF6HxQT…, 3Qm6H4sW…; status Relayed
program ENZa…pubW executable; programData 55ZD9n58… space 426837 (= 45 B header + 426,792 B ELF); last deploy slot 521021977 (< first re-run tx slot 521022774)
release pos=8 4rn4VdeK…dtPE slot 521024256 err null finalized; programs [Ed25519, VAULT]; pubkey 3N1d… == authority; sig_valid true; tampered false
  msg NECTAR_RELEASE_V1|chain=solana-devnet|vault=ENZa…|pos=8|recipient=2s7mn…|nonce=7|expires=1794384870 (== get_pending_release message)
release pos=9 5vF6HxQT…N51d slot 521033668 finalized; [Ed25519, VAULT]; pubkey 3DAH… == authority; valid true; tampered false; nonce=8
settle pos=10 3Qm6H4sW…izA4 slot 521034149 finalized; [Ed25519, VAULT]; pubkey BCnW… == authority; valid true; tampered false
  token: vault HGSF… 3 → 0.613144 | recipient FtWQZk7K… 2.54598 → 4.932836 (+2.386856)
PDAs (from deposit-<id>.log; included in the vault ix accounts): At266Cu… / 7weJCk7… / 3iQ8Jrd… → getAccountInfo null (closed)
  pos 8: OpenPosition depositor 7.45402→4.45402 · Release · Withdraw 4.45402→7.45402
  pos 9: OpenPosition 7.45402→4.45402 · Release · Withdraw 4.45402→7.45402
  pos 10: OpenPosition 7.45402→4.45402 · Settle · Withdraw 4.45402→5.067164 (+0.613144)
```
Explorer: WebFetch https://explorer.solana.com/tx/3Qm6H4sW…izA4?cluster=devnet → HTTP 429 (no content). NEAR explorer not opened (403, §G2). RPC proof above.
Verdict: **PASS.** Every claim in the summary holds from the chains: authorities (domain 1) for 8/9/10; OutLayer-sourced confirms, pos 8 refused (aggregate_limit) and refunded,
9/10 funded at $364.695480; three finalized Solana txs with the Ed25519 verify ix at index 0 right before the vault ix, signed by the stored authority over the exact NEAR preimage;
vault v2 program 426,792 B ELF upgraded before the runs; recipient +2.386856 ≈ 370.44 / (160 × 0.97) = 2.3868557 (rounded up at the 6th decimal); depositor withdrawals 3 / 3 / 0.613144; slots closed; NEAR Closed.
The 180 → 160 owner price move is a disclosed demo control (current owner price 135 after G13).

### G7 — Solana + signer (v7) — PASS — 2026-11-10T16:45Z–16:52Z — commit 91db9ea
Every claim in evidence/G7/v2-roundtrip-summary.md re-derived from public RPC (NEAR rpc.testnet.near.org, Solana api.devnet.solana.com, finalized),
read-only, no transactions sent. Logs: evidence/G7/verifier-v7-20261110T1645Z/.
```
(a) get_position 2 → remote.authority ed25519:HRf3veyfWvAccxvAgkDvp9eCKTuCpfobLVMJ9TVstarz, status Closed, source outlayer, deposit_ref 520805167
    v1.signer-prod.testnet derived_public_key {path solana-devnet/pos/2, predecessor nectar-core-v2.nectar.testnet, domain_id 1} → HRf3…tarz  MATCH
    get_position 3 → ed25519:APU8mbdwRLFR884iW2om4pQmP126ueKXCWL2B4JrYXCw, Closed, outlayer, 520805657; derived (pos/3) → APU8…YXCw  MATCH
(b) 8XXvnBVN… (keeper-v2 confirm_remote_deposit) → outlayer execution_requested 16443 / execution_completed → remote_deposit_confirmed {pos 2, source outlayer} → position_opened
    8hNqxAdC… (keeper-v2 confirm_remote_deposit) → outlayer 16449 completed → remote_deposit_confirmed {pos 3, source outlayer} → position_opened
    54eukmJT… (borrower1 ft_transfer_call) → repaid {pos 2, 370440000, remaining 0}
    DKH57jdP… (borrower1 request_remote_release) → remote_release_signed {pos 2, nonce 0, sig 813709fd…, pubkey HRf3…}
    7biCvPbA… (keeper-v2 relay_release_result) → remote_release_relayed {pos 2, solana_tx_sig 5fTihnbJ…}
    HrpQsuMW… (keeper-v2 trigger_preliquidation) → preliq_triggered → quoter_requested → outlayer 16453 execution_completed (wasm 5d90edb8…)
      → quoter_result fills [q1 250, q2 300, q0 400] → settlement_sign_requested → v1.signer-prod receipts Success → settlement_signed {pos 3, quote 2, nonce 1}
    all six: status SuccessValue, 0 failed receipts
(c) 5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv  slot 520805448 err null
      ix0 Ed25519SigVerify111… (pubkey HRf3…tarz, sig 813709fd…, msg NECTAR_RELEASE_V1|…|pos=2|…|nonce=0|expires=1794332328)  ix1 ENZaNF… "Instruction: Release"
    3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6  slot 520806179 err null   (== get_pending_settlement(3).solana_tx_sig, status Relayed)
      ix0 Ed25519SigVerify111… (pubkey APU8…YXCw, sig 2ffb74b9…, msg == stored preimage …|pos=3|quote=2|seize_units=2545980|…|kind=PRELIQ)  ix1 ENZaNF… "Instruction: Settle"
    getAccountInfo FDUbeLRb… (pos 2 PDA, in release tx keys) → null; E26iv84F… (pos 3 PDA, in settle tx keys) → null   (closed)
    getTokenAccountsByOwner FtWQZk7K… mint 3Ve8GiDB… → ATA GARN7FTb… 2.54598 (raw 2545980); depositor 2s7mn… 7.45402
(d) node scripts/verify-ed25519.mjs ed25519:APU8… '<get_pending_settlement 3>'           → signature_valid true
    node scripts/verify-ed25519.mjs ed25519:HRf3… '{preimage:<release message>, signature_hex}' → signature_valid true
    negative: release sig vs pos-3 key → false; settle preimage with seize_units+1 → false
```
Explorer links (WebFetch): https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet → HTTP 429;
https://testnet.nearblocks.io/txns/HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u → HTTP 403. Not opened (listed for judges):
https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet,
https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet, https://testnet.nearblocks.io/txns/8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3,
https://testnet.nearblocks.io/txns/8hNqxAdC61nAwmTWeUbK5auA4CbB35ppkPcnNX7PYe5C, https://testnet.nearblocks.io/txns/7biCvPbApT6RU7hoxUcKGeMxNX2aG6PWEv79KzPxsz2e.
Chain data came from RPC; a human browser check of the explorer pages is still open.
Notes: the price drop 180 → 150 that triggered pre-liquidation is an owner-oracle demo control (disclosed in the summary). Positions #2/#3 are the only remote positions checked.
**PASS** — (a), (b), (c) hold from chain data; (d) both signatures valid off-chain with negative controls.


### G7 prep — vault deployed + 25 anchor tests — RECORDED (not a G7 PASS) — 2026-11-10T13:44Z — commit 09c4316
Clone as §G10; PATH += ~/.avm/bin ~/.local/share/solana/install/active_release/bin; SDKROOT=.../MacOSX26.5.sdk (solana/deploy.md:13).
$ solana program show ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW --url devnet
  Owner: BPFLoaderUpgradeab1e11111111111111111111111 · ProgramData 55ZD9n58bZKC9PfVcsiuRMoDyGVkJSPQX2AtTvUL1vzR
  Authority: 3pF3vKewQdsKd4TEZvWYZrHZfRRJnzW3EsgtU3x8bZgS · Last Deployed In Slot 520746382 · Data Length 397240 · 2.01885804 SOL
$ solana account HGSFKMWWnXeHJtPyaCEysWb5vHvQZJLvTkeB6YntEbeX --url devnet
  Owner: ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW · 95 bytes · data contains "NVDAx" · 0.00113284 SOL
  (vault holds no authority key; per deploy.md:40-41 positions carry their own authority, so the derived-key == authority check is G7.)
declare_id! in programs/nectar_vault/src/lib.rs == ENZa… == Anchor.toml [programs.devnet]; [programs.localnet] = GdCVqcg2….
$ (solana) pnpm install --ignore-workspace → exit 0
$ pnpm run test:unit → 7 passed; 0 failed, exit 0  (first attempt without SDKROOT failed at link: verifier omission, documented in deploy.md)
$ pnpm run test:anchor → exit 0: # tests 25 · # pass 25 · # fail 0 (4 client + 5 happy paths + 16 negative paths incl. wrong authority,
  replayed nonce, expired, tampered signature, verify ix offset, recipient mismatch)
Explorer: none opened (Solana explorer not fetched; RPC output above).
Result: RECORDED as "G7 prep: vault deployed + 25 anchor tests". G7 itself stays pending (needs nectar-core-v2 on testnet).

### G7 — Solana + signer — PARTIAL: NEAR side verified; Solana leg not built — 2026-11-09T23:57Z — commit 97382fd
Fresh clone /tmp/verify-G7-1794268628 at main 97382fd. PATH += ~/.cargo/bin ~/.local/bin, SDKROOT per gates.md host notes.
No secrets used, no transactions sent (RPC reads only). Logs: evidence/G7/verifier-20261109T2357Z/.
Not PASS (no Solana devnet tx exists), not FAIL-by-bug (Solana toolchain absent: H-TOOLCHAIN-SOLANA).
$ cd solana && anchor test 2>&1 | tail -40                 → "command not found: anchor" (solana/ holds only .gitkeep)
$ pnpm --filter keeper test:settle-devnet                  → ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT (script does not exist)
Explorer links: none for Solana (no tx). NEAR: https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe
  opened with WebFetch → HTTP 403; proven via RPC instead (below).
NEAR side, source = evidence/G7/signer-roundtrip-20261109T2348Z.log (latest, position #6), trigger tx FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe:
$ RPC EXPERIMENTAL_tx_status (sender keeper.nectar.testnet, rpc.testnet.near.org) → tx_status_FCtApD2.json, rpc_checks.log
  status SuccessValue, FINAL; keeper.nectar.testnet → nectar-core trigger_preliquidation {"position_id":"6"}
  receipt chain: outlayer.testnet request_execution → on_quoter_result → nectar-core → v1.signer-prod.testnet `sign`
    deposit 1 yocto, 30 Tgas, request {path:"solana-devnet-v1", payload_v2:{Eddsa:<hex>}, domain_id:1}
  → signer return_signature_and_clean_state_on_success SuccessValue {"scheme":"Ed25519","signature":[64 u8]}
    (SignatureResponse shape per F-035) → nectar-core on_signature → keeper reward ft_transfer 11634 units
  nectar events: preliq_triggered, quoter_requested, quoter_result, settlement_sign_requested, settlement_signed
  Eddsa payload hex decodes to the raw preimage bytes (not pre-hashed) == view preimage: true (sign_args_check.log)
  sign_requested.preimage == signed.preimage == get_pending_settlement {"position_id":"6"}.preimage: true true
  SignatureResponse bytes == event signature_hex == view signature_hex: true
$ node scripts/verify-ed25519.mjs ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV '<pending json>' → "signature_valid":true
  negative control (repay_e6 205000000→205000001 in preimage) → "signature_valid":false (verify_ed25519_negative.log)
$ view v1.signer-prod.testnet derived_public_key {"path":"solana-devnet-v1","predecessor":"nectar-core.nectar.testnet","domain_id":1}
  → "ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV" == config.yaml signer.authority: true
$ view get_position {"position_id":"6"} → status "Settling", units 0, debt 0 (no relay; stays Settling)
Code:
$ (cd contracts/nectar-core && cargo near build non-reproducible-wasm) → exit 0, bs58(sha256) CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t
  == on-chain view_account code_hash CFTfzY4APx3fBsebqQ8SqcfLVVcShKe4TdD48Sapgi5t: true (code_hash.log)
$ cargo test --workspace → exit 0 (cargo_test.log): mock_ft 11/0, nectar_core unit 179/0 (incl.
  tests_p2::preimage_golden_vectors_byte_for_byte ok), sandbox 5/0, sandbox_p1 4/0, sandbox_p2 3/0, test_stubs 8/0
Disclosures (must stay true in README/submission):
  - preimage program id EgfPYZfKHksk1P5x9z8WXKGr7cKcQ7sr5Zf8sdo68NYZ is a PLACEHOLDER (random address from
    scripts/55-g7-signer-roundtrip.sh); no Solana vault is deployed; config.yaml solana.program_id/authority = TODO-G7.
  - recipient DbrceqSnyAcm2EkTD2j5npcc16BdkWtZuW73MULaUt98 is a throwaway address (key generated and discarded per script).
  - position #6 stays Settling: the signature was never relayed to Solana (solana_tx_sig null).
Notes for the orchestrator (not fixed by verifier):
  - README line 51 says in present tense "A Solana program verifies it before releasing collateral"; line 23 says the vault is
    "not built". Line 56 says pre-hashing is "open until G7"; the on-chain sign args show the raw preimage is signed (no pre-hash).
  - scripts/55-g7-signer-roundtrip.sh says the placeholder is "disclosed in EVIDENCE/README"; README does not mention it.
  - gates.md G7 commands reference a keeper script `test:settle-devnet` that does not exist yet.
Remaining for PASS: Solana toolchain (H-TOOLCHAIN-SOLANA) → nectar_vault on devnet → devnet tx with Ed25519 verify ix + settle,
both explorer links opened.

## G8

### G8 — copilot verifier — FAIL (docs overclaim; every offline check green) — 2026-11-09T23:45Z — commit 2b49f42
Fresh clone /tmp/verify-G8-1794267776 at main 2b49f42 (main has since moved to c0c2a2f; not re-run). PATH += ~/.cargo/bin ~/.local/bin
(gates.md host notes). NEAR_AI_API_KEY unset (H7). No secrets used. Logs: evidence/G8/verifier-20261109T2343Z/.
$ pnpm i --frozen-lockfile                                   → exit 0
$ pnpm --filter web test:copilot                             → exit 0: tests 11, pass 10, fail 0, skipped 1 (live round trip)
  ✔ DCAP: Phala sample TDX quote verifies against Intel root with recorded collateral (TCB UpToDate)
  ✔ DCAP: patched report_data breaks the quote signature
  ✔ quote offsets match dcap-qvl Quote.parse (report_data, mr_config_id)
  ✔ fixture: signature, hashes, model id and report_data pass; DCAP fails → answer hidden
  ✔ gate logic: with an accepted DCAP verdict over the same quote bytes the answer is released
  ✔ negative: tampered response, stale nonce, foreign signer, gateway signature
  ✔ F-075: MRCONFIGID check is a prefix match on 01 || sha256(app_compose)
  ✔ F-074/F-076/C-018: request paths carry no provider param or aliasing header; 404 backoff grows
  ✔ F-077: NRAS verdict needs overall=true and both nonces equal ours
  ✔ system prompt forbids prices and amounts; request carries it
  ﹣ live round trip (only with --live and NEAR_AI_API_KEY) # fixture run
$ pnpm --filter web test:copilot -- --live  (no key)        → exit 1: "--live needs NEAR_AI_API_KEY (TODO-H7). Fixture run: pnpm --filter web test:copilot"
$ pnpm --filter web build                                    → exit 0
$ PW_CHANNEL=chrome pnpm --filter web exec playwright test e2e/copilot.spec.ts → 4 passed (/console, /borrow × phone, desktop)
$ next start -p 3917 (no key): GET /api/copilot → 200 {"configured":false,...}; POST {nonce,notes} → 503 {"status":"key_missing"};
  POST {fixture:true} → quoteVerdict {ran:true, ok:false, detail:"dcap-qvl rejected the quote: ISV enclave report signature is invalid"}
UI probe (Chrome, /console): "Key missing" banner visible; "Ask copilot" disabled; after fixture run badge "unverified — hidden",
  12 checklist rows each start with the word passed / failed / not run (0 tick glyphs), 0 .copilot-answer blocks, "Answer hidden: TDX quote …".
NEAR AI probe 23:44:34Z: GET https://cloud-api.near.ai/v1/models → HTTP 500 "Database connection pool error" (5.2 s).
Explorer links: none for this gate.

What the fixture is (scripts/build-copilot-fixture.ts, lib/copilot/fixtures/): Phala-Network/dcap-qvl sample/tdx_quote + collateral
(MIT), a real Intel-signed TDX quote, verified at fixed nowSecs 2025-06-20 inside the collateral window. The chat is synthetic: built
locally and signed with a throwaway secp256k1 key that is then discarded. The synthetic quote is that sample with report_data patched to
signer‖nonce. It is NOT a recorded NEAR AI response. Verdict end to end: report_data checks pass, DCAP fails → "unverified — hidden" (correct).
Exercised with real crypto offline: EIP-191 recovery (+ foreign signer rejected), sha256 request/response hashes (+ tampered response
rejected), provider_tee 3-part text + model id (gateway 2-part rejected), report_data F-075 right-padded signer ‖ nonce (+ stale nonce
rejected), dcap-qvl 0.7.1 on the genuine sample (accepts) and patched quote (rejects), quote offsets vs dcap-qvl Quote.parse, MRCONFIGID
prefix 01‖sha256(app_compose) (F-075), NRAS verdict logic on synthetic JWTs (F-077), signature 404 backoff.
Live only (not run): NEAR AI chat / signature / attestation, Phala PCCS collateral fetch, NVIDIA NRAS POST, /v1/models listing, MRCONFIGID
on a real app_compose. RTMR3 replay is not implemented (shown "not run").
FACTS match: attestationPath = /attestation/report?model=&signing_algo=ecdsa&nonce= (F-074); signaturePath = /signature/<id>?model=&signing_algo=ecdsa
(F-076); compose read at info.tcb_info.app_compose (F-074); no provider= / x-no-aliasing anywhere in apps/web (C-018); signer must match a
model_attestations[].signing_address (F-076); model id shown "unverified (F-078)". SYSTEM_PROMPT forbids prices, amounts, LTVs.
Live round trip not performed (H7 key absent; API returned 500).
FAIL reasons (docs/UI wording only; no check is wrong):
  1. README.md:61 (`privacy` track): "copilot answers are TEE-signed and verified". Present tense. No NEAR AI answer has ever been
     received or verified, and only the fixture path runs. Overclaim.
  2. README.md:24 status row says "not built; live mode needs key H7". The fixture verifier and panel are built and merged, so this row
     is inaccurate and contradicts line 61.
  3. CopilotPanel.tsx intro: "shown only after the browser verifies the TEE signature and attestation". The Intel DCAP chain runs
     server-side; the browser checks the server's verdict and the quote hash. The checklist row does say "(server)". Minor.
Notes: e2e spec asserts /Key missing|Ask copilot/, so on its own it would pass without the banner; the UI probe above checked the
  banner directly. Optional checks (MRCONFIGID, NRAS, model list) do not block release in live mode, so a "verified in TEE" answer
  proves some TDX VM holds the signing key, not which compose it runs. That is consistent with F-075/F-077 and disclosed as (optional).

### G8 (re-run) — copilot verifier — PASS (fixture) — 2026-11-09T23:56Z — commit df4706f
Fresh clone /tmp/verify-G8b-1794268483 at main df4706f (merge WO-17c, after WO-4f merge c294b22). PATH += ~/.cargo/bin ~/.local/bin.
NEAR_AI_API_KEY unset (H7). No secrets used. Never pushed. Logs: evidence/G8/verifier-20261109T235453Z/.
$ pnpm i --frozen-lockfile                                   → exit 0 (Done in 4.3s, pnpm v10.34.9)
$ pnpm --filter web test:copilot                             → exit 0: tests 11, pass 10, fail 0, skipped 1 (live round trip); same 10 checks as the FAIL block
$ pnpm --filter web test:copilot -- --live  (no key)        → exit 1: "--live needs NEAR_AI_API_KEY (TODO-H7). Fixture run: pnpm --filter web test:copilot"
$ pnpm --filter web build                                    → exit 0
$ PW_CHANNEL=chrome pnpm --filter web exec playwright test e2e/copilot.spec.ts → 4 passed (/console, /borrow × phone, desktop)
NEAR AI probe 23:55:49Z: GET https://cloud-api.near.ai/v1/models → HTTP 500 (status only, no key).
Explorer links: none for this gate.
FAIL items re-checked:
  1/2. Docs wording. Grep of README.md + apps/docs-site/docs for "verif" within 3 lines of copilot/answer/NEAR AI (grep-copilot.txt). Every hit:
    README.md:24 "**built; no live NEAR AI answer has been verified yet.** Live mode needs key H7 … run on a fixture built from a real
      Intel-signed sample TDX quote (Phala dcap-qvl sample, MIT) plus a chat signed by a throwaway key, not a NEAR AI recording; it correctly
      ends "unverified — hidden". Intel DCAP quote verification runs on the server …; EIP-191 … run in the browser … G8 re-run pending"
    README.md:61 "the copilot shows an answer only after signature and attestation checks pass (no live NEAR AI answer verified yet: key H7
      absent, NEAR AI Cloud 500 on 2026-11-09)"
    docs-site start/live-on-testnet.md:27 same text as README:24 ("built; no live NEAR AI answer has been verified yet" + honest fixture).
    docs-site security/trust-model.md:22 "the answer is shown only after the checks pass: Intel DCAP … on the server, EIP-191 … in the
      browser. No live answer has been verified yet (key H7 absent; /v1/models 500 on 2026-11-09, F-078)"; :8 is the page's "Verified against: F-…" facts line.
    docs-site legal/privacy.md:37-39 NEAR AI Cloud, Phala PCCS, NVIDIA NRAS each "live mode only"; "not called in fixture mode". No verification claim.
    Other hits (README:74, project/evidence.md:17/23 "pending", project/roadmap.md:15/19) are plans/status, not claims. → no overclaim; built; fixture honest.
  3. Panel intro (components/CopilotPanel.tsx:54-56): "In your browser: EIP-191 signature recovery, request/response hashes, and the
     report_data/nonce binding. On this server: the Intel TDX quote (DCAP, via dcap-qvl) and, in live mode, NVIDIA GPU attestation (NRAS)."
     Matches code: dcap-qvl imported only in lib/copilot/server.ts; panel imports verifyBundle (lib/copilot/verify.ts, pure) and POSTs /api/copilot.
  Weak test fixed: e2e/copilot.spec.ts (no key) filters .banner by .b-title /^Key missing$/, toHaveText("Key missing"), asserts the full banner
     sentence and "Ask copilot" disabled; also asserts both browser/server intro sentences. 4/4 green.
Live round trip not performed (H7 key absent; API 500).
PASS (fixture): no overclaim in README/docs-site/panel; all offline checks green. Notes: docs still say "G8 re-run pending" (stale after this PASS, not an overclaim).

## G0

### G0 — toolchain + facts — FAIL — 2026-11-09T23:01Z — commit 90af048
Recorded late: the orchestrator ran G0 on 2026-11-09 (evidence/G0/toolchain.log, help.log, help-1954.log; mtimes 19:53-19:55Z UTC) but it never reached this file. This verifier run comes after the tags `p0-green` and `p1-green` were set (both tags are in the repo at 90af048), so G0 did not gate P0 as CLAUDE.md §1 requires.
Fresh clone /tmp/verify-G0-1794265313 at main 90af048. PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH". `pnpm i --frozen-lockfile` → Done in 4.6s using pnpm v10.34.9. No secrets used. Logs: evidence/G0/verifier-20261109T230153Z/{toolchain,help,network}.log.
I ran the gates.md G0 lines exactly (`near account create-account --help | head -40`, `near account add-key --help | head -40`, Hermes through the gates.md mirror pyth.dourolabs.app). I also ran the orchestrator's variants (`create-account fund-myself --help | head -25`, `add-key x.testnet grant-function-call-access --help | head -25`, hermes.pyth.network and hermes-beta directly). The first loop failed under zsh (no word-splitting: "command not found: rustc --version"), so I reran it in bash. That was my harness mistake, not a product fault.
```
$ rustc --version        → rustc 1.95.0 (59807616e 2026-04-14)     FACTS: none (F-010 lists only near-sdk rust_version 1.95, the minimum)
$ cargo --version        → cargo 1.95.0 (f2d3ce0bd 2026-03-21)     FACTS: none
$ cargo near --version   → cargo-near-near 0.23.0                  FACTS: F-011, F-023 (2026-11-10)
$ near --version         → near-cli-rs 0.31.1                      FACTS: F-022 (2026-11-10)
$ node -v                → v22.23.4                                FACTS: none (F-012 + package.json engines give only the floor >=22.22.2)
$ pnpm -v                → 10.34.9                                 FACTS: F-026 (2026-11-10), packageManager pnpm@10.34.9
$ anchor --version       → command not found [exit 127]            P2 only: F-081 Anchor 0.32.1; H-TOOLCHAIN-SOLANA OPEN
$ solana --version       → command not found [exit 127]            P2 only: F-025 agave v4.4.1; H-TOOLCHAIN-SOLANA OPEN
$ gitleaks version       → 8.30.1                                  FACTS: F-024 (2026-11-10)
$ near account create-account --help | head -40
  Usage: near account create-account [COMMAND]  … sponsor-by-faucet-service … fund-myself
$ near account create-account fund-myself --help | head -25
  Usage: near account create-account fund-myself [NEW_ACCOUNT_ID] [INITIAL_BALANCE] [COMMAND]
$ near account add-key x.testnet grant-function-call-access --help | head -25
  Usage: near account add-key grant-function-call-access [OPTIONS] [COMMAND]
      --allowance <ALLOWANCE>   --contract-account-id <CONTRACT_ACCOUNT_ID>   --function-names <FUNCTION_NAMES>
$ curl -s https://1click.chaindefuser.com/v0/tokens | head -c 400
  [{"assetId":"nep141:wrap.near","decimals":24,"blockchain":"near","symbol":"wNEAR","price":3.64,"priceUpdatedAt":"2026-11-09T23:01:00.667Z",…},{"assetId":"nep141:eth.bridge.near",…
$ curl -s "https://pyth.dourolabs.app/hermes/v2/updates/price/latest?ids[]=b1073854…a593" | head -c 400   (id = config.yaml oracle.nvda_price_id = F-053)
  unauthorized [http 401]
$ (same path on hermes.pyth.network, hermes-beta.pyth.network) → unauthorized [http 401] on both
```
F-020: resolved. It is marked V (2026-11-10) and cites evidence/G0/help-1954.log:36-38 and evidence/G0/help.log:2-7. I opened both: the lines are `--contract-account-id`, `--function-names` and `--signature-scheme` (ed25519 | ml-dsa-65). This run's help.log shows the same flags again. C-004 is closed 2026-11-10 and points to F-020.
Hermes 401 matches F-056 / C-007 (still open, needs the human key H13). It is expected and is not a G0 failure.
Explorer: none. G0 has no explorer step.
Verdict: FAIL. Reasons:
 1. The installed versions of rustc 1.95.0, cargo 1.95.0 and node v22.23.4 are not recorded in FACTS. Only the minimums appear: F-010 (rust_version 1.95) and F-012 / engines (node >=22.22.2). The pass rule is "all recorded in FACTS with today's date". Fix: the researcher adds FACTS entries with a date and the evidence path.
Not failures:
 - anchor and solana are absent. They are a P2 / G7 dependency (H-TOOLCHAIN-SOLANA OPEN, F-025, F-081).
 - All other P0 tools are present and match FACTS. F-020 is resolved. 1Click /v0/tokens is live.
Notes:
 - FACTS dates look like local time (IST, +05:30), not UTC. Example: F-053 is dated 2026-11-10 but cites a curl made at 2026-11-09T19:59:55Z. UTC was still 2026-11-09 when this gate ran.
 - The gates.md G0 commands differ from the orchestrator's brief: help subcommand depth and the Hermes host. I ran both sets.

### G0 — toolchain + facts — PASS — 2026-11-09T23:09Z — commit b3a9090
Re-record after GATE_FAIL_G0. Fresh clone /tmp/verify-G0-20261109T230923Z at main b3a90906. Commands run in bash with PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH". No secrets used. Logs are in evidence/G0/verifier-20261109T230923Z/: toolchain.log, help.log, and facts.log (the FACTS rows I checked).
Network probes are reused from evidence/G0/verifier-20261109T230153Z/network.log, taken at 23:01Z, 8 minutes earlier and inside the 2 h limit. 1Click /v0/tokens was live. All three Hermes hosts returned 401, which matches F-056 / C-007.
```
$ rustc --version        → rustc 1.95.0 (59807616e 2026-04-14)   FACTS: F-181 (2026-11-09, V, evidence verifier-20261109T230153Z/toolchain.log)
$ cargo --version        → cargo 1.95.0 (f2d3ce0bd 2026-03-21)   FACTS: F-182 (2026-11-09, V, same log)
$ node -v                → v22.23.4                              FACTS: F-183 (2026-11-09, V, same log)
$ cargo near --version   → cargo-near-near 0.23.0                FACTS: F-011, F-023 (2026-11-10, V)
$ near --version         → near-cli-rs 0.31.1                    FACTS: F-022 (2026-11-10, V)
$ pnpm -v                → 10.34.9                               FACTS: F-026 (2026-11-10, V)
$ gitleaks version       → 8.30.1                                FACTS: F-024 (2026-11-10, V)
$ anchor --version       → bash: anchor: command not found       P2 only (F-081, F-187; H-TOOLCHAIN-SOLANA OPEN)
$ solana --version       → bash: solana: command not found       P2 only (F-025, F-187)
$ near account create-account --help | head -40 → Commands: sponsor-by-faucet-service, fund-myself, fund-later, help
$ near account add-key --help | head -40        → captured in help.log
```
I opened the evidence that F-181, F-182 and F-183 cite (evidence/G0/verifier-20261109T230153Z/toolchain.log). It shows the same three version strings as this run.
F-020 is V (2026-11-10). It cites help-1954.log:36-38 and help.log:2-7, and the 23:01Z run already confirmed those flags. C-004 is closed.
Explorer: none. G0 has no explorer step.
Verdict: PASS. Every G0 tool version is in FACTS with a date and evidence, and every installed version matches its FACTS row. F-020 is resolved.
Not failures:
 - anchor and solana are absent. They are a P2 / G7 dependency (H-TOOLCHAIN-SOLANA).
 - Hermes returns 401 (C-007, H13).
Note: the FACTS date convention is mixed. F-181 to F-183 use the UTC date (2026-11-09), while F-010 to F-026 use the IST date (2026-11-10) for the same session. Both dates fall within this session, so I did not count it as a failure.

## G5

### G5 — oracle — FALLBACK (disclosed) — 2026-11-09T22:55Z — commit 706d940
Fresh clone /tmp/verify-G5-1794264871 at main 706d940. PATH and SDKROOT set per the gates.md host notes. Only read-only calls, no transactions sent. Logs are in evidence/G5/verifier-20261109T2254Z/.
$ORACLE and $NVDA_PRICE_ID are not defined anywhere in the repo: config.yaml has `oracle.nvda_price_id: TODO-G5` and .env.example has `NVDA_PRICE_ID=TODO-G5`. I used ORACLE=pyth-oracle.testnet (C-012) and the F-053 Equity.US.NVDA id b1073854…a593.
```
$ near contract call-function as-read-only pyth-oracle.testnet get_price json-args '{"price_identifier":"b1073854…a593"}' network-config testnet now   # near-cli-get_price.log 22:55:09Z
null                                                       -> criterion "publish_time < 600 s" NOT met
# live-probes.log 22:55:28Z (RPC rpc.testnet.near.org, finality final)
pyth-oracle.testnet get_price_no_older_than {price_id, age:86400} @276984374 -> null
pyth-oracle.testnet get_price_unsafe @276984380 -> null ; price_feed_exists -> false (no update pushed)
price-oracle.testnet get_price -> MethodResolveError(MethodNotFound)        (C-012 holds)
hermes.pyth.network /v2/updates/price/latest?ids[]=<id> -> HTTP 401 ; hermes-beta -> HTTP 401   (C-007 holds, H13 open)
nectar-core get_oracle_source {NVDAx} @276984398 -> "Owner"
nectar-core get_exit_capacity {NVDAx} @276984404 -> oracle_price_usd_e6 112000000, oracle_age_s 623, oracle_fresh true, session_open false, oracle_source Owner
$ cargo test -p nectar-core oracle_rejects                 # cargo-oracle_rejects.log
test result: ok. 0 passed; 0 failed; 4 filtered out ; ... 0 passed  -> the gates.md filter matches NO test (stale name)
$ cargo test -p nectar-core -- --nocapture                 # cargo-test-nectar-core.log, EXIT 0
unittests 157 passed 0 failed ; tests/sandbox.rs 5 passed ; tests/sandbox_p1.rs 4 passed
$ env -i PATH HOME pnpm --filter keeper oracle-updater     # keeper-oracle-updater-nokey.log (no .env in clone)
{"level":"warn","service":"oracle-updater","msg":"oracle_updater_disabled","reason":"PYTH_API_KEY_PATH unset (TODO-H13)"}  EXIT 0
$ node --test services/keeper/test/oracle-updater.test.ts  # keeper-oracle-updater-test.log: 14 pass / 0 fail
```
Tests covering each defence (all passed in the full run):
- Staleness, 120 s with the session open and 86,400 s closed: `pyth_acceptance_rules` (121 s rejected at 120 s, accepted at 86,400 s), `pyth_rejects_stale_in_session`, `pyth_trigger_open_session_age` (age_s 120), `pyth_trigger_closed_session_age` (age_s 86400) and `pyth_age_rounds_up_to_seconds`. The contract calls `get_price_no_older_than(price_id, age)` (p1.rs:11,312). Sandbox `upgrade_v1_then_pyth_secrets_cancel` covers a 25 h-old price with the session closed → `no_price`, and a 3 min-old price with the session open → `no_price`. P0: `lock_and_borrow_stale_oracle_refunds`, `trigger_stale_oracle`.
- Confidence (max_conf_bps): `pyth_acceptance_rules` accepts exactly 100 bps and rejects 100 bps + 1 unit (`conf_too_wide`). Also `pyth_rejects_wide_conf`, `max_conf_bound`, and the sandbox `conf_too_wide` case.
- Band: `pyth_acceptance_rules` (119 accepted, 118.99 → `out_of_band`), `pyth_rejects_out_of_band` and the sandbox `out_of_band` case. Owner-oracle band from P0: `update_owner_price_band` (emits `oracle_rejected`), `propose_apply_bypasses_band`, `apply_price_same_block_rejected`, `apply_price_without_proposal`.
- Negative price: `pyth_rejects_negative_price`, the sandbox `non_positive` case, and the `pyth_to_usd_e6` / `check_pyth_price` non_positive asserts.
- Expo conversion: `pyth_expo_to_usd_e6` covers expo -5, -8, 0, +1 and -6, flooring, zero_price and overflow.
- Rejection returns the position to Open: `pyth_reject_case` asserts `oracle_rejected{reason}` + `settlement_aborted{oracle_rejected}`, status Open and the price untouched. It is used by the null, failed, parse and too_long cases and by the conf, band and negative cases above. The sandbox loop asserts `status == "Open"` for every reason.
Disclosure (disclosure-grep.log, at 706d940):
- README.md:18 is the first place a reader meets the oracle: "owner oracle on nectar-core (`update_owner_price`, $180) | **fallback**, badge in UI | owner oracle (P0, disclosed); live source decided at G5".
- apps/docs-site/docs/start/live-on-testnet.md:20 has the same row; lines 29-30 say "the owner-set price" and "The P0 oracle is owner-set instead of Pyth or OutLayer"; line 45 says "owner price $180 (disclosed fallback)".
Explorer: none opened. No transaction was involved; all evidence comes from RPC views.
Verdict: FALLBACK (disclosed). This is NOT a PASS, because no live Pyth price was read by nectar-core: pyth-oracle.testnet has no NVDA update, Hermes returns 401 and the H13 key is absent. The defences are tested and the owner oracle is disclosed.
Findings for the orchestrator:
- (1) The gates.md G5 line `cargo test -p nectar-core oracle_rejects` runs 0 tests. The tests are named `pyth_rejects_*` / `pyth_acceptance_rules`.
- (2) $ORACLE and NVDA_PRICE_ID are still TODO-G5 in config.yaml and .env.example.
- (3) README and docs say "owner price $180", but the live nectar-core NVDAx price is $112 (age 623 s at 22:55Z). The README is not truthful about the current value.

## G6

### G6 — 1Click depth — FAIL — 2026-11-09T22:14Z — commit 578b006
Fresh clone /tmp/verify-G6-1794262313 at main 578b006. `pnpm i --frozen-lockfile` exit 0. Logs: evidence/G6/verifier-20261109T221158Z/.
gates.md line (`pnpm --filter keeper test:oneclick`) is out of date. The sampler is in services/feed (WO-11a), so the correct commands are:
```
$ NECTAR_IT=1 pnpm --filter feed test                       # feed-test-live.log
ok 8 - 1Click recorded fixture (F-062)   (fixture verifies; tampering breaks the signature)
ok 10 - 1Click client is dry-only (Q-007) (non-dry body refused before any network call)
ok 11 - 1Click sampler (NVDAx -> "no_route", no request; bad signature -> dropped)
ok 12 - 1Click live (NECTAR_IT=1; read-only, dry only)
    ok 1 - fetches tokens and gets a verified dry quote for the reference pair   (1086 ms)
# tests 32  pass 32  fail 0  skipped 0
$ node <scratch>/vq.mjs services/feed/test/fixtures/oneclick-quote-ref.json   # fixture-verify.json (offline, SDK 0.1.26)
verify true · correlationId f8df1d4c-99c8-4599-86f9-7bc881c4ced8 · 2026-11-09T21:34:05Z · dry true · EXACT_INPUT
nep141:wrap.near -> nep141:17208628…133a1 (USDC) · amountIn 276.2431 wNEAR · amountInUsd 1000.000000000000
amountOut 1004397702 (1004.397702 USDC) · minAmountOut 994353724 · amountOutUsd 1000.000000000000 · no depositAddress
$ curl -sS https://1click.chaindefuser.com/v0/tokens   # 22:11:58Z, HTTP 200, tokens.json + tokens-check.txt
count 216 · NVDA/xStock/stock/equity/TSLA/AAPL/SPYx/QQQx matches: none · only *x symbol: USDCx (a stablecoin) · F-063 holds
near wNEAR nep141:wrap.near 3.64 · near USDC 0.999486
$ pnpm --filter web build                                   # exit 0, web-build.log
$ PW_CHANNEL=chrome pnpm --filter web exec playwright test -g feed   # pw-feed.log
12 passed (14.1s): p1 "feed shows oracle badge, no 1Click route for NVDAx…" desktop + phone; shell /feed dark/light axe clean; testnet feed lists NVDAx; screenshots
```
The live test does not log the reference pair or the response; it runs the sampler with default config (`near:wNEAR -> near:USDC`, $1,000) and asserts at least one `verified` row and 0 dropped. The only signed quote stored in the repo is the fixture above, which re-verifies offline. I made no POST myself. The live test posted one dry quote (dry is checked in code at oneclick.ts:142, and only GET /v0/tokens and POST /v0/quote are allowed at l.13/124).
Screenshot: evidence/G6/verifier-20261109T221158Z/feed-desktop-dark.png (from this run's screens spec).
Criteria:
- Signed quote recorded and verified: PASS (live verify = true for the wNEAR->USDC ref pair; the fixture re-verifies offline).
- Assets with no route show "no 1Click route": PASS (web /feed badge for NVDAx; MCP `get_exit_capacity` returns status "no 1Click route" from a sampler `no_route` row). However, the web badge comes from a hard-coded `NO_1CLICK_ROUTE = new Set(["NVDAx"])` (apps/web/components/OracleBadge.tsx:6), not from sampler data.
- Implied depth shown on Feed: FAIL. apps/web has no oneclick/gap/depth sample consumer, so /feed never shows a depth number for the reference pair. Only the MCP `explain_limit`/`get_exit_capacity` show `gap_bps`.
- C-014: FAIL. services/feed/src/oneclick.ts:179-181 computes `gap_bps = (amountInUsd - amountOutUsd)/amountInUsd`, which is exactly the field C-014/F-064 say not to use. On the fixture it gives 0 bps. The realised `amountOut` 1004.397702 USDC against $1,000 in (token-list price) would read about -44 bps, and `minAmountOut` 994.353724 about +56 bps. The stored response keeps `amountOut`, so samples can be recomputed.
FAIL reasons: (1) the depth metric uses `amountOutUsd`, contrary to FACTS C-014/F-064; (2) /feed shows no implied depth, and the no-route badge is static rather than driven by the sampler. The gates.md wording ("Feed shows R_c or no 1Click route") alone would pass on the NVDAx badge, but the orchestrator's criteria do not. gates.md G6 command also needs to change to the feed commands above.

### G6 — 1Click depth (re-run) — PASS — 2026-11-09T22:58Z — commit fea52b7
Fresh clone /tmp/verify-G6b-1794264583 at main fea52b7. `pnpm i --frozen-lockfile` exit 0. Logs: evidence/G6/verifier-20261109T224955Z/. Dry quotes only; nothing deposited. The previous FAIL block above stays as the record.
```
$ NECTAR_IT=1 pnpm --filter feed test                    # feed-test.log
# tests 39  # pass 39  # fail 0  # skipped 0
ok 14 - 1Click live (NECTAR_IT=1; read-only, dry only)   (2.66 s, real network)
  three verified dry quotes for the reference pair; NVDAx no_route from the live token list   (asserts dropped == 0, 3 samples)
# [{"id":"wnear-usdc","samples":[[500,"3636470",0,100],[1000,"3636440",0,100],[2000,"3636378",0,100]]}]   # [usd, rate_e6, impact_bps, worst_impact_bps]
$ grep -rn "amountInUsd\|amountOutUsd" services/feed/src
services/feed/src/oneclick.ts:14:// amountInUsd / amountOutUsd are never read (amountOutUsd mirrors the input value, C-014).   # comment only
  rate_e6 = rateE6(BigInt(quote.amountIn), BigInt(quote.amountOut), decIn, decOut); worst uses minAmountOut (oneclick.ts:175-188)
  each response goes through verifyQuoteSignature; one false drops the whole set (oneclick.ts:244-269)
$ FEED_FIXTURES=1 FEED_PORT=8798 FEED_MCP_PORT=off pnpm --filter feed start ; curl -i :8798/api/oneclick   # api-oneclick-fixture.json
HTTP/1.1 200  {"as_of":"2026-11-09T22:22:14.925Z","pairs":[{"id":"wnear-usdc",...,"verified":true,"samples":[
  {"notional_usd":500,...,"rate_e6":"3627157","impact_bps":0,"worst_impact_bps":100},{"notional_usd":1000,...,"rate_e6":"3627652","impact_bps":0,"worst_impact_bps":98},
  {"notional_usd":2000,...,"rate_e6":"3627652","impact_bps":0,"worst_impact_bps":98}]}],"assets":[{"symbol":"NVDAx","status":"no_route",...}]}
$ FEED_PORT=8799 FEED_MCP_PORT=off pnpm --filter feed start (live, no fixtures) ; curl :8799/api/oneclick   # api-oneclick-live.json
oneclick_tick sets:1 dropped:0 no_route:1 ; samples 500/1000/2000 rate_e6 3635521/3635449/3635922, impact 0/0/0, worst 99/100/98; NVDAx no_route
$ pnpm --filter web build  -> exit 0 ;  PW_CHANNEL=chrome pnpm --filter web e2e   # web-e2e.log
  128 passed, 2 skipped (testnet.spec write specs self-skip without a demo key), 0 failed; oneclick.spec 3/3 x2 projects, p1.spec feed 1/1 x2
$ NEXT_PUBLIC_FEED_URL=http://127.0.0.1:8798 pnpm --filter web build && pnpm --filter web start ; GET :3100/api/indexer/api/oneclick -> 200 (fixture body)
/feed panel text (feed-panel-text.log): "1Click reference depth · As of 2026-11-09 22:22 UTC · WNEAR → USDC signature verified ·
  0.5× $500 3.627157 0 % 1 % · 1× $1,000 3.627652 0 % 0.98 % · 2× $2,000 3.627652 0 % 0.98 % · NVDAx no 1Click route"
$ curl https://1click.chaindefuser.com/v0/tokens   # v0-tokens.json
216 tokens; equity-pattern hits AVAX FRAX GMX INX ITLX SPX TRX USDCx are all crypto (SPX = eth/sol omft at $0.36); no tokenized equity (F-063)
```
Screenshot: evidence/G6/verifier-20261109T224955Z/feed-oneclick-panel.png (Playwright, chrome channel, /feed against the fixture feed). All servers (8798, 8799, 3100) stopped.
Criteria:
- Live dry quotes at 3 sizes verify: PASS (live test asserts 0 dropped and 3 samples; the sampler drops any set with a false signature).
- Impact from base units, no amountInUsd/amountOutUsd: PASS (only a comment mentions them; rate is from amountIn/amountOut with token decimals, worst case from minAmountOut).
- GET /api/oneclick documented shape (WO-11c §3): PASS in fixture and live modes (extra fields observed_at and per-sample correlation_id).
- /feed panel shows the pair's numbers and NVDAx status from the API: PASS (panel numbers equal the fixture body; OracleBadge.tsx has no route logic now; RouteStatusBadge in OneClickPanel.tsx renders only the status the feed reports).
- Web e2e full suite: PASS (0 failed).
- F-063 no tokenized equity in /v0/tokens: PASS.
Notes (not failures): wNEAR→USDC is deep enough that impact_bps is 0 at all three sizes ($500 to $2,000). In the live run rate(2×) was above rate(0.5×), so the result was clamped to 0. The depth signal comes mostly from worst_impact_bps, which is about 1 %, the minAmountOut slippage floor. The live feed logs `polling_disabled` because CORE_ACCOUNT_ID is unset by default; that is outside G6 scope. gates.md G6 line now names the feed commands; no secret was needed.

## G4

### G4 — OutLayer — PASS — 2026-11-09T22:10Z — commit d87eef6
Fresh clone /tmp/verify-G4-1794262025 (cloned at 552de76, then pulled to d87eef6, which adds the run logs and scripts/45; main later moved to 0e15ee9, which only adds FACTS). Logs: evidence/G4/verifier-20261109T2210Z/. No transactions sent; everything below is RPC view, HTTP GET or a local build.
$ near contract call-function as-read-only outlayer.testnet estimate_execution_cost json-args "$(cat packages/config/outlayer-limits.json)" network-config testnet now
  → "4000010000000000000000" yocto = 0.00400001 NEAR (100M instr / 128 MB / 30 s, input_len 512) (estimate.log)
$ near contract call-function as-read-only $CORE get_settlement json-args '{"position_id":"0"}' network-config testnet now
  → ERROR MethodResolveError(MethodNotFound). gates.md names a view nectar-core does not have (gates-get_settlement.log). The disc_bps criterion is checked from tx events below instead. Fix the gates.md line (orchestrator).
Quoter wasm: bash quoter/build.sh (rustc 1.95.0) → exit 0, sha256 3ce17749ae1b997971d97efa8f79110b586273e39bf9ca00c61a2bdf14ea6cc2, 92355 B
  GET outlayer.wasm_url (test.fastfs.io/.../3ce17749….wasm) → HTTP 200, 92355 B, same sha256. Matches config.yaml version_key and wasm_sha256 (quoter-sha.log)
Core wasm: cargo near build non-reproducible-wasm (SDKROOT per host notes) → base58(sha256) FQjNLgawvz9KmeLioJs6fdd5GdB5JAVeEfSSZfEGTFfB
  = view_account nectar-core.nectar.testnet code_hash (block 276979526) (core-hash.log)
Views (views.log): get_quoter_config enabled, outlayer.testnet, project nectar.testnet/nectar-quoter, version_key 3ce17749…, deposit 0.01 NEAR, 100 Tgas, limits 100M/128/30
  · get_state_version 1 · contract_version "nectar-core 0.1.0 p1" · get_quote 0 max_discount_bps 250 · get_quote 1 max_discount_bps 400 · positions 0 and 2 Closed
Run B trigger 6ywM8Qm53Ppf36T64biUPFNbMEwAREXQ3XvZYYnEztwr (EXPERIMENTAL_tx_status, signer keeper.nectar.testnet → nectar-core, SuccessValue):
  outlayer: Resolved project nectar.testnet/nectar-quoter version 3ce17749… source WasmUrl test.fastfs.io/…/3ce17749….wasm, wasm32-wasip2
  outlayer: execution_requested request_id 15114, sender keeper.nectar.testnet, predecessor nectar-core.nectar.testnet, limits 100M/128/30
  outlayer: execution_completed success true, instructions 135689; "Cost: 1090000000000000000000 yoctoNEAR, Refund: 8910000000000000000000 yoctoNEAR" (0.00109 charged of 0.01 deposit)
  nectar: quoter_result position 0, fills [q0 disc 250 (max 250), q1 disc 400 (max 400)]: both within [0, max]
  nectar: settled_near q0 250 bps repay 9400000000 seize 68864469 buyer1 · q1 400 bps repay 1850000000 seize 13764881 buyer2
Run A trigger 5TSasAEy2QedbkV7SEjzFpSdZb8eqJtjHABexAYvwShC (signer keeper.nectar.testnet, SuccessValue). The run pinned version_key = 0…0 on purpose, so
  outlayer.testnet receipt fails with "Smart contract panicked … Version not found", then nectar quoter_fallback {position 2, reason "failed"}, then
  settled_near q0 disc 250 = quote 0 max_discount_bps 250. Fallback path tested.
Fills equal max_discount_bps in Run B because no secrets_ref is configured yet (WO-10b). The quoter returns each quote's max. This is not evidence of discount pricing.
Attestation:
  WebFetch https://app.outlayer.ai/executions → Executions table headers ("Click an id to open its TEE attestation"), no rows rendered, 15114 not visible.
  WebFetch https://outlayer.fastnear.com/docs/getting-started → 301 to app.outlayer.ai/docs/getting-started (no per-request URL); /docs/tee-attestation gives no route either.
  WebFetch https://testnet-api.outlayer.ai/attestations/by-request/15114 (route from F-168/F-169; also curl, attestation-testnet-15114.json) → HTTP 200:
    request_id 15114 · caller_account_id keeper.nectar.testnet · transaction_hash 6ywM8Qm5… (= Run B) · project_id nectar.testnet/nectar-quoter
    wasm_hash = executed_wasm_sha256 = 3ce17749… (= version_key) · input_hash d1b6aa1c… (= quoter_requested input_sha256) · block 276979189
    tdx_quote present (base64, non-empty) · worker_measurement present (b1773e4d…). TDX quote NOT verified cryptographically (not attempted).
  Caution: https://api.outlayer.ai/attestations/15114 returns HTTP 200 for an unrelated MAINNET task (caller price-oracle.near, another wasm). Do not link it. by-request on api.outlayer.ai → 404.
Criteria: execution attested/visible OK (testnet-api attestation record; dashboard shows nothing) · disc_bps within [0,max] OK (from events, since the gates.md view is missing) ·
  cost recorded OK (estimate 0.00400001 NEAR; actual 0.00109 NEAR, refund 0.00891) · fallback tested OK (Run A) · wasm and core hashes reproduce OK.
Open: gates.md G4 line 2 (get_settlement) does not exist. Attestation is shown via API JSON, not the dashboard. Discount pricing is unproven until WO-10b.

#### G4 addendum — discount pricing from OutLayer secrets — PASS — 2026-11-09T22:51Z — commit fea52b7
Read-only; no transactions sent. Fresh clone /tmp/verify-G4add-20261109T2249Z/repo at main HEAD fea52b7. Logs: evidence/G4/verifier-addendum-20261109T2249Z/.
Inputs: evidence/G4/run-C-20261109T2240Z.log, run-D-20261109T2245Z.log (scripts/45-g4-run.sh steps C/D, scripts/35-quoter-secrets.mjs --quote 1:3000:2000),
  evidence/upgrades/run-20261109T2238Z.log (core upgrade 2, scripts/26: FQjNLgaw… → HqZaadxy…).
$ curl rpc.testnet.near.org EXPERIMENTAL_tx_status <hash> sender keeper.nectar.testnet   (tx-run-C.json, tx-run-D.json)
  Run C CS5KGXTBcZFY7QwxM8HDL9XBUFFnqupbPT8sQ9U23ZDd trigger_preliquidation #3, SuccessValue:
    outlayer execution_requested request_id 15145, secrets_ref {mm-demo, nectar.testnet}, input vol_bps 150, max_discount_bps 400
    outlayer execution_completed success:false error_message "Access denied by access condition. Check the access conditions configured by the secret owner."
      (charged 0.001 NEAR, refunded 0.009). Cause: the C1 store used Whitelist[nectar-core, nectar.testnet]; the signer is keeper. This is the expected denial.
    nectar quoter_fallback {position 3} → settled_near {quote 1, disc_bps 400 (= cap), repay 190000000, seize 1583334, buyer2}
  Run D BQscYSpn4qMzwD9fDehHbqc84gcpzs1vuK18yzVCvhBb trigger_preliquidation #4, SuccessValue:
    outlayer execution_requested request_id 15148, input vol_bps 150, max_discount_bps 400 · execution_completed success:true, 118394 instr, 236 ms,
      charged 0.0010236 NEAR, refunded 0.0089764
    nectar quoter_result fills [{quote_id 1, disc_bps 159}] → settled_near {quote 1, disc_bps 159, repay 170000000, seize 1542382, buyer2}
Recompute (quoter/src/lib.rs disc_bps, QG_SCALE 1e8, floor): min(400, 150 + floor(3000·2000·150/1e8)) = min(400, 150 + 9) = 159. Matches.
$ RPC call_function (final): get_vol_bps {"symbol":"NVDAx"} → 150 (block 276983848; set by run C set_vol_bps tx CUoyzijV…, vol_set event)
  get_quoter_config → enabled true, version_key 3ce17749…, secrets_ref {"profile":"mm-demo","account_id":"nectar.testnet"} (block 276983854)
$ EXPERIMENTAL_tx_status BH8aNKgudk1TocqgrpWm9irsdJhCCNuNUpV7KFdghoB8 sender nectar.testnet (run D1 store_secrets, tx-D1-store_secrets.json) → SuccessValue;
  on-chain args access = Logic And[Whitelist[keeper.nectar.testnet], Predecessor(Whitelist[nectar-core.nectar.testnet]), WasmHash 3ce17749…],
  accessor Project nectar.testnet/nectar-quoter, profile mm-demo; log "Updating secrets … Secrets stored".
$ curl + WebFetch https://testnet-api.outlayer.ai/attestations/by-request/15148 (attestation-15148.json) → HTTP 200:
  request_id 15148 · caller_account_id keeper.nectar.testnet · transaction_hash BQscYSpn… (= Run D) · project_id nectar.testnet/nectar-quoter · secrets_ref nectar.testnet/mm-demo
  wasm_hash = executed_wasm_sha256 = 3ce17749ae1b…6cc2 · input_hash c03a2bf9… (= quoter_requested input_sha256) · block 276983419
  tdx_quote present (6676 base64 chars) · worker_measurement present (b1773e4d…). TDX quote NOT verified cryptographically.
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   PATH += ~/.cargo/bin ~/.local/bin; SDKROOT=.../MacOSX26.5.sdk → EXIT=0 (core-build.log)
  sha256 fa2bb4f1…0f4e (404811 B) → base58 HqZaadxyZpywceMBKnjfagdn8NAMdAC5Ucn1K1MG4THX = view_account code_hash (block 276983860) = upgrade-2 deploy log.
Disclosures: MM_1_Q_BPS=3000 / MM_1_GAMMA_BPS=2000 are demo values, not a real market maker's book. They are stored in OutLayer under
  access And[signer keeper, predecessor nectar-core, WasmHash 3ce17749…]. The plaintext went to OutLayer's /secrets/pubkey endpoint
  in the request body (F-167) before client-side encryption, so the coordinator has seen these values.
Criteria: denial path → fallback at cap 400 OK · secrets path → disc_bps 159 < cap, recomputed OK · vol 150 and secrets_ref views OK · attestation for 15148 OK ·
  core code hash reproduces from fresh clone OK. Closes the "discount pricing unproven" item above.

## G3

### G3 — web E2E — PASS — 2026-11-09T21:15Z — commit 176914f
Fresh clone /tmp/verify-G3b-1794258954 (git clone /Volumes/T7/nectar-labs, main HEAD 176914f). Logs: evidence/G3/verifier-20261109T2115Z/ (01–07 + lh-*.json; screenshot-feed-phone-light.png). NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER unset.
$ pnpm i --frozen-lockfile                          → exit 0
$ pnpm --filter web build 2>&1 | tail -40           → exit 0 (21 routes, 02-build.log)
$ PW_CHANNEL=chrome pnpm --filter web e2e 2>&1 | tail -40   → exit 0
  112 passed, 2 skipped (53.8s). Skips = testnet.spec.ts:29 write flow, desktop + phone (no key, by design).
  shell.spec "<route> renders in <theme>, no horizontal scroll, axe clean": 13 routes × dark/light × desktop/phone, all ✓.
  "theme toggle switches data-theme" ✓ desktop + phone. testnet read-only (feed live capacity, api health) ✓ both.
$ LH_START=1 pnpm --filter web lighthouse            → exit 0 (script now exists: apps/web/scripts/lighthouse.mjs, lighthouse 13.6.0)
  | route | dark | light |
  | / | 100 | 100 |  | /feed | 100 | 100 |  | /borrow | 100 | 100 |
  | /quote/new | 100 | 100 |  | /console | 100 | 100 |  | /keepers | 100 | 100 |
  Theme check (05-lighthouse-theme-check.log, fullPageScreenshot mean brightness): dark 30.8–37.8, light 231.4–242.5 on all 6 routes.
$ node apps/web/scripts/check-no-branding.mjs       → exit 0 "no hackathon branding in UI sources"
$ pnpm demo:testnet                                  → exit 0 (07-demo-testnet.log)
  positions: #0 Open debt $11,250.00 · #1 Open debt $10.00 ltv 556 bps / pre-liq 7250 bps (borrower1, from the 20:57Z write run)
Write flow NOT repeated: running testnet.spec write would open position #2 on testnet. WO-3b changed only the skeleton's ARIA role and
added the lighthouse script; the borrow path did not change. Cited evidence from the c940dec run: evidence/G3/verifier-20261109T2057Z/06-e2e-write.log
(write spec 1 passed), 07-demo-after.log, 08-position1-rpc.json (position_id 1, borrower1.nectar.testnet, debt_usd_e6 10000000, Open). Position #1 still exists (above).
Key hygiene: no ed25519:[base58]{60,} in saved logs or the clone's test-results/playwright-report. Server on :3100 stopped by the script (lsof empty).
Explorer: none opened (no G3 criterion; nearblocks returns 403 to WebFetch, see §G2).
Criteria: e2e 0 failures OK · 12/12 Lighthouse ≥ 90 OK (all 100) · both themes OK · phone no h-scroll OK · branding clean OK · write flow OK (cited, not repeated).
Resolves both reasons from the 20:57Z FAIL (axe aria-prohibited-attr fixed with role="status"; lighthouse script now present).

### G3 — web E2E — FAIL — 2026-11-09T20:57Z — commit c940dec
Fresh clone /tmp/verify-G3-1794257832 (git clone /Volumes/T7/nectar-labs, main HEAD). Logs: evidence/G3/verifier-20261109T2057Z/ (01–14 + lh-*.json; screenshot-feed-phone-light.png)
```
$ pnpm i --frozen-lockfile                                   -> exit 0 (pnpm 10.34.9)
$ pnpm --filter web build                                    -> exit 0 (2 Turbopack "dynamic filesystem access" warnings)
$ PW_CHANNEL=chrome pnpm --filter web e2e                    -> exit 1: 84 passed, 28 failed, 2 skipped (54.0s)
  28 failed = shell.spec "<route> renders in <theme>, no horizontal scroll, axe clean" for
  /feed /borrow /quote/new /quote/0 /position/0 /console /keepers x dark,light x desktop,phone
  every one: axe serious "aria-prohibited-attr: 1" ->
  <div class="stack-sm" aria-busy="true" aria-label="Loading"> (apps/web/components/states.tsx:79, div with aria-label and no role)
  testnet read-only: feed lists NVDAx with live capacity, api health answers from the contract -> passed (desktop + phone)
  2 skipped = write spec (no key in read-only pass)
$ NEXT_PUBLIC_E2E_KEY_ADAPTER=1 pnpm --filter web build      -> exit 0
$ NECTAR_E2E_BORROWER_KEY=<from ~/.nectar/keys/borrower1.json, 0600, not printed> NEXT_PUBLIC_E2E_KEY_ADAPTER=1 \
  PW_CHANNEL=chrome pnpm --filter web exec playwright test e2e/testnet.spec.ts -g "borrow lands"
                                                             -> exit 0: 1 passed [desktop] (6.9s), 1 skipped [phone, "one write per run"]
$ pnpm demo:testnet (after)  -> positions: #0 Open debt $11,250.00 | #1 Open debt $10.00 ltv 556 bps (before: only #0)
  RPC list_positions(1): borrower1.nectar.testnet, NVDAx units 1000000, debt_usd_e6 10000000, status Open
$ pnpm --filter web build                                    -> exit 0 (final build; bundle sets no NEXT_PUBLIC_E2E_KEY_ADAPTER value)
$ pnpm --filter web start + pnpm dlx lighthouse@13.6.0 http://localhost:3100<route> --only-categories=accessibility \
  --chrome-flags="--headless=new <theme flag>" --output=json --quiet
  route       dark  light   (lighthouseVersion 13.6.0, mobile emulation 412 px)
  /           100   100
  /feed       100   100
  /borrow     100   100
  /quote/new  100   100
  /console    100   100
  /keepers    100   100
$ node apps/web/scripts/check-no-branding.mjs                -> exit 0 "no hackathon branding in UI sources"
$ curl SSR HTML: / testnet x35, "mock collateral" x14, hackathon x0; /feed testnet x17, "mock collateral" x8, hackathon x0
```
Theme method for Lighthouse: the app has no ?theme param; with no stored `nectar-theme` key, tokens.css follows prefers-color-scheme.
Dark = `--force-dark-mode`, light = `--blink-settings=preferredColorScheme=1`. Checked from each report's fullPageScreenshot:
mean RGB about (28,32,35) for all dark runs and about (242,244,243) for all light runs (12-lighthouse-theme-check.log).
Playwright themes come from localStorage `nectar-theme` (e2e/helpers.ts prime()); the data-theme assertion passed for all 13 routes in both themes.
Phone: Pixel 7 project at 400 px. The scroll assertion (scrollWidth - clientWidth ≤ 0) runs before the axe assertion, so it passed for all 26 phone route tests, including the 14 that later failed on axe. The "/" route passed in full, as did /talk, /security, /legal/*, /docs.
Key hygiene: no string matching ed25519:[base58]{60,} in any saved log or in the clone's test-results/playwright-report. Server on :3100 stopped.
Explorer: none opened (no criterion for G3).
Criteria: render 6 screens OK · Lighthouse ≥ 90 OK (all 100) · dark+light OK · phone no h-scroll OK · write flow lands OK (position #1) · disclosures/no branding OK.
FAIL reasons:
1. The gates.md G3 command `pnpm --filter web e2e` exits 1: 28 failures from the axe serious rule aria-prohibited-attr on the Loading skeleton (states.tsx:79) on 7 routes × 2 themes × 2 viewports.
2. gates.md lists `pnpm --filter web lighthouse`, but apps/web/package.json has no `lighthouse` script, so the gate command as written cannot run. I used the coordinator's `pnpm dlx lighthouse@13.6.0` command instead.
Note: Lighthouse scored 100 on the same routes. It audits after load, probably once the skeleton is gone. The axe check runs while the page is still loading, so the two results are not in conflict.

## G2

### G2 — testnet deploy — PASS — 2026-11-09T20:55Z — commit 5f27f44
Fresh clone /tmp/verify-G2-1794257515 (git clone /Volumes/T7/nectar-labs), no keys, no transactions sent. Full log: evidence/G2/verifier-20261109T2055Z.log
```
$ pnpm i --frozen-lockfile                         -> Done (pnpm 10.34.9)
$ pnpm demo:testnet                                -> EXIT=0
account nectar-core.nectar.testnet  version nectar-core 0.1.0 p0
Q_c $15,000.00  R_c $0.00  D_c $0.00  haircut 2500 bps  session closed; oracle $180.00 (age 320s, fresh); effective limit 7000 bps
pool: available $38,750.00  utilised $11,250.00  treasury $12.15
quotes: #0 remaining $10,000.00 max disc 250 bps live · #1 remaining $5,000.00 max disc 400 bps live
positions: #0 Open debt $11,250.00 ltv 6250 bps / pre-liq 7500 bps
$ near contract call-function as-read-only nectar-core.nectar.testnet get_collateral json-args '{"symbol":"NVDAx"}' network-config testnet now
  -> base_ltv 4000, max_nectar_ltv 7000, haircut 1000/2500, premium 300, session false, oracle 180000000, Q 15000000000, acc_fee_per_dollar_e18 5670000000000000
$ ... get_pool '{}'  -> available 38750000000, utilised 11250000000, treasury 12150000, lenders_fees 24300000
$ ... get_health '{"position_id":"0"}' -> value 18000000000, debt 11250000000, ltv 6250, pre_liq 7500, oracle_fresh true, triggerable false
$ ... preview_borrow '{"symbol":"NVDAx","units":"100000000","borrow_usd_e6":"11250000000"}'
  -> b_c 11250000000, static_limit 7200000000, premium 121500000, ok true, reason null
  (first attempt used arg name collateral_amount -> deserialize panic "missing field units"; verifier error, interface-p0.md says units)
$ ... get_quote 0/1 -> claimable 56700000 / 28350000 (sum 85050000) · get_position 0 -> Open, units 100000000, premium 121500000
$ (cd contracts/nectar-core && cargo near build non-reproducible-wasm)   SDKROOT=.../MacOSX26.5.sdk -> EXIT=0
$ (cd contracts/mock-ft && cargo near build non-reproducible-wasm)       -> EXIT=0
local base58(sha256) nectar_core.wasm = 8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV (324833 B)
local base58(sha256) mock_ft.wasm     = 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF (152268 B)
RPC view_account nectar-core.nectar.testnet code_hash 8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV  (match)
RPC view_account usdc-mock.nectar.testnet   code_hash 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF  (match)
RPC view_account nvdax-mock.nectar.testnet  code_hash 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF  (match)
$ git diff --stat b721641..HEAD -- contracts/ Cargo.toml Cargo.lock rust-toolchain.toml   -> empty (source = G1-verified)
$ RPC view_access_key_list keeper.nectar.testnet -> 1 key
ed25519:Gx7eX95TzYQq4c4pjg2ZfsHWdtUw9csLMfETKswnyXgQ FunctionCall receiver nectar-core.nectar.testnet methods [trigger_preliquidation, relay_settlement_result] allowance 1 NEAR
```
Model check vs contracts/nectar-core/tests/model.csv row demo_borrow: B_c 11250000000 = 11250000000 · static limit 7200000000 = 7200000000 ·
premium 121500000 = 121500000 · ltv_bps 6250 = 6250 · value 18000000000 = 18000000000 · pre-liq 7500 = 7500 · buyers fee 85050000 = quote
claimables 56700000 + 28350000 · lenders 24300000 = pool.lenders_fees · treasury 12150000 = pool.treasury · acc_increment_e18 5670000000000000 =
collateral.acc_fee_per_dollar_e18. No differences.
Keeper scope (D-012): only a FunctionCall key, receiver nectar-core, the two keeper methods; no FullAccess key.
Explorer (WebFetch, opened this run): https://testnet.nearblocks.io/address/nectar-core.nectar.testnet -> HTTP 403 Forbidden ·
https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet -> HTTP 403 · https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet -> HTTP 403 ·
https://api-testnet.nearblocks.io/v1/account/nectar-core.nectar.testnet -> HTTP 410 Gone. The pages did not load for an automated fetch, so this
run did not see their content; account existence and deployed code are shown by RPC view_account above. A human browser check is still open.
Verdict: PASS. Accounts exist, views answer, two quotes and one Open position, demo state matches model.csv demo_borrow, code hashes match the
wasm built from G1-verified source, keeper key scope correct, links recorded (load status: 403 to WebFetch).
Observations (not gate criteria): get_quote field `fee_debt_e18` returns 56700000 / 28350000, the same USD-e6 values as `claimable_fees_usd_e6`,
so the name suggests an e18 scale that the value does not have. relay_settlement_result is on the keeper key but is a P1 feature-gated method
that does not exist in the deployed default build.

## G1

### G1 (v7 additions) — contract tests — PASS — 2026-11-10T13:34Z–14:05Z — commit 09c4316
Clone as §G10; SDKROOT=.../MacOSX26.5.sdk. All exit codes via bash -c (evidence/G1/verifier-v7-20261110T1334Z/summary.txt).
$ cargo test -p nectar-core                          → exit 0: unit 318/0 (incl. model_csv_vectors_match_contract_math), sandbox 5/0,
                                                         sandbox_p1 5/0, sandbox_p2 3/0, sandbox_v7 4/0
$ cargo test -p nectar-core --test sandbox -- --nocapture     → 5 passed; 0 failed
$ cargo test -p nectar-core --test sandbox_p1 -- --nocapture  → 5 passed; 0 failed
$ cargo test -p nectar-core --test sandbox_p2 -- --nocapture  → 3 passed; 0 failed
$ cargo test -p nectar-core --test sandbox_v7 -- --nocapture  → 4 passed; 0 failed (146.68 s)
$ cargo test -p mock-ft                              → 17 passed; 0 failed
$ python3 contracts/nectar-core/tests/model.py --check → model.csv OK (87 rows)
v7 criteria (sandbox_v7, against real mock-ft wasm):
  aggregate debt — aggregate_debt_two_borrowers_repay_settle ok (reason aggregate_limit, full refund, headroom, 1-over refused)
  weekend > 900 s — weekend_guard_calendar_stale_and_forced ok (+905 s → stale_price, haircut 2500, D=0; force false cannot reopen);
    unit price_older_than_900s_flips_to_weekend_parameters asserts exactly 900 s is still fresh
  multiplier bounds + announcement + split — multiplier_bounds_announce_and_split ok (+5.01 % and decrease refused, < 1 h announce
    refused, borrow refused while pending, 2-for-1 split leaves V and LTV unchanged)
  pay_to → claimable, referrer ≠ borrower — pay_to_claimable_and_referrers ok (pay_to_failed → get_claimable → withdraw_claimable;
    referrer_is_borrower refused with full refund)
Gas, v7.rs methods (max Tgas): set_session_calendar 8.93 · withdraw_claimable 7.13 · apply_corporate_action 2.49 · set_multiplier 2.43 ·
  announce_corporate_action 2.42 · force_session_closed 2.38 · register_referrer 2.25 · unregister_referrer 2.24 · set_origination_fee_bps 2.13
  (9/9). v2 borrow paths: LockCollateralAndBorrow(referrer) 12.34 · (pay_to failed) 12.21 · trigger_preliquidation(v2) 16.96; max overall
  trigger_preliquidation 50.56 (sandbox). remote.rs (sandbox_p2 totals): trigger+sign(remote) 17.94 · request_remote_release+sign 16.88 ·
  confirm_remote_deposit+vault_read+payout 12.96 · reserve_remote_position+derived_public_key 8.68 · keeper_attest_deposit+payout 7.88 ·
  relay_settlement_result 2.75 · relay_release_result 2.72 · expire_remote_reservation 2.38. All < 100 Tgas.
Not separately gas-labelled (G11 scope, not a G1(v7) criterion): remote.rs set_allow_keeper_deposit_attestation, set_vault_read_config;
  p1/p2 owner setters (set_max_conf_bps, set_oracle_source, set_outlayer_account, set_quoter_pin, set_quoter_secrets_ref, set_vol_bps,
  set_remote_chain, set_signer_config — default = ["p1","p2"] now, so these are in the default build). Private callbacks excepted.
  Full list: method-coverage.txt (its 0.00 rows are sandbox_p2's 4-field format; real totals in gas-sandbox_p2-totals.csv).
Explorer: none (local).
Result: PASS on every G1 v7 addition. Note for G11: 10 owner setters lack a gas row.

### G1 — contract tests — PASS — 2026-11-09T20:43Z — commit b721641
Re-run after GATE_FAIL_G1 (WO-2b merged at 0b3d9ac). Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G1b-1794256819
(HEAD b721641eb16f); PATH += ~/.cargo/bin ~/.local/bin; SDKROOT=.../MacOSX26.5.sdk (gates.md host notes). No secrets used.
$ pnpm i --frozen-lockfile                                         → Done in 3.7s, exit 0
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   → exit 0
     -                  Size: 324.8 KB (324833 bytes)
     - SHA-256 checksum hex : 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46
$ (contracts/mock-ft) cargo near build non-reproducible-wasm       → exit 0
     -                  Size: 152.3 KB (152268 bytes)
     - SHA-256 checksum hex : 28578356a6e426f8ea384051ff7519c51faa2bd7ed9f711e9e4f3a05f3f372c2
  (both identical to the 3bc0de8 run: WO-2b changed tests only)
$ cargo test -p nectar-core -p mock-ft -- --nocapture              → exit 0
     mock_ft unit 11 passed · nectar_core unit 88 passed (incl. model_csv_vectors_match_contract_math)
     tests/sandbox.rs 5 passed; 0 failed (31.65s): owner_setters_and_ft_gas · refunds_and_guards ·
       topup_exit_and_repay · demo_flow_matches_model · preliq_eight_buyers_gas
$ cargo test -p nectar-core 2>&1 | tail -40                        → exit 0 (gates.md line 1; sandbox 5 passed)
$ cargo test -p nectar-core --test sandbox 2>&1 | tail -40         → 5 passed; 0 failed, exit 0 (gates.md line 2)
$ python3 contracts/nectar-core/tests/model.py --check             → model.csv OK (54 rows), exit 0
$ git status --short (clone, after all runs)                       → empty
Gas (max per label, Tgas; 31 labels, all < 100): trigger_preliquidation(8 legs) 46.86 · (2 legs) 19.92 ·
  ft_transfer_call: LockCollateralAndBorrow 11.05 · FundPappusQuote 6.74 · TopUpQuote 6.61 · Repay(refund) 6.50 ·
  Repay(partial) 6.44 · invalid 6.37 · SupplyLendingLiquidity 6.26 · complete_quote_withdrawal 6.72 · claim_fees 6.61 ·
  upsert_collateral 2.34 · initiate_quote_withdrawal 2.30 · apply_price 2.26 · update_owner_price 2.11 · propose_price 2.07 ·
  set_reserve 2.03 · set_dex_depth 2.03 · set_session 2.03 · pause/unpause 1.84 · set_oracle_params 1.81 ·
  set_quote_params 1.81 · set_fee_split 1.81 · set_keeper 1.81 · fund_gas_reserve 1.79 · new 1.75 ·
  mock-ft: ft_transfer 1.94 · mint 1.73 · storage_deposit 1.73 · new 1.53
Coverage check (pub fn ...(&mut self in #[near] impl of the default build vs GAS labels): nectar-core 24/24 covered
  (ft_on_transfer via the 7 ft_transfer_call:* totals); mock-ft 5/5 covered (ft_transfer_call via the same totals).
  Excepted: #[private] callbacks nectar-core on_payout and mock-ft ft_resolve_transfer (gas counted inside their
  callers' totals). p1.rs/p2.rs are cfg(feature) and absent from the default build.
Key scope (PRD §6.10), inside demo_flow_matches_model (passed): keeper adds an FC key scoped to nectar-core
  [trigger_preliquidation, relay_settlement_result]; KEYSCOPE rows: usdc.ft_transfer with 1 yocto, usdc.ft_transfer
  without deposit, and core.pause all rejected-at-validation; contract still unpaused; trigger_preliquidation with the
  scoped key succeeded (19.92 Tgas, no receipt failures).
Explorer: none (G1 is local; no links opened).
Result: PASS. Every criterion met: builds exit 0 with recorded hashes, unit 99/99, sandbox 5/5, model match exact,
  every public change method has a gas row < 100 Tgas, key-scope test passed.
Notes (not fail reasons): the 3 key-scope refusals accept any client-side Err ("unable to broadcast the transaction");
  the test does not assert the specific access-key error. Full log 1528 lines.

### G1 — contract tests — FAIL — 2026-11-09T20:33Z — commit 3bc0de8
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G1-1794256025 (HEAD 3bc0de8cb4bd); PATH += ~/.cargo/bin ~/.local/bin;
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk (gates.md host notes). No secrets used.
$ pnpm i --frozen-lockfile                                   → Done in 3.4s
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   → exit 0
     -                  Size: 324.8 KB (324833 bytes)
     - SHA-256 checksum hex : 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46
$ (contracts/mock-ft) cargo near build non-reproducible-wasm       → exit 0
     -                  Size: 152.3 KB (152268 bytes)
     - SHA-256 checksum hex : 28578356a6e426f8ea384051ff7519c51faa2bd7ed9f711e9e4f3a05f3f372c2
  (both hashes identical to the committed evidence/G1/build-*.log)
$ cargo test -p nectar-core -p mock-ft                       → exit 0
     Running unittests src/lib.rs (mock_ft)     test result: ok. 11 passed; 0 failed
     Running unittests src/lib.rs (nectar_core) test result: ok. 88 passed; 0 failed
     Running tests/sandbox.rs                   test result: ok. 4 passed; 0 failed (42.64s)
       refunds_and_guards ok · demo_flow_matches_model ok · topup_exit_and_repay ok · preliq_eight_buyers_gas ok
$ cargo test -p nectar-core 2>&1 | tail -40                  → exit 0 (gates.md line 1)
$ cargo test -p nectar-core --test sandbox 2>&1 | tail -40   → 4 passed; 0 failed (gates.md line 2)
$ python3 contracts/nectar-core/tests/model.py --check       → model.csv OK (54 rows)
  model_csv_vectors_match_contract_math ok (assert_eq, i.e. exact; stricter than ±1 unit)
$ cargo test -p nectar-core --test sandbox -- --nocapture --test-threads=1   (gas capture; 4 passed)
  max Tgas per label: trigger_preliquidation(8 legs) 46.97 · trigger_preliquidation(2 legs) 19.99 ·
  ft_transfer_call:LockCollateralAndBorrow 11.09 · FundPappusQuote 6.76 · complete_quote_withdrawal 6.72 ·
  claim_fees 6.63 · TopUpQuote 6.62 · Repay(refund) 6.51 · Repay(partial) 6.44 · invalid 6.37 ·
  SupplyLendingLiquidity 6.27 · upsert_collateral 2.36 · initiate_quote_withdrawal 2.30 ·
  update_owner_price 2.12 · pause/unpause 1.84 · set_oracle_params 1.82 · set_quote_params 1.81 ·
  fund_gas_reserve 1.80 · new 1.75   (20 labels, same set as committed gas-sandbox.csv; all < 100 Tgas)
Explorer: none (G1 is local; no links opened).
Result: tests green, model match exact, wasm builds reproducible on this host.
FAIL reason (criterion "gas per method < 100 Tgas recorded"): 7 public change methods in the default
  (P0) nectar-core build have no gas measurement in the sandbox output or in evidence/G1/gas-sandbox.csv:
  set_keeper, set_fee_split, set_session, set_dex_depth, set_reserve, propose_price, apply_price.
  (on_payout is a #[private] callback counted inside trigger_preliquidation totals; on_quoter_result /
  relay_settlement_result / on_signature are feature-gated p1/p2 stubs, not in the default build.)
  mock-ft mint / storage_deposit / ft_transfer have no standalone gas row either (ft_transfer runs inside
  the ft_transfer_call totals); flagged for the orchestrator to decide whether G1 scope includes mock-ft.
Notes: clone tree clean after all runs (no files written by tests). Full log 1032 lines.
