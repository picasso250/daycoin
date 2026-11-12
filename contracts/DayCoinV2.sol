// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DC2 minimal permanent-eligibility prototype for Arbitrum Sepolia
/// @notice A qualified GitHub identity can register ONCE, then accrue 1 DC2/day.
/// @dev Immutable issuer attests eligibility off-chain. The contract cannot verify
///      GitHub itself; whoever controls the issuer can issue fraudulent identities.
///      No wallet replacement, revocation, owner, upgrade, or rescue.
///      Never deploy to Arbitrum One without reviewing key-loss/issuer trust risks.
contract DayCoinV2 is ERC20, EIP712 {
    uint256 public constant RATE = 1 ether; // 1 token per day, 18 decimals
    uint256 public constant PERIOD = 1 days;
    bytes32 private constant ENROLL_TYPEHASH =
        keccak256("Enroll(bytes32 identity,address recipient,uint256 deadline)");

    address public immutable issuer;
    struct Position {
        address recipient;
        uint64 since;
        uint256 minted;
    }
    mapping(bytes32 => Position) public positions;
    mapping(address => bytes32) public identityOf;

    error InvalidIssuer();
    error InvalidIdentity();
    error InvalidRecipient();
    error AlreadyRegistered();
    error ExpiredApproval();
    error UnauthorizedSigner();
    error NotRegistered();

    event Registered(bytes32 indexed identity, address indexed recipient, uint256 since);
    event Claimed(bytes32 indexed identity, address indexed recipient, uint256 amount);

    constructor(address issuer_) ERC20("DayCoin V2", "DC2") EIP712("DayCoin V2", "1") {
        if (issuer_ == address(0)) revert InvalidIssuer();
        issuer = issuer_;
    }

    /// @notice Issuer's EIP712 approval must bind the unique identity and wallet.
    /// @dev identity must be an unguessable random opaque nullifier, not a plain
    ///      hash of a public GitHub user ID (which would be enumerable).
    function register(bytes32 identity, uint256 deadline, bytes calldata signature) external {
        if (identity == bytes32(0)) revert InvalidIdentity();
        if (identityOf[msg.sender] != bytes32(0)) revert AlreadyRegistered();
        if (positions[identity].recipient != address(0)) revert AlreadyRegistered();
        if (block.timestamp > deadline) revert ExpiredApproval();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(ENROLL_TYPEHASH, identity, msg.sender, deadline))
        );
        if (ECDSA.recover(digest, signature) != issuer) revert UnauthorizedSigner();

        positions[identity] = Position(msg.sender, uint64(block.timestamp), 0);
        identityOf[msg.sender] = identity;
        emit Registered(identity, msg.sender, block.timestamp);
    }

    function pending(address recipient) public view returns (uint256) {
        bytes32 identity = identityOf[recipient];
        if (identity == bytes32(0)) return 0;
        Position storage p = positions[identity];
        uint256 earned = (block.timestamp - uint256(p.since)) * RATE / PERIOD;
        return earned - p.minted;
    }

    /// @notice Mint all accrued rewards since initial registration; never double mint.
    function claim() external returns (uint256 amount) {
        bytes32 identity = identityOf[msg.sender];
        if (identity == bytes32(0)) revert NotRegistered();
        Position storage p = positions[identity];
        amount = pending(msg.sender);
        if (amount != 0) {
            p.minted += amount; // cumulative entitlement avoids per-claim rounding loss
            _mint(msg.sender, amount);
            emit Claimed(identity, msg.sender, amount);
        }
    }
}
