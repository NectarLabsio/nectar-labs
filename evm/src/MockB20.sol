// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPolicyRegistry} from "./interfaces/IB20Minimal.sol";

/// @title MockB20
/// @notice Testnet stand-in for a B20 ASSET token (mock collateral, e.g. mock NVDAx). ERC-20 plus the Beryl
///         multiplier surface (F-345, D-021: `multiplier()`, `scaledBalanceOf`, `toScaledBalance`,
///         `toRawBalance`, `updateMultiplier`, `WAD_PRECISION()`) and the transfer policy slots
///         (`TRANSFER_*_POLICY()`, `policyId(scope)`, `updatePolicy`) checked against a PolicyRegistry,
///         like a real B20 (base-std v1.0.0 IB20.sol). Raw balances never change with the multiplier.
/// @dev Owner-gated admin (stands in for DEFAULT_ADMIN_ROLE / MINT_ROLE / OPERATOR_ROLE).
contract MockB20 {
    uint256 public constant WAD = 1e18;

    bytes32 public constant TRANSFER_SENDER_POLICY = keccak256("TRANSFER_SENDER_POLICY");
    bytes32 public constant TRANSFER_RECEIVER_POLICY = keccak256("TRANSFER_RECEIVER_POLICY");
    bytes32 public constant TRANSFER_EXECUTOR_POLICY = keccak256("TRANSFER_EXECUTOR_POLICY");
    bytes32 public constant MINT_RECEIVER_POLICY = keccak256("MINT_RECEIVER_POLICY");

    string public name;
    string public symbol;
    uint8 public immutable decimals;
    IPolicyRegistry public immutable policyRegistry;

    address public owner;
    uint256 public totalSupply;
    uint256 public multiplier = WAD;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => uint64) internal _policyIds;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier);
    event PolicyUpdated(bytes32 indexed policyScope, uint64 oldPolicyId, uint64 newPolicyId);
    event OwnerUpdated(address indexed owner);

    error NotOwner();
    error ZeroOwner();
    error ZeroMultiplier();
    error UnsupportedPolicyType(bytes32 policyScope);
    error PolicyForbids(bytes32 policyScope, address account);
    error InsufficientBalance(uint256 balance, uint256 needed);
    error InsufficientAllowance(uint256 allowance, uint256 needed);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address policyRegistry_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        policyRegistry = IPolicyRegistry(policyRegistry_);
        owner = msg.sender;
        emit OwnerUpdated(msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------- ERC-20

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _check(TRANSFER_SENDER_POLICY, msg.sender);
        _check(TRANSFER_RECEIVER_POLICY, to);
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _check(TRANSFER_SENDER_POLICY, from);
        _check(TRANSFER_RECEIVER_POLICY, to);
        if (msg.sender != from) _check(TRANSFER_EXECUTOR_POLICY, msg.sender);
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < amount) revert InsufficientAllowance(a, amount);
            allowance[from][msg.sender] = a - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _check(MINT_RECEIVER_POLICY, to);
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    // --------------------------------------------------------- multiplier

    function WAD_PRECISION() external pure returns (uint256) {
        return WAD;
    }

    function scaledBalanceOf(address account) external view returns (uint256) {
        return balanceOf[account] * multiplier / WAD;
    }

    function toScaledBalance(uint256 rawAmount) external view returns (uint256) {
        return rawAmount * multiplier / WAD;
    }

    function toRawBalance(uint256 scaledAmount) external view returns (uint256) {
        return scaledAmount * WAD / multiplier;
    }

    function updateMultiplier(uint256 newMultiplier) external onlyOwner {
        if (newMultiplier == 0) revert ZeroMultiplier();
        uint256 old = multiplier;
        multiplier = newMultiplier;
        emit MultiplierUpdated(old, newMultiplier);
    }

    // ------------------------------------------------------------ policies

    function policyId(bytes32 policyScope) external view returns (uint64) {
        _scope(policyScope);
        return _policyIds[policyScope];
    }

    function updatePolicy(bytes32 policyScope, uint64 newPolicyId) external onlyOwner {
        _scope(policyScope);
        emit PolicyUpdated(policyScope, _policyIds[policyScope], newPolicyId);
        _policyIds[policyScope] = newPolicyId;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroOwner();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    // ------------------------------------------------------------ internal

    function _scope(bytes32 s) internal pure {
        if (
            s != TRANSFER_SENDER_POLICY && s != TRANSFER_RECEIVER_POLICY && s != TRANSFER_EXECUTOR_POLICY
                && s != MINT_RECEIVER_POLICY
        ) revert UnsupportedPolicyType(s);
    }

    function _check(bytes32 scope, address account) internal view {
        if (!policyRegistry.isAuthorized(_policyIds[scope], account)) revert PolicyForbids(scope, account);
    }

    function _move(address from, address to, uint256 amount) internal {
        uint256 b = balanceOf[from];
        if (b < amount) revert InsufficientBalance(b, amount);
        unchecked {
            balanceOf[from] = b - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
