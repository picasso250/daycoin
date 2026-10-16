# UBIC1 Sepolia interface

Static browser client for Sepolia V2 at `0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715`, Ethereum chain 11155111. V2 deployed at block `11925819`, with runtime code hash `0x1c8b1489ffa0d74d93f90db305434f6b640edd579fa4af5d244eff987aeee6e6`. No server wallet or private key. Signing uses the user's injected EIP-1193 browser wallet only. The in-app preview may not expose browser extensions; open the published page in your wallet-enabled browser to transact.

Run `npm test` and `npm run preview`. No build step: publish `dist/`. `ethers.min.js` is the bundled ethers 6.15.0 browser distribution. Never copy the contract project's `.env`, keys, or node_modules into this site.

Reads use public Sepolia RPC and verify the runtime hash against the deployment record. Contract state is read at one block tag. Failed or stale reads disable signing, never masquerade as zero. Pending entitlement is displayed independently of current funding eligibility. Withdrawal is always refund-only with an explicit confirmation that every unclaimed reward, including mature rewards, is forfeited. The V2 contract has been deployed and its runtime hash verified. Do not point this refund-only UI at any earlier contract with different withdrawal behavior. Wallet changes are handled and chain/account are checked again before sending.

Global principal, active positions and personal total claimed are rebuilt from Deposited/ToppedUp/Withdrawn/Claimed logs from deployment block 11925819. Stats are published only after a complete scan, lag latest by two blocks, and label their snapshot block. Scan failures retain clearly labeled previous data or show unavailable. Public RPC rate/range limits or very long histories may prevent indexing; this does not prevent primary position reads. Contract balance is never substituted for principal. Two confirmations do not imply finality.

Wallet addresses/requests are visible to the RPC provider. No analytics, no private-key field, no automatic wallet connection request. A self-contained font fallback works if the optional Google Fonts request fails. No burn UI is added to the MVP; the contract retains burn capabilities.
