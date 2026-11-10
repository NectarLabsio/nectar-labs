// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/console2.sol";
import {NectarScript} from "./Base.s.sol";
import {MockB20} from "../src/MockB20.sol";
import {PolicyRegistryMock} from "../src/PolicyRegistryMock.sol";

/// @notice Deploys PolicyRegistryMock + MockB20 (mock NVDAx, 6 decimals) and mints to the deployer.
///         Fallback collateral when real B20 is not used (PRD §9B). NOT RUN by WO-27.
/// @dev forge script script/DeployMock.s.sol --rpc-url <84532> --account <keystore> --sender <addr> [--broadcast]
///      (only via scripts/26-deploy-base.sh). Env (all optional): MOCK_NAME, MOCK_SYMBOL, MOCK_DECIMALS,
///      MOCK_MINT_RAW. Receiver policy stays 0 = ALWAYS_ALLOW unless MOCK_ALLOWLIST_ID is set, in which case
///      the deployer is allowlisted under it and the receiver slot points at it (vault added by DeployVault).
contract DeployMock is NectarScript {
    function run() external onlyBaseSepolia returns (PolicyRegistryMock registry, MockB20 token) {
        string memory name = vm.envOr("MOCK_NAME", string("Mock NVDAx (Nectar testnet)"));
        string memory symbol = vm.envOr("MOCK_SYMBOL", string("NVDAx"));
        uint8 decimals = uint8(vm.envOr("MOCK_DECIMALS", uint256(6)));
        uint256 mintRaw = vm.envOr("MOCK_MINT_RAW", uint256(1_000_000 * 1e6));
        uint64 allowlistId = uint64(vm.envOr("MOCK_ALLOWLIST_ID", uint256(0)));

        vm.startBroadcast();
        address deployer = msg.sender;
        registry = new PolicyRegistryMock();
        token = new MockB20(name, symbol, decimals, address(registry));
        if (allowlistId != 0) {
            registry.allow(allowlistId, deployer);
            token.updatePolicy(token.TRANSFER_RECEIVER_POLICY(), allowlistId);
        }
        token.mint(deployer, mintRaw);
        vm.stopBroadcast();

        console2.log("PolicyRegistryMock", address(registry));
        console2.log("MockB20", address(token));
        console2.log("receiver policyId", uint256(allowlistId));
    }
}
