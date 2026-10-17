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
