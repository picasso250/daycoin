# UBIC1-v0.2 · 极简连续发行实验

**状态：v0.2 已部署到 Sepolia 测试网，尚未部署任何 v0.2 主网合约。** 固定测试合约见 [README.md](README.md)。不可把 v0.1 主网地址当成 v0.2 使用。

已部署 v0.1 合约：0x759723E3869181616D6567458b59bCbA365FEcEe。它无法删除、升级或修改，即使目前尚未公开推广。v0.2 是独立部署的合约。

## 三个入口

| 函数 | 行为 |
| --- | --- |
| deposit() payable | 任意正数额 ETH 入金或加仓；本金增加；奖励时钟重置，旧的全部未领取奖励丢失；不铸币 |
| claim() | 把尚未领取的合格秒数线性兑换成 UBIC1；推进奖励时钟，不动本金 |
| withdraw() | 随时清仓，按记录本金退款；放弃未领取奖励；不执行奖励计算 |

没有 topUp()：追加存款就是再次 deposit()。不支持部分提款。ERC20 name 和 symbol 为 UBIC1，decimals 为 18。没有 owner、升级、暂停、管理员增发或救援。

## 状态结构

~~~solidity
struct Position {
    uint64 cursor;       // 尚未结算的奖励时间游标
    uint256 principal;   // 可退的全部 ETH 本金
}
~~~

本金为 0 表示无仓位。存款只增加 principal、重置 cursor，无内部奖励账本，无历史迭代。

## 持续达标规则

自部署起每隔 1000 天，质押门槛上涨 0.1 ETH，初始为 0.1 ETH。只有本金在某个时间点达到该时刻门槛，才能累计奖励；多存本金不提高发行速率。

~~~text
epoch = 1000 * 86400 seconds
covered = floor(principal / 0.1 ETH)
currentEpoch = floor((now - genesisTime) / epoch)
eligibleEnd =
    now                             if covered > currentEpoch
    genesisTime + covered * epoch    otherwise
eligibleSeconds = max(0, eligibleEnd - cursor)
claimableSmallestUnits = floor(eligibleSeconds * 10^18 / 86400)
~~~

所以某个地址在第 0 天质押 0.1 ETH，到第 1000 天自动停止获得新奖励；在第 1200 天仍可以 claim 前 1000 天的合法奖励。若先 deposit 追加钱、未先 claim，那么之前的奖励按照已定稿规则作废，并从新 deposit 的时间重新开始。

Claim 允许随时进行，不必满一天。例如达到条件 12 小时可领取 0.5 UBIC1。每次 Claim 采用向下取整；每次独立铸币的误差严格小于 1 个代币最小单位，即 10^-18 UBIC1。为保持状态极简，本版不结转该微小余数。

## 示例

- 存入 1 wei，次日 Withdraw：原额退回，奖励为 0（Gas 另付）。
- 存入 0.001 ETH，过一年追加 0.099 ETH：新 Deposit 时才第一次开始累计奖励，先前一年为 0。
- 达标 3.5 天后直接再存 1 wei：丢弃未领取的 3.5 UBIC1；重新计时。
- 达标 3.5 天后先 Claim 再存 1 wei：领取的 3.5 UBIC1 保留；重新计时。
- 0.1 ETH 从创世时达标，第 1000 天失格，第 1200 天可以补领此前 1000 天，失格的 200 天不产生奖励。
- 0.3 ETH 可连续合格到第 3000 天；门槛再涨便失格。

## 安全约束

- 不变量：合约 ETH 余额 >= 所有活跃仓位的 principal 总和。Withdraw 不依赖门槛、Claim、ERC20 余额或等待期。
- 仍存在已知合约钱包问题：无法接收 ETH 的永久拒收智能钱包可能锁住自己的本金。若 EOA 使用 EIP-7702 委托，也要单独审查委托接收行为。
- 前端必须在任何 Deposit 前明显提示“未领取奖励和计时将永久归零”，最好显示 pending 数额；Withdraw 也必须提示奖励作废。此类 UI 是知情同意，不是链上安全边界。
- 2026-10-16 Astra 首次审计发现 V02-01～V02-05；第二次复审发现 R-01、R-02 来自新增的本地未决交易记录管理。当前简化版 **直接删除所有交易记录持久化、自动恢复和人工解锁**，保留固定 chainId、钱包变化时中止操作、单标签页同步 busy 锁、区块时间和高度检查，以及在预期链上验证交易回执。安全边界仍需独立复审。
- 如果钱包请求或广播结果不明，前端只在 **当前页面** 提示“交易结果未知”，阻止该页直接再次操作。用户应到钱包和可信浏览器核对是否成功。**刷新、重新开页、切换设备将失去本页警告，无法保证不会重复操作；刷新不代表旧交易失败。** 不再提供交易恢复服务或交易结果推断；任何前端锁都不影响可信工具直接调用链上的 Withdraw。
- 浏览器若提供 Web Locks，则尝试用其协调同源、同链、同合约、同账户的同时操作；不提供 Web Locks 的浏览器照常允许交易。对于不同标签页、不同浏览器或不同设备中用户各自确认的存款，协议不承诺全局只执行一次。每次真实 Deposit 都会增加可退本金、清空该地址尚未 Claim 的奖励；需要用户独立确认并留意钱包历史。
- 区块时间新鲜度门槛默认 10 分钟，钱包与数据 RPC 头高度偏差最大 12 个块。此检查无法证明单 RPC 或恶意钱包绝对可信；不支持跳过新鲜度检查直接存入。
- 新前端位于 `sites/ubic1-sepolia`，固定 Sepolia 网络、合约地址、Runtime Hash 和只读 PublicNode RPC，不提供网络或地址配置。已覆盖模拟 EIP-1193 钱包与故障场景；真实钱包（MetaMask/Rabby 等）和 EIP-7702 仍需人工独立复核，不发送主网资金。
- v0.1 前端使用不同 ABI、仓位字段和 decimals，不能直接改地址复用。
- 当前只能本地编译、测试，禁止在未另行明确授权的情况下部署主网或转移资产。

## 本地构建

~~~powershell
npm run build:v02
npm run test:v02
npm test
~~~

新合约：contracts/UBIC1V02.sol；测试：test/ubic-v02.test.mjs；构建产物：artifacts/UBIC1V02.json（gitignored）。旧版源码及部署记录不改动。

**部署与字节码核验：见 [DEPLOY.md](DEPLOY.md)。** 统一使用 `npm run deploy -- .env.sepolia artifacts/UBIC1V02.json`（默认仅预演）、`npm run verify -- .env.sepolia artifacts/UBIC1V02.json`（只读核验）；旧版部署脚本已退休。

任何未来主网部署之前仍需：独立安全审计、真实钱包端到端测试、测试网试运行、部署版本字节码核对、主网显式确认。真实存款风险无法完全消除。
