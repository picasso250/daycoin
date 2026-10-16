# UBIC1 V1 · 千日纪元制（1000-Day Epoch）

**UBIC 是理想，UBIC1 是第一次尝试。** 协议家族称 UBIC；第一代合约、代币名称和 Symbol 均为 `UBIC1`。未来 UBIC2、UBIC3 不因编号自动获得权威，版本独立、用户自愿选择。

Sepolia 部署与链上验证步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。

不可升级的 ERC-20。每地址最多一个仓位，每完整 24 小时累计 1 UBIC1 的发行资格。最低质押要求从 0.1 ETH 开始，自部署起每 1000 天增加 0.1 ETH。领取时按当前门槛判断；补仓可追溯解锁全部历史待领取资格。不足额也能退出，取回全部本金。

UBIC 的演化原则：
1. 合约不可变。 每一版都独立部署，不设置升级特权。
2. 迁移自愿。 不强制旧持有人换币。
3. 兑换有界。 新版本不得承担旧版本无限期增发的兑换义务。
4. 名称不代表权力。 开发者没有权力宣布旧版本无效。
5. 规则公开。 兑换比例、快照条件和新发行机制必须在迁移前确定。

UBIC 第六原则：发行公治，销毁私有。
货币发行属于公开制度，货币销毁属于个人财产权。

UBIC1 V1：三条核心规则
1. 一个地址，一个仓位。 同一地址在任何时刻最多只能有一个活跃仓位。
2. 一个仓位，一份可赎回本金。初始最低要求为 0.1 ETH，以后按千日纪元增加；退出时退回实际存入的全部本金。
3. 一天，一个 UBIC1。 每经过完整 24 小时，产生 1 UBIC1，不足一天的时间不计奖励。

领取是主动权利，退出是无条件退本。
用户可以随时退出，取回全部记录的 ETH 本金（gas 另付），而退出时一切尚未铸造的奖励资格自动作废。

## 固定规则

- `deposit()` 创建仓位，必须至少达到交易执行时的当前门槛；允许超额，不要求 0.1 ETH 整数倍。同地址已有仓位时禁止重复 deposit；退出后重新开仓必须达到当时门槛，并重新开始计时。
- `topUp()` 为自己的活跃仓位补入任意正数 wei。允许分次补仓或提前补足未来门槛，不重置时间、不修改已领取周期、不增加每日奖励。无仓位或补入零 ETH 时失败。
- `claim()` 先检查当前本金是否达到当前门槛；不足则回滚，即使暂时没有整天奖励也是如此。达标后一次性领取尚未领取的全部整天奖励，不退本金、不关闭仓位、不重置质押时间。达标但没有奖励时返回零；没有仓位时失败。
- 存入 36 小时后 claim 得到 1 UBIC1，剩余 12 小时进度保留；再等 12 小时可领取下一个 1 UBIC1。
- `withdraw()` 无条件关闭仓位并退还全部记录本金，**绝不铸币**，不检查当前门槛或成熟天数。所有尚未领取的资格（包括已满整天）在退出时作废；请先调用 `claim()` 再退出。已持有的 UBIC1 不受影响。
- 已经领取的周期不会在后续 claim 中重复计奖。无批量接口和部分提款。
- 从存入时刻起算，每天 86,400 秒，不按 UTC 午夜划分。
- 退款为初始存款加全部补仓，超额本金也全额返还；用户钱包余额净变化另扣 gas。没有部分提款。
- 名称和符号均为 `UBIC1`；**4 位小数，1 UBIC1 = 10,000 肖**。所有 ERC-20 金额参数和余额以肖为单位，`transfer(to, 1)` 转出 1 肖。
- 初始供应量为零，无人为总量上限；成熟额度在 claim 铸币前不计入 `totalSupply()`。
- 使用 OpenZeppelin `ERC20Burnable`：`burn(amount)` 自愿销毁自己的币；`burnFrom(account, amount)` 只能在该账户 ERC-20 allowance 授权范围内销毁，并消耗授权（无限授权遵循标准行为）。普通 `approve` 也赋予相应的授权销毁能力。
- 销毁金额以肖计，`burn(1)` 销毁 1 肖，`burn(10000)` 销毁 1 UBIC1。销毁减少余额及 `totalSupply()`，产生转入零地址的 `Transfer` 事件；不可恢复，不退 ETH，也不改变仓位、未来奖励或计时。没有管理员强制销毁权限。
- 无 owner、代理、升级、暂停、参数修改、管理员增发或救援提款。直接部署本体，不部署代理。

每份本金每天产生一份额度，无法识别人或人口。移除批量接口只要求每份单独调用，**不能强制手动操作、每人一份或每笔交易只含一次调用**：脚本能发送多次交易，外部合约也能在一笔交易中顺序调用多次。防重入阻止的是尚未完成的调用中的嵌套进入。

## 千日纪元与追溯性领取

```text
t0 = genesisTime（部署时固定）
E(t) = floor((block.timestamp - t0) / (1000 × 86400))
D(t) = 0.1 ETH × (1 + E(t))
```

| 纪元 | 自部署起天数 | 最低本金 |
| --- | --- | --- |
| 0 | 0–999 | 0.1 ETH |
| 1 | 1000–1999 | 0.2 ETH |
| 2 | 2000–2999 | 0.3 ETH |
| 3 | 3000–3999 | 0.4 ETH |
| 10 | 10000–10999 | 1.1 ETH |

纪元按部署时间计，仓位奖励按各自的存入时间计。无需管理员或切换交易，不做历史分段计算，也不设置老仓位豁免。

Alice 在第 0 天存入 0.1 ETH，第 1200 天 claim 因门槛已为 0.2 ETH 而失败。失败不修改任何状态。补入 0.1 ETH 后，可领取全部 1200 UBIC1，包含不足额期间累计的资格。若选择不补仓直接退出，则取回 0.1 ETH，全部未铸造资格终止。

资格检查只发生在 claim 时；topUp 本身不铸币。多存本金不改变发行速度。UI 应同时显示 `pending(account)`、实际本金和 `requiredDeposit()`；pending 非零不表示当前可以成功领取。

按此规则，用户可以长期不补仓，到领取前才补足；补仓后可以立即领取并退出。因此它提高的是领取时所需本金，不强制用户在整个纪元持续占用新增本金，也不保证旧版自然退出。新版本迁移仍然自愿、独立且兑换义务有界。

总供应量 = 累计成功铸造量 − 累计自愿或授权销毁量。未铸造的发行资格不计入 ERC-20 供应量；没有持币税、交易税或自动销毁。

## 调用

```solidity
deposit() payable
topUp() payable
claim() returns (uint256 reward)
withdraw()
pending(address account) view returns (uint256)
positions(address account) view returns (uint64 depositedAt, uint64 claimedPeriods, uint256 principal)
genesisTime() view returns (uint256)
currentEpoch() view returns (uint256)
requiredDeposit() view returns (uint256)
burn(uint256 amount)
burnFrom(address account, uint256 amount)
```

`pending()` 返回累计未领取整天资格的肖数量，**不扣除未达标期间，也不检查当前是否达标**。没有仓位时返回零。不同地址各存 12 小时，不能合并成 1 UBIC1。一个地址一个仓位不等于一个人一个仓位。

claim 铸造奖励但不转 ETH；withdraw 仅退本金，要求合约钱包能接收 ETH，若拒收，整笔提款回滚。没有其他收款地址或救援接口，因此不要通过无法接收 ETH 的合约存款。

普通直接转 ETH 会失败，必须调用 `deposit()` 或 `topUp()`。被强制转入的 ETH 不记为任何用户的本金，不帮助其达到门槛，不改变奖励或退款，没有取回接口。存款本金不进行外部投资，也不是 UBIC1 可赎回的储备。

## 实现与编译版本

保留并精确固定 **Solidity 0.8.37** 和 **OpenZeppelin Contracts 5.4.0**。0.8.37 是明确固定的已发布版本，避免浮动 pragma 和自动跟随最新编译器；不使用实验性语言功能。这是本项目的保守选择，不代表编译器绝无问题。[官方发布说明](https://www.soliditylang.org/blog/2026/09/10/solidity-0.8.37-release-announcement/)。

优化开启，runs=200，明确指定 Shanghai EVM 目标。部署链必须支持该指令集并以 ETH 为原生币；`ether` 只是 Solidity 数值单位。区块时间取自部署链的 `block.timestamp`。

奖励公式：

```text
(floor((block.timestamp - depositedAt) / 86400) - claimedPeriods) × 10000 肖
```

仓位只使用一个 `mapping(address => Position)`。两个 `uint64` 时间字段合占一个 slot，新增的 `uint256 principal` 占另一个 slot：现在本金可变，不能再由仓位数量推导，必须记录。`genesisTime` 为 immutable；当前纪元、当前门槛、pending 都由现有状态计算。

`depositedAt == 0` 表示没有仓位；存款明确拒绝零时间戳，uint64 转换使用 SafeCast。ERC-20 和防重入组件的必要状态保留。

没有仓位 ID、单独 active 标记或 `totalPrincipal`。总质押负债可从携带金额的 `Deposited`、`ToppedUp`、`Withdrawn` 事件在链下累计；强制转入的 ETH 会让合约余额高于真实负债，不能把余额直接当作本金统计。

无逐秒速率舍入，无小数累计。结算时先更新 `claimedPeriods` 再铸币，`depositedAt` 不变。withdraw 不调用结算，直接删除仓位并退还实际本金；退款失败时全部回滚，仓位与待领取资格均恢复。deposit、topUp、claim、withdraw 均受 ReentrancyGuard 保护。单次操作无循环。

本版本移除带仓位 ID 的旧接口，不做接口兼容。若有旧版本已部署，无法原地修改；本仓库没有执行链上部署或迁移。

## 验证

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

锁文件固定依赖；构建生成 `artifacts/UBIC1.json`，含 ABI 和字节码，构造函数无参数。测试使用本地 Ganache Shanghai EVM，并主动启用其 JavaScript 后备实现以避免 Node 原生扩展版本不匹配。

测试覆盖：纪元边界前后一秒、多个纪元、Alice 第 1200 天追溯领取、失败 claim 不改状态、分次与提前补仓、当前门槛下新开仓、超额本金退款、跨纪元不重复计奖、不足额无条件退本、已发行币不受退出影响、两种退款失败分支回滚、持续领取、权限隔离、重入、4 位精度、自愿和授权销毁。非存款余额测试通过节点 RPC 模拟账本外资金流入。

测试不构成独立安全审计，也不能证明绝无 bug。
