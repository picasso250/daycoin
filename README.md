# UBIC1 · v0.2

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

## 部署与网站

所有网络与合约统一使用两个参数的 [通用部署器](DEPLOY.md)，不再为每版单独复制脚本：

```powershell
npm run deploy -- .env.sepolia artifacts/UBIC1V02.json      # 仅预演
npm run verify -- .env.sepolia artifacts/UBIC1V02.json     # 只读字节码核对
```

当前前端位于 `sites/ubic1-sepolia/dist`，`wrangler.jsonc` 直接将其发布为现有的 `ubic1-sepolia` Cloudflare Worker。网站内容不包含私钥；只通过用户自己的 EIP-1193 钱包签名。本地预览：`npm --prefix sites/ubic1-sepolia run dev`，打开 `http://127.0.0.1:5173`。实现边界与测试见 [前端说明](sites/ubic1-sepolia/README.md)。

```powershell
npx wrangler deploy --config wrangler.jsonc
```

历史 v0.1 Solidity 源码仍保留在 `contracts/UBIC1.sol` 中供追溯；它与 v0.2 **互不升级、互不迁移**。旧版测试页面与旧版部署命令已退休，可通过 Git 历史查看。现有旧主网合约并未因网页更新而改变。

## 长期原则

UBIC 是协议家族名，UBIC1 是第一代实验。每版自愿选择、无管理员特权、名称不赋予权威。工程上实行**最小充分责任**：严格保护明确承诺的安全边界，不为了防止所有用户独立授权行为而维护复杂的全局事务状态。
