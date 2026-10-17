# DayCoin V1 / DC1 · 部署与核验

**现行合约：** `contracts/DayCoinV1.sol`，ERC-20 Name `DayCoin V1`，Symbol `DC1`。

- **Ethereum Mainnet（Chain ID 1）：** `0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715`
- **Sepolia（Chain ID 11155111）：** `0xBB322A88f2ED0EdFd3632825Cf44Bbb62B93Bd26`
- 公开交易与地址见 [README.md](README.md)；旧 UBIC1 合约与 DC1 互不迁移，旧部署命令不属于现行工作流。

## 构建（不会广播）

```powershell
npm run build
npm run test:dc1
npm test
```

默认构建产物：`artifacts/DayCoinV1.json`。编译器 Solidity 0.8.37，EVM Shanghai，Optimizer runs 200。部署产物基准 Creation Hash 为：

`0xd3888c5525657300e00c91245fcc9fdfde4aebfced36a92639522499362532f6`

如果以后重新编译得出不同 Creation Hash，先追查依赖、源码与编译环境，不要直接发布。

## 预演命令格式（供以后新版本参考）

```powershell
npm run deploy -- .env.sepolia artifacts/DayCoinV1.json
npm run deploy -- .env.mainnet artifacts/DayCoinV1.json
```

配置文件使用 `CHAIN_ID`、`RPC_URL`、`PRIVATE_KEY` 和可选 `MAX_DEPLOY_FEE_ETH`；`.env.*` 必须只保存在本机（`.gitignore` 已排除）。预演会检查真实链 ID、Gas 估算、费用预算和余额，但**不会广播**。**上述两个网络已有 DC1 Journal，因此现在重复预演会因“部署记录已存在”被拒绝，这是正常安全保护。**

**重要：DC1 已经部署到上述两个网络。不要再执行同一版本的部署广播来“重试”或“验证”。** 重复部署会创建不同地址、引发用户混淆。

## 实际部署逻辑（历史记录；不必重跑）

部署器仅在明确添加 `--broadcast` 时签名发送交易。它采用独立 Journal（`deployments/<chain>-DayCoinV1-<creation-hash>.json`）：
1. 先排他性预留记录，再签名；
2. 在发送前保存准确交易哈希及 Nonce；
3. 成功后记录实际合约地址和运行时代码哈希；
4. 超时不会自动增加 Gas、替换 Nonce 或二次部署。

**不要删除或提交含有隐私信息的本地部署记录，不要为绕过“已存在记录”的防护而删除 Journal。请单独备份 Journal 和部署交易哈希。** Journal 不含私钥，但仍应避免把本机配置一并公开。

## 核验现有部署（只读）

```powershell
npm run verify -- .env.mainnet artifacts/DayCoinV1.json
npm run verify -- .env.sepolia artifacts/DayCoinV1.json
```

核验读取本地 Journal 和链上回执，比较创建交易字节码与产物、预期地址，以及除 Solidity `immutable` 槽位外的运行时字节码。对 `genesisTime` 等 `immutable` 的业务含义，还须单独读取链上变量检查。字节码核验不等于第三方安全审计。

## 历史版本与测试

旧 `UBIC1.sol` / `UBIC1V02.sol` 及其历史测试目前保留作回归与审查参考，**不是现行部署入口**。使用 `npm run build` 始终只构建 DC1；旧版编译需显式执行 `npm run build:v02` 等命令。旧网页在 `sites/ubic1-*`，仍可能指向旧合约；请勿误作 DC1 官网。之后如需删除历史源码，应同步重构编译辅助程序、测试、文档链接和 CI，避免破坏验证能力。
