import { ContractFactory, formatEther, keccak256 } from 'ethers';
import { artifact, connect, readDeployment, saveDeployment, mined, safeError } from './sepolia-common.mjs';
let provider;
try {
  const flags = process.argv.slice(2);
  if (flags.some(flag => flag !== '--broadcast')) throw new Error('Usage: npm run deploy:sepolia -- [--broadcast]');
  if (readDeployment()) throw new Error('Deployment record exists. Inspect it before any new deployment; no automatic redeploy.');
  const connection = await connect(true);
  provider = connection.provider;
  const { signer } = connection;
  const built = artifact();
  const factory = new ContractFactory(built.abi, built.evm.bytecode.object, signer);
  const request = await factory.getDeployTransaction();
  const gas = await provider.estimateGas({ ...request, from: signer.address });
  const gasLimit = (gas * 120n + 99n) / 100n;
  const fees = await provider.getFeeData();
  if (fees.maxFeePerGas == null || fees.maxPriorityFeePerGas == null) throw new Error('RPC did not return EIP-1559 fees.');
  const maxCost = gasLimit * fees.maxFeePerGas;
  const balance = await provider.getBalance(signer.address);
  console.log(`Network: Sepolia 11155111\nDeployer: ${signer.address}\nBalance: ${formatEther(balance)} ETH\nGas estimate: ${gas}\nMaximum deployment fee with current caps: ${formatEther(maxCost)} ETH`);
  if (balance < maxCost) throw new Error('Insufficient Sepolia ETH for deployment gas.');
  if (!flags.includes('--broadcast')) {
    console.log('Preflight passed. To send: npm run deploy:sepolia -- --broadcast');
  } else {
    const contract = await factory.deploy({ gasLimit, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
    const tx = contract.deploymentTransaction();
    const address = await contract.getAddress();
    const record = { chainId: 11155111, address, deployer: signer.address, transactionHash: tx.hash, status: 'pending', compiler: '0.8.37', evmVersion: 'shanghai', optimizerRuns: 200 };
    saveDeployment(record);
    const receipt = await mined(tx, 'Deploy UBIC1');
    const block = await provider.getBlock(receipt.blockNumber);
    const genesis = await contract.genesisTime();
    if (genesis !== BigInt(block.timestamp)) throw new Error('Genesis timestamp mismatch.');
    if (await contract.name() !== 'UBIC1' || await contract.symbol() !== 'UBIC1' || await contract.decimals() !== 4n) throw new Error('Metadata mismatch.');
    if (await contract.totalSupply() !== 0n) throw new Error('Unexpected initial supply.');
    saveDeployment({ ...record, status: 'confirmed', blockNumber: receipt.blockNumber, genesisTime: genesis.toString(), runtimeHash: keccak256(await provider.getCode(address)) });
    console.log(`Deployed: https://sepolia.etherscan.io/address/${address}\nSaved deployments/sepolia.json`);
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
finally { provider?.destroy(); }
