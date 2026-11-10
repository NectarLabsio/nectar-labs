// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockB20} from "../src/MockB20.sol";
import {PolicyRegistryMock} from "../src/PolicyRegistryMock.sol";

contract MocksTest is Test {
    PolicyRegistryMock internal registry;
    MockB20 internal token;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint64 internal constant ALLOW = (uint64(1) << 56) | 3;
    uint64 internal constant BLOCK = 4; // BLOCKLIST type byte 0

    function setUp() public {
        registry = new PolicyRegistryMock();
        token = new MockB20("Mock NVDAx", "NVDAx", 6, address(registry));
    }

    // ------------------------------------------------------------ registry

    function test_registry_builtins() public {
        assertTrue(registry.isAuthorized(0, alice));
        assertFalse(registry.isAuthorized(registry.ALWAYS_BLOCK(), alice));
        assertEq(registry.ALWAYS_BLOCK(), (uint64(1) << 56) | 1);
        vm.expectRevert(abi.encodeWithSelector(PolicyRegistryMock.BuiltinPolicy.selector, 0));
        registry.deny(0, alice);
        uint64 alwaysBlock = registry.ALWAYS_BLOCK();
        vm.expectRevert(abi.encodeWithSelector(PolicyRegistryMock.BuiltinPolicy.selector, alwaysBlock));
        registry.allow(alwaysBlock, alice);
    }

    function test_registry_unknownIds() public view {
        assertFalse(registry.isAuthorized(ALLOW, alice)); // unknown allowlist → false
        assertTrue(registry.isAuthorized(BLOCK, alice)); // unknown blocklist → true
    }

    function test_registry_allowDeny() public {
        registry.allow(ALLOW, alice);
        assertTrue(registry.isAuthorized(ALLOW, alice));
        registry.deny(ALLOW, alice);
        assertFalse(registry.isAuthorized(ALLOW, alice));
        registry.deny(BLOCK, bob);
        assertFalse(registry.isAuthorized(BLOCK, bob));
        registry.allow(BLOCK, bob);
        assertTrue(registry.isAuthorized(BLOCK, bob));
    }

    function test_registry_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(PolicyRegistryMock.NotOwner.selector);
        registry.allow(ALLOW, alice);
        vm.expectRevert(PolicyRegistryMock.ZeroOwner.selector);
        registry.transferOwnership(address(0));
        registry.transferOwnership(alice);
        assertEq(registry.owner(), alice);
    }

    // ---------------------------------------------------------- multiplier

    function test_multiplier_defaultsToWad() public view {
        assertEq(token.multiplier(), 1e18);
        assertEq(token.WAD_PRECISION(), 1e18);
        assertEq(token.decimals(), 6);
    }

    function test_multiplier_scalesWithoutTouchingRaw() public {
        token.mint(alice, 1_000_000);
        token.updateMultiplier(1.02e18); // dividend reinvested as M (F-345)
        assertEq(token.balanceOf(alice), 1_000_000);
        assertEq(token.scaledBalanceOf(alice), 1_020_000);
        assertEq(token.toScaledBalance(500_000), 510_000);
        assertEq(token.toRawBalance(510_000), 500_000);
    }

    function test_multiplier_onlyOwnerAndNonZero() public {
        vm.prank(alice);
        vm.expectRevert(MockB20.NotOwner.selector);
        token.updateMultiplier(2e18);
        vm.expectRevert(MockB20.ZeroMultiplier.selector);
        token.updateMultiplier(0);
        vm.expectEmit(address(token));
        emit MockB20.MultiplierUpdated(1e18, 2e18);
        token.updateMultiplier(2e18);
    }

    // ------------------------------------------------------------ policies

    function test_policy_defaultZeroAndScopeCheck() public {
        assertEq(token.policyId(token.TRANSFER_RECEIVER_POLICY()), 0);
        vm.expectRevert(abi.encodeWithSelector(MockB20.UnsupportedPolicyType.selector, bytes32("x")));
        token.policyId(bytes32("x"));
        bytes32 scope = token.TRANSFER_RECEIVER_POLICY();
        vm.prank(alice);
        vm.expectRevert(MockB20.NotOwner.selector);
        token.updatePolicy(scope, ALLOW);
    }

    function test_transfer_enforcesReceiverPolicy() public {
        token.mint(alice, 10);
        token.updatePolicy(token.TRANSFER_RECEIVER_POLICY(), ALLOW);
        bytes32 scope = token.TRANSFER_RECEIVER_POLICY();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockB20.PolicyForbids.selector, scope, bob));
        token.transfer(bob, 1);
        registry.allow(ALLOW, bob);
        vm.prank(alice);
        token.transfer(bob, 1);
        assertEq(token.balanceOf(bob), 1);
    }

    function test_transferFrom_enforcesExecutorPolicy() public {
        token.mint(alice, 10);
        vm.prank(alice);
        token.approve(bob, 5);
        token.updatePolicy(token.TRANSFER_EXECUTOR_POLICY(), ALLOW);
        bytes32 scope = token.TRANSFER_EXECUTOR_POLICY();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MockB20.PolicyForbids.selector, scope, bob));
        token.transferFrom(alice, bob, 5);
        registry.allow(ALLOW, bob);
        vm.prank(bob);
        token.transferFrom(alice, bob, 5);
        assertEq(token.allowance(alice, bob), 0);
    }

    function test_mint_enforcesMintReceiverPolicy() public {
        token.updatePolicy(token.MINT_RECEIVER_POLICY(), ALLOW);
        bytes32 scope = token.MINT_RECEIVER_POLICY();
        vm.expectRevert(abi.encodeWithSelector(MockB20.PolicyForbids.selector, scope, alice));
        token.mint(alice, 1);
        vm.prank(alice);
        vm.expectRevert(MockB20.NotOwner.selector);
        token.mint(alice, 1);
    }

    function test_balanceAndAllowanceErrors() public {
        token.mint(alice, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockB20.InsufficientBalance.selector, 1, 2));
        token.transfer(bob, 2);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MockB20.InsufficientAllowance.selector, 0, 1));
        token.transferFrom(alice, bob, 1);
    }
}
