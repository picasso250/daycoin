import fs from 'node:fs';
import { ContractFactory, JsonRpcProvider, Wallet, formatEther, formatUnits, getAddress, keccak256 } from 'ethers';
import { artifact, matchesRuntime } from './sepolia-common.mjs';
import { deploymentFeeCap, parseDeployMode, requireFreshDeployer, requireMainnet } from './mainnet-guards.mjs';

const DEPLOYMENT_FILE = 'deployments/mainnet.json';
const readRecord = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
function saveRecord(data) {
  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(DEPLOYMENT_FILE + '.tmp', DEPLOYMENT_FILE);
}
function safeMessage(error) {
  let message = String(error.shortMessage || error.message || 'Unknown deployment error');
  for (const secret of [process.env.MAINNET_PRIVATE_KEY, process.env.MAINNET_RPC_URL])
    if (secret) message = message.split(secret).join('[redacted]');
  return message.replace(/https?:\/\/[^\s"']+/g, '[RPC URL redacted]');
}

let provider;
try {
  const mode = parseDeployMode(process.argv.slice(2));
  if (readRecord(DEPLOYMENT_FILE)) throw new Error('Mainnet deployment record already exists. Inspect its transaction before attempting any other deployment.');

  const url = process.env.MAINNET_RPC_URL;
  const key = process.env.MAINNET_PRIVATE_KEY?.trim();
  if (!url || !/^https:\/\//.test(url)) throw new Error('Set a trusted HTTPS MAINNET_RPC_URL in .env.mainnet.');
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error('Set a new, unexposed MAINNET_PRIVATE_KEY in .env.mainnet.');

  provider = new JsonRpcProvider(url, undefined, { cacheTimeout: -1 });
  requireMainnet((await provider.getNetwork()).chainId);
  const signer = new Wallet(key, provider);
  const previousDeployers = ['deployments/sepolia.json', 'deployments/sepolia-v1.json']
    .map(readRecord).filter(Boolean).map(record => record.deployer).filter(Boolean);
  requireFreshDeployer(signer.address, previousDeployers);
  if (mode.broadcast && getAddress(signer.address) !== mode.expectedDeployer)
    throw new Error('Confirmation address does not match the current mainnet signer. No transaction sent.');

  const built = artifact();
  const factory = new ContractFactory(built.abi, built.evm.bytecode.object, signer);
  const request = await factory.getDeployTransaction();
  const gasEstimate = await provider.estimateGas({ ...request, from: signer.address });
  const gasLimit = (gasEstimate * 120n + 99n) / 100n; // 20% headroom
  const fees = await provider.getFeeData();
  if (fees.maxFeePerGas == null || fees.maxPriorityFeePerGas == null)
    throw new Error('Ethereum RPC did not return EIP-1559 fee caps.');
  const estimatedMaximum = gasLimit * fees.maxFeePerGas;
  const budgetEth = process.env.MAINNET_MAX_DEPLOY_FEE_ETH ?? '0.005';
  const balance = await provider.getBalance(signer.address);
  console.log('Network: Ethereum Mainnet (chain 1)');
  console.log('Deployer: ' + signer.address);
  console.log('Balance: ' + formatEther(balance) + ' ETH');
  console.log('Estimated gas: ' + gasEstimate.toString() + '; gas limit: ' + gasLimit.toString());
  console.log('RPC max fee cap: ' + formatUnits(fees.maxFeePerGas, 'gwei') + ' Gwei');
  console.log('Maximum transaction fee at RPC cap: ' + formatEther(estimatedMaximum) + ' ETH');
  console.log('Configured fee budget: ' + budgetEth + ' ETH');
  const {cap} = deploymentFeeCap(gasLimit, fees.maxFeePerGas, budgetEth);
  if (balance < cap) throw new Error('Insufficient balance to cover the full EIP-1559 deployment fee cap.');

  if (!mode.broadcast) {
    console.log('PREFLIGHT ONLY. No transaction was signed or sent.');
    console.log('For explicit deployment, rerun with --broadcast --confirm-deployer=' + signer.address);
  } else {
    const instance = await factory.deploy({
      gasLimit, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas
    });
    const tx = instance.deploymentTransaction();
    const address = await instance.getAddress();
    const record = {
      chainId: 1, address, deployer: signer.address, transactionHash: tx.hash,
      status: 'pending', compiler: '0.8.37', evmVersion: 'shanghai', optimizerRuns: 200
    };
    saveRecord(record);
    console.log('Broadcast: https://etherscan.io/tx/' + tx.hash);
    const receipt = await tx.wait(1, 180000);
    if (!receipt || receipt.status !== 1) throw new Error('Deployment did not succeed. Inspect existing transaction before retrying.');
    const block = await provider.getBlock(receipt.blockNumber);
    const [genesis, name, symbol, decimals, supply, code] = await Promise.all([
      instance.genesisTime(), instance.name(), instance.symbol(), instance.decimals(),
      instance.totalSupply(), provider.getCode(address)
    ]);
    if (genesis !== BigInt(block.timestamp) || name !== 'UBIC1' || symbol !== 'UBIC1' ||
        decimals !== 4n || supply !== 0n || !matchesRuntime(code, built))
      throw new Error('Deployed code or token invariants do not match the build. Do not publish or accept deposits.');
    saveRecord({
      ...record, status: 'confirmed', blockNumber: receipt.blockNumber,
      genesisTime: genesis.toString(), runtimeHash: keccak256(code)
    });
    console.log('VERIFIED: https://etherscan.io/address/' + address);
    console.log('Deployment record: ' + DEPLOYMENT_FILE);
  }
} catch (error) {
  console.error(safeMessage(error));
  process.exitCode = 1;
} finally { provider?.destroy(); }
