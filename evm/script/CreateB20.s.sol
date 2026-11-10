// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/console2.sol";
import {NectarScript} from "./Base.s.sol";

/// @dev Subset of base-std v1.0.0 (tag @4658f1b) interfaces, re-declared here so evm/ has no base-std dependency.
///      IB20Factory.sol:18-51,157 (F-347); IPolicyRegistry.sol:17-20,97; IB20.sol:384,451,547; B20Constants.sol.
interface IB20Factory {
    enum B20Variant {
        ASSET,
        STABLECOIN
    }

    struct B20AssetCreateParams {
        uint8 version;
        string name;
        string symbol;
        address initialAdmin;
        uint8 decimals;
    }

    function createB20(B20Variant variant, bytes32 salt, bytes calldata params, bytes[] calldata initCalls)
        external
        payable
        returns (address token);
}

interface IB20PolicyRegistry {
    enum PolicyType {
        BLOCKLIST,
        ALLOWLIST
    }

    function createPolicyWithAccounts(address admin, PolicyType policyType, address[] calldata accounts)
        external
        returns (uint64 newPolicyId);
}

interface IB20Admin {
    function updatePolicy(bytes32 policyScope, uint64 newPolicyId) external;
    function grantRole(bytes32 role, address account) external;
    function mint(address to, uint256 amount) external;
}

/// @notice Creates a real B20 ASSET token through the B20Factory precompile with explicit policies
///         (PRD §9B: defaults are allow-all; Nectar sets them). NOT RUN by WO-27; G12 runs it.
///         1. `createPolicyWithAccounts(deployer, ALLOWLIST, [deployer, ...DEMO_ACCOUNTS])` → policyId.
///         2. `createB20(ASSET, salt, abi.encode(B20AssetCreateParams{1, name, symbol, deployer, decimals}), initCalls)`
///            where initCalls (run inside the factory bootstrap window) point TRANSFER_SENDER / RECEIVER /
///            EXECUTOR and MINT_RECEIVER at policyId, grant OPERATOR_ROLE (updateMultiplier) to the deployer,
///            and mint B20_MINT_RAW to the deployer.
///         The vault is allowlisted afterwards by DeployVault (POLICY_ID = the id printed here).
/// @dev forge script script/CreateB20.s.sol --rpc-url <84532> --account <keystore> --sender <addr> [--broadcast]
///      (only via scripts/26-deploy-base.sh). Env (optional): B20_NAME, B20_SYMBOL, B20_DECIMALS (6–18),
///      B20_SALT (bytes32), B20_MINT_RAW, DEMO_ACCOUNTS (comma-separated addresses).
contract CreateB20 is NectarScript {
    IB20Factory internal constant FACTORY = IB20Factory(0xB20f000000000000000000000000000000000000);
    IB20PolicyRegistry internal constant REGISTRY = IB20PolicyRegistry(0x8453000000000000000000000000000000000002);

    bytes32 internal constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 internal constant TRANSFER_SENDER_POLICY = keccak256("TRANSFER_SENDER_POLICY");
    bytes32 internal constant TRANSFER_RECEIVER_POLICY = keccak256("TRANSFER_RECEIVER_POLICY");
    bytes32 internal constant TRANSFER_EXECUTOR_POLICY = keccak256("TRANSFER_EXECUTOR_POLICY");
    bytes32 internal constant MINT_RECEIVER_POLICY = keccak256("MINT_RECEIVER_POLICY");

    function run() external onlyBaseSepolia returns (address token, uint64 policyId) {
        string memory name = vm.envOr("B20_NAME", string("Mock NVDAx (Nectar testnet)"));
        string memory symbol = vm.envOr("B20_SYMBOL", string("NVDAx"));
        uint8 decimals = uint8(vm.envOr("B20_DECIMALS", uint256(6)));
        bytes32 salt = vm.envOr("B20_SALT", keccak256("nectar-labs/nvdax/v1"));
        uint256 mintRaw = vm.envOr("B20_MINT_RAW", uint256(1_000_000 * 10 ** decimals));
        address[] memory demo = vm.envOr("DEMO_ACCOUNTS", ",", new address[](0));

        vm.startBroadcast();
        address deployer = msg.sender;

        address[] memory members = new address[](demo.length + 1);
        members[0] = deployer;
        for (uint256 i; i < demo.length; ++i) {
            members[i + 1] = demo[i];
        }
        policyId = REGISTRY.createPolicyWithAccounts(deployer, IB20PolicyRegistry.PolicyType.ALLOWLIST, members);

        bytes[] memory initCalls = new bytes[](6);
        initCalls[0] = abi.encodeCall(IB20Admin.updatePolicy, (TRANSFER_SENDER_POLICY, policyId));
        initCalls[1] = abi.encodeCall(IB20Admin.updatePolicy, (TRANSFER_RECEIVER_POLICY, policyId));
        initCalls[2] = abi.encodeCall(IB20Admin.updatePolicy, (TRANSFER_EXECUTOR_POLICY, policyId));
        initCalls[3] = abi.encodeCall(IB20Admin.updatePolicy, (MINT_RECEIVER_POLICY, policyId));
        initCalls[4] = abi.encodeCall(IB20Admin.grantRole, (OPERATOR_ROLE, deployer));
        initCalls[5] = abi.encodeCall(IB20Admin.mint, (deployer, mintRaw));

        bytes memory params = abi.encode(
            IB20Factory.B20AssetCreateParams({
                version: 1, name: name, symbol: symbol, initialAdmin: deployer, decimals: decimals
            })
        );
        token = FACTORY.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);
        vm.stopBroadcast();

        console2.log("B20 token", token);
        console2.log("allowlist policyId", uint256(policyId));
    }
}
