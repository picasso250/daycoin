import { Interface } from './ethers.min.js';
import { ADDRESS, rpc, verifiedBlock } from './core.mjs';

const TOKEN_UNIT = 10n ** 18n;
const SECONDS_PER_DAY = 86400n;

// Display-only rough estimate: current contract ETH / current eligibility threshold
// proxies the number of qualified positions active continuously since genesis.
// It cannot account for entrants/exits, top-ups, forgone rewards or token burns.
// Treat minted supply as a floor rather than adding it to the proxy (double counting).
export function estimateTotalAccrued(data) {
  if (data.totalSupply == null || data.totalPrincipal == null ||
      data.requiredDeposit == null || data.requiredDeposit <= 0n || data.genesisTime == null ||
      data.block?.timestamp == null) return null;
  const elapsed = BigInt(data.block.timestamp) - data.genesisTime;
  if (elapsed < 0n) return null;
  const eligibleCapacity = data.totalPrincipal / data.requiredDeposit;
  const estimate = eligibleCapacity * elapsed * TOKEN_UNIT / SECONDS_PER_DAY;
  return estimate > data.totalSupply ? estimate : data.totalSupply;
}

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
  names.push('totalPrincipal');
  requests.push(read('eth_getBalance', [ADDRESS, block.number]).then(value => {
    if (!/^0x[0-9a-f]+$/i.test(value)) throw Error('Invalid contract balance');
    return BigInt(value);
  }));
  if (account) {
    names.push('ethBalance');
    requests.push(read('eth_getBalance', [account, block.number]).then(value => {
      if (!/^0x[0-9a-f]+$/i.test(value)) throw Error('Invalid balance');
      return BigInt(value);
    }));
  }
  const results = await Promise.allSettled(requests);
  const data = Object.fromEntries(names.map((name, i) => [name, results[i].status === 'fulfilled' ? results[i].value : null]));
  data.estimatedTotalAccrued = estimateTotalAccrued({ ...data, block });
  data.nextEpochTime = data.genesisTime != null && data.currentEpoch != null && data.EPOCH_DURATION != null
    ? data.genesisTime + (data.currentEpoch + 1n) * data.EPOCH_DURATION : null;
  return { ...data, block };
}
