# DC2 GitHub → Arbitrum One 主网登记与签发

状态：**主网代币已部署，Arbiscan 已验证源码；前端与 Worker 已切换至主网。签发开关取决于 Cloudflare Secret 配置。**

- Chain ID：`42161`（Arbitrum One）
- 固定合约：`0xD891dc80535e885E5893B8139902F90F6aBA086b`
- 永久 Issuer：`0x806918b917a89956B8AF1a2897940c475973E2d3`
- 签发：用户通过 GitHub OAuth 后由 Worker 核对 7 年 / 10 Star / 10 第三方已合并 PR / 10 Followers，签发有效期十分钟的 EIP-712 凭证。
- 用户用 `personal_sign` 链下证明钱包控制权，随后自己通过 Arbitrum One `register` 支付 Gas；GitHub ID 与地址永久公开绑定。
- 合约 `claim()` 按秒累积，以每天每资格 1 DC2 为基准发行；无需每天领取。

## 上线与开关

网站根目录：`sites/daycoin-mainnet`。Cloudflare 必须配置以下 *Secret*（不得提交 Git、写入 `wrangler.jsonc`、传入聊天或放进静态 assets）：

- `DC2_MAINNET_ISSUER_PRIVATE_KEY`：必须对应上述固定 Issuer 地址；缺失或不匹配时自动关闭签发。
- `DC2_MAINNET_ISSUANCE_ENABLED`：字符串 `true`，仅在签发者匹配时开启；不设置则关闭。

GitHub OAuth 已有的 `DC2_GITHUB_CLIENT_ID`、`DC2_GITHUB_CLIENT_SECRET` 和 `DC2_SESSION_SECRET` 仍然必需。`/api/dc2/issuer-status` 和 `/api/dc2/config` 为安全的只读健康检查。关闭签发可删除 `DC2_MAINNET_ISSUANCE_ENABLED`。

**重要**：这把主网密钥同时是部署钱包和 Issuer，暴露给任何互联网 Worker 都会扩大攻击面；建议专门准备 Cloudflare 访问隔离和私钥离线备份，不要赋予任何外部调用直接操作这把钱包的能力。更换 Issuer 已被合约设计永久禁止。

## 最低限度回归

```
npm --prefix sites/daycoin-mainnet test
node --test test/dc2-flow.test.mjs
npm --prefix sites/daycoin-mainnet run test:browser
```

主网首次登记必须由合格的真实 GitHub 用户自行操作。不得制造假 GitHub 身份或代替用户同意不可逆的身份关联。

## 已知限制

- 当前 Star 采用自有非 Fork 仓库的观察总数，PR 使用 GitHub 搜索前 100 条，来源独立性未证明；API 限流或部分数据可能误判资格。GitHub ID 不是自然人唯一身份。
- 会话最多保留 24 小时的资格观察；账号在会话期间发生变化时可能使用旧数据。重新登录可刷新检查。
- 钱包丢失后不能迁移注册资格，Issuer 丢失后不能继续新增登记。Issuer 私钥泄露可能导致虚假身份永久占用登记资格。
- 运行时代码与源码一致不等于第三方安全审计。
