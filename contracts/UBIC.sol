// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice One deposit locks exactly 0.1 ETH. One claim closes one position,
/// refunds its ETH and mints 1 UBIC per completed 24-hour period.
/// @dev No owner, upgrade, batch endpoint, arbitrary mint or rescue function.
contract UBIC is ERC20, ReentrancyGuard {
    uint256 public constant DEPOSIT = 0.1 ether;
    uint256 public constant PERIOD = 1 days;
    uint256 public constant REWARD = 10_000; // 1 UBIC = 10,000 xiao (肖).

    struct Position {
        uint256 depositedAt;
        bool active;
    }

    mapping(address => uint256) public nextPositionId;
    mapping(address => mapping(uint256 => Position)) public positions;
    uint256 public totalPrincipal;

    error InvalidDeposit();
    error InactivePosition();
    error EtherTransferFailed();

    event Deposited(address indexed account, uint256 indexed id);
    event Claimed(address indexed account, uint256 indexed id, uint256 reward);

    constructor() ERC20("UBIC", "UBIC") {}

    function decimals() public pure override returns (uint8) {
        return 4;
    }

    /// @notice One call creates one position. No top-ups or fractional deposits.
    function deposit() external payable nonReentrant returns (uint256 id) {
        if (msg.value != DEPOSIT) revert InvalidDeposit();
        id = nextPositionId[msg.sender]++;
        positions[msg.sender][id] = Position(block.timestamp, true);
        totalPrincipal += DEPOSIT;
        emit Deposited(msg.sender, id);
    }

    /// @notice Returns exactly 0.1 ETH before gas costs, plus N UBIC for N full
    /// days. Closes the position and discards its incomplete day. To earn again,
    /// deposit again. Smart-contract callers must be able to receive ETH.
    function claim(uint256 id) external nonReentrant returns (uint256 reward) {
        Position memory p = positions[msg.sender][id];
        if (!p.active) revert InactivePosition();
        reward = ((block.timestamp - p.depositedAt) / PERIOD) * REWARD;

        delete positions[msg.sender][id];
        totalPrincipal -= DEPOSIT;
        if (reward != 0) _mint(msg.sender, reward);
        emit Claimed(msg.sender, id, reward);

        (bool success,) = payable(msg.sender).call{value: DEPOSIT}("");
        if (!success) revert EtherTransferFailed();
    }

    /// @notice Reward in xiao (肖); zero for inactive positions.
    function pending(address account, uint256 id) external view returns (uint256) {
        Position memory p = positions[account][id];
        if (!p.active) return 0;
        return ((block.timestamp - p.depositedAt) / PERIOD) * REWARD;
    }
}
