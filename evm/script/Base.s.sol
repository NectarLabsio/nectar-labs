// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

/// @notice Shared guard for every evm/ script. NOT RUN by WO-27.
/// @dev Broadcasts happen only through scripts/26-deploy-base.sh, which passes a Foundry keystore account
///      (`--account <name>` from ~/.nectar/evm) and `--sender`; no script reads a private key or a
///      PRIVATE_KEY env var, and `--private-key` is never used. Chain must be 84532: Base Sepolia, or the
///      disclosed anvil fork of it (D-026). Base mainnet (8453) is refused here and by the Bash hook.
abstract contract NectarScript is Script {
    uint256 internal constant BASE_SEPOLIA = 84532;

    error WrongChain(uint256 chainId);

    modifier onlyBaseSepolia() {
        if (block.chainid != BASE_SEPOLIA) revert WrongChain(block.chainid);
        _;
    }
}
