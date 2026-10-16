# UBIC1：Sepolia 部署与验证

合约：`contracts/UBIC1.sol`，名称 / Symbol / Solidity 合约名均为 `UBIC1`。Solidity 固定 **0.8.37**，OpenZeppelin **5.4.0**，优化 runs=200，EVM 目标 Shanghai。经济规则、24 小时和千日纪元不因测试而缩短。

## 需要准备

1. Node.js **22.9+**（或更高的受支持版本）和 npm，支持 `--env-file-if-exists`。
2. 可访问的 **Ethereum Sepolia RPC**，chain ID 必须为 `11155111`。脚本拒绝主网和其他链。
3. 一个只用于测试的私钥，通过本机 `.env` 或环境变量提供。不要把私钥放进源码、命令行参数、截图或提交记录。聊天中已经公开的私钥不能用于真实资产。
4. 对应地址中的 **Sepolia 测试 ETH**。部署需要 gas；完整流程还需至少 **0.1 ETH + 补仓 1 wei + 全部交易的 gas**。准备约 0.12 ETH 作为起步余额，但是否足够取决于实际 gas；部署预检会显示当时的估算。本金会在退出时退回。

可从 [Ethereum 测试网说明及水龙头入口](https://ethereum.org/en/developers/docs/networks/#sepolia) 获取资源。测试 ETH 不是主网 ETH。无需 Etherscan API key 即可执行这些脚本；本流程不自动提交浏览器源码认证。

## 配置

在项目根目录执行：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
Copy-Item .env.example .env
```

编辑 `.env`，填入 `SEPOLIA_RPC_URL` 和 `PRIVATE_KEY`。已有 `.env` 时不要重复覆盖。模板提供公共 RPC 地址，也可以改为自己的 RPC。私钥格式必须为 `0x` 加 64 个十六进制字符，**末尾不要带反斜杠**。

`UBIC1_ADDRESS` 可先留空，部署成功后自动使用 `deployments/sepolia.json` 的地址。`.env` 与部署记录目录已加入 `.gitignore`。无需把私钥再发到聊天里。

## 部署

```powershell
# 只预检，验证网络、账户余额、估算 gas；不广播
npm run deploy:sepolia

# 广播部署交易
npm run deploy:sepolia -- --broadcast

# 只读验证运行时代码、名称、Symbol、精度和常量
npm run test:sepolia -- inspect
```

部署脚本为 gas limit 添加 20% 余量，并按当时 EIP-1559 费率上限检查余额。部署前不需要先锁定本金。

记录包含部署地址、交易哈希、区块、创世时间、编译设置和运行时代码哈希，不含私钥或 RPC。广播后先保存 pending 记录，再等待确认，避免等待超时后无意重复部署。有任何已有记录时脚本拒绝重新部署；应先核查交易状态，不能直接删除记录重试。

若记录停留在 pending，可用打印的交易链接检查是否成功；若已成功，设置 `UBIC1_ADDRESS` 后运行 inspect。不要因为网络等待超时就假定交易失败。脚本按一次区块确认继续执行，不等同于最终性保证。

## 阶段一：即时冒烟测试

```powershell
npm run test:sepolia -- smoke
```

执行真实交易：新建仓位 → 拒绝重复存款（只读模拟）→ 补入 1 wei → claim → withdraw。

验证仓位起始时间不变、实际本金正确、claim 保留仓位、退出事件报告全部本金且仓位关闭。正常情况下尚未满一天，claim 没有奖励。本阶段**不证明满一天的正数奖励已在真实 Sepolia 验证**。

只在当前地址没有仓位时启动；不会覆盖既有仓位。发生中断时停止，不自动退出，以免误清除用户有意保留的仓位。查看链上状态后使用下面的 withdraw 命令取回本金。

## 阶段二：真实 24 小时奖励

```powershell
# 开仓并保留，脚本打印首个奖励的 UTC 时间
npm run test:sepolia -- stake

# 真实经过至少 24 小时后手动运行
npm run test:sepolia -- harvest

# 测试完毕后，结算剩余奖励并退回全部本金
npm run test:sepolia -- withdraw
```

harvest 在未成熟时退出，不发送交易；成熟后领取奖励，核查领取周期和余额增加，向自己转账 **1 肖**，再自愿销毁 **1 肖**，确认仓位仍然保留。它不向外部第三方赠送代币。运行一次即可验证；再次运行需要等到下个完整周期。

withdraw 会真实关闭当前仓位。若届时本金低于纪元门槛，按照协议丢弃未铸造资格并退回本金。没有额外授权的自动定时任务；不会后台等一天或自动再次领取。

保持测试账户单独使用，避免同一私钥的其他程序同时发交易，造成 nonce 竞争或余额断言失败。

## 验证范围与限制

- `npm test`：本地 EVM 规则测试，涵盖千日边界、追溯补仓等；还在**隔离的模拟 Sepolia** 上端到端运行部署与所有链上测试脚本。模拟网络的 chain ID 相同，**不等于真实 Sepolia 已部署**。
- `npm run test:sepolia -- inspect`：只读校验，比较本地构建与链上运行时代码，忽略编译器标注的 immutable 地址区段；同时核查元数据和常量。有部署记录时还比对完整运行时代码哈希。
- `smoke`、`stake`、`harvest`、`withdraw`：消耗真实 Sepolia gas，并改变链上状态。
- 测试网不能随意加速时间。1000 天、2000 天和 1200 天追溯领取由本地 EVM 时间推进验证，不在 Sepolia 修改合约来模拟。
- 这些脚本验证行为与构建一致性，不构成独立安全审计。没有主网部署脚本。
