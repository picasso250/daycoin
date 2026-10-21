# DayCoin V1 · DC1 Mainnet Website

The bilingual public interface for DayCoin: https://daycoin.io99.xyz/.

- Ethereum Mainnet, Chain ID `1`
- DC1: `0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715`
- Runtime Keccak-256: `0xfdde03bc7708ba27ee8fae35e8c643e7bff09d1754dbdf173514417d33109c2c`
- Read-only RPC: https://ethereum-rpc.publicnode.com

The interface checks chain ID, runtime bytecode and wallet identity before sending transactions. It never holds private keys. Deposits and withdrawals use real ETH. **Every Deposit resets accrual and forfeits unclaimed rewards. Withdraw does not automatically Claim and also forfeits unclaimed rewards. Claim first to preserve them.**

## Routes / 页面

| Document | English (default) | 中文 |
| --- | --- | --- |
| Home | `/` | `/zh/` |
| Whitepaper | `/whitepaper` | `/zh/whitepaper` |
| PDF | `/whitepaper.pdf` | `/zh/whitepaper.pdf` |
| Manifesto | `/manifesto` | `/zh/manifesto` |

Language is determined by the URL, without automatic browser-language redirects or stored preferences. Native links work without JavaScript. A small shared script preserves the current fragment; corresponding document headings use matching `section-N` anchors. Switching language reloads the page and requires selecting a wallet again. It does not cancel any already submitted transaction; inspect wallet history if a transaction is pending or uncertain.

## Sources and architecture / 内容维护

- `content/index.html`: one homepage structure, with the original Chinese copy and route placeholders.
- `content/home.en.json`: English static text. `build-home.mjs` translates text nodes and accessible labels, escapes translations, and generates both homepages. It also localizes the existing English navigation labels for Chinese readers. Missing English translations fail the build.
- `dist/messages.mjs`: English runtime messages keyed by the original Chinese wording. `dist/i18n.mjs` formats string/template messages and translates errors at the presentation boundary. Unknown wallet/network errors receive localized guidance instead of displaying arbitrary provider text. Wallet vendors control their own confirmation screens and languages.
- `dist/app.mjs`: one shared UI and wallet flow. `core.mjs`, `dashboard.mjs` and `pending.mjs` are shared without changes to their transaction or issuance logic. Both languages use the same contract, RPC, exact wei parsing, identity checks and same-origin operation lock.
- `whitepaper.config.json`: the only source-path configuration for both whitepapers and manifestos. Repository-root Chinese originals remain intact. English sources are `DayCoin_Whitepaper_v0.3.en.md` and `Manifesto.en.md`.

Update both languages together when changing claims or safety disclosures. Preserve matching document heading order to keep language-switch anchors aligned. Tests compare heading structure, display and inline formulas (allowing translated text labels), numeric table values and deployment addresses/hashes. These checks cannot establish semantic equivalence of prose; substantive changes still need bilingual review.

`dist/index.html` remains tracked as in the original project, but is generated: edit the template/dictionary and rebuild. Chinese HTML, document HTML/PDF and `whitepaper-assets` are generated and ignored. Do not edit generated files.

## Build and preview

From the repository root, with Node.js 22 or newer:

```sh
npm ci --prefix sites/daycoin-mainnet
npm exec --prefix sites/daycoin-mainnet -- playwright install chromium
npm run build:whitepaper
npm --prefix sites/daycoin-mainnet run dev
```

The existing `build:whitepaper` entry point now builds both homepages, both whitepaper HTML/PDF editions and both manifesto pages. Preview at http://127.0.0.1:5174/ and http://127.0.0.1:5174/zh/. Set `PORT` to use another port. On Linux, Chromium may need `playwright install --with-deps chromium`.

Markdown-it and KaTeX generate static HTML, and the locked Playwright Chromium prints that same HTML to A4 PDF. Formula errors fail the build. Fonts, licenses, math styles and scripts are local, compatible with the existing strict CSP. Documents do not load wallet or RPC code. Long formulas scroll on phones and scale to the printable width in PDF. PDF metadata timestamps can vary between builds; byte-for-byte reproducibility is not promised.

## Validation

```sh
npm --prefix sites/daycoin-mainnet test
npm --prefix sites/daycoin-mainnet run test:browser
npm --prefix sites/daycoin-mainnet run test:whitepaper
npm test
```

Build first. Browser/document tests start and close their own temporary preview servers. Browser tests mock the wallet and RPC; they never broadcast real transactions. They cover Chinese regression behavior and English Deposit/Claim/Withdraw, exact wei and contract targets, cancellation, network mismatch, unknown results, wallet absence/rejection, invalid amounts, identity changes, language switching and 320/390/1440px layout under the production CSP. Whitepaper tests verify both sources, formulas, navigation, local resources, responsive layout and PDF responses. Review rendered PDF pages after layout or content changes.

## Anonymous journey analytics (experimental)

The homepage and reading pages load `dist/journey.mjs`; it records a page visit and named UX events (wallet chooser, successful *validated* connection, action tabs, confirmation, transaction states). `worker.mjs` accepts only `POST /api/journey` with `session` (random tab-scoped ID), `event`, `page`, and `step` (sequence). Only these four fields reach the Analytics Engine dataset `daycoin_journey`; **no wallet address, input value, transaction hash or raw referrer** is recorded. The browser disables these events under Global Privacy Control or Do Not Track. A page navigation within a tab keeps the same session; inactivity over 30 minutes starts a new session. Event delivery is best-effort and is not a reliable transaction record or an exact user count. Do not circumvent tracking protection.

Query event paths with Cloudflare Workers Analytics Engine SQL API after events are written (requires a separate account-scoped **Analytics Read** API token). For example:

```sql
SELECT timestamp, blob1 AS session, blob2 AS event, blob3 AS page, double1 AS step
FROM daycoin_journey
WHERE timestamp > NOW() - INTERVAL '1' DAY
ORDER BY timestamp DESC
LIMIT 100
```

Group rows by `session` and order by `step` to inspect navigation within that tab. Dataset sampling can mean some events are absent; never interpret absence as proof a visitor did not act. This feature records pseudonymous session-level data and may require additional notice/consent depending on applicable privacy laws. No public analytics read endpoint is provided.

## Deployment boundary / 部署边界

Use the website-local `wrangler.jsonc` with Cloudflare Git integration **Root directory** `sites/daycoin-mainnet`, **Build command** `npm run build:cloudflare`, and **Deploy command** `npx wrangler deploy`. Cloudflare installs only this folder's dependencies and builds static HTML, CSS and assets **without launching Chromium**. For now, generate whitepaper PDFs locally with `npm run build:whitepaper` after installing Playwright Chromium, then commit the two PDF files in `dist/whitepaper.pdf` and `dist/zh/whitepaper.pdf` with website changes. Both PDFs are tracked in Git and included by Wrangler in static `dist` assets; the Cloudflare build validates them but never generates PDFs. Existing GitHub Actions builds and tests PDF output separately, but does not publish or push artifacts yet. If Markdown changes, commit refreshed PDFs before deploying; automating their publication is future work. The root repository remains available for reading Markdown sources. Static files provide both languages on the existing domain; no Worker routing code, second deployment or second domain is needed. Cloudflare's existing HTML handling maps `whitepaper.html` to `/whitepaper` and the nested `zh/index.html` to `/zh/`. Unknown paths are not translated into homepage content by the local preview.

This is a website/document change only. Do not redeploy DC1, modify deployed protocol rules, or alter deployment journals as part of publishing it. The historical UBIC1 site at https://ubi.io99.xyz/ remains independent.

中文维护说明：英文为根路径默认语言，中文完整保留在 `/zh/`。修改首页请编辑 `content`，修改动态提示请同时更新 `messages.mjs`；白皮书和宣言的中英文 Markdown 需同步审阅。共享交易实现与合约配置，不维护两套钱包逻辑。真实钱包界面由钱包自身决定语言；本地自动化验证不代表独立安全审计，也不替代发布后的真实设备检查。
