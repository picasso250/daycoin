# DC2 GitHub OAuth 上线配置

DC2 技术预览：`https://daycoin.io99.xyz/dc2/`

目前采用零框架静态 HTML + ES Modules，复用原有 Cloudflare Worker，尚未部署 DC2 代币合约。服务器端实现了 GitHub OAuth 登录；未配置 OAuth 密钥时页面仍可访问，但登录按钮不可用，不会假装已经成功连接。

## GitHub OAuth App（需要维护者执行一次）

1. 在 GitHub 登录开发者账号，前往 **Settings → Developer settings → OAuth Apps → New OAuth App**。
2. Application name: `DayCoin 2 Preview`（可以自定义）。
3. Homepage URL: `https://daycoin.io99.xyz/dc2/`
4. Authorization callback URL: `https://daycoin.io99.xyz/api/dc2/callback`
5. 创建后获取 Client ID 和新建 Client Secret。**Secret 只配置给 Cloudflare Worker，不能放在静态前端、Git 仓库、聊天消息或截图里。**

官方 OAuth 文档：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

## Cloudflare Worker Secrets

在 `sites/daycoin-mainnet` 目录运行，分别通过交互式命令输入值：

```sh
wrangler secret put DC2_GITHUB_CLIENT_ID
wrangler secret put DC2_GITHUB_CLIENT_SECRET
wrangler secret put DC2_SESSION_SECRET
```

`DC2_SESSION_SECRET` 推荐至少 32 字节高熵随机值，如用 `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` 在自己的终端生成，勿在聊天中分享。

如直接编辑 Worker env，测试用可配置的 `DC2_PUBLIC_ORIGIN` 需严格匹配预览服务的 Origin；默认限制为正式域名 `https://daycoin.io99.xyz`。

设置 Secrets 后，访问 `https://daycoin.io99.xyz/api/dc2/config` 应显示 `loginReady: true`；再实际走一遍 GitHub 授权登录及退出。Secrets 的存在不能替代登录实测。

## 机制与风险

- OAuth 发起采用随机 State + Secure/HttpOnly/SameSite cookie，服务端交换授权码，不在前端暴露 GitHub token。
- 用 HMAC 签名短期（24 小时）公开摘要 cookie；不在数据库持久化 Github token。
- 当前只显示账号年龄、公开原创仓库采样、总 Star 和外部合并 PR 采样，不表示正式资格通过。
- API 部分数据是采样，Star 独立性、贡献跨度尚未充分验证，不能拿来签发永久资格。
- GitHub token 在 Worker 请求结束后丢弃。GitHub API 配额、认证失败、账号数据不完整均按预览处理。
- 当前**没有钱包登记、没有 DC2 铸币合约、没有发行任何 DC2**。
- 要启动永久资格的链上登记，需先固定可审计的证据模型、唯一性方案和签发者信任模型；不要因为 UI 已上线就宣布代币已发行。

## 验证与发布

```sh
npm test
npm run build:cloudflare
wrangler deploy
```

已有的 DC1 网站以及链上合约保持不变。发布不需要也不应该重部署 DC1。
