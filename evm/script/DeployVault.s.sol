// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/console2.sol";
import {NectarScript} from "./Base.s.sol";
import {NectarVaultBase} from "../src/NectarVaultBase.sol";

/// @notice B20 PolicyRegistry admin call used to allowlist the vault on a real B20 (base-std v1.0.0
///         IPolicyRegistry.sol:143).
interface IPolicyRegistryAdmin {
    function updateAllowlist(uint64 policyId, bool allowed, address[] calldata accounts) external;
}

/// @notice Mock registry admin call (PolicyRegistryMock).
interface IPolicyRegistryMockAdmin {
    function allow(uint64 policyId, address account) external;
}

/// @notice Deploys NectarVaultBase for TOKEN and, if POLICY_ID is set, authorizes the vault under it
///         (PRD §9B: the vault must be authorized as sender, receiver and executor). NOT RUN by WO-27.
/// @dev forge script script/DeployVault.s.sol --rpc-url <84532> --account <keystore> --sender <addr> [--broadcast]
///      (only via scripts/26-deploy-base.sh). Env: TOKEN (required); POLICY_REGISTRY (default: B20 registry
///      precompile 0x8453…0002, F-347); POLICY_ID (optional allowlist id, deployer must be its admin);
///      REGISTRY_IS_MOCK=true when the registry is PolicyRegistryMock.
contract DeployVault is NectarScript {
    address internal constant B20_POLICY_REGISTRY = 0x8453000000000000000000000000000000000002;

    function run() external onlyBaseSepolia returns (NectarVaultBase vault) {
        address token = vm.envAddress("TOKEN");
        address registry = vm.envOr("POLICY_REGISTRY", B20_POLICY_REGISTRY);
        uint64 policyId = uint64(vm.envOr("POLICY_ID", uint256(0)));
        bool isMock = vm.envOr("REGISTRY_IS_MOCK", false);

        vm.startBroadcast();
        vault = new NectarVaultBase(token, registry);
        if (policyId != 0) {
            if (isMock) {
                IPolicyRegistryMockAdmin(registry).allow(policyId, address(vault));
            } else {
                address[] memory accounts = new address[](1);
                accounts[0] = address(vault);
                IPolicyRegistryAdmin(registry).updateAllowlist(policyId, true, accounts);
            }
        }
        vm.stopBroadcast();

        console2.log("NectarVaultBase", address(vault));
        console2.logBytes32(vault.domainSeparator());
    }
}
