# UBIC1 Ethereum Mainnet · Unpromoted pilot UI

This is a **separate** static browser UI for the Ethereum L1 UBIC1 contract, not a replacement for `sites/ubic1-sepolia`.

- Network: Ethereum Mainnet, chain ID **1**.
- Contract address: `0x759723E3869181616D6567458b59bCbA365FEcEe`.
- Deployment block: **26203926**.
- Runtime code hash: `0x5f6af2e9b218e95a2f2e41f83198476d2d03b8ed0a3639cc3869e9b11451d7aa`.
- Data RPC: `https://ethereum-rpc.publicnode.com`; independent of wallet RPC.
- Deployment transaction: `https://etherscan.io/tx/0xe5bd9164af0fea025064f5d1e977a596ac297dd2258d5bf0bb5b3c4679185173`.

**Risk and access**: this site uses **real ETH**. The protocol has no owner, pause or upgrade; a withdrawal refunds principal but forfeits all unclaimed rewards. If claiming matured rewards, **Claim before Withdraw**. It has not yet completed the user's planned 24h mainnet test and is not independently security-audited. `noindex` headers, meta and robots reduce search discovery, but **do not make this Worker private**; anyone with the URL may access it and anyone can interact with the deployed contract directly. Do not put real stake in a wallet with a publicly exposed private key.

`dist/` contains no secret or deployer credentials. Browser wallets use injected EIP-1193 signing; the frontend independently verifies RPC chain ID and the full runtime hash before enabling transaction signing. It checks the connected wallet's chain/account again before each transaction. It is intended for the *separate* user's funding wallet, not the potentially exposed deployment wallet.

## Local verification

```powershell
npm --prefix sites/ubic1-mainnet test
cd sites/ubic1-mainnet
npm run preview  # http://127.0.0.1:5174
```

## Cloudflare Worker assets deployment (separate worker)

From the repository root:

```powershell
npx wrangler deploy --config wrangler.mainnet.jsonc
```

`wrangler.jsonc` still points to the existing Sepolia Worker and remains unchanged. **Do not use that original config to publish mainnet UI.**

No mainnet contract deployment, wallet keys, or smart contract write transaction is performed by publishing these static files.
