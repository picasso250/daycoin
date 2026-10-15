// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice One address locks exactly 0.1 ETH and earns 1 UBIC per full day.
/// Claim keeps the position; withdraw settles rewards and refunds principal.
/// @dev No owner, upgrade, batch endpoint, arbitrary mint or rescue function.
contract UBIC is ERC20Burnable, ReentrancyGuard {
    uint256 public constant DEPOSIT = 0.1 ether;
    uint256 public constant PERIOD = 1 days;
    uint256 public constant REWARD = 10_000; // 1 UBIC = 10,000 xiao (肖).

    struct Position {
        uint64 depositedAt;
        uint64 claimedPeriods;
    }

    mapping(address => Position) public positions;

    error InvalidDeposit();
    error ActivePositionExists();
    error InactivePosition();
    error EtherTransferFailed();
    error InvalidTimestamp();

    event Deposited(address indexed account);
    event Claimed(address indexed account, uint256 reward);
    event Withdrawn(address indexed account);

    constructor() ERC20("UBIC", "UBIC") {}

    function decimals() public pure override returns (uint8) {
        return 4;
    }

    /// @notice At most one active position per address. No top-ups.
    function deposit() external payable nonReentrant {
        if (msg.value != DEPOSIT) revert InvalidDeposit();
        if (positions[msg.sender].depositedAt != 0) revert ActivePositionExists();
        if (block.timestamp == 0) revert InvalidTimestamp();
        positions[msg.sender] = Position(SafeCast.toUint64(block.timestamp), 0);
        emit Deposited(msg.sender);
    }

    /// @notice Mints mature rewards, preserving principal and unfinished time.
    /// An active position with no full day yet returns zero without resetting time.
    function claim() external nonReentrant returns (uint256 reward) {
        return _settle(msg.sender);
    }

    /// @notice Settles unclaimed full days, closes the position and refunds
    /// exactly 0.1 ETH before gas costs. Discards only the unfinished day.
    /// Smart-contract callers must be able to receive ETH.
    function withdraw() external nonReentrant returns (uint256 reward) {
        reward = _settle(msg.sender);
        delete positions[msg.sender];
        emit Withdrawn(msg.sender);

        (bool success,) = payable(msg.sender).call{value: DEPOSIT}("");
        if (!success) revert EtherTransferFailed();
    }

    /// @notice Reward in xiao (肖); zero for inactive positions.
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
