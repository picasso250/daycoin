# 通用 Ethereum 合约部署

**两个参数：网络配置文件 + 已编译 artifact。** 同一个 `scripts/deploy.mjs`、`scripts/verify.mjs` 可用于 UBIC1、UBIC1-v0.2 和后续版本，不按版本复制脚本。

## 预演（默认不签名、不发送）

```powershell
npm run build:v02
Copy-Item .env.sepolia.example .env.sepolia
# 编辑 .env.sepolia，只在本地填入 Sepolia 测试钱包私钥。
npm run deploy -- .env.sepolia artifacts/UBIC1V02.json
```

预演输出 `CHAIN_ID`、部署地址、编译物创建 Hash、Gas 上限及费用预算。**不会写入部署记录或广播交易。**

网络配置文件使用 `CHAIN_ID`、`RPC_URL`、`PRIVATE_KEY` 和可选 `MAX_DEPLOY_FEE_ETH`（默认 0.02 ETH）。RPC 必须使用 HTTPS；仅本机隔离模拟链允许 loopback HTTP。实际链的 `eth_chainId` 必须和环境文件一致，错链拒绝。建议按网络维护 `.env.sepolia`、`.env.mainnet`，而不按合约版本维护。现有 v0.1 的 `.env`、旧主网配置和历史入口保持不动；它们不自动兼容本新格式。

## 部署（只有明确授权时才执行）

```powershell
npm run deploy -- .env.sepolia artifacts/UBIC1V02.json --broadcast
```

**`--broadcast` 才会签署并发送部署交易。** 在运行之前必须人工核对预演显示的 Chain ID、artifact、创建 Hash、部署钱包与预估费用。请勿把真实钱包私钥发给他人或提交 Git。

部署工具使用与网络和 artifact 创建 Hash 绑定的独立记录，保存到 `deployments/`（已被 Git 忽略）。部署进程先独占预留记录，签名后先保存交易 Hash，再发送交易；如果广播响应丢失，**不可删除记录直接重跑**。请优先凭记录 Hash 核对链上状态。

## 核对链上的确切代码（只读）

```powershell
npm run verify -- .env.sepolia artifacts/UBIC1V02.json
```

核验不需要私钥（但需要环境文件中 `CHAIN_ID`、`RPC_URL`），也不会广播。它检查：
- 记录与所选 artifact 的创建 Hash 相符，创建交易 `chainId`、`from`、`nonce`、`to=null`、`value=0` 和完整创建字节码一致；
- 创建交易回执与预测合约地址一致；
- 读取当前链上运行时代码，与 artifact 逐字节核对 **除了 Solidity 编译器标记的 immutable 槽位**；同一个 immutable 在多个位置的写入值也必须一致。

Solidity 的 immutable 会在构造时写入运行时代码，因此通用核验器不能只比较静态 runtime Hash。它也**不能仅凭字节码证明每个 immutable 的业务含义**：UBIC1-v0.2 还须检查 `genesisTime` 等于部署区块时间、18 decimals、初始供应量和每日发行量；这属于版本专用协议验证，而不是部署程序的网络责任。

## 测试与历史兼容

```powershell
npm run test:deploy
npm run test:v02
npm --prefix sites/ubic1-v02 test
```

本地/CI 在完全隔离的 Ganache 模拟链测试通用部署器。旧的 `deploy:sepolia`、`deploy:mainnet` 保留供 v0.1 历史用途；**请勿用它们部署 UBIC1-v0.2**。新流程不触碰任何旧部署记录，v0.2 前端默认配置仍然全空。

真实 Sepolia 上使用真实钱包进行 Deposit → Claim → Withdraw 留给人工单独操作；部署工具不参与该测试。
