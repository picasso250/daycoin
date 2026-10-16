// UBIC1-v0.2 · verified deployment on Sepolia (test ETH only).
// The dedicated browser E2E suite replaces this module with a local Ganache
// fixture; this published configuration has NO mainnet transaction path.
export const CONFIG = Object.freeze({
  label: 'UBIC1-v0.2 · Sepolia 测试网',
  chainId: 11155111,
  address: '0x407892d5606b0FB91D77C62aC306566E01963674',
  runtimeHash: '0x2c4e7b4318fa60fc3bf7b1560997d350585a8d474c82aa8def4818e91effe6db',
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  explorerUrl: 'https://sepolia.etherscan.io'
});
