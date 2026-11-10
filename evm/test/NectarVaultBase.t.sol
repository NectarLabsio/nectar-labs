// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VaultFixture} from "./VaultFixture.sol";
import {NectarVaultBase} from "../src/NectarVaultBase.sol";
import {MockB20} from "../src/MockB20.sol";

contract NectarVaultBaseTest is VaultFixture {
    // ================================================================ open

    function test_open_recordsPositionAndPullsTokens() public view {
        (address a, address d, uint256 amt, NectarVaultBase.Status st) = vault.positions(POS);
        assertEq(a, authority);
        assertEq(d, alice);
        assertEq(amt, AMOUNT);
        assertEq(uint8(st), uint8(NectarVaultBase.Status.Open));
        assertEq(token.balanceOf(address(vault)), AMOUNT);
        assertEq(token.balanceOf(alice), 9 * AMOUNT);
    }

    function test_open_emitsEvent() public {
        vm.expectEmit(address(vault));
        emit NectarVaultBase.PositionOpened(8, authority, alice, 5);
        vm.prank(alice);
        vault.openPosition(8, authority, 5);
    }

    function test_open_zeroAmount_reverts() public {
        vm.prank(alice);
        vm.expectRevert(NectarVaultBase.ZeroAmount.selector);
        vault.openPosition(8, authority, 0);
    }

    function test_open_zeroAuthority_reverts() public {
        vm.prank(alice);
        vm.expectRevert(NectarVaultBase.ZeroAddress.selector);
        vault.openPosition(8, address(0), 1);
    }

    function test_open_duplicateId_reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.PositionExists.selector, POS));
        vault.openPosition(POS, authority, 1);
    }

    function test_open_closedId_cannotReopen() public {
        _doRelease(_release(POS, alice, 1, T0 + 60));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.PositionExists.selector, POS));
        vault.openPosition(POS, authority, 1);
    }

    function test_open_withoutAllowance_reverts() public {
        address carol = makeAddr("carol");
        registry.allow(ALLOW_ID, carol);
        token.mint(carol, 10);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(MockB20.InsufficientAllowance.selector, 0, 10));
        vault.openPosition(9, authority, 10);
    }

    function test_constructor_wrongChain_reverts() public {
        vm.chainId(8453);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.WrongChain.selector, 8453));
        new NectarVaultBase(address(token), address(registry));
    }

    function test_constructor_zeroAddress_reverts() public {
        vm.expectRevert(NectarVaultBase.ZeroAddress.selector);
        new NectarVaultBase(address(0), address(registry));
        vm.expectRevert(NectarVaultBase.ZeroAddress.selector);
        new NectarVaultBase(address(token), address(0));
    }

    // ============================================================ happy paths

    function test_settle_happy_seizesToRecipientRemainderToDepositor() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        vm.expectEmit(address(vault));
        emit NectarVaultBase.PositionSettled(POS, 12, buyer, 1_250_000_000, 40_000_000, 60_000_000, 1, 1);
        _doSettle(m);
        assertEq(token.balanceOf(buyer), 40_000_000);
        assertEq(token.balanceOf(alice), 9 * AMOUNT + 60_000_000);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Settled));
        assertTrue(vault.nonceUsed(1));
    }

    function test_settle_selfKind_fullSeize() public {
        NectarVaultBase.Settle memory m = _settle(POS, AMOUNT, buyer, 2, T0 + 600, 2);
        _doSettle(m);
        assertEq(token.balanceOf(buyer), AMOUNT);
        assertEq(token.balanceOf(alice), 9 * AMOUNT);
    }

    function test_settle_zeroSeize_allToDepositor() public {
        _doSettle(_settle(POS, 0, buyer, 3, T0 + 600, 1));
        assertEq(token.balanceOf(buyer), 0);
        assertEq(token.balanceOf(alice), 10 * AMOUNT);
    }

    function test_settle_atExactExpiry_ok() public {
        _doSettle(_settle(POS, 1, buyer, 4, T0, 1));
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Settled));
    }

    function test_settle_anyoneCanRelay() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.prank(makeAddr("keeper"));
        vault.settle(m, v, r, s);
        assertEq(token.balanceOf(buyer), 40_000_000);
    }

    function test_release_happy() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        vm.expectEmit(address(vault));
        emit NectarVaultBase.PositionReleased(POS, alice, AMOUNT, 9);
        _doRelease(m);
        assertEq(token.balanceOf(alice), 10 * AMOUNT);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Released));
        assertTrue(vault.nonceUsed(9));
    }

    function test_hashes_matchIndependentEip712() public view {
        NectarVaultBase.Settle memory m = _defaultSettle();
        NectarVaultBase.Release memory rl = _release(POS, alice, 9, T0 + 600);
        assertEq(vault.domainSeparator(), _domain(84532, address(vault)));
        assertEq(vault.hashSettle(m), _settleDigest(m, 84532));
        assertEq(vault.hashRelease(rl), _releaseDigest(rl, 84532));
    }

    // ============================================================ wrong signer

    function test_settle_wrongSigner_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(OTHER_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.WrongSigner.selector, vm.addr(OTHER_PK), authority));
        vault.settle(m, v, r, s);
    }

    function test_release_wrongSigner_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(OTHER_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.WrongSigner.selector, vm.addr(OTHER_PK), authority));
        vault.release(m, v, r, s);
    }

    function test_settle_tamperedField_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        m.seizeRaw += 1; // relayer tries to seize one more unit
        vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
        vault.settle(m, v, r, s);
    }

    function test_release_redirectedRecipient_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        m.recipient = buyer;
        vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
        vault.release(m, v, r, s);
    }

    function test_settle_releaseSignatureAsSettle_reverts() public {
        // a Release signature for the same position cannot authorise a Settle (different type hash)
        NectarVaultBase.Release memory rl = _release(POS, buyer, 1, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(rl, 84532));
        vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
        vault.settle(_settle(POS, AMOUNT, buyer, 1, T0 + 600, 1), v, r, s);
    }

    function test_settle_signatureForOtherVault_reverts() public {
        NectarVaultBase other = new NectarVaultBase(address(token), address(registry));
        NectarVaultBase.Settle memory m = _defaultSettle();
        bytes32 d = _digest(_domain(84532, address(other)), _settleStruct(m));
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, d);
        vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
        vault.settle(m, v, r, s);
    }

    function testFuzz_settle_onlyAuthorityKeyAccepted(uint256 pk) public {
        pk = bound(pk, 1, N - 1);
        vm.assume(pk != AUTH_PK);
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(pk, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.WrongSigner.selector, vm.addr(pk), authority));
        vault.settle(m, v, r, s);
    }

    // ================================================================= nonce

    function test_settle_replayedSignature_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vault.settle(m, v, r, s);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NonceUsed.selector, 1));
        vault.settle(m, v, r, s);
    }

    function test_nonceReusedOnAnotherPosition_reverts() public {
        vm.prank(alice);
        vault.openPosition(8, authority, AMOUNT);
        _doSettle(_defaultSettle()); // consumes nonce 1 on position 7
        NectarVaultBase.Release memory m = _release(8, alice, 1, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NonceUsed.selector, 1));
        vault.release(m, v, r, s);
    }

    function test_failedSettle_doesNotBurnNonce() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(OTHER_PK, _settleDigest(m, 84532));
        vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
        vault.settle(m, v, r, s);
        assertFalse(vault.nonceUsed(1));
        _doSettle(m);
    }

    // ================================================================ expiry

    function test_settle_expired_reverts() public {
        NectarVaultBase.Settle memory m = _settle(POS, 1, buyer, 1, T0 - 1, 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.Expired.selector, T0 - 1, T0));
        vault.settle(m, v, r, s);
    }

    function test_release_expiredAfterWarp_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.warp(T0 + 601);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.Expired.selector, T0 + 600, T0 + 601));
        vault.release(m, v, r, s);
    }

    // ============================================================ chain id

    function test_settle_digestForChain8453_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 8453));
        vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
        vault.settle(m, v, r, s);
    }

    function test_release_digestForChain8453_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 8453));
        vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
        vault.release(m, v, r, s);
    }

    function test_settle_executedOnChain8453_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.chainId(8453); // same bytecode/state on a different chain (fork replay)
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.WrongChain.selector, 8453));
        vault.settle(m, v, r, s);
    }

    // ==================================================== Solana message refused

    /// @dev The Solana vault signs NECTAR_SETTLE_V1 pipe-joined bytes (solana/programs/nectar_vault/src/preimage.rs).
    function _solanaSettlePreimage() internal pure returns (bytes memory) {
        return bytes(
            "NECTAR_SETTLE_V1|chain=solana-devnet|program=Nectar1Vau1t11111111111111111111111111111111|pos=7|quote=12|repay_e6=1250000000|seize_units=40000000|recipient=3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV|nonce=1|expires=1762819800|kind=PRELIQ"
        );
    }

    function test_settle_solanaMessageSignedBySameKey_reverts() public {
        // Worst case: the same secp256k1 key signs the Solana preimage (keccak and sha256 prehash).
        // The vault only ever recovers over its own EIP-712 digest, so both are refused.
        NectarVaultBase.Settle memory m = _defaultSettle();
        bytes memory pre = _solanaSettlePreimage();
        bytes32[3] memory hashes = [keccak256(pre), sha256(pre), bytes32(0)];
        hashes[2] = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n", vm.toString(pre.length), pre));
        for (uint256 i; i < hashes.length; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, hashes[i]);
            vm.expectPartialRevert(NectarVaultBase.WrongSigner.selector);
            vault.settle(m, v, r, s);
        }
    }

    function test_settle_ed25519SignatureBytes_reverts() public {
        // A 64-byte Ed25519 signature (R ‖ S) relayed as (r, s) with either v: never recovers the authority.
        bytes32 edR = sha256("ed25519 R of a NECTAR_SETTLE_V1 signature");
        bytes32 edS = bytes32(uint256(sha256("ed25519 S")) >> 4); // ed25519 S < 2^253
        NectarVaultBase.Settle memory m = _defaultSettle();
        for (uint8 v = 27; v <= 28; ++v) {
            (bool ok, bytes memory ret) = address(vault).call(abi.encodeCall(NectarVaultBase.settle, (m, v, edR, edS)));
            assertFalse(ok);
            bytes4 sel = bytes4(ret);
            assertTrue(sel == NectarVaultBase.WrongSigner.selector || sel == NectarVaultBase.InvalidSignature.selector);
        }
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Open));
    }

    // ==================================================== policy registry

    function test_settle_unauthorizedRecipient_reverts() public {
        NectarVaultBase.Settle memory m = _settle(POS, 1, mallory, 1, T0 + 600, 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotAuthorized.selector, ALLOW_ID, mallory));
        vault.settle(m, v, r, s);
        assertFalse(vault.nonceUsed(1));
    }

    function test_settle_recipientDeniedAfterQuote_reverts() public {
        registry.deny(ALLOW_ID, buyer);
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotAuthorized.selector, ALLOW_ID, buyer));
        vault.settle(m, v, r, s);
    }

    function test_settle_unauthorizedDepositorForRemainder_reverts() public {
        registry.deny(ALLOW_ID, alice);
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotAuthorized.selector, ALLOW_ID, alice));
        vault.settle(m, v, r, s);
    }

    function test_settle_fullSeize_depositorNotChecked() public {
        registry.deny(ALLOW_ID, alice); // no remainder → no transfer to alice → no check
        _doSettle(_settle(POS, AMOUNT, buyer, 1, T0 + 600, 1));
        assertEq(token.balanceOf(buyer), AMOUNT);
    }

    function test_release_unauthorizedRecipient_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, mallory, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotAuthorized.selector, ALLOW_ID, mallory));
        vault.release(m, v, r, s);
    }

    function test_issuerSwitchesToAlwaysBlock_failsVisibly() public {
        uint64 blockAll = registry.ALWAYS_BLOCK();
        token.updatePolicy(token.TRANSFER_RECEIVER_POLICY(), blockAll);
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotAuthorized.selector, blockAll, alice));
        vault.release(m, v, r, s);
    }

    function test_defaultAlwaysAllowPolicy_settles() public {
        token.updatePolicy(token.TRANSFER_RECEIVER_POLICY(), 0);
        _doSettle(_settle(POS, 1, mallory, 1, T0 + 600, 1));
        assertEq(token.balanceOf(mallory), 1);
    }

    function test_tokenSenderPolicyBlocksVault_bubblesTokenError() public {
        // registry allows the recipient, but the issuer blocks the vault as sender: the B20 error surfaces
        uint64 senderList = (uint64(1) << 56) | 8;
        token.updatePolicy(token.TRANSFER_SENDER_POLICY(), senderList);
        registry.allow(senderList, alice); // alice may still send; vault may not
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(
            abi.encodeWithSelector(MockB20.PolicyForbids.selector, token.TRANSFER_SENDER_POLICY(), address(vault))
        );
        vault.release(m, v, r, s);
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Open)); // whole tx reverted
    }

    // ============================================================ high s / v

    function test_settle_highS_isNormalisedAndAccepted() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        assertLe(uint256(s), N / 2, "vm.sign returns low s");
        (uint8 hv, bytes32 hs) = _highS(v, s);
        vault.settle(m, hv, r, hs);
        assertEq(token.balanceOf(buyer), 40_000_000);
    }

    function test_highS_malleatedReplay_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vault.settle(m, v, r, s);
        (uint8 hv, bytes32 hs) = _highS(v, s);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NonceUsed.selector, 1));
        vault.settle(m, hv, r, hs);
    }

    function test_release_highS_isNormalisedAndAccepted() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        (uint8 hv, bytes32 hs) = _highS(v, s);
        vault.release(m, hv, r, hs);
        assertEq(token.balanceOf(alice), 10 * AMOUNT);
    }

    function test_highS_withUnflippedV_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        bytes32 hs = bytes32(N - uint256(s)); // v left as-is → recovers a different key
        (bool ok, bytes memory ret) = address(vault).call(abi.encodeCall(NectarVaultBase.settle, (m, v, r, hs)));
        assertFalse(ok);
        bytes4 sel = bytes4(ret);
        assertTrue(sel == NectarVaultBase.WrongSigner.selector || sel == NectarVaultBase.InvalidSignature.selector);
    }

    function test_invalidV_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        uint8[3] memory bad = [v - 27, 29, 0];
        for (uint256 i; i < bad.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.InvalidV.selector, bad[i]));
            vault.settle(m, bad[i], r, s);
        }
    }

    function test_sOutOfRange_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r,) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(NectarVaultBase.InvalidSignature.selector);
        vault.settle(m, v, r, bytes32(0));
        vm.expectRevert(NectarVaultBase.InvalidSignature.selector);
        vault.settle(m, v, r, bytes32(N));
    }

    function test_rOutOfRange_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v,, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(NectarVaultBase.InvalidSignature.selector);
        vault.settle(m, v, bytes32(0), s);
        vm.expectRevert(NectarVaultBase.InvalidSignature.selector);
        vault.settle(m, v, bytes32(type(uint256).max), s);
    }

    function test_unrecoverableSignature_reverts() public {
        // r = 5 is not the x-coordinate of a curve point (x^3 + 7 = 132 is a non-residue mod p) → ecrecover returns 0
        NectarVaultBase.Settle memory m = _defaultSettle();
        vm.expectRevert(NectarVaultBase.InvalidSignature.selector);
        vault.settle(m, 27, bytes32(uint256(5)), bytes32(uint256(1)));
    }

    // ===================================================== lifecycle closure

    function test_doubleRelease_sameSignature_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vault.release(m, v, r, s);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NonceUsed.selector, 9));
        vault.release(m, v, r, s);
    }

    function test_doubleRelease_freshNonce_reverts() public {
        _doRelease(_release(POS, alice, 9, T0 + 600));
        NectarVaultBase.Release memory m = _release(POS, alice, 10, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotOpen.selector, POS, NectarVaultBase.Status.Released));
        vault.release(m, v, r, s);
    }

    function test_settleAfterRelease_reverts() public {
        _doRelease(_release(POS, alice, 9, T0 + 600));
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotOpen.selector, POS, NectarVaultBase.Status.Released));
        vault.settle(m, v, r, s);
    }

    function test_releaseAfterSettle_reverts() public {
        _doSettle(_defaultSettle());
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotOpen.selector, POS, NectarVaultBase.Status.Settled));
        vault.release(m, v, r, s);
    }

    function test_settle_unknownPosition_reverts() public {
        NectarVaultBase.Settle memory m = _settle(99, 1, buyer, 1, T0 + 600, 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotOpen.selector, 99, NectarVaultBase.Status.None));
        vault.settle(m, v, r, s);
    }

    // ===================================================== typed-field sanity

    function test_settle_badKind_reverts() public {
        uint8[2] memory kinds = [0, 3];
        for (uint256 i; i < kinds.length; ++i) {
            NectarVaultBase.Settle memory m = _settle(POS, 1, buyer, 1, T0 + 600, kinds[i]);
            (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
            vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.BadKind.selector, kinds[i]));
            vault.settle(m, v, r, s);
        }
    }

    function test_settle_seizeExceedsAmount_reverts() public {
        NectarVaultBase.Settle memory m = _settle(POS, AMOUNT + 1, buyer, 1, T0 + 600, 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.SeizeExceedsAmount.selector, AMOUNT + 1, AMOUNT));
        vault.settle(m, v, r, s);
    }

    function test_settle_zeroRecipient_reverts() public {
        NectarVaultBase.Settle memory m = _settle(POS, 1, address(0), 1, T0 + 600, 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(NectarVaultBase.ZeroAddress.selector);
        vault.settle(m, v, r, s);
    }

    function test_release_zeroRecipient_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, address(0), 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(NectarVaultBase.ZeroAddress.selector);
        vault.release(m, v, r, s);
    }

    function testFuzz_settle_splitConservesUnits(uint256 seize) public {
        seize = bound(seize, 0, AMOUNT);
        _doSettle(_settle(POS, seize, buyer, 1, T0 + 600, 1));
        assertEq(token.balanceOf(buyer), seize);
        assertEq(token.balanceOf(alice), 9 * AMOUNT + (AMOUNT - seize));
        assertEq(token.balanceOf(address(vault)), 0);
    }
}
