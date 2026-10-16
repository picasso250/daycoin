import fs from 'node:fs';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, formatEther, formatUnits, getAddress, getCreateAddress, keccak256 } from 'ethers';
import { artifact, matchesRuntime } from './sepolia-common.mjs';
import { deploymentFeeCap, parseDeployMode, requireFreshDeployer, requireMainnet } from './mainnet-guards.mjs';
import { reserveDeployment, updateDeployment, broadcastRecordedTransaction } from './mainnet-journal.mjs';

const DEPLOYMENT_FILE = 'deployments/mainnet.json';
const readRecord = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
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
    // Exclusive single-use reservation BEFORE nonce selection and BEFORE any network broadcast.
    // A crash at any stage leaves a record, so a second run cannot blindly redeploy.
    const reserved = {
      chainId: 1, deployer: signer.address,
      createdAt: new Date().toISOString(), compiler: '0.8.37',
      evmVersion: 'shanghai', optimizerRuns: 200
    };
    reserveDeployment(DEPLOYMENT_FILE, reserved);
    const nonce = await provider.getTransactionCount(signer.address, 'pending');
    const address = getCreateAddress({ from: signer.address, nonce });
    const signedTransaction = await signer.signTransaction({
      chainId: 1, type: 2, nonce, to: null, data: request.data, value: 0n,
      gasLimit, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas
    });
    const prepared = { ...reserved, nonce, address };
    const signedHash = keccak256(signedTransaction);
    console.log('Precomputed mainnet contract address: ' + address);
    console.log('Signed transaction hash: https://etherscan.io/tx/' + signedHash);
    const {transactionHash, signedRecord} = await broadcastRecordedTransaction({
      file: DEPLOYMENT_FILE, prepared, signedTransaction,
      broadcast: bytes => provider.broadcastTransaction(bytes)
    });
    console.log('Broadcast returned: https://etherscan.io/tx/' + transactionHash);
    const receipt = await provider.waitForTransaction(transactionHash, 1, 180000);
    if (!receipt || receipt.status !== 1 || receipt.contractAddress?.toLowerCase() !== address.toLowerCase())
      throw new Error('Deployment missing, failed, or at wrong address. Inspect saved hash before any further action.');
    const block = await provider.getBlock(receipt.blockNumber);
    const instance = new Contract(address, built.abi, provider);
    const [genesis, name, symbol, decimals, supply, code] = await Promise.all([
      instance.genesisTime(), instance.name(), instance.symbol(), instance.decimals(),
      instance.totalSupply(), provider.getCode(address)
    ]);
    if (genesis !== BigInt(block.timestamp) || name !== 'UBIC1' || symbol !== 'UBIC1' ||
        decimals !== 4n || supply !== 0n || !matchesRuntime(code, built))
      throw new Error('Deployed code or token invariants do not match the build. Do not publish or accept deposits.');
    updateDeployment(DEPLOYMENT_FILE, {
      ...signedRecord, status: 'confirmed', blockNumber: receipt.blockNumber,
      genesisTime: genesis.toString(), runtimeHash: keccak256(code)
    });
    console.log('VERIFIED: https://etherscan.io/address/' + address);
    console.log('Deployment record: ' + DEPLOYMENT_FILE);
  }
} catch (error) {
  console.error(safeMessage(error));
  process.exitCode = 1;
} finally { provider?.destroy(); }
