// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VaultFixture} from "./VaultFixture.sol";
import {NectarVaultBaseV1} from "./legacy/NectarVaultBaseV1.sol";
import {NectarVaultBase} from "../src/NectarVaultBase.sol";
import {IB20Minimal} from "../src/interfaces/IB20Minimal.sol";

/// @dev Answers every call with fixed raw return data, whatever the selector.
contract ReturnStub {
    bytes internal _ret;

    constructor(bytes memory ret) {
        _ret = ret;
    }

    fallback(bytes calldata) external returns (bytes memory) {
        return _ret;
    }
}

/// @notice docs/work/security-review-v7.md, one pair per finding: `_v1_` runs the attack on the pre-fix vault and asserts
///         it works; `_v2_` runs the same attack on the current vault and asserts it fails.
contract SecurityV7Test is VaultFixture {
    uint256 internal constant ATT_PK = 0xBAD;
    uint64 internal constant ATT_POS = 900;

    /// @dev `createB20` result simulated on Base Sepolia (F-348). Nothing is deployed here, so it has no code.
    address internal constant B20_TOKEN = 0xb200000000000000000000D93cb9fdc504209d4a;

    NectarVaultBaseV1 internal v1;
    address internal attacker = makeAddr("attacker");
    address internal attKey;

    function setUp() public override {
        super.setUp();
        attKey = vm.addr(ATT_PK);
        v1 = new NectarVaultBaseV1(address(token), address(registry));
        registry.allow(ALLOW_ID, address(v1));
        registry.allow(ALLOW_ID, attacker);
        token.mint(attacker, 10 * AMOUNT);
        vm.startPrank(attacker);
        token.approve(address(vault), type(uint256).max);
        token.approve(address(v1), type(uint256).max);
        vm.stopPrank();
        vm.prank(alice);
        token.approve(address(v1), type(uint256).max);
    }

    // -------------------------------------------------------------- v1 helpers

    function _v1Settle(NectarVaultBase.Settle memory m, uint256 pk) internal {
        (uint8 v, bytes32 r, bytes32 s) = _sign(pk, _digest(_domain(84532, address(v1)), _settleStruct(m)));
        v1.settle(
            NectarVaultBaseV1.Settle({
                positionId: m.positionId,
                quoteId: m.quoteId,
                repayE6: m.repayE6,
                seizeRaw: m.seizeRaw,
                recipient: m.recipient,
                nonce: m.nonce,
                expires: m.expires,
                kind: m.kind
            }),
            v,
            r,
            s
        );
    }

    function _v1Release(NectarVaultBase.Release memory m, uint256 pk) internal {
        (uint8 v, bytes32 r, bytes32 s) = _sign(pk, _digest(_domain(84532, address(v1)), _releaseStruct(m)));
        v1.release(
            NectarVaultBaseV1.Release({
                positionId: m.positionId, recipient: m.recipient, nonce: m.nonce, expires: m.expires
            }),
            v,
            r,
            s
        );
    }

    // ==================================================================== SR-1

    function test_SR1_v1_nonceBurnLocksCollateral() public {
        vm.prank(alice);
        v1.openPosition(POS, authority, AMOUNT);

        // the attacker burns NEAR's next nonce (1) through a throwaway position under its own key
        vm.prank(attacker);
        v1.openPosition(ATT_POS, attKey, 1);
        _v1Release(_release(ATT_POS, attacker, 1, T0 + 600), ATT_PK);
        assertTrue(v1.nonceUsed(1));

        vm.expectRevert(abi.encodeWithSelector(NectarVaultBaseV1.NonceUsed.selector, 1));
        _v1Settle(_defaultSettle(), AUTH_PK);
        assertEq(token.balanceOf(address(v1)), AMOUNT, "collateral stays locked");
    }

    function test_SR1_v2_nonceBurnedElsewhereDoesNotBlockSlot() public {
        vm.prank(attacker);
        vault.openPosition(ATT_POS, attKey, 1);
        NectarVaultBase.Release memory burn = _release(ATT_POS, attacker, 1, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(ATT_PK, _releaseDigest(burn, 84532));
        vault.release(burn, attacker, v, r, s);

        assertTrue(vault.nonceUsed(_key(ATT_POS, attacker), 1));
        assertFalse(vault.nonceUsed(_key(POS, alice), 1));
        _doSettle(_defaultSettle());
        assertEq(token.balanceOf(buyer), 40_000_000);
    }

    /// @dev The interface-v7 §E amendment: authority-scoped nonces would fall to this, because NEAR's authority is public.
    function test_SR1_v2_sameIdSameAuthorityRelayDoesNotBurnHonestNonce() public {
        vm.prank(attacker);
        vault.openPosition(POS, authority, AMOUNT);

        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vault.settle(m, attacker, v, r, s); // lands on the attacker's own deposit
        assertTrue(vault.nonceUsed(_key(POS, attacker), 1));
        assertFalse(vault.nonceUsed(_key(POS, alice), 1));
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Open));

        vault.settle(m, alice, v, r, s); // the same signature still settles the honest slot
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Settled));
        assertEq(token.balanceOf(alice), 9 * AMOUNT + 60_000_000);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_SR1_v2_nonceStillSingleUseWithinSlot() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vault.release(m, alice, v, r, s);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NonceUsed.selector, 9));
        vault.release(m, alice, v, r, s);
    }

    // ==================================================================== SR-8

    function test_SR8_v1_squatterBlocksDeposit() public {
        vm.prank(attacker);
        v1.openPosition(POS, attKey, 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBaseV1.PositionExists.selector, POS));
        v1.openPosition(POS, authority, AMOUNT);
    }

    function test_SR8_v2_squatterDoesNotBlockDeposit() public {
        uint64 id = 8;
        vm.prank(attacker);
        vault.openPosition(id, attKey, 1);

        vm.prank(alice);
        vault.openPosition(id, authority, AMOUNT);

        (address a, address d, uint256 amt, NectarVaultBase.Status st) = vault.positionOf(id, alice);
        assertEq(a, authority);
        assertEq(d, alice);
        assertEq(amt, AMOUNT);
        assertEq(uint8(st), uint8(NectarVaultBase.Status.Open));
        (a, d, amt, st) = vault.positionOf(id, attacker);
        assertEq(a, attKey);
        assertEq(d, attacker);
        assertEq(amt, 1);
    }

    function test_SR8_v2_unknownSlotReadsEmpty() public view {
        (address a, address d, uint256 amt, NectarVaultBase.Status st) = vault.positionOf(POS, buyer);
        assertEq(a, address(0));
        assertEq(d, address(0));
        assertEq(amt, 0);
        assertEq(uint8(st), uint8(NectarVaultBase.Status.None));
    }

    function test_SR8_v2_squatterKeyCannotMoveHonestSlot() public {
        NectarVaultBase.Release memory m = _release(POS, attacker, 1, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(ATT_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.WrongSigner.selector, attKey, authority));
        vault.release(m, alice, v, r, s);
    }

    function test_SR8_v2_honestSignatureRefusedOnSquatterKeySlot() public {
        vm.prank(attacker);
        vault.openPosition(POS, attKey, AMOUNT);
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.WrongSigner.selector, authority, attKey));
        vault.settle(m, attacker, v, r, s);
    }

    function test_SR8_v2_settleOnSlotNobodyOpened_reverts() public {
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.NotOpen.selector, POS, NectarVaultBase.Status.None));
        vault.settle(m, buyer, v, r, s);
    }

    function test_SR8_v2_seizeBoundedByThatSlotsDeposit() public {
        vm.prank(attacker);
        vault.openPosition(POS, authority, 1);
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.SeizeExceedsAmount.selector, m.seizeRaw, 1));
        vault.settle(m, attacker, v, r, s);
        assertEq(token.balanceOf(address(vault)), AMOUNT + 1);
    }

    function test_SR8_v2_closedSlotCannotReopenButOtherDepositorCan() public {
        _doRelease(_release(POS, alice, 9, T0 + 600));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.PositionExists.selector, POS));
        vault.openPosition(POS, authority, 1);
        vm.prank(attacker);
        vault.openPosition(POS, attKey, 1);
    }

    // =================================================================== SR-30

    function test_SR30_v1_acceptsAtExactExpiry() public {
        vm.prank(alice);
        v1.openPosition(POS, authority, AMOUNT);
        _v1Release(_release(POS, alice, 9, T0), AUTH_PK);
        assertEq(token.balanceOf(address(v1)), 0);
    }

    function test_SR30_v2_settleAtExactExpiry_reverts() public {
        NectarVaultBase.Settle memory m = _settle(POS, 1, buyer, 4, T0, 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.Expired.selector, T0, T0));
        vault.settle(m, alice, v, r, s);
    }

    function test_SR30_v2_releaseAtExactExpiry_reverts() public {
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.Expired.selector, T0, T0));
        vault.release(m, alice, v, r, s);
    }

    function test_SR30_v2_releaseOneSecondBeforeExpiry_ok() public {
        _doRelease(_release(POS, alice, 9, T0 + 1));
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Released));
    }

    // ========================================================== phantom deposit

    function test_phantom_v1_noCodeTokenCreditsDepositWithNoTransfer() public {
        address ghost = makeAddr("ghost");
        assertEq(ghost.code.length, 0);
        NectarVaultBaseV1 bad = new NectarVaultBaseV1(ghost, address(registry));
        vm.prank(attacker);
        bad.openPosition(POS, attKey, AMOUNT);
        (,, uint256 amt, NectarVaultBaseV1.Status st) = bad.positions(POS);
        assertEq(amt, AMOUNT, "credited although nothing moved");
        assertEq(uint8(st), uint8(NectarVaultBaseV1.Status.Open));
    }

    function test_phantom_v2_noCodeToken_constructorReverts() public {
        address ghost = makeAddr("ghost");
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.TokenHasNoCode.selector, ghost));
        new NectarVaultBase(ghost, address(registry));
    }

    function testFuzz_phantom_v2_noCodeOutsideB20Prefix_reverts(address a) public {
        vm.assume(a != address(0) && a.code.length == 0);
        vm.assume(bytes10(bytes20(a)) != bytes10(0xb2000000000000000000));
        vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.TokenHasNoCode.selector, a));
        new NectarVaultBase(a, address(registry));
    }

    function test_phantom_v2_nearMissPrefixes_revert() public {
        address[3] memory near = [
            address(bytes20(hex"b300000000000000000000d93cb9fdc504209d4a")), // first byte
            address(bytes20(hex"b200000000000000000100d93cb9fdc504209d4a")), // tenth byte
            address(bytes20(hex"00b2000000000000000000d93cb9fdc504209d4a")) // shifted
        ];
        for (uint256 i; i < near.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(NectarVaultBase.TokenHasNoCode.selector, near[i]));
            new NectarVaultBase(near[i], address(registry));
        }
    }

    function test_phantom_v2_uncreatedB20Address_depositRefused() public {
        assertEq(B20_TOKEN.code.length, 0);
        NectarVaultBase b20Vault = new NectarVaultBase(B20_TOKEN, address(registry));
        vm.prank(alice);
        (bool ok,) = address(b20Vault).call(abi.encodeCall(NectarVaultBase.openPosition, (POS, authority, AMOUNT)));
        assertFalse(ok, "an empty account must not credit a deposit");
        (,,, NectarVaultBase.Status st) = b20Vault.positionOf(POS, alice);
        assertEq(uint8(st), uint8(NectarVaultBase.Status.None));
    }

    /// @dev vm.mockCall gives the account a 1-byte stub, so the vault is deployed first, while the address has no code.
    function test_phantom_v2_b20NoCodeToken_fullLifecycle() public {
        assertEq(B20_TOKEN.code.length, 0);
        NectarVaultBase b20Vault = new NectarVaultBase(B20_TOKEN, address(registry));
        bytes32 scope = keccak256("TRANSFER_RECEIVER_POLICY");

        bytes memory pull = abi.encodeCall(IB20Minimal.transferFrom, (alice, address(b20Vault), AMOUNT));
        bytes memory seize = abi.encodeCall(IB20Minimal.transfer, (buyer, 40_000_000));
        bytes memory rest = abi.encodeCall(IB20Minimal.transfer, (alice, 60_000_000));
        vm.mockCall(B20_TOKEN, pull, abi.encode(true));
        vm.mockCall(B20_TOKEN, seize, abi.encode(true));
        vm.mockCall(B20_TOKEN, rest, abi.encode(true));
        vm.mockCall(B20_TOKEN, abi.encodeCall(IB20Minimal.TRANSFER_RECEIVER_POLICY, ()), abi.encode(scope));
        vm.mockCall(B20_TOKEN, abi.encodeCall(IB20Minimal.policyId, (scope)), abi.encode(ALLOW_ID));

        vm.expectCall(B20_TOKEN, pull);
        vm.prank(alice);
        b20Vault.openPosition(POS, authority, AMOUNT);

        NectarVaultBase.Settle memory m = _defaultSettle();
        bytes32 d = _digest(_domain(84532, address(b20Vault)), _settleStruct(m));
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, d);
        vm.expectCall(B20_TOKEN, seize);
        vm.expectCall(B20_TOKEN, rest);
        b20Vault.settle(m, alice, v, r, s);
        (,,, NectarVaultBase.Status st) = b20Vault.positionOf(POS, alice);
        assertEq(uint8(st), uint8(NectarVaultBase.Status.Settled));
    }

    function test_phantom_v2_tokenReturningNothing_depositRefused() public {
        ReturnStub stub = new ReturnStub("");
        NectarVaultBase stubVault = new NectarVaultBase(address(stub), address(registry));
        vm.expectRevert(NectarVaultBase.TransferFailed.selector);
        stubVault.openPosition(POS, authority, AMOUNT);
    }

    function test_phantom_v2_tokenReturningFalse_depositRefused() public {
        ReturnStub stub = new ReturnStub(abi.encode(false));
        NectarVaultBase stubVault = new NectarVaultBase(address(stub), address(registry));
        vm.expectRevert(NectarVaultBase.TransferFailed.selector);
        stubVault.openPosition(POS, authority, AMOUNT);
    }

    function test_phantom_v2_tokenReturningTwoWords_depositRefused() public {
        ReturnStub stub = new ReturnStub(abi.encode(true, true));
        NectarVaultBase stubVault = new NectarVaultBase(address(stub), address(registry));
        vm.expectRevert(NectarVaultBase.TransferFailed.selector);
        stubVault.openPosition(POS, authority, AMOUNT);
    }

    function test_phantom_v2_tokenReturningNonBool_depositRefused() public {
        ReturnStub stub = new ReturnStub(abi.encode(uint256(2)));
        NectarVaultBase stubVault = new NectarVaultBase(address(stub), address(registry));
        vm.expectRevert();
        stubVault.openPosition(POS, authority, AMOUNT);
    }

    function test_phantom_v2_payoutReturningFalse_revertsAndKeepsSlotOpen() public {
        vm.mockCall(address(token), abi.encodeWithSelector(IB20Minimal.transfer.selector), abi.encode(false));
        NectarVaultBase.Release memory m = _release(POS, alice, 9, T0 + 600);
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _releaseDigest(m, 84532));
        vm.expectRevert(NectarVaultBase.TransferFailed.selector);
        vault.release(m, alice, v, r, s);
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Open));
        assertFalse(vault.nonceUsed(_key(POS, alice), 9));
    }

    function test_phantom_v2_payoutReturningNothing_revertsAndKeepsSlotOpen() public {
        vm.mockCall(address(token), abi.encodeWithSelector(IB20Minimal.transfer.selector), "");
        NectarVaultBase.Settle memory m = _defaultSettle();
        (uint8 v, bytes32 r, bytes32 s) = _sign(AUTH_PK, _settleDigest(m, 84532));
        vm.expectRevert(NectarVaultBase.TransferFailed.selector);
        vault.settle(m, alice, v, r, s);
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Open));
        assertFalse(vault.nonceUsed(_key(POS, alice), 1));
    }

    // ============================================================ keeper contract

    /// @dev Literal from `cast abi-encode "f(uint64,address)" 7 <addr> | cast keccak`, the encoding of keeper `slotKeyOf`.
    function test_slotKey_matchesKeeperEncoding() public view {
        address depositor = 0xbcb6eAB973570cB1e5C16195696b8BdDb4c7D8f7;
        bytes32 expected = 0xc06f05e09022340af25113ece1d57e369c2e698a67f568f607c566606859ddbd;
        assertEq(vault.slotKeyOf(7, depositor), expected);
        assertEq(_key(7, depositor), expected);
    }

    /// @dev Pins the selectors and topics of services/keeper/src/base.ts VAULT_ABI.
    function test_abi_matchesKeeper() public view {
        string memory settleTuple = "(uint64,uint64,uint256,uint256,address,uint64,uint64,uint8)";
        string memory releaseTuple = "(uint64,address,uint64,uint64)";
        assertEq(
            NectarVaultBase.settle.selector,
            bytes4(keccak256(bytes(string.concat("settle(", settleTuple, ",address,uint8,bytes32,bytes32)"))))
        );
        assertEq(
            NectarVaultBase.release.selector,
            bytes4(keccak256(bytes(string.concat("release(", releaseTuple, ",address,uint8,bytes32,bytes32)"))))
        );
        assertEq(NectarVaultBase.positionOf.selector, bytes4(keccak256("positionOf(uint64,address)")));
        assertEq(vault.nonceUsed.selector, bytes4(keccak256("nonceUsed(bytes32,uint64)")));
        assertEq(NectarVaultBase.PositionOpened.selector, keccak256("PositionOpened(uint64,address,address,uint256)"));
        assertEq(
            NectarVaultBase.PositionSettled.selector,
            keccak256("PositionSettled(uint64,uint64,address,uint256,uint256,uint256,uint64,uint8)")
        );
        assertEq(
            NectarVaultBase.PositionReleased.selector, keccak256("PositionReleased(uint64,address,uint256,uint64)")
        );
    }
}

interface IB20FactoryView {
    function isB20(address token) external view returns (bool);
    function getB20Address(uint8 variant, address sender, bytes32 salt) external view returns (address);
}

/// @notice Runs against Foundry's local B20 precompiles (`forge test --network base --hardfork base:beryl`, F-347).
///         Skipped when they are absent (plain `forge test`).
contract B20PrecompileParityTest is VaultFixture {
    address internal constant FACTORY = 0xB20f000000000000000000000000000000000000;
    address internal constant REGISTRY = 0x8453000000000000000000000000000000000002;

    function _requirePrecompiles() internal {
        (bool ok, bytes memory ret) = FACTORY.staticcall(abi.encodeCall(IB20FactoryView.isB20, (address(0))));
        if (!ok || ret.length != 32) vm.skip(true, "B20 precompiles absent: run `forge test --network base`");
    }

    function _accepted(address a) internal returns (bool) {
        try new NectarVaultBase(a, address(registry)) {
            return true;
        } catch {
            return false;
        }
    }

    /// @dev The vault's hard-coded prefix must agree with the factory's own `isB20`, on both sides of the boundary.
    function test_b20Prefix_agreesWithFactory() public {
        _requirePrecompiles();
        IB20FactoryView factory = IB20FactoryView(FACTORY);
        address[6] memory candidates = [
            factory.getB20Address(0, alice, keccak256("asset")),
            factory.getB20Address(1, alice, keccak256("stablecoin")),
            address(bytes20(hex"b200000000000000000000d93cb9fdc504209d4a")),
            address(bytes20(hex"b300000000000000000000d93cb9fdc504209d4a")),
            address(bytes20(hex"b200000000000000000100d93cb9fdc504209d4a")),
            address(bytes20(hex"00b2000000000000000000d93cb9fdc504209d4a"))
        ];
        for (uint256 i; i < candidates.length; ++i) {
            assertEq(candidates[i].code.length, 0);
            assertEq(_accepted(candidates[i]), factory.isB20(candidates[i]));
        }
        assertTrue(factory.isB20(candidates[0]));
        assertTrue(factory.isB20(candidates[1]));
    }

    /// @dev The real registry precompile answers the vault's `isAuthorized` read through a full release.
    function test_registryPrecompile_answersVault() public {
        _requirePrecompiles();
        token.updatePolicy(token.TRANSFER_RECEIVER_POLICY(), 0); // ALWAYS_ALLOW (F-346)
        vault = new NectarVaultBase(address(token), REGISTRY);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.openPosition(POS, authority, AMOUNT);
        _doRelease(_release(POS, alice, 9, T0 + 600));
        assertEq(uint8(_status(POS)), uint8(NectarVaultBase.Status.Released));
    }
}
