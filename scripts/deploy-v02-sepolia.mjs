import { ContractFactory, JsonRpcProvider, Wallet, formatEther, formatUnits, getCreateAddress, keccak256 } from 'ethers';
import { reserveDeployment, updateDeployment, broadcastRecordedTransaction } from './mainnet-journal.mjs';
import { parseV02DeployMode, assertV02FeeBudget, assertV02RpcUrl } from './v02-sepolia-guards.mjs';
import {
  V02_DEPLOYMENT_FILE, V02_SEPOLIA_CHAIN, requireV02Sepolia, buildV02,
  creationHash, readV02Deployment, verifyV02OnChain, safeV02Error
} from './v02-sepolia-common.mjs';

let provider;
try {
  const mode = parseV02DeployMode(process.argv.slice(2));
  if (readV02Deployment()) throw Error('v0.2 deployment record already exists. Inspect deployments/sepolia-v02.json and verify it; do NOT blindly redeploy.');

  const url=process.env.UBIC1_V02_SEPOLIA_RPC_URL;
  const key=process.env.UBIC1_V02_SEPOLIA_PRIVATE_KEY?.trim();
  assertV02RpcUrl(url);
  if(!/^0x[0-9a-fA-F]{64}$/.test(key||''))throw Error('Set UBIC1_V02_SEPOLIA_PRIVATE_KEY (0x + 64 hex characters); never commit it.');
  provider=new JsonRpcProvider(url,undefined,{cacheTimeout:-1,batchMaxCount:1});
  requireV02Sepolia((await provider.getNetwork()).chainId);
  const signer=new Wallet(key,provider);
  const built=buildV02();
  const bytecodeHash=creationHash(built);
  if(mode.broadcast && (mode.expectedDeployer!==signer.address || mode.expectedCreationHash!==bytecodeHash.toLowerCase()))
    throw Error('Explicit deployer or v0.2 creation hash confirmation differs. Refusing deployment.');

  const factory=new ContractFactory(built.abi,built.evm.bytecode.object,signer);
  const request=await factory.getDeployTransaction();
  const gasEstimate=await provider.estimateGas({...request,from:signer.address});
  const gasLimit=(gasEstimate*120n+99n)/100n;
  const fees=await provider.getFeeData();
  if(fees.maxFeePerGas===null||fees.maxPriorityFeePerGas===null)
    throw Error('Sepolia RPC did not return EIP-1559 fees.');
  const maximum=assertV02FeeBudget(gasLimit,fees.maxFeePerGas,process.env.UBIC1_V02_SEPOLIA_MAX_FEE_ETH??'0.02');
  const balance=await provider.getBalance(signer.address);
  console.log('Protocol: UBIC1-v0.2 (contract UBIC1V02.sol ONLY)');
  console.log('Network: Ethereum Sepolia (11155111)');
  console.log('Deployer: '+signer.address);
  console.log('Creation bytecode keccak256: '+bytecodeHash);
  console.log('Deployer balance: '+formatEther(balance)+' Sepolia ETH');
  console.log('Estimated deployment gas: '+gasEstimate+'; limit: '+gasLimit);
  console.log('Max fee per gas: '+formatUnits(fees.maxFeePerGas,'gwei')+' Gwei');
  console.log('Transaction maximum ETH fee: '+formatEther(maximum));
  if(balance<maximum)throw Error('Insufficient Sepolia ETH for the transaction maximum fee.');

  if(!mode.broadcast){
    console.log('PREFLIGHT ONLY. No signing or network broadcast occurred.');
    console.log('Explicit deployment, after your review:');
    console.log('npm run deploy:v02:sepolia -- --broadcast --confirm-deployer='+signer.address+' --confirm-creation-hash='+bytecodeHash);
  } else {
    // Retain ONLY ONE v0.2 deployment journal. Never use v0.1 Sepolia paths.
    // Reuse the existing hard-tested journal to guard unknown RPC responses.
    const original = {
      protocol:'UBIC1-v0.2', chainId:Number(V02_SEPOLIA_CHAIN),
      deployer:signer.address,creationHash:bytecodeHash,
      compiler:'0.8.37',evmVersion:'shanghai',optimizerRuns:200,
      createdAt:new Date().toISOString()
    };
    reserveDeployment(V02_DEPLOYMENT_FILE,original);
    const nonce=await provider.getTransactionCount(signer.address,'pending');
    const address=getCreateAddress({from:signer.address,nonce});
    const signed=await signer.signTransaction({
      type:2,chainId:V02_SEPOLIA_CHAIN,nonce,to:null,data:request.data,value:0n,
      gasLimit,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas
    });
    const prepared={...original,nonce,address};
    const expectedHash=keccak256(signed);
    console.log('Predicted v0.2 address: '+address);
    console.log('Signed deploy tx: https://sepolia.etherscan.io/tx/'+expectedHash);
    const {transactionHash}=await broadcastRecordedTransaction({
      file:V02_DEPLOYMENT_FILE,prepared,signedTransaction:signed,
      broadcast:bytes=>provider.broadcastTransaction(bytes)
    });
    const receipt=await provider.waitForTransaction(transactionHash,1,180000);
    if(!receipt||receipt.status!==1)
      throw Error('No successful v0.2 deployment receipt. Consult saved hash; do NOT rerun deployment.');
    const verified=await verifyV02OnChain(provider,built,readV02Deployment());
    updateDeployment(V02_DEPLOYMENT_FILE,verified);
    console.log('VERIFIED EXACT CREATION AND RUNTIME BYTES: https://sepolia.etherscan.io/address/'+address);
    console.log('Runtime hash: '+verified.runtimeHash);
    console.log('Deployment journal: '+V02_DEPLOYMENT_FILE);
    console.log('Leave sites/ubic1-v02/dist/config.mjs DISABLED until separately approved for manual testing.');
  }
} catch(e){
  console.error('v0.2 Sepolia deployment: '+safeV02Error(e));
  process.exitCode=1;
} finally {provider?.destroy();}
