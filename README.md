# DayCoin V1 / DC1 · Ethereum Mainnet

**当前正式合约源码：** [`contracts/DayCoinV1.sol`](contracts/DayCoinV1.sol)。品牌 DayCoin，ERC-20 Name `DayCoin V1`，Symbol `DC1`。口号：*One Coin a Day.*

**正式主网：** [`0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715`](https://etherscan.io/address/0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715)，Chain ID **1**，部署交易 [`0x868a542a…549e9155`](https://etherscan.io/tx/0x868a542a0953ecf40458b7750d3b4082a5e74e551a437d903c01ac9e549e9155)。

**DC1 Sepolia：** [`0xBB322A88f2ED0EdFd3632825Cf44Bbb62B93Bd26`](https://sepolia.etherscan.io/address/0xBB322A88f2ED0EdFd3632825Cf44Bbb62B93Bd26)，Chain ID **11155111**。

合约源自历史 UBIC1 v0.2，仅调整 Solidity 合约名及 ERC-20 名称和符号，不改变发行和存提款逻辑。**旧合约是独立历史实验，切勿使用旧 artifact 代替 DC1 部署。** 代码核验通过不等于第三方安全审计；真实钱包 Deposit → Claim → Withdraw 仍需用户自行验收。

本地默认构建与测试（不签名、不部署）：

```powershell
npm run build
npm run test:dc1
npm test
```

构建产物为 `artifacts/DayCoinV1.json`；主网和测试网部署记录在本地忽略目录 `deployments/`，**请妥善备份，不要为了重新部署而删除**。网络、部署与只读验证参见 [DEPLOY.md](DEPLOY.md)。

---

## 历史资料：UBIC1 v0.2（不是 DC1）

UBIC1 是一个不设 Owner、不可升级的 Ethereum 货币发行实验。**当前公开测试站只连接 Sepolia 测试网络，不使用真实主网 ETH。**

**测试入口：** https://ubic1-sepolia.xi-aochi.workers.dev/

**Sepolia v0.2 合约：** [0x407892d5606b0FB91D77C62aC306566E01963674](https://sepolia.etherscan.io/address/0x407892d5606b0FB91D77C62aC306566E01963674)，Chain ID 11155111。部署区块 11928435，运行时代码 keccak256 `0x2c4e7b4318fa60fc3bf7b1560997d350585a8d474c82aa8def4818e91effe6db`。

- `Deposit`：存入任意正额测试 ETH；**每次存入都会重置计时，并永久放弃尚未领取的 UBIC1**。初始奖励资格门槛为 0.1 ETH，每千日提高 0.1 ETH。
- `Claim`：符合资格时按秒线性累计奖励，速率每天 1 UBIC1。代币精度为 18。
- `Withdraw`：退回记录本金，不自动领取奖励；未领部分将被放弃。交易 Gas 另付。

一个地址不等于一个人；测试仅验证可审查的发行机制，并不构成安全或投资保证。不能接受 ETH 的合约钱包可能无法提回本金。更详细的规则与审计边界见 [UBIC1-V0.2.md](UBIC1-V0.2.md)。

## 编译与测试

```powershell
npm ci
npm run build
npm test
npm --prefix sites/ubic1-sepolia test
```

## 链上核验与历史网站

当前 DC1 已部署，**不要重复执行部署**。可以通过通用 [只读核验器](DEPLOY.md) 检查现有合约：

```powershell
npm run verify -- .env.mainnet artifacts/DayCoinV1.json
npm run verify -- .env.sepolia artifacts/DayCoinV1.json
```

这些命令需要本地 `deployments/` 中的原始 Journal。历史 UBIC1 的部署命令和测试仅供研究，不应用于新的 DC1 发行。

当前前端位于 `sites/ubic1-sepolia/dist`，`wrangler.jsonc` 直接将其发布为现有的 `ubic1-sepolia` Cloudflare Worker。网站内容不包含私钥；只通过用户自己的 EIP-1193 钱包签名。本地预览：`npm --prefix sites/ubic1-sepolia run dev`，打开 `http://127.0.0.1:5173`。实现边界与测试见 [前端说明](sites/ubic1-sepolia/README.md)。

```powershell
npx wrangler deploy --config wrangler.jsonc
```

历史 v0.1 Solidity 源码仍保留在 `contracts/UBIC1.sol` 中供追溯；它与 v0.2 **互不升级、互不迁移**。旧版测试页面与旧版部署命令已退休，可通过 Git 历史查看。现有旧主网合约并未因网页更新而改变。

## 长期原则

**DayCoin** 是现行项目品牌，**DC1** 是已上主网的第一代独立合约；历史 UBIC1 v0.1、v0.2 不会自动升级或迁移到 DC1。每版自愿选择、无管理员特权，名称不赋予权威。工程上实行**最小充分责任**。
