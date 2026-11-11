// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {NectarVaultBase} from "../src/NectarVaultBase.sol";
import {MockB20} from "../src/MockB20.sol";
import {PolicyRegistryMock} from "../src/PolicyRegistryMock.sol";

/// @dev Shared fixture: chain 84532, an allowlist receiver policy, one open position.
///      All private keys here are throwaway test scalars for vm.sign, never real key material.
abstract contract VaultFixture is Test {
    uint256 internal constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    uint256 internal constant AUTH_PK = 0xA11CE;
    uint256 internal constant OTHER_PK = 0xB0B;
    uint64 internal constant ALLOW_ID = (uint64(1) << 56) | 7; // ALLOWLIST type byte, id 7
    uint64 internal constant POS = 7;
    uint256 internal constant AMOUNT = 100_000_000; // 100 NVDAx at 6 decimals
    uint64 internal constant T0 = 1_762_819_200;

    PolicyRegistryMock internal registry;
    MockB20 internal token;
    NectarVaultBase internal vault;

    address internal authority;
    address internal alice = makeAddr("alice"); // depositor
    address internal buyer = makeAddr("buyer"); // quote recipient (allowlisted)
    address internal mallory = makeAddr("mallory"); // not allowlisted

    function setUp() public virtual {
        vm.chainId(84532);
        vm.warp(T0);
        authority = vm.addr(AUTH_PK);

        registry = new PolicyRegistryMock();
        token = new MockB20("Mock NVDAx", "NVDAx", 6, address(registry));
        vault = new NectarVaultBase(address(token), address(registry));

        token.updatePolicy(token.TRANSFER_RECEIVER_POLICY(), ALLOW_ID);
        registry.allow(ALLOW_ID, address(vault));
        registry.allow(ALLOW_ID, alice);
        registry.allow(ALLOW_ID, buyer);

        token.mint(alice, 10 * AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.openPosition(POS, authority, AMOUNT);
    }

    // ------------------------------------------------------------ builders

    function _settle(uint64 pos, uint256 seize, address to, uint64 nonce, uint64 expires, uint8 kind)
        internal
        pure
        returns (NectarVaultBase.Settle memory m)
    {
        m = NectarVaultBase.Settle({
            positionId: pos,
            quoteId: 12,
            repayE6: 1_250_000_000,
            seizeRaw: seize,
            recipient: to,
            nonce: nonce,
            expires: expires,
            kind: kind
        });
    }

    function _defaultSettle() internal view returns (NectarVaultBase.Settle memory) {
        return _settle(POS, 40_000_000, buyer, 1, T0 + 600, 1);
    }

    function _release(uint64 pos, address to, uint64 nonce, uint64 expires)
        internal
        pure
        returns (NectarVaultBase.Release memory m)
    {
        m = NectarVaultBase.Release({positionId: pos, recipient: to, nonce: nonce, expires: expires});
    }

    // --------------------------------------------- independent EIP-712 hashing

    function _domain(uint256 chainId, address verifying) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("NectarVault"),
                keccak256("1"),
                chainId,
                verifying
            )
        );
    }

    function _settleStruct(NectarVaultBase.Settle memory m) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "Settle(uint64 positionId,uint64 quoteId,uint256 repayE6,uint256 seizeRaw,address recipient,uint64 nonce,uint64 expires,uint8 kind)"
                ),
                m.positionId,
                m.quoteId,
                m.repayE6,
                m.seizeRaw,
                m.recipient,
                m.nonce,
                m.expires,
                m.kind
            )
        );
    }

    function _releaseStruct(NectarVaultBase.Release memory m) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("Release(uint64 positionId,address recipient,uint64 nonce,uint64 expires)"),
                m.positionId,
                m.recipient,
                m.nonce,
                m.expires
            )
        );
    }

    function _digest(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }

    function _settleDigest(NectarVaultBase.Settle memory m, uint256 chainId) internal view returns (bytes32) {
        return _digest(_domain(chainId, address(vault)), _settleStruct(m));
    }

    function _releaseDigest(NectarVaultBase.Release memory m, uint256 chainId) internal view returns (bytes32) {
        return _digest(_domain(chainId, address(vault)), _releaseStruct(m));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        (v, r, s) = vm.sign(pk, digest);
    }

    function _highS(uint8 v, bytes32 s) internal pure returns (uint8, bytes32) {
        return (v == 27 ? 28 : 27, bytes32(N - uint256(s)));
    }

    function _doSettle(NectarVaultBase.Settle memory m) internal {
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vault.settle(m, alice, v, r, s);
    }

    function _doRelease(NectarVaultBase.Release memory m) internal {
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vault.release(m, alice, v, r, s);
    }

    /// @dev Independent of the contract: abi.encode(uint64, address) is two left-padded words.
    function _key(uint64 id, address depositor) internal pure returns (bytes32) {
        return keccak256(bytes.concat(bytes32(uint256(id)), bytes32(uint256(uint160(depositor)))));
    }

    function _status(uint64 id) internal view returns (NectarVaultBase.Status st) {
        (,,, st) = vault.positionOf(id, alice);
    }
}
