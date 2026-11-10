// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The ERC-20 and B20 policy functions NectarVaultBase calls.
/// @dev B20 signatures from base-std v1.0.0 src/interfaces/IB20.sol (`TRANSFER_RECEIVER_POLICY()` l.232,
///      `policyId(bytes32)` l.536: returns 0 = ALWAYS_ALLOW for a never-assigned slot).
interface IB20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);

    function TRANSFER_RECEIVER_POLICY() external view returns (bytes32);
    function policyId(bytes32 policyScope) external view returns (uint64);
}

/// @notice B20 PolicyRegistry read function (F-346): never reverts.
interface IPolicyRegistry {
    function isAuthorized(uint64 policyId, address account) external view returns (bool);
}
