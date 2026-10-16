# UBIC1 Ethereum L1 主网部署准备（**尚未部署**）

主网合约源代码：`contracts/UBIC1.sol`，**与 Sepolia V2 逻辑相同**。主网部署后不可升级，无 Owner、暂停、救援或管理员功能。真实 ETH 存入后，智能合约账户如不能接收 ETH，可能无法通过 `withdraw()` 取回；普通外部账户需要另外支付 Gas。Claim 后再 Withdraw 需要两笔交易，直接 Withdraw 会放弃所有未领取奖励，包括已成熟的部分。

**部署失败**通常只损失 Gas，**部署成功后的使用风险**则可能涉及实际锁入的 ETH。部署意味着任何人都能直接调用公开地址，不存在真正的私有测试阶段。不要使用此前任何在聊天里出现过的私钥。

## 前提条件

1. 先审查最新 Solidity 代码和全部测试；主网部署是一个独立的制度选择，不以 Sepolia 上无异常交易保证主网无漏洞。
2. 在全新钱包生成 **从未公开过的私钥**；不要与 Sepolia V1/V2 部署钱包复用。
3. 配置可信任的 Ethereum Mainnet HTTPS RPC，只接受 Chain ID `1`。
4. 在本地复制 `.env.mainnet.example` 至 `.env.mainnet`，只填入 `MAINNET_RPC_URL` 和 `MAINNET_PRIVATE_KEY`。本文件被 Git 忽略；不会读旧 `.env`。
5. 设置 `MAINNET_MAX_DEPLOY_FEE_ETH` 作为本次部署 **Gas 上限预算**。主网实际 Gas 价格动态变化，Sepolia 价格不适用。
6. 已存在 `deployments/mainnet.json` 时脚本禁止新部署；交易超时后先查 Etherscan，勿清理记录后盲目重发。

## 仅执行预检（不会发送交易）

```powershell
Copy-Item .env.mainnet.example .env.mainnet
# 手工编辑 .env.mainnet 后
npm test
npm run build
npm run deploy:mainnet
```

核对输出中的 `Network: Ethereum Mainnet (chain 1)`、Deployer 地址、余额、Gas 估算与最大可能手续费。预算太低时脚本会拒绝广播，此时应等待费率下降或由本人明确修改手续费预算。

## 广播（必须在审查通过并明确授权后才能执行）

```powershell
npm run deploy:mainnet -- --broadcast --confirm-deployer=0x你的主网部署钱包地址
```

部署后只记录 **单笔交易**、完整运行时代码哈希和地址到本地 `deployments/mainnet.json`。初始供应必须为零；脚本会按精确编译设置验证链上字节码（只忽略构造函数嵌入的时间戳字段）。需另外在 Etherscan 提交合约源码验证。**不要自动发布或将 Sepolia 前端改指主网**；先做独立链上核验与正式发布决策。

⚠️ `deploy:sepolia` 只支持 Sepolia、`deploy:mainnet` 只支持主网。两者的私钥环境变量和部署记录严格隔离。
