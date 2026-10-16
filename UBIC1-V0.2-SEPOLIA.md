# UBIC1-v0.2 · 独立 Sepolia 部署及字节码核验

**状态：部署工具已经实现并可以在本地 Ganache Sepolia 模拟链执行完整部署与核验。真实 Sepolia 部署必须另行明确授权运行 `--broadcast`，且需要专用测试钱包和 Sepolia 测试 ETH。**

本流程不会修改、覆盖或调用旧的 `deploy:sepolia` / `test:sepolia`（它们是 **v0.1**、4 decimals、旧 ABI）。所有 v0.2 源码均为 `contracts/UBIC1V02.sol`，ERC-20 采用 **18 decimals**。

## 独立性

| 项目 | v0.1（旧） | **v0.2（新）** |
| --- | --- | --- |
| 部署命令 | `npm run deploy:sepolia` | `npm run deploy:v02:sepolia` |
| 只读校验 | `npm run test:sepolia -- inspect` | `npm run verify:v02:sepolia` |
| Solidity | `contracts/UBIC1.sol` | `contracts/UBIC1V02.sol` |
| 编译物 | `artifacts/UBIC1.json` | `artifacts/UBIC1V02.json` |
| 部署记录 | `deployments/sepolia.json` | `deployments/sepolia-v02.json` |
| 环境文件 | `.env` | `.env.sepolia-v02` |
| 私钥变量 | `PRIVATE_KEY` | `UBIC1_V02_SEPOLIA_PRIVATE_KEY` |

**默认 v0.2 前端 `sites/ubic1-v02/dist/config.mjs` 的网络、地址和 RPC 均保持 `null`，不会自动启用真实资金交易。**

### 第一步：创建独立的测试网络部署凭据

```powershell
Copy-Item .env.sepolia-v02.example .env.sepolia-v02
```

编辑本地 `.env.sepolia-v02`：

- `UBIC1_V02_SEPOLIA_RPC_URL`：可信 Sepolia HTTPS JSON-RPC 端点。
- `UBIC1_V02_SEPOLIA_PRIVATE_KEY`：仅用于部署的独立测试钱包私钥（绝不可提交或粘贴到聊天中）。
- `UBIC1_V02_SEPOLIA_MAX_FEE_ETH`：部署交易按 EIP-1559 费用上限计算的最高可接受 Gas 支出，默认 0.02 Sepolia ETH，可自主调整。

务必使用**不会持有真实资产**的独立部署钱包，只为它准备少量 Sepolia 测试 ETH。后续使用真实扩展钱包做 Deposit / Claim / Withdraw 的测试由用户人工执行，可以使用另一个测试钱包。不要复用主网密钥、已经公开过的测试私钥或有主网 ETH 的钱包。

### 第二步：只编译与预演（默认无任何交易）

```powershell
npm ci
npm run build:v02
npm run test:deploy:v02
npm run deploy:v02:sepolia
```

最后一个命令默认**只查询 Sepolia 链 ID、gas、费用、部署者余额并重新编译**；**不会签名、广播或写入部署记录**。成功输出部署者地址、创建字节码 keccak256 Hash，以及下一步显式确认命令。

若意外连接 Mainnet (1)、本地 Chain ID (31337) 或其他链，部署器必须拒绝；如果字节码 Hash 与用户确认值不同，也必须拒绝。

### 第三步：实际部署（单独显式授权才执行）

复核费用、部署者地址和创建字节码哈希后，在用户明确要求发出 **Sepolia 测试币部署交易**时才运行类似下述命令：

```powershell
npm run deploy:v02:sepolia -- --broadcast --confirm-deployer=0xYOUR_DEPLOYER_ADDRESS --confirm-creation-hash=0xYOUR_64_HEX_CREATION_HASH
```

请使用预演命令实际输出的完整地址与 Hash，不要照抄占位符。

广播时：

1. 重新检查 `chainId=11155111` 与 `contracts/UBIC1V02.sol` 构建结果，确认部署者和创建 Hash 均与命令行输入相符。
2. 费用上限超出设定或测试 ETH 不足则拒绝。
3. **先独占创建** `deployments/sepolia-v02.json`，防止两个部署进程同时执行。
4. 选择 nonce，离线签署交易，**先在记录中保存可计算的交易 Hash**，然后才向 Sepolia RPC 广播。广播响应丢失时**不可直接再次部署**，应查看该 Hash。
5. 等待成功回执，然后执行下面的字节码核验，通过才将记录标为 `verified`。

部署记录被 gitignore 忽略，不含私钥或签名原文。**不要删除未完成或状态为 `signed`、`pending` 的记录以强行重跑。**

### 第四步：独立只读核对实际链上部署产物

```powershell
npm run verify:v02:sepolia
```

该命令**无需私钥，不广播，也不修改记录**。它严格使用 `deployments/sepolia-v02.json` 中的合约地址和部署交易 Hash，不读取 v0.1 记录：

1. RPC 的 Chain ID 必须是 **11155111**。
2. 根据固定编译器配置构造 v0.2 编译字节码，验证本地 `creationHash` 与部署记录一致。
3. 获取原始创建交易和交易回执，验证部署交易的 `to=null`、`value=0`、`chainId`、`from`、`data` 均匹配，且 `receipt.status=1`、合约地址匹配。
4. 查询部署区块的时间戳，将其写入编译器标记的唯一 Solidity `genesisTime` **immutable** 的每个位置（v0.2 编译物有多个该 immutable 的引用），构造**精确预期完整运行时代码**。
5. 读取该部署区块上的真实 `eth_getCode`，逐字节比较**完整 runtime（包括 metadata）**；不掩盖不可变槽、也不只比较长度。
6. 在部署区块读取 `genesisTime`、name、symbol、decimals、totalSupply 以及 `DEPOSIT_STEP`、`EPOCH_DURATION`、`PERIOD`、`REWARD_PER_DAY`、`requiredDeposit`。必须验证 genesis 等于部署块 timestamp、18 位精度、初始 supply=0、最低资格 0.1 ETH 和每日 1 UBIC1。

任何不一致都导致非零退出码，绝不标示 Verified。**本地 CI 用同样的函数对真实模拟 EVM 上的部署产物做完整检查，包括拒绝把 v0.1 合约冒充 v0.2。**

### 第五步：真实钱包人工测试（单独执行）

通过 Sepolia 真实链部署与独立核验后，再另行安排连接 MetaMask / Rabby 等真实扩展钱包的手动测试：Deposit、等待可领时间、Claim、Withdraw、逐项检查链上余额与事件。当前 v0.2 前端默认配置全空；应在独立审查后以正确 Sepolia 地址、链 ID、runtimeHash 配置专门测试站点。**不要直接更改现有 v0.1 站点地址，或把未经验证的部署地址复制进生产页面。**

## 本地/CI 回归

```powershell
npm run test:deploy:v02
npm run test:v02
npm --prefix sites/ubic1-v02 test
```

`test/v02-sepolia-deployment.test.mjs` 在**隔离模拟的 Sepolia Chain ID 11155111** 上执行完整部署 + 核验，并验证 dry-run 不广播、错误 Hash/地址拒绝、重复部署拒绝、伪造记录拒绝、v0.1 代码拒绝。它不联系真实 Sepolia RPC，不读取实际私钥。

## 原则

本部署流程采用最小充分责任原则：保护「部署到预期网络、部署正确合约、完整验证已部署产物、避免意外重复部署」这些工程承诺，不承担自动化模拟人工钱包交易、跨设备钱包事务管理或对所有未来用户失误兜底的责任。
