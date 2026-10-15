// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice One position per address, 1 UBIC per full day. The claim threshold
/// rises by 0.1 ETH every 1000 days from deployment, including for old positions.
/// @dev No owner, upgrade, batch endpoint, arbitrary mint or rescue function.
contract UBIC is ERC20Burnable, ReentrancyGuard {
    uint256 public constant DEPOSIT_STEP = 0.1 ether;
    uint256 public constant EPOCH_DURATION = 1000 days;
    uint256 public constant PERIOD = 1 days;
    uint256 public constant REWARD = 10_000; // 1 UBIC = 10,000 xiao (肖).
    uint256 public immutable genesisTime;

    struct Position {
        uint64 depositedAt;
        uint64 claimedPeriods;
        uint256 principal;
    }

    mapping(address => Position) public positions;

    error InvalidDeposit();
    error ActivePositionExists();
    error InactivePosition();
    error EtherTransferFailed();
    error InvalidTimestamp();
    error InsufficientStake(uint256 actual, uint256 required);

    event Deposited(address indexed account, uint256 amount);
    event ToppedUp(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 reward);
    event Withdrawn(address indexed account, uint256 amount);

    constructor() ERC20("UBIC", "UBIC") {
        genesisTime = block.timestamp;
    }

    function decimals() public pure override returns (uint8) {
        return 4;
    }

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - genesisTime) / EPOCH_DURATION;
    }

    function requiredDeposit() public view returns (uint256) {
        return DEPOSIT_STEP * (1 + currentEpoch());
    }

    /// @notice Opens a position with at least the current minimum. Excess ETH
    /// remains refundable principal but never increases the reward rate.
    function deposit() external payable nonReentrant {
        if (msg.value < requiredDeposit()) revert InvalidDeposit();
        if (positions[msg.sender].depositedAt != 0) revert ActivePositionExists();
        if (block.timestamp == 0) revert InvalidTimestamp();
        positions[msg.sender] = Position(SafeCast.toUint64(block.timestamp), 0, msg.value);
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Adds any positive amount to an existing position. No timing or
    /// reward changes; partial and advance top-ups are allowed.
    function topUp() external payable nonReentrant {
        Position storage p = positions[msg.sender];
        if (p.depositedAt == 0) revert InactivePosition();
        if (msg.value == 0) revert InvalidDeposit();
        p.principal += msg.value;
        emit ToppedUp(msg.sender, msg.value);
    }

    /// @notice Mints mature rewards, preserving principal and unfinished time.
    /// Requires the current threshold even with no reward. A qualified position
    /// with no full day yet returns zero without resetting time.
    function claim() external nonReentrant returns (uint256 reward) {
        Position storage p = positions[msg.sender];
        if (p.depositedAt == 0) revert InactivePosition();
        uint256 required = requiredDeposit();
        if (p.principal < required) revert InsufficientStake(p.principal, required);
        return _settle(msg.sender);
    }

    /// @notice Always refunds all recorded principal. Settles rewards only if
    /// currently qualified; otherwise all unminted entitlement is forfeited.
    /// Closes the position and discards any incomplete day.
    /// Smart-contract callers must be able to receive ETH.
    function withdraw() external nonReentrant returns (uint256 reward) {
        Position storage p = positions[msg.sender];
        if (p.depositedAt == 0) revert InactivePosition();
        uint256 principal = p.principal;
        if (principal >= requiredDeposit()) reward = _settle(msg.sender);
        delete positions[msg.sender];
        emit Withdrawn(msg.sender, principal);

        (bool success,) = payable(msg.sender).call{value: principal}("");
        if (!success) revert EtherTransferFailed();
    }

    /// @notice Accumulated entitlement in xiao (肖), even when underfunded.
    /// A nonzero value does NOT guarantee claim succeeds at the current threshold.
    function pending(address account) external view returns (uint256) {
        Position memory p = positions[account];
        if (p.depositedAt == 0) return 0;
        return (((block.timestamp - p.depositedAt) / PERIOD) - p.claimedPeriods) * REWARD;
    }

    function _settle(address account) private returns (uint256 reward) {
        Position storage p = positions[account];
        if (p.depositedAt == 0) revert InactivePosition();
        uint256 elapsedPeriods = (block.timestamp - p.depositedAt) / PERIOD;
        uint256 unclaimedPeriods = elapsedPeriods - p.claimedPeriods;
        if (unclaimedPeriods != 0) {
            // Preserve the original timestamp and count only completed periods.
            p.claimedPeriods = SafeCast.toUint64(elapsedPeriods);
            reward = unclaimedPeriods * REWARD;
            _mint(account, reward);
            emit Claimed(account, reward);
        }
    }
}
