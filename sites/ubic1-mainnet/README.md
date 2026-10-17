# UBIC1 v0.2 · Ethereum Mainnet

独立静态站点，仅本地实现。未修改 Sepolia、Solidity 或根目录 Cloudflare 配置，未部署或广播任何真实交易。

## 设计来源

从 `ubic-v01-recovery` 的 Git 历史追溯，`sites/ubic1-sepolia/dist` 最早入库提交为 **a10f5c3 — Include dist files in repo**。本版恢复该提交的暖纸色、鼠尾草绿、Space Grotesk / DM Sans 排版、圆形印章、奖励主视觉与底部页签操作。

只参考旧版 HTML/CSS 的设计，不使用其业务代码。移除旧版 Top Up、整日奖励倒计时、事件统计和历史扫描。字体本地托管，许可在 `dist/fonts/`，页面无需第三方字体服务。

## 固定参数与只读验证

- Ethereum Mainnet，Chain ID `1`。
- 合约：`0xef04ABbc1EEf957715895c234f5dEef7d2452AE1`。
- Runtime Hash：`0x26b2fa278cceae9f52984986b1c9f1fcfc61f7d8b7184336abdc08637103c2d7`。
- 只读 RPC：`https://ethereum-rpc.publicnode.com`。
- 2026-10-17 于区块 `0x18fe22c` 核验 runtime 及合约 getter：`decimals=18`、`DEPOSIT_STEP=100000000000000000`、`PERIOD=86400`、`REWARD_PER_DAY=1000000000000000000`、`EPOCH_DURATION=86400000`。没有签名或发送交易。

业务代码以已验证的 Sepolia v0.2 `core.mjs`、`app.mjs` 为基础，固定主网参数。保持同一区块读取仓位、pending、代币余额及门槛；交易校验仍以链上状态为准。UI 从一次链上快照出发，按照 v0.2 每 86400 合格秒发行 1 UBIC1 的公式、质押本金和 1000 天纪元截止点，由浏览器每秒推算待领取奖励，不在计时器里请求 RPC。Pending 展示 5 位小数、ETH 钱包余额展示 6 位小数（悬停可看完整精度），取消手动刷新按钮；连接钱包及交易确认后重新同步链上快照。

每次 Deposit 提示未领奖励与计时永久归零；Withdraw 提示退回全部记录本金并放弃未领奖励。三个操作分别调用 `deposit()`、`claim()`、`withdraw()`。Gas、nonce 和最终签名由钱包处理。

提交前保留账户/网络复核、钱包事件失效、双方 Runtime Hash、区块新鲜度与高度差检查、单页锁和可选 Web Locks。未知广播结果锁住当前页面，不做自动恢复、重发或持久化。刷新网页不取消旧交易。回执验证固定链、地址、账户和区块哈希，显示 1 个区块确认，不承诺最终性。

## 本地预览

在项目根目录执行（预览无需安装依赖）：

```powershell
npm --prefix sites/ubic1-mainnet run dev
```

打开 http://127.0.0.1:5174 。与 Sepolia 的 5173 端口分开。

## 自动化测试

```powershell
npm --prefix sites/ubic1-mainnet ci
npm --prefix sites/ubic1-mainnet test
# 保持本地预览运行，再执行：
npm --prefix sites/ubic1-mainnet run test:browser
```

Windows 浏览器测试使用已安装的 Edge；其他系统在本目录先执行 `npx playwright install chromium`。全部浏览器测试注入模拟 EIP-1193 钱包并拦截 RPC；没有真实钱包交互或真实交易。公开 runtime fixture 只用于离线 Hash 校验。

测试覆盖固定主网参数、Deposit / Claim / Withdraw、严格 Proxy 钱包、错误网络、账户变化、取消、并发、未知结果、失败回执，以及桌面、390/320px 手机布局、键盘页签和减少动态效果偏好。截图位于忽略的 `test-output/`。

2026-10-17 执行结果：核心逻辑 **27/27**、浏览器 **8/8** 通过；桌面与手机截图已人工检查，页面未发现脚本异常。Git 边界核对确认只有新增主网站点，Sepolia、Solidity 与根目录 Wrangler 配置没有差异。

真实 MetaMask/Rabby 签名与 EIP-7702 钱包行为尚未实测。本任务不含 Cloudflare 发布，未添加主网部署配置。

## UI v2：信息架构与钱包菜单

保留原有暖纸色、鼠尾草绿、字体与圆形印章。Pending 居中放大，桌面、平板和手机均为全页最大的数字；其下分别展示钱包 ETH、本金、UBIC1 余额、门槛、发行资格与达标差额。

Connect Wallet 打开原生 dialog，先显示钱包检测状态，点击具体钱包才请求连接授权。保留 EIP-6963 与标准注入回退；连接后按钮显示缩写地址，菜单可复制完整地址或切换钱包。未知交易期间仍禁止切换和发送，保留复制能力。没有引入钱包连接库或 UI 框架。

`dashboard.mjs` 只负责展示数据：`eth_getBalance`、`totalSupply()`、`currentEpoch()`、`requiredDeposit()`、`genesisTime()` 和 `EPOCH_DURATION()`。连接后使用仓位相同的区块号；未连接时也可读取协议概况。下次门槛变化时间为 `genesisTime + (currentEpoch + 1) × EPOCH_DURATION`，标明 UTC。各项失败返回空值、显示 `—`；实际零余额正常显示零。Pending 始终来自合约，显示补足小数位但不丢弃原始精度。不扫描历史事件。

交易核心 `core.mjs`、ABI、主网参数、运行时代码验证、确认和回执流程均未修改。

UI v2 验证结果：原有 27 项核心测试与 8 项浏览器场景全部保留；新增 4 项只读数据测试、4 项钱包交互回归，共 **31/31 逻辑测试、12/12 浏览器测试通过**。另针对平板断点复查 Pending 字号，桌面/手机截图与钱包浮层已检查。测试使用模拟钱包和拦截 RPC，不签署或广播真实交易。
