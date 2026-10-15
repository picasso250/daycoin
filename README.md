# UBIC

不可升级的 ERC-20。每次存入恰好 **0.1 ETH**；每次 claim 关闭一个仓位，退回 **0.1 ETH**，并按该仓位实际经过的完整天数铸造 UBIC。

UBIC 的演化原则：
1. 合约不可变。 每一版都独立部署，不设置升级特权。
2. 迁移自愿。 不强制旧持有人换币。
3. 兑换有界。 新版本不得承担旧版本无限期增发的兑换义务。
4. 名称不代表权力。 开发者没有权力宣布旧版本无效。
5. 规则公开。 兑换比例、快照条件和新发行机制必须在迁移前确定。

UBIC 第六原则：发行公治，销毁私有。
货币发行属于公开制度，货币销毁属于个人财产权。

UBIC V1：三条核心规则
1. 一个地址，一个仓位。 同一地址在任何时刻最多只能有一个活跃仓位。
2. 一个仓位，0.1 ETH。 本金锁定期间产生 UBIC，退出时原额退还。
3. 一天，一个 UBIC。 每经过完整 24 小时，产生 1 UBIC，不足一天的时间不计奖励。

## 固定规则

- `deposit()` 必须携带恰好 0.1 ETH，多或少 1 wei 都失败。每次新建独立仓位，ID 按用户递增且不复用。
- `claim(id)` 只处理调用者的一个仓位。无批量接口、部分提款或单独领取奖励接口。
- 未满 24 小时：退回 0.1 ETH，0 UBIC。
- 满 24 小时：退回 0.1 ETH，1 UBIC。
- 满 48 小时：退回 0.1 ETH，2 UBIC；60 小时也是 2 UBIC。
- claim 后仓位关闭，不足一天的时间作废；继续参与需要重新 deposit 并重新计时。
- 从存入时刻起算，每天 86,400 秒，不按 UTC 午夜划分。
- 每次退回本金严格为 0.1 ETH，用户钱包余额净变化还要扣除 gas。
- 名称和符号均为 `UBIC`；**4 位小数，1 UBIC = 10,000 肖**。所有 ERC-20 金额参数和余额以肖为单位，`transfer(to, 1)` 转出 1 肖。
- 初始供应量为零，无人为总量上限；成熟额度在 claim 前不计入 `totalSupply()`。
- 无 owner、代理、升级、暂停、参数修改、管理员增发或救援提款。直接部署本体，不部署代理。

每份本金每天产生一份额度，无法识别人或人口。移除批量接口只要求每份单独调用，**不能强制手动操作、每人一份或每笔交易只含一次调用**：脚本能发送多次交易，外部合约也能在一笔交易中顺序调用多次。防重入阻止的是尚未完成的调用中的嵌套进入。

## 调用

```solidity
deposit() payable returns (uint256 id)
claim(uint256 id) returns (uint256 reward)
pending(address account, uint256 id) view returns (uint256)
positions(address account, uint256 id) view returns (uint256 depositedAt, bool active)
nextPositionId(address account) view returns (uint256)
totalPrincipal() view returns (uint256)
```

监听 `Deposited(account, id)` 获取仓位 ID。`pending()` 返回当前完整天数对应的肖数量，已关闭或不存在的仓位返回零。重复或不存在仓位的 claim 会失败。两个 0.1 ETH 仓位各存 12 小时，均没有奖励，不能合并成 1 UBIC。

本金和奖励都返回调用者。合约钱包必须能够接收 ETH；若拒收，整个 claim 回滚，仓位和奖励保持原状。没有其他收款地址或救援接口，因此不要通过无法接收 ETH 的合约存款。

普通直接转 ETH 会失败，必须调用 `deposit()`。被强制转入的 ETH 不记为本金，不改变奖励或退款，没有取回接口。存款本金不进行外部投资，也不是 UBIC 可赎回的储备。

## 实现与编译版本

保留并精确固定 **Solidity 0.8.30** 和 **OpenZeppelin Contracts 5.4.0**。0.8.30 是已发布的维护版本，避免浮动 pragma 和自动跟随最新编译器；不使用实验性语言功能。这是本项目的保守选择，不代表编译器绝无问题。[官方发布说明](https://www.soliditylang.org/blog/2025/05/07/solidity-0.8.30-release-announcement/)。

优化开启，runs=200，明确指定 Shanghai EVM 目标。部署链必须支持该指令集并以 ETH 为原生币；`ether` 只是 Solidity 数值单位。区块时间取自部署链的 `block.timestamp`。

奖励公式：

```text
floor((block.timestamp - depositedAt) / 86400) × 10000 肖
```

无逐秒速率舍入，无小数累计。claim 先删除仓位、扣减本金账本并铸币，再执行 ETH 退款。退款失败时全部回滚。deposit 和 claim 均受 OpenZeppelin ReentrancyGuard 保护。单次操作无循环，不依赖系统总仓位数。

本版本不保留旧的批量 claim、withdraw 或 accrued 接口。若有旧版本已部署，无法原地修改；本仓库没有执行链上部署或迁移。

## 验证

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

锁文件固定依赖；构建生成 `artifacts/UBIC.json`，含 ABI 和字节码，构造函数无参数。测试使用本地 Ganache Shanghai EVM，并主动启用其 JavaScript 后备实现以避免 Node 原生扩展版本不匹配。

测试覆盖：精确存款金额、提前退出的本金与 gas 对账、24 小时边界、逐仓位领取与权限隔离、多日累计与重新存入、重入攻击、拒收退款的完整回滚、1 肖转账和授权、非存款 ETH 不改变本金或奖励。非存款余额测试通过节点 RPC 模拟账本外资金流入。

测试不构成独立安全审计，也不能证明绝无 bug。
