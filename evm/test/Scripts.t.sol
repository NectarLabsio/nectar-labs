// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployMock} from "../script/DeployMock.s.sol";
import {DeployVault} from "../script/DeployVault.s.sol";
import {NectarScript} from "../script/Base.s.sol";
import {CreateB20} from "../script/CreateB20.s.sol";
import {MockB20} from "../src/MockB20.sol";
import {PolicyRegistryMock} from "../src/PolicyRegistryMock.sol";
import {NectarVaultBase} from "../src/NectarVaultBase.sol";

/// @notice Runs the deploy scripts in the in-process test EVM only (no RPC, no keys, nothing sent).
contract ScriptsTest is Test {
    uint64 internal constant ALLOW_ID = (uint64(1) << 56) | 11;

    function test_scripts_refuseOtherChains() public {
        DeployMock s = new DeployMock();
        vm.chainId(8453);
        vm.expectRevert(abi.encodeWithSelector(NectarScript.WrongChain.selector, 8453));
        s.run();
    }

    function test_deployMockThenVault_allowlistsVault() public {
        vm.chainId(84532);
        vm.setEnv("MOCK_ALLOWLIST_ID", vm.toString(uint256(ALLOW_ID)));
        (PolicyRegistryMock registry, MockB20 token) = new DeployMock().run();
        assertEq(token.decimals(), 6);
        assertEq(token.policyId(token.TRANSFER_RECEIVER_POLICY()), ALLOW_ID);
        assertEq(token.totalSupply(), 1_000_000 * 1e6);

        vm.setEnv("TOKEN", vm.toString(address(token)));
        vm.setEnv("POLICY_REGISTRY", vm.toString(address(registry)));
        vm.setEnv("POLICY_ID", vm.toString(uint256(ALLOW_ID)));
        vm.setEnv("REGISTRY_IS_MOCK", "true");
        NectarVaultBase vault = new DeployVault().run();
        assertEq(address(vault.token()), address(token));
        assertEq(address(vault.policyRegistry()), address(registry));
        assertTrue(registry.isAuthorized(ALLOW_ID, address(vault)));
    }
}

interface IB20View {
    function balanceOf(address) external view returns (uint256);
    function policyId(bytes32) external view returns (uint64);
    function decimals() external view returns (uint8);
}

interface IRegistryView {
    function isAuthorized(uint64, address) external view returns (bool);
}

/// @notice Runs CreateB20 against Foundry's local B20 precompiles (`forge test --network base`, F-347:
///         "local Foundry v1.8.4+"; precompiles appear with `--network base --hardfork base:beryl`). Skipped when
///         the precompiles are absent (plain `forge test`) or a needed feature cannot be activated locally.
contract CreateB20ScriptTest is Test {
    address internal constant REGISTRY = 0x8453000000000000000000000000000000000002;

    function test_createB20_localPrecompiles() public {
        vm.chainId(84532);
        (bool ok, bytes memory ret) =
            REGISTRY.staticcall(abi.encodeCall(IRegistryView.isAuthorized, (uint64(0), address(this))));
        if (!ok || ret.length != 32) {
            vm.skip(true, "B20 precompiles absent: run `forge test --network base`");
        }
        _activateNeededFeatures();
        address demo = makeAddr("demo");
        vm.setEnv("DEMO_ACCOUNTS", vm.toString(demo));
        (address token, uint64 pid) = new CreateB20().run();
        assertTrue(token != address(0));
        assertEq(IB20View(token).decimals(), 6);
        assertEq(IB20View(token).policyId(keccak256("TRANSFER_RECEIVER_POLICY")), pid);
        assertTrue(IRegistryView(REGISTRY).isAuthorized(pid, demo));
        assertFalse(IRegistryView(REGISTRY).isAuthorized(pid, makeAddr("stranger")));
        emit log_named_address("B20 token (local precompile)", token);
        emit log_named_uint("allowlist policyId", pid);
    }

    /// @dev A fresh local EVM has B20 features deactivated (Base Sepolia has ASSET active, F-348).
    ///      Probe with throwaway calls; on `FeatureNotActivated(feature)` activate it as the registry admin.
    function _activateNeededFeatures() internal {
        bytes4 notActivated = bytes4(keccak256("FeatureNotActivated(bytes32)"));
        address[] memory none = new address[](0);
        bytes memory params = abi.encode(uint8(1), "probe", "PRB", address(this), uint8(6));
        bytes[2] memory probes = [
            abi.encodeWithSignature("createPolicyWithAccounts(address,uint8,address[])", address(this), uint8(1), none),
            abi.encodeWithSignature(
                "createB20(uint8,bytes32,bytes,bytes[])", uint8(0), keccak256("probe"), params, new bytes[](0)
            )
        ];
        address[2] memory targets = [REGISTRY, address(0xB20f000000000000000000000000000000000000)];
        for (uint256 round; round < 6; ++round) {
            bool progressed;
            for (uint256 i; i < 2; ++i) {
                uint256 snap = vm.snapshotState();
                (bool ok, bytes memory ret) = targets[i].call(probes[i]);
                vm.revertToState(snap);
                if (!ok && ret.length == 36 && bytes4(ret) == notActivated) {
                    bytes32 feature;
                    assembly {
                        feature := mload(add(ret, 36))
                    }
                    address admin = IActivation(ACTIVATION).admin();
                    if (admin == address(0)) {
                        // forge 1.9.0 local precompiles: no activation admin → cannot activate; G12 runs the
                        // script against Base Sepolia state (live or anvil fork) where ASSET is active (F-348)
                        vm.skip(true, "B20 feature inactive and no activation admin in the local EVM");
                    }
                    vm.prank(admin);
                    IActivation(ACTIVATION).activate(feature);
                    emit log_named_bytes32("activated feature", feature);
                    progressed = true;
                }
            }
            if (!progressed) return;
        }
    }

    address internal constant ACTIVATION = 0x8453000000000000000000000000000000000001;
}

interface IActivation {
    function admin() external view returns (address);
    function activate(bytes32 feature) external;
}
