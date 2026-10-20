# DayCoin · One Coin One Day

DayCoin V1 (DC1) is a minimal Ethereum experiment in continuous monetary issuance. It is an independent, non-upgradeable ERC-20 contract, not guaranteed income or a promise of investment returns.

## Official DC1 deployments

| Network | Chain ID | Contract |
| --- | --- | --- |
| Ethereum Mainnet | 1 | [0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715](https://etherscan.io/address/0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715) |
| Sepolia | 11155111 | [0xBB322A88f2ED0EdFd3632825Cf44Bbb62B93Bd26](https://sepolia.etherscan.io/address/0xBB322A88f2ED0EdFd3632825Cf44Bbb62B93Bd26) |

**ERC-20 Name:** DayCoin V1 · **Symbol:** DC1 · **Decimals:** 18

**Arbitrum One bridged DC1:** [0xDa7f5A3e68145Ad5125216d40D58729bEF5275f7](https://arbiscan.io/address/0xDa7f5A3e68145Ad5125216d40D58729bEF5275f7) — linked by `l1Address()` to Ethereum Mainnet DC1; no independent reward issuer. See whitepaper v0.3 for bridge risks and supply accounting.

**Website:** https://daycoin.io99.xyz/ · **Solidity:** [contracts/DayCoinV1.sol](contracts/DayCoinV1.sol)

An ETH deposit gives an *address*, not a verified human, eligibility to accrue one DC1 per qualifying day (prorated by seconds). A person can control multiple addresses. Every deposit resets the earning clock and forfeits previously unclaimed rewards. Withdraw returns recorded ETH principal, but forfeits unclaimed rewards: **Claim before any further Deposit or Withdraw**. A contract-wallet unable to receive native ETH can fail to withdraw.

There is no owner, proxy upgrade, admin mint, or admin pause. This is not a security audit; asset value is not guaranteed.

## Roadmap

- **DC1 — live:** 1 DC1/day per eligible ETH-backed address; no personhood check.
- **DC2 — research only:** Move toward 1 coin/day per human. Explore refundable ETH sponsorship (sponsor keeps principal; beneficiary receives coins) and no-deposit eligibility via established GitHub accounts, Google sign-in, or personhood proofs.
- **Approach:** Accept imperfect, overlapping identity checks and some Sybil claims; measure and correct them openly. Prioritize access over perfect verification. DC1 stays unchanged.

## Development (local only)

- npm run build — compile DC1, creates artifacts/DayCoinV1.json
- npm test — current DC1 contract and generic deployment tests
- npm --prefix sites/daycoin-mainnet test — frontend unit tests
- npm --prefix sites/daycoin-mainnet run dev — local website preview

Generic deploy.mjs and verify.mjs remain current and protected by chain/artifact-specific deployment Journals. See [DEPLOY.md](DEPLOY.md). **DC1 has already been deployed on both networks. Do not broadcast a new deployment to “verify” it.**

## Historical UBIC1 experiments

Old Solidity contracts, build scripts, tests, and the obsolete Sepolia website were removed from the *current tree*, but are preserved in [Git revision b8d6fb3](https://github.com/picasso250/daycoin/tree/b8d6fb3):

- [UBIC1 v0.1 original source](https://github.com/picasso250/daycoin/blob/b8d6fb3/contracts/UBIC1.sol)
- [UBIC1 v0.2 original source](https://github.com/picasso250/daycoin/blob/b8d6fb3/contracts/UBIC1V02.sol)
- [UBIC1 v0.2 historical specification](https://github.com/picasso250/daycoin/blob/b8d6fb3/UBIC1-V0.2.md)

Previously deployed UBIC1 contracts remain distinct and live on the blockchain. The historical website at https://ubi.io99.xyz/ is **not** the DC1 site, and old UBIC1 is not automatically migrated.

See the [DayCoin manifesto](%E5%AE%A3%E8%A8%80.md) and [whitepaper v0.3](DayCoin_Whitepaper_v0.3.md) for the proposed long-term fairness goals. **One wallet/address is not one human.**

The local deployments/ directory is excluded from Git and contains essential per-network deployment records. Back it up separately, never delete it to bypass a duplicate-deployment guard.
