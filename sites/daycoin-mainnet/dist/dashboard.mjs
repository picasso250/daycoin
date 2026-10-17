import { Interface } from './ethers.min.js';
import { ADDRESS, rpc, verifiedBlock } from './core.mjs';

// Display-only reads: failures must not become zero or alter transaction guards.
export const overviewAbi = new Interface([
  'function totalSupply() view returns (uint256)',
  'function currentEpoch() view returns (uint256)',
  'function requiredDeposit() view returns (uint256)',
  'function genesisTime() view returns (uint256)',
  'function EPOCH_DURATION() view returns (uint256)',
]);
export async function readDashboard(account, block, read = rpc) {
  block ??= await verifiedBlock(read);
  const names = ['totalSupply', 'currentEpoch', 'requiredDeposit', 'genesisTime', 'EPOCH_DURATION'];
  const requests = names.map(async name => overviewAbi.decodeFunctionResult(name,
    await read('eth_call', [{ to: ADDRESS, data: overviewAbi.encodeFunctionData(name) }, block.number]))[0]);
  if (account) {
    names.push('ethBalance');
    requests.push(read('eth_getBalance', [account, block.number]).then(value => {
      if (!/^0x[0-9a-f]+$/i.test(value)) throw Error('Invalid balance');
      return BigInt(value);
    }));
  }
  const results = await Promise.allSettled(requests);
  const data = Object.fromEntries(names.map((name, i) => [name, results[i].status === 'fulfilled' ? results[i].value : null]));
  data.nextEpochTime = data.genesisTime != null && data.currentEpoch != null && data.EPOCH_DURATION != null
    ? data.genesisTime + (data.currentEpoch + 1n) * data.EPOCH_DURATION : null;
  return { ...data, block };
}
