# UBIC1 v0.2 · Sepolia 前端

从零实现的静态页面，仅支持 Ethereum Sepolia（11155111）。合约地址与 Runtime Hash 写死在 `dist/core.mjs`，与项目根目录 README 一致。不读取环境文件或私钥。

## 本地运行

在项目根目录：

```powershell
npm --prefix sites/ubic1-sepolia run dev
```

打开 http://127.0.0.1:5173 。静态运行无需安装依赖或构建。`dist/ethers.min.js` 是根项目 ethers 6.15.0 的本地 ESM 分发文件，附带 MIT 许可；没有远程脚本或字体。

## 测试

```powershell
npm --prefix sites/ubic1-sepolia test
npm --prefix sites/ubic1-sepolia ci
# 保持预览服务运行；Windows 使用已安装的 Edge
npm --prefix sites/ubic1-sepolia run test:browser
# 非 Windows 首次需要：在本目录执行 npx playwright install chromium
# 合约回归（在根目录安装依赖后运行）
npm run test:v02
```

浏览器测试完全拦截 RPC 并注入模拟钱包，不触碰真实钱包。截图输出到忽略的 `test-output/`。测试 fixture 为 2026-10-17 从指定 Sepolia 地址只读获取的公开 runtime，并验证固定 Hash。

## 实现与责任边界

- `core.mjs`：固定网络、ABI、链上快照、EIP-1193 适配和交易流程。只访问钱包标准方法，不把注入对象传给 ethers，也不探测 `then` 或钱包厂商属性。支持 EIP-6963 多钱包发现和标准 `window.ethereum` 注入。
- `app.mjs`：连接、刷新、三个操作与确认提示。所有金额保留 18 位精度；pending 直接读取合约。领取资格（pending > 0）与当前累计资格（principal >= requiredDeposit）分开显示。页面显示区块快照，点击刷新更新，不模拟链上时钟。
- Deposit 必须确认未领奖励和计时永久清零；Withdraw 确认取回全部记录本金及未领奖励作废。只调用无参数 `withdraw()`，不把本金作为转出 ETH，不做部分提款。
- 每次提交前核对数据 RPC 与钱包网络、账户、区块新鲜度（10 分钟）、高度差（最多 12 块）及双方 Runtime Hash。请求固定 `from`、`to`、`chainId`、`data`、`value`，Gas、nonce 和最终签名交给钱包。
- 账户、网络或连接事件使当前快照和确认失效；确认后再次读取身份。请求交给钱包以后，网页无法撤销用户已经授权的交易，钱包必须遵守指定账户和 chainId。
- 同页同步 busy 锁；可用时用 Web Locks 协调同源、同账户标签页。拒签（4001）释放锁；广播结果未知、无效哈希或回执无法核实时，本页停止新交易。等待回执最多两分钟。
- 成功只在固定链核对交易哈希、发送账户、目标地址、区块哈希和 status 后显示，标明 1 个区块确认；不承诺最终性或重组恢复。
- 不维护交易历史持久化、自动恢复、重发、人工解锁、跨设备协调或自定义 RPC。刷新网页会丢失本页未知交易警告，不会取消链上交易；请先到钱包及 Sepolia 浏览器核对。

## 最小充分责任自审

仅保留连接钱包、读取链上状态、Deposit / Claim / Withdraw 及必要的提交校验。没有前端奖励公式、钱包余额/Gas 预算器、链切换自动化、后端、数据库、统计追踪或主网入口。ethers 仅用于 ABI、单位转换和 Keccak-256，不使用钱包 Provider 包装器。Cloudflare 直接托管静态文件，不增加 Worker 请求处理代码。

## 验证记录（2026-10-17）

- 核心逻辑：26/26 通过，涵盖固定参数、1 wei 精度、Proxy、失格后的历史 Claim、全额 Withdraw、错误链/代码/过期区块、账户与网络变化、取消、并发、拒签、未知结果和失败回执。
- 浏览器：7/7 通过；桌面 1360 px、手机 390 px 无横向溢出，三个确认操作、账户变化、错链与未知交易阻断均通过，未发现页面脚本异常。
- 原有 v0.2 合约回归：16/16 通过（本地 Ganache），包括奖励边界、全额提款和本金不变量。Solidity 未改动。
- 真实 Sepolia：只读获取 runtime，Keccak-256 与任务书一致。真实 MetaMask/Rabby 签名、EIP-7702 与真实链上交易未测试。
- `wrangler deploy --dry-run` 通过。部署目标沿用根目录配置中的 `ubic1-sepolia` Worker，只更改静态目录。
- 已通过 `wrangler deploy --config wrangler.jsonc` 发布到 https://ubic1-sepolia.xi-aochi.workers.dev ，版本 `d6a4f21c-0b9a-4d79-8093-0a210a959366`。线上 HTML/模块返回 200，CSP 已生效；线上再次执行 7 项模拟钱包浏览器测试全部通过，无真实交易。

发布命令（根目录，需 Cloudflare 登录）：`wrangler deploy --config wrangler.jsonc`。
