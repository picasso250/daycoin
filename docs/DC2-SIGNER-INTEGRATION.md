# DC2 GitHub → Arbitrum Sepolia 注册原型

状态：已完成本地端到端测试；**Arbitrum Sepolia 合约尚未部署；正式代币尚未发行**。

## 数据和权限流

1. GitHub OAuth 完成后，Worker 将可信 GitHub 数字 ID、账户创建日期、已观察的仓库 Star、第三方合并 PR、Followers 放进短期 HMAC 签名的 HttpOnly 会话。浏览器传来的指标**完全不参与资格签发**。
2. 验证规则（候选 v0.2）：账户 7 个完整公历年且 10 Star / 10 第三方合并 PR / 10 Followers 全部满足。采用首期简化方案：Star 为自己非 Fork 仓库获得的可观察总数，PR 为 GitHub 搜索前 100 条内确认属于第三方仓库的已合并 PR；**尚未做来源独立性审计，命中 ≥10 才可作为通过证据；数据缺失不通过**。
3. 用户在 Arbitrum Sepolia (421614) 连接钱包，服务端向该钱包返回 5 分钟有效的 HMAC 绑定挑战（GitHub ID、钱包、链、目标合约、登录会话）。
4. 钱包使用 `personal_sign` 证明控制权，Worker 验证签名及挑战完整性，才用专用测试网 Issuer 签发 EIP-712 `Enroll(uint256 githubId,address recipient,uint256 deadline)`。
5. 前端调用测试网 DC2 合约 `register`。合约公开 GitHub ID 和钱包对应关系、强制唯一、登记后按秒累计每天 1 DC2。签发本身不表示已经链上登记。
6. 正式上线前必须加入明确的用户授权提示：GitHub ID 与钱包链上公开绑定且不可删除；建议使用专用钱包。

## 禁用与配置

没有配置时，`/api/dc2/issuer-status` 返回 `enabled:false`，`/api/dc2/prepare` 和 `/api/dc2/attest` 返回 503。页面里的测试网登记按钮保持禁用。

必须**同时**具备以下 Worker Secret/环境变量，才会启用测试网签发：

- `DC2_TESTNET_ISSUANCE_ENABLED=true`
- `DC2_SEPOLIA_CONTRACT=0x...` （在 Arbitrum Sepolia 上真实部署的 DayCoinV2 合约地址）
- `DC2_TESTNET_ISSUER_PRIVATE_KEY` （仅限测试网的签发密钥；绝不提交 Git）

必须确保部署合约的 immutable `issuer` 等于这把测试网密钥的地址。不要复用 DC1 私钥或任何资金钱包私钥。**当前不要设置以上三项**；下一阶段先完成真实 Sepolia 合约部署和 issuer 地址核对。专用密钥需要严格管理，主网正式发行前需再次安全审查。

## 本地测试

```bash
npm --prefix sites/daycoin-mainnet test
node --test test/dc2-flow.test.mjs
npm --prefix sites/daycoin-mainnet run test:browser
```

`dc2-flow.test.mjs` 覆盖从服务器规则到签发、钱包证明、ABI 编码、真实本地 EVM 登记和时间累计 Claim。私钥仅使用测试过程临时随机生成的密钥。

## 已知风险和限制

- 简化的 Star/PR 规则防刷能力有限，但保留了用户同意的 7/10/10/10 门槛。GitHub API 可能限流或返回不完整数据，数据缺失必须失败关闭。
- GitHub 认证不是自然人唯一性证明。签发者的私钥泄露会破坏资格完整性；协议公开身份 ID 可直接阻止重复 ID，但无法证明签发者未虚构不同 GitHub ID。
- 会话最多有效 24 小时，旧会话若缺少 `createdAt` 必须重新登录，不保留旧数据兼容分支。
- 钱包私钥丢失后资格无法迁移，固定 issuer 也无法轮换；正式发行前必须决定是否接受。
- 挑战仅用于授权登记签名，不能替代合约的唯一性判断或审计；签发接口不记录持久化许可证数据库。
