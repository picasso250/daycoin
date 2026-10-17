# DayCoin V1 · DC1 Mainnet Website

The public mainnet interface for the *DayCoin* project. Official URL: https://daycoin.io99.xyz/.

- Mainnet Chain ID: 1
- DC1 smart contract: 0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715
- Runtime Keccak-256: 0xfdde03bc7708ba27ee8fae35e8c643e7bff09d1754dbdf173514417d33109c2c
- Public JSON RPC: https://ethereum-rpc.publicnode.com

The frontend compares the fixed runtime code hash and chain ID before transactions and checks the wallet identity on sensitive operations. It does not hold private keys. All deposits/withdrawals move real mainnet ETH. **Claim before topping up or withdrawing**, or unclaimed accrued rewards will be irreversibly forfeited.

Local checks:

1. npm ci --prefix sites/daycoin-mainnet
2. npm --prefix sites/daycoin-mainnet test
3. npm --prefix sites/daycoin-mainnet run dev
4. npm --prefix sites/daycoin-mainnet run test:browser (while preview is running)

Deploy the frontend using wrangler.mainnet.jsonc. The former UBIC1 interface remains at https://ubi.io99.xyz/ as a distinct historical site; it does not use the DC1 contract.

## Whitepaper / 白皮书

唯一正文是仓库根目录的 Markdown。`whitepaper.config.json` 的 `source` 是唯一文件路径配置；改名时只改这里。封面版本、日期（含草稿状态）、理念及主网链接从正文提取。经济学内容不在模板中维护。

从仓库根目录执行（Node.js 22 或更新版本）：

```sh
npm ci --prefix sites/daycoin-mainnet
npm exec --prefix sites/daycoin-mainnet -- playwright install chromium
npm run build:whitepaper
npm --prefix sites/daycoin-mainnet run dev
```

打开 http://127.0.0.1:5174/whitepaper 和 http://127.0.0.1:5174/whitepaper.pdf。端口可通过 `PORT` 环境变量修改。Linux 构建机首次安装可用 `playwright install --with-deps chromium`。

构建以 Markdown-it + KaTeX 生成静态 HTML，同一 HTML 用 Playwright 所锁定的 Chromium 打印 A4 PDF。Noto Sans SC 中文字体、品牌字体和公式字体均为本地资源，许可证随资源复制。数学公式错误直接终止构建；网页不运行钱包代码、RPC 或第三方脚本。手机上超长公式可在公式区域横向滚动，PDF 中按可用宽度缩放。打印样式集中在 `whitepaper.css`。

输出为 `dist/whitepaper.html`、`dist/whitepaper.pdf`、`dist/whitepaper-assets/`，均不提交 Git。不要手改输出。Worker 仍使用原来的 `dist` 静态资源目录；Wrangler build hook 在运行时先重建白皮书，`whitepaper.html` 由静态资源默认规则映射到 `/whitepaper`，无需 Worker 路由代码。

更新正文后重新执行构建即可同步替换两种输出。依赖固定在 package.json 和 package-lock.json；检出旧提交后使用该提交的锁文件和 Chromium 重建。PDF 内部生成时间会改变，不承诺 PDF 字节级完全相同。没有历史输出目录或版本路由。

验证：

```sh
npm --prefix sites/daycoin-mainnet run test:whitepaper
npm --prefix sites/daycoin-mainnet test
npm --prefix sites/daycoin-mainnet run test:browser
```

白皮书测试自启临时预览，检查源文件哈希、章节/公式数、目录目标、320/390/1440px 布局、原站 CSP 下的渲染、本地资源及 PDF 下载。原站浏览器测试需要预览服务器，非默认端口时设置 `PREVIEW_URL`。更新后还应目视检查 PDF 封面、长公式、表格和末尾附录的分页。
