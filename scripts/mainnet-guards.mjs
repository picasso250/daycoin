import { parseEther, getAddress } from 'ethers';

export const MAINNET_CHAIN_ID = 1n;
export function requireMainnet(chainId) {
  if (BigInt(chainId) !== MAINNET_CHAIN_ID) throw new Error('Refusing deployment: expected Ethereum Mainnet (chain 1).');
}
export function requireFreshDeployer(address, oldDeployers) {
  const candidate = getAddress(address);
  if (oldDeployers.some(old => getAddress(old) === candidate))
    throw new Error('Refusing to reuse a Sepolia deployer wallet on mainnet. Use a new, never-shared private key.');
}
export function deploymentFeeCap(gasLimit, maxFeePerGas, budgetEth) {
  if (typeof budgetEth !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(budgetEth))
    throw new Error('MAINNET_MAX_DEPLOY_FEE_ETH must be a positive decimal ETH amount.');
  const budget = parseEther(budgetEth);
  if (budget === 0n) throw new Error('Deployment fee budget must exceed zero.');
  const cap = gasLimit * maxFeePerGas;
  if (cap > budget) throw new Error('Deployment maximum fee exceeds MAINNET_MAX_DEPLOY_FEE_ETH; no transaction sent.');
  return { cap, budget };
}
export function parseDeployMode(args) {
  if (args.length === 0) return { broadcast: false };
  if (args.length === 2 && args[0] === '--broadcast' && /^--confirm-deployer=0x[0-9a-fA-F]{40}$/.test(args[1]))
    return { broadcast: true, expectedDeployer: getAddress(args[1].slice('--confirm-deployer='.length)) };
  throw new Error('Usage: npm run deploy:mainnet -- [--broadcast --confirm-deployer=0xYOUR_ADDRESS]');
}
