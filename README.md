# UBIC

不可升级的 ERC-20。每个地址最多质押 **0.1 ETH**；`claim()` 领取完整天数的奖励并保留仓位，`withdraw()` 结算剩余奖励、退回本金并退出。

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

- `deposit()` 必须携带恰好 0.1 ETH，多或少 1 wei 都失败。同地址已有活跃仓位时禁止再次存款；退出后可重新存款，重新开始计时。
- `claim()` 仅领取尚未领取的完整天数奖励，不返还本金、不关闭仓位、不重置质押开始时间。没有奖励时返回零，状态不变；没有仓位时调用失败。
- 存入 36 小时后 claim 得到 1 UBIC，剩余 12 小时进度保留；再等 12 小时可领取下一个 1 UBIC。
- `withdraw()` 随时可调用：领取剩余完整天数奖励，退回恰好 0.1 ETH 并关闭仓位。只有退出时不足一天的时间作废。
- 已经领取的周期不会在后续 claim 或 withdraw 中重复计奖。无批量接口和部分提款。
- 从存入时刻起算，每天 86,400 秒，不按 UTC 午夜划分。
- 每次退回本金严格为 0.1 ETH，用户钱包余额净变化还要扣除 gas。
- 名称和符号均为 `UBIC`；**4 位小数，1 UBIC = 10,000 肖**。所有 ERC-20 金额参数和余额以肖为单位，`transfer(to, 1)` 转出 1 肖。
- 初始供应量为零，无人为总量上限；成熟额度在 claim 或 withdraw 铸币前不计入 `totalSupply()`。
- 使用 OpenZeppelin `ERC20Burnable`：`burn(amount)` 自愿销毁自己的币；`burnFrom(account, amount)` 只能在该账户 ERC-20 allowance 授权范围内销毁，并消耗授权（无限授权遵循标准行为）。普通 `approve` 也赋予相应的授权销毁能力。
- 销毁金额以肖计，`burn(1)` 销毁 1 肖，`burn(10000)` 销毁 1 UBIC。销毁减少余额及 `totalSupply()`，产生转入零地址的 `Transfer` 事件；不可恢复，不退 ETH，也不改变仓位、未来奖励或计时。没有管理员强制销毁权限。
- 无 owner、代理、升级、暂停、参数修改、管理员增发或救援提款。直接部署本体，不部署代理。

每份本金每天产生一份额度，无法识别人或人口。移除批量接口只要求每份单独调用，**不能强制手动操作、每人一份或每笔交易只含一次调用**：脚本能发送多次交易，外部合约也能在一笔交易中顺序调用多次。防重入阻止的是尚未完成的调用中的嵌套进入。

## 调用

```solidity
deposit() payable
claim() returns (uint256 reward)
withdraw() returns (uint256 reward)
pending(address account) view returns (uint256)
positions(address account) view returns (uint64 depositedAt, uint64 claimedPeriods)
burn(uint256 amount)
burnFrom(address account, uint256 amount)
```

`pending()` 返回未领取整天奖励的肖数量，没有仓位时返回零。不同地址各存 12 小时，均没有奖励，不能合并成 1 UBIC。一个地址一个仓位不等于一个人一个仓位。

本金和奖励都返回调用者。claim 不转 ETH；withdraw 要求合约钱包能接收 ETH，若拒收，整笔提款包括奖励结算都回滚。没有其他收款地址或救援接口，因此不要通过无法接收 ETH 的合约存款。

普通直接转 ETH 会失败，必须调用 `deposit()`。被强制转入的 ETH 不记为本金，不改变奖励或退款，没有取回接口。存款本金不进行外部投资，也不是 UBIC 可赎回的储备。

## 实现与编译版本

保留并精确固定 **Solidity 0.8.30** 和 **OpenZeppelin Contracts 5.4.0**。0.8.30 是已发布的维护版本，避免浮动 pragma 和自动跟随最新编译器；不使用实验性语言功能。这是本项目的保守选择，不代表编译器绝无问题。[官方发布说明](https://www.soliditylang.org/blog/2025/05/07/solidity-0.8.30-release-announcement/)。

优化开启，runs=200，明确指定 Shanghai EVM 目标。部署链必须支持该指令集并以 ETH 为原生币；`ether` 只是 Solidity 数值单位。区块时间取自部署链的 `block.timestamp`。

奖励公式：

```text
(floor((block.timestamp - depositedAt) / 86400) - claimedPeriods) × 10000 肖
```

仓位只使用一个 `mapping(address => Position)`，其中两个 `uint64` 字段存入同一个 storage slot。`depositedAt == 0` 表示没有仓位；存款明确拒绝零时间戳，并使用 SafeCast 检查 uint64 转换。ERC-20 与防重入组件自身的必要状态保留。

没有仓位 ID、单独 active 标记或 `totalPrincipal`。总质押负债需要链下索引 `Deposited` / `Withdrawn` 事件计算；强制转入的 ETH 会让合约余额高于真实负债，不能把余额直接当作本金统计。

无逐秒速率舍入，无小数累计。结算时先更新 `claimedPeriods` 再铸币，`depositedAt` 保持不变。withdraw 结算后删除仓位，再执行 ETH 退款；退款失败时全部回滚。deposit、claim、withdraw 均受 ReentrancyGuard 保护。单次操作无循环。

本版本移除带仓位 ID 的旧接口，不做接口兼容。若有旧版本已部署，无法原地修改；本仓库没有执行链上部署或迁移。

## 验证

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

锁文件固定依赖；构建生成 `artifacts/UBIC.json`，含 ABI 和字节码，构造函数无参数。测试使用本地 Ganache Shanghai EVM，并主动启用其 JavaScript 后备实现以避免 Node 原生扩展版本不匹配。

测试覆盖：精确存款金额、同地址重复存款拒绝、持续领取与不足一天进度保留、重复领取不增发、领取期间花费代币、退出时只结算剩余奖励、退出重开、退款与 gas 对账、权限隔离、重入攻击、退款失败完整回滚、1 肖转账、自愿与授权销毁、非存款 ETH 不改变本金或奖励。非存款余额测试通过节点 RPC 模拟账本外资金流入。

测试不构成独立安全审计，也不能证明绝无 bug。
