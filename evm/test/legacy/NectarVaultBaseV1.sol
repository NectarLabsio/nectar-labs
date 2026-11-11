// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IB20Minimal, IPolicyRegistry} from "../../src/interfaces/IB20Minimal.sol";

// TEST ONLY, NEVER DEPLOY. Pre-fix vault kept so test/SecurityV7.t.sol can reproduce SR-1, SR-8, SR-30 and the phantom
// deposit against it. Same code as evm/src/NectarVaultBase.sol at 0c999b0; only this comment, the import path and the
// contract name differ.

/// @title NectarVaultBase
/// @notice Base Sepolia spoke vault for Nectar remote collateral (PRD v7 §9B, interface-v7 §D, D-026).
///         A borrower deposits B20 (or MockB20) units under an authority address that nectar-core derives
///         from `v1.signer` (domain 0, path `base-sepolia/pos/<id>`). The collateral leaves only with an
///         EIP-712 message signed by that authority: `Settle` (seized units to the buyer, remainder to the
///         depositor) or `Release` (everything to the recipient).
/// @dev Checks on settle/release, in order: chain id 84532, expiry, global nonce unused, position open,
///      ecrecover(digest) == authority, typed-field sanity, then `PolicyRegistry.isAuthorized` for every
///      receiving account, and only then the transfers. State is closed before any external transfer.
///      Signatures with s > n/2 are normalised (s' = n - s, v flipped) instead of rejected: the MPC
///      network's low-s behaviour is unverified (F-332), and replay protection comes from the signed
///      nonce, not from signature uniqueness, so a malleated copy is refused as `NonceUsed`.
contract NectarVaultBaseV1 {
    // ---------------------------------------------------------------- types

    struct Settle {
        uint64 positionId;
        uint64 quoteId;
        uint256 repayE6;
        uint256 seizeRaw;
        address recipient;
        uint64 nonce;
        uint64 expires;
        uint8 kind;
    }

    struct Release {
        uint64 positionId;
        address recipient;
        uint64 nonce;
        uint64 expires;
    }

    enum Status {
        None,
        Open,
        Settled,
        Released
    }

    struct Position {
        address authority;
        address depositor;
        uint256 amount;
        Status status;
    }

    // ------------------------------------------------------------ constants

    /// @notice Base Sepolia (F-355). Also the chain id of the disclosed local fork (D-026).
    uint256 public constant CHAIN_ID = 84532;

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant NAME_HASH = keccak256("NectarVault");
    bytes32 public constant VERSION_HASH = keccak256("1");
    bytes32 public constant SETTLE_TYPEHASH = keccak256(
        "Settle(uint64 positionId,uint64 quoteId,uint256 repayE6,uint256 seizeRaw,address recipient,uint64 nonce,uint64 expires,uint8 kind)"
    );
    bytes32 public constant RELEASE_TYPEHASH =
        keccak256("Release(uint64 positionId,address recipient,uint64 nonce,uint64 expires)");

    uint8 public constant KIND_PRELIQ = 1;
    uint8 public constant KIND_SELF = 2;

    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    uint256 internal constant SECP256K1_HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // --------------------------------------------------------------- state

    IB20Minimal public immutable token;
    IPolicyRegistry public immutable policyRegistry;
    bytes32 private immutable _DOMAIN_SEPARATOR;

    /// @notice `positions(id) → (authority, depositor, amount, status)`; read by the OutLayer vault_read job.
    mapping(uint64 => Position) public positions;

    /// @notice Vault-global used-nonce set shared by settle and release (same scope as the Solana vault).
    mapping(uint64 => bool) public nonceUsed;

    // -------------------------------------------------------------- events

    event PositionOpened(
        uint64 indexed positionId, address indexed authority, address indexed depositor, uint256 amount
    );
    event PositionSettled(
        uint64 indexed positionId,
        uint64 indexed quoteId,
        address indexed recipient,
        uint256 repayE6,
        uint256 seizeRaw,
        uint256 remainder,
        uint64 nonce,
        uint8 kind
    );
    event PositionReleased(uint64 indexed positionId, address indexed recipient, uint256 amount, uint64 nonce);

    // -------------------------------------------------------------- errors

    error WrongChain(uint256 chainId);
    error ZeroAddress();
    error ZeroAmount();
    error PositionExists(uint64 positionId);
    error NotOpen(uint64 positionId, Status status);
    error Expired(uint64 expires, uint256 nowTs);
    error NonceUsed(uint64 nonce);
    error InvalidV(uint8 v);
    error InvalidSignature();
    error WrongSigner(address recovered, address authority);
    error BadKind(uint8 kind);
    error SeizeExceedsAmount(uint256 seizeRaw, uint256 amount);
    error NotAuthorized(uint64 policyId, address account);
    error TransferFailed();

    // --------------------------------------------------------- constructor

    /// @param token_ B20 ASSET token (or MockB20) held as collateral.
    /// @param policyRegistry_ B20 PolicyRegistry (`0x8453…0002`, F-347) or PolicyRegistryMock.
    constructor(address token_, address policyRegistry_) {
        if (block.chainid != CHAIN_ID) revert WrongChain(block.chainid);
        if (token_ == address(0) || policyRegistry_ == address(0)) revert ZeroAddress();
        token = IB20Minimal(token_);
        policyRegistry = IPolicyRegistry(policyRegistry_);
        _DOMAIN_SEPARATOR = keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, CHAIN_ID, address(this)));
    }

    // ------------------------------------------------------------ external

    /// @notice Deposit `amount` raw units for position `id` under `authority`. Depositor = msg.sender.
    function openPosition(uint64 id, address authority, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (authority == address(0)) revert ZeroAddress();
        Position storage p = positions[id];
        if (p.status != Status.None) revert PositionExists(id);
        p.authority = authority;
        p.depositor = msg.sender;
        p.amount = amount;
        p.status = Status.Open;
        emit PositionOpened(id, authority, msg.sender, amount);
        _safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Settle an open position with an authority-signed EIP-712 `Settle`.
    function settle(Settle calldata m, uint8 v, bytes32 r, bytes32 s) external {
        Position storage p = _consume(m.positionId, m.nonce, m.expires, hashSettle(m), v, r, s);
        _executeSettle(p, m);
    }

    /// @notice Release an open position's full amount with an authority-signed EIP-712 `Release`.
    function release(Release calldata m, uint8 v, bytes32 r, bytes32 s) external {
        Position storage p = _consume(m.positionId, m.nonce, m.expires, hashRelease(m), v, r, s);
        if (m.recipient == address(0)) revert ZeroAddress();
        _requireAuthorized(token.policyId(token.TRANSFER_RECEIVER_POLICY()), m.recipient);
        uint256 amount = p.amount;
        p.status = Status.Released;
        emit PositionReleased(m.positionId, m.recipient, amount, m.nonce);
        _safeTransfer(m.recipient, amount);
    }

    // --------------------------------------------------------------- views

    function domainSeparator() public view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
    }

    function hashSettle(Settle calldata m) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SETTLE_TYPEHASH, m.positionId, m.quoteId, m.repayE6, m.seizeRaw, m.recipient, m.nonce, m.expires, m.kind
            )
        );
        return keccak256(abi.encodePacked(hex"1901", _DOMAIN_SEPARATOR, structHash));
    }

    function hashRelease(Release calldata m) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(RELEASE_TYPEHASH, m.positionId, m.recipient, m.nonce, m.expires));
        return keccak256(abi.encodePacked(hex"1901", _DOMAIN_SEPARATOR, structHash));
    }

    // ------------------------------------------------------------ internal

    function _executeSettle(Position storage p, Settle calldata m) internal {
        if (m.kind != KIND_PRELIQ && m.kind != KIND_SELF) revert BadKind(m.kind);
        if (m.recipient == address(0)) revert ZeroAddress();
        uint256 amount = p.amount;
        if (m.seizeRaw > amount) revert SeizeExceedsAmount(m.seizeRaw, amount);
        uint256 remainder = amount - m.seizeRaw;
        address depositor = p.depositor;

        uint64 pid = token.policyId(token.TRANSFER_RECEIVER_POLICY());
        _requireAuthorized(pid, m.recipient);
        if (remainder != 0) _requireAuthorized(pid, depositor);

        p.status = Status.Settled;
        _emitSettled(m, remainder);
        if (m.seizeRaw != 0) _safeTransfer(m.recipient, m.seizeRaw);
        if (remainder != 0) _safeTransfer(depositor, remainder);
    }

    function _emitSettled(Settle calldata m, uint256 remainder) private {
        emit PositionSettled(m.positionId, m.quoteId, m.recipient, m.repayE6, m.seizeRaw, remainder, m.nonce, m.kind);
    }

    /// @dev Common gate for settle/release. Marks the nonce used and returns the open position.
    function _consume(uint64 id, uint64 nonce, uint64 expires, bytes32 digest, uint8 v, bytes32 r, bytes32 s)
        internal
        returns (Position storage p)
    {
        if (block.chainid != CHAIN_ID) revert WrongChain(block.chainid);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > expires) revert Expired(expires, block.timestamp);
        if (nonceUsed[nonce]) revert NonceUsed(nonce);
        p = positions[id];
        if (p.status != Status.Open) revert NotOpen(id, p.status);
        address recovered = _recover(digest, v, r, s);
        if (recovered != p.authority) revert WrongSigner(recovered, p.authority);
        nonceUsed[nonce] = true;
    }

    function _recover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) internal pure returns (address signer) {
        if (v != 27 && v != 28) revert InvalidV(v);
        uint256 rv = uint256(r);
        uint256 sv = uint256(s);
        if (rv == 0 || rv >= SECP256K1_N || sv == 0 || sv >= SECP256K1_N) revert InvalidSignature();
        if (sv > SECP256K1_HALF_N) {
            s = bytes32(SECP256K1_N - sv);
            v = v == 27 ? 28 : 27;
        }
        // s was normalised to the lower half above; replay protection is the signed nonce.
        // forge-lint: disable-next-line(ecrecover)
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    function _requireAuthorized(uint64 pid, address account) internal view {
        if (!policyRegistry.isAuthorized(pid, account)) revert NotAuthorized(pid, account);
    }

    function _safeTransfer(address to, uint256 amount) internal {
        _call(abi.encodeCall(IB20Minimal.transfer, (to, amount)));
    }

    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        _call(abi.encodeCall(IB20Minimal.transferFrom, (from, to, amount)));
    }

    function _call(bytes memory data) private {
        (bool ok, bytes memory ret) = address(token).call(data);
        if (!ok) {
            // bubble the token's revert (e.g. B20 `PolicyForbids`) so failures stay visible
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        // No extcodesize check: B20 tokens may be native (precompile-style) accounts with empty code (F-347).
        if (ret.length != 0 && !abi.decode(ret, (bool))) revert TransferFailed();
    }
}
