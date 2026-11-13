# WO-27 — evm — NectarVaultBase + MockB20 + PolicyRegistryMock (Foundry) (< 2 h; commit `feat(evm): NectarVaultBase with EIP-712 settle/release`)
Rules (docs/process/work/agent-evm.md, verbatim intent): own only evm/. Solidity version pinned in foundry.toml. EIP-712 domain {NectarVault, 1, 84532, vault}.
settle and release recompute the digest on-chain, ecrecover against the stored authority, check nonce + expiry, check PolicyRegistry.isAuthorized before any
transfer. Every revert path has a forge test, including a signature produced for Solana replayed on Base and a digest built for chain 8453.
**No broadcasts of any kind in this WO** (no `--broadcast`, no RPC sends, no keys, never `--private-key`): `forge build` / `forge test` locally only.
Read: docs/process/work/interface-v7.md §D (binding), PRD v7 §9B "Base Sepolia spoke" (only), FACTS F-343 (Foundry 1.9.0), F-345–F-348 (B20 multiplier(),
isAuthorized never reverts, factory 0xB20f…0000, createB20 open on Base Sepolia), F-331/F-332 (secp256k1 signature shape), D-021, D-026.
Build `evm/` (foundry.toml, src/, test/, script/):
1. `NectarVaultBase.sol` per §D (openPosition, settle, release, positions view, events). Seized units go to recipient, remainder to depositor; position closed.
2. `MockB20.sol`: ERC-20 + `multiplier()`, `scaledBalanceOf`, `toScaledBalance`, `toRawBalance`, owner `updateMultiplier`; `PolicyRegistryMock.sol`
   `isAuthorized(uint64 policyId, address) → bool` with owner allow/deny.
3. Scripts (not run): `script/DeployMock.s.sol`, `script/DeployVault.s.sol`, `script/CreateB20.s.sol` (B20Factory createB20 with the base-std v1.0.0
   B20AssetCreateParams per F-347; policies set explicitly). They read the deployer from a Foundry keystore account name (`--account`), never a key.
4. `test/eip712_vectors.json`: settle + release digests for fixed inputs, generated in a forge test (or viem script) so the contract agent can match them byte for byte
   in nectar-core (WO-29a). Include the r/s/v of a signature from a fixed test key (vm.sign) for each.
5. forge tests:
   - happy settle and release;
   - wrong signer, replayed nonce, expired, wrong chainId digest (8453), a Solana-format message refused, unauthorized recipient (registry deny),
     high-s signature (decide: reject or normalise; test it);
   - double release, settle after release, open with zero amount.
Report ≤ 20 lines: test counts, gas per external function (forge --gas-report), solc version, vector file path.
