import { parseEther, getAddress } from 'ethers';

export const MAINNET_CHAIN_ID = 1n;
export function requireMainnet(chainId) {
  if (BigInt(chainId) !== MAINNET_CHAIN_ID) throw new Error('Refusing deployment: expected Ethereum Mainnet (chain 1).');
}
export function requireFreshDeployer(address, oldDeployers, approvedReuseAddress = null) {
  const candidate = getAddress(address);
  const reused = oldDeployers.some(old => getAddress(old) === candidate);
  if (approvedReuseAddress !== null) {
    if (getAddress(approvedReuseAddress) !== candidate)
      throw new Error('Explicit reuse confirmation must match the actual mainnet signer address.');
    if (!reused) throw new Error('Reuse confirmation was supplied, but this signer is not a recorded Sepolia deployer.');
  }
  if (reused && approvedReuseAddress === null)
    throw new Error('Sepolia deployer reuse blocked. For a deliberate, deployment-only exception, pass --allow-reused-deployer=0xYOUR_DEPLOYER_ADDRESS. Never fund an exposed wallet with stake capital.');
  return reused;
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
  const reusePattern = /^--allow-reused-deployer=(0x[0-9a-fA-F]{40})$/;
  const confirmationPattern = /^--confirm-deployer=(0x[0-9a-fA-F]{40})$/;
  if (args.length === 0) return { broadcast: false };
  if (args.length === 1 && reusePattern.test(args[0]))
    return { broadcast: false, approvedReuseAddress: getAddress(args[0].match(reusePattern)[1]) };
  if ((args.length === 2 || args.length === 3) && args[0] === '--broadcast' &&
      confirmationPattern.test(args[1]) && (args.length === 2 || reusePattern.test(args[2]))) {
    return {
      broadcast: true,
      expectedDeployer: getAddress(args[1].match(confirmationPattern)[1]),
      ...(args.length === 3 ? { approvedReuseAddress: getAddress(args[2].match(reusePattern)[1]) } : {})
    };
  }
  throw new Error('Usage: npm run deploy:mainnet -- [--allow-reused-deployer=0xADDRESS] OR --broadcast --confirm-deployer=0xADDRESS [--allow-reused-deployer=0xADDRESS]');
}
