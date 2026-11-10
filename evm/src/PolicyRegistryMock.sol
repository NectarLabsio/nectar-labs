// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title PolicyRegistryMock
/// @notice Stand-in for the B20 PolicyRegistry precompile (`0x8453…0002`, F-347) when real B20 is not used.
/// @dev Semantics follow F-346: `isAuthorized` never reverts; id 0 = ALWAYS_ALLOW;
///      `ALWAYS_BLOCK = (uint64(ALLOWLIST) << 56) | 1`; the policy type is the top byte of the id
///      (0 = BLOCKLIST, 1 = ALLOWLIST). An allowlist authorizes members only, a blocklist everyone except
///      members, so an unknown allowlist id → false and an unknown blocklist id → true. The owner edits
///      membership with `allow` / `deny` (testnet mock; the real registry has per-policy admins).
contract PolicyRegistryMock {
    uint8 public constant BLOCKLIST = 0;
    uint8 public constant ALLOWLIST = 1;
    uint64 public constant ALWAYS_ALLOW = 0;
    uint64 public constant ALWAYS_BLOCK = (uint64(ALLOWLIST) << 56) | 1;

    address public owner;
    mapping(uint64 => mapping(address => bool)) public isMember;

    event MembershipUpdated(uint64 indexed policyId, address indexed account, bool member);
    event OwnerUpdated(address indexed owner);

    error NotOwner();
    error ZeroOwner();
    error BuiltinPolicy(uint64 policyId);

    constructor() {
        owner = msg.sender;
        emit OwnerUpdated(msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function policyType(uint64 policyId) public pure returns (uint8) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8(policyId >> 56); // top byte of a uint64 always fits
    }

    function isAuthorized(uint64 policyId, address account) external view returns (bool) {
        if (policyId == ALWAYS_ALLOW) return true;
        if (policyId == ALWAYS_BLOCK) return false;
        bool member = isMember[policyId][account];
        return policyType(policyId) == ALLOWLIST ? member : !member;
    }

    /// @notice Make `account` authorized under `policyId` (allowlist: add; blocklist: remove).
    function allow(uint64 policyId, address account) external onlyOwner {
        _set(policyId, account, policyType(policyId) == ALLOWLIST);
    }

    /// @notice Make `account` unauthorized under `policyId` (allowlist: remove; blocklist: add).
    function deny(uint64 policyId, address account) external onlyOwner {
        _set(policyId, account, policyType(policyId) != ALLOWLIST);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroOwner();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function _set(uint64 policyId, address account, bool member) internal {
        if (policyId == ALWAYS_ALLOW || policyId == ALWAYS_BLOCK) revert BuiltinPolicy(policyId);
        isMember[policyId][account] = member;
        emit MembershipUpdated(policyId, account, member);
    }
}
