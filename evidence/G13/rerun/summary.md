# G13 re-run on the upgraded stack — 2026-11-11 ~07:55Z — LOCAL FORK of Base Sepolia (D-026), redeployed vault 0xC64b733424C8d25fB574F275007ED8756e261226
(slot-scoped nonces, depositor-keyed slots, release recipient = depositor; MockB20 0x634F88DAEf0a1f77645c523C3FA351Fe37aaf81d), nectar-core-v2 2.2.1-v7, keeper attest mode.
- Position 11 (release): authority = keccak-address of derived_public_key(base-sepolia/pos/11, domain 0) (check-11.log); deposit → keeper-attested → paid $303.9129; repay → EIP-712 Release signed →
  relayed → positionOf(11, borrower1).status 3; borrower1 balance back to 10.000000; NEAR Closed.
- Position 12 (settle): price 150 → 135 (disclosed) → keeper trigger → EIP-712 Settle (kind 1, quote 4, nonce 14) signed → relayed (tx 0xa2fea901d3…) → status 2; buyer1 +2.357389, borrower1 7.642611;
  replay of the relay calldata → `NonceUsed(14)` (replay-12.log).
