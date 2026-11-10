# G13 Base spoke round trip — orchestrator run 2026-11-10 17:57–18:05Z — LOCAL FORK of Base Sepolia (D-026; disclosed, not Base Sepolia)
NEAR side is real testnet: nectar-core-v2 upgraded code-only to 2.1.0-v7 (scripts/28, views identical except contract_version), MPC v1.signer-prod.testnet
domain 0 (secp256k1). EVM side: anvil fork of Base Sepolia, chain 84532, 127.0.0.1:8545 (scripts/27); vault 0xC4f46D859f9B555D95b68DC28564C5201F743d09,
MockB20 0xD83A1571Ac3431A498f657512439B744c35CAd7E, PolicyRegistryMock 0x5A87…52D5 (scripts/26). Keeper daemon: keeper-v2 (NEAR) + Foundry keystore signer
0xe4A5FB078AeaD3D67C7Acdb7D0C2895bdB47C991, BASE_KEEPER_ATTEST=1 (OutLayer cannot reach a local fork → deposits are keeper-attested, labelled source "keeper").
set_extra_remote_chain(NVDAx, base-sepolia, vault, rpc) → get_remote_chains lists solana-devnet (primary) + base-sepolia (evm 84532). Base quote #4 (buyer1,
$1,000 @ 300 bps, recipient 0xcA61FE6F57a6A36Dedf2b99E1D4D8923b1D71fa1).
## Release path — position 6
- authority 0xd4189b46e51e93fee716b78ccf0325e622f0bdb5 == last20(keccak(x‖y)) of live derived_public_key(base-sepolia/pos/6, nectar-core-v2, domain 0)
  (computed independently with cast keccak; evidence/G13/check-6.log)
- approve + openPosition on the fork (tx 0xa190cf69…b4cc); keeper-attested → Open, paid $303.9129
- repay $308.70 → remote_release_signed (EIP-712 Release digest 0xf5f93f43…c769, MPC secp256k1 r/s/v) → keeper relay tx 0x759a9a8b…694b status 1 →
  vault positions(6).status 3; borrower1 MockB20 back to 10.000000; NEAR position Closed.
## Settle path — position 7
- authority 0xad6bc652…a31b == derived (check-7.log); deposit + attest → Open
- owner price 150 → 135 (disclosed demo control) → LTV 7623 bps > 7500 → keeper trigger → MPC Ecdsa sign of EIP-712 Settle (kind 1, quote 4, digest
  0x260c067c…f2f3) → keeper relay tx 0x20d13922…e4bb status 1 → vault positions(7).status 2; buyer1 received 2.357389 (= 308.70 / (135 × 0.97));
  borrower1 received the 0.642611 remainder; NEAR position Closed.
## Replay protection (on the fork)
- eth_call replay of the relayed settle calldata → `NonceUsed(6)`; of the release calldata → `NonceUsed(2)` (evidence/G13/replay.log).
- Solana-format / chain-8453 / wrong-signer / expired reverts: forge tests (evm/, 74 pass).
ERC-8021 suffix: not appended (H19 builder code absent; format unverified F-351). Real Base Sepolia: pending H15 (deployer 0x4CAd…BFBd).
