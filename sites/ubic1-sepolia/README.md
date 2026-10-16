# UBIC1 Sepolia interface

Static browser client for `0xef04ABbc1EEf957715895c234f5dEef7d2452AE1`, Ethereum Sepolia chain 11155111. No server wallet or private key. Signing uses the user's injected EIP-1193 browser wallet only. The in-app preview may not expose browser extensions; open the published page in your wallet-enabled browser to transact.

Run `npm test` and `npm run preview`. No build step: publish `dist/`. `ethers.min.js` is the bundled ethers 6.15.0 browser distribution. Never copy the contract project's `.env`, keys, or node_modules into this site.

Reads use public Sepolia RPC and verify the runtime hash against the deployment record. Contract state is read at one block tag. Failed or stale reads disable signing, never masquerade as zero. Pending entitlement is displayed independently of current funding eligibility. Withdrawal is always refund-only with an explicit confirmation that every unclaimed reward, including mature rewards, is forfeited. The currently deployed Sepolia contract still implements the earlier settle-on-withdraw rule; this source change requires a new contract deployment before frontend activation. Wallet changes are handled and chain/account are checked again before sending.

Global principal, active positions and personal total claimed are rebuilt from Deposited/ToppedUp/Withdrawn/Claimed logs from deployment block 11920524. Stats are published only after a complete scan, lag latest by two blocks, and label their snapshot block. Scan failures retain clearly labeled previous data or show unavailable. Public RPC rate/range limits or very long histories may prevent indexing; this does not prevent primary position reads. Contract balance is never substituted for principal. Two confirmations do not imply finality.

Wallet addresses/requests are visible to the RPC provider. No analytics, no private-key field, no automatic wallet connection request. A self-contained font fallback works if the optional Google Fonts request fails. No burn UI is added to the MVP; the contract retains burn capabilities.
