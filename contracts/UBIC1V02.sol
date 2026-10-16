// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title UBIC1 v0.2 - experimental, independently deployed ERC20
/// @notice A position accrues 1 UBIC1 per 86400 eligible seconds (18 decimals).
/// @dev Every positive deposit RESETS the reward clock and forfeits all unclaimed
///      rewards, including rewards accrued before an epoch boundary.
///      Withdraw never settles rewards; it refunds principal only.
///      No owner, upgradeability, privileged minting, pause or rescue.
contract UBIC1V02 is ERC20Burnable, ReentrancyGuard {
    uint256 public constant DEPOSIT_STEP = 0.1 ether;
    uint256 public constant EPOCH_DURATION = 1000 days;
    uint256 public constant PERIOD = 1 days;
    uint256 public constant REWARD_PER_DAY = 1 ether; // 18 decimals (1e18 units)
    uint256 public immutable genesisTime;

    struct Position {
        uint64 cursor;       // Unclaimed reward interval starts here.
        uint256 principal;   // Refundable ETH; zero means no open position.
    }

    mapping(address => Position) public positions;

    error InvalidDeposit();
    error InactivePosition();
    error EtherTransferFailed();

    event Deposited(address indexed account, uint256 added, uint256 principal);
    event Claimed(address indexed account, uint256 reward);
    event Withdrawn(address indexed account, uint256 principal);

    constructor() ERC20("UBIC1", "UBIC1") {
        genesisTime = block.timestamp;
    }

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - genesisTime) / EPOCH_DURATION;
    }

    function requiredDeposit() public view returns (uint256) {
        return DEPOSIT_STEP * (1 + currentEpoch());
    }

    /// @notice Open or add any positive ETH amount; every call resets the clock.
    /// @dev All pending entitlement is forfeited, without minting or settlement.
    function deposit() external payable nonReentrant {
        if (msg.value == 0) revert InvalidDeposit();
        Position storage p = positions[msg.sender];
        p.principal += msg.value;
        p.cursor = SafeCast.toUint64(block.timestamp);
        emit Deposited(msg.sender, msg.value, p.principal);
    }

    /// @notice Mint rewards for eligible elapsed seconds since the reward cursor.
    /// @dev May claim previously accrued entitlement even after falling below the
    ///      current epoch's minimum. Fractional token wei are rounded down per claim.
    function claim() external nonReentrant returns (uint256 reward) {
        Position storage p = positions[msg.sender];
        if (p.principal == 0) revert InactivePosition();
        uint256 end = _eligibleThrough(p.principal);
        if (end <= p.cursor) return 0;
        reward = ((end - p.cursor) * REWARD_PER_DAY) / PERIOD;
        p.cursor = SafeCast.toUint64(end);
        if (reward != 0) {
            _mint(msg.sender, reward);
            emit Claimed(msg.sender, reward);
        }
    }

    /// @notice Refund the ENTIRE principal, regardless of eligibility and time.
    /// @dev Forfeits all unclaimed rewards. A smart wallet that cannot receive
    ///      native ETH may permanently lock its own principal in this version.
    function withdraw() external nonReentrant {
        Position storage p = positions[msg.sender];
        if (p.principal == 0) revert InactivePosition();
        uint256 principal = p.principal;
        delete positions[msg.sender];
        emit Withdrawn(msg.sender, principal);
        (bool success,) = payable(msg.sender).call{value: principal}("");
        if (!success) revert EtherTransferFailed();
    }

    /// @notice Currently claimable reward in 18-decimal smallest token units.
    /// @dev Includes past eligible time, but excludes all time after stake expires.
    function pending(address account) external view returns (uint256) {
        Position memory p = positions[account];
        if (p.principal == 0) return 0;
        uint256 end = _eligibleThrough(p.principal);
        if (end <= p.cursor) return 0;
        return ((end - p.cursor) * REWARD_PER_DAY) / PERIOD;
    }

    /// @dev For fixed principal P, qualification ends at the exact epoch boundary
    ///      genesis + 1000 days * floor(P / 0.1 ETH). No historical loop.
    ///      Compare epochs FIRST, so multiplying by covered epochs cannot overflow:
    ///      the multiplication runs only when the result is at most now-genesis.
    function _eligibleThrough(uint256 principal) private view returns (uint256) {
        uint256 epochsCovered = principal / DEPOSIT_STEP;
        uint256 epochNow = currentEpoch();
        if (epochsCovered > epochNow) return block.timestamp;
        return genesisTime + epochsCovered * EPOCH_DURATION;
    }
}
