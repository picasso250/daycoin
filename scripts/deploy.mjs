import fs from 'node:fs';
import {
  ContractFactory, JsonRpcProvider, Wallet, formatEther,
  getCreateAddress, keccak256, parseEther
} from 'ethers';
import { reserveDeployment, updateDeployment, broadcastRecordedTransaction } from './deployment-journal.mjs';
import {
  readConfig, readArtifact, creationHex, creationHash, deploymentFile,
  requireChain, verifyDeployment, safeError
} from './deployment-common.mjs';

const usage='Usage: node scripts/deploy.mjs <env-file> <artifact.json> [--broadcast]';
const [envFile,artifactFile,...flags]=process.argv.slice(2);
let config,provider;
try {
  if(!envFile||!artifactFile||flags.length>1||(flags.length===1&&flags[0]!=='--broadcast'))
    throw Error(usage);
  const broadcast=flags.length===1;
  config=readConfig(envFile);
  const artifact=readArtifact(artifactFile);
  const code=creationHex(artifact),hash=creationHash(artifact);
  const file=deploymentFile(config.chainId,artifactFile,artifact);
  if(fs.existsSync(file))
    throw Error('A deployment record already exists at '+file+'. Verify the existing transaction before attempting another deployment.');
  provider=new JsonRpcProvider(config.rpcUrl,undefined,{batchMaxCount:1,cacheTimeout:-1});
  requireChain((await provider.getNetwork()).chainId,config.chainId);
  const signer=new Wallet(config.privateKey,provider);
  const factory=new ContractFactory(artifact.abi,code,signer);
  const deployment=await factory.getDeployTransaction();
  const estimate=await provider.estimateGas({...deployment,from:signer.address});
  const gasLimit=(estimate*120n+99n)/100n;
  const fees=await provider.getFeeData();
  if(fees.maxFeePerGas===null||fees.maxPriorityFeePerGas===null)
    throw Error('EIP-1559 fees are unavailable.');
  const feeMaximum=gasLimit*fees.maxFeePerGas;
  if(feeMaximum>parseEther(config.budget))throw Error('Deployment gas maximum exceeds MAX_DEPLOY_FEE_ETH.');
  const balance=await provider.getBalance(signer.address);
  console.log('Chain ID: '+config.chainId);
  console.log('Artifact: '+artifactFile);
  console.log('Creation hash: '+hash);
  console.log('Deployer: '+signer.address);
  console.log('Gas estimate: '+estimate+'; limit: '+gasLimit);
  console.log('Maximum network fee: '+formatEther(feeMaximum)+' ETH');
  console.log('Deployer balance: '+formatEther(balance)+' ETH');
  console.log('Journal: '+file);
  if(balance<feeMaximum)throw Error('Insufficient ETH for maximum deployment gas cost.');
  if(!broadcast){
    console.log('PREFLIGHT ONLY. No signature, broadcast or deployment record was created.');
    console.log('To deploy, review the above and run:');
    console.log('node scripts/deploy.mjs '+envFile+' '+artifactFile+' --broadcast');
  }else{
    const metadata={chainId:config.chainId,artifact:artifactFile,creationHash:hash,
      deployer:signer.address,createdAt:new Date().toISOString()};
    // Deployment-specific single-use journal: not an application transaction
    // recovery subsystem; protects contract creation from blind retry.
    reserveDeployment(file,metadata);
    const nonce=await provider.getTransactionCount(signer.address,'pending');
    const address=getCreateAddress({from:signer.address,nonce});
    const signed=await signer.signTransaction({
      chainId:BigInt(config.chainId),type:2,nonce,to:null,data:code,value:0n,
      gasLimit,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas
    });
    const {transactionHash}=await broadcastRecordedTransaction({
      file,prepared:{...metadata,address,nonce},signedTransaction:signed,
      broadcast:bytes=>provider.broadcastTransaction(bytes)
    });
    console.log('Deployment transaction: '+transactionHash);
    const receipt=await provider.waitForTransaction(transactionHash,1,180000);
    if(!receipt||receipt.status!==1)
      throw Error('Deployment has not succeeded. Inspect the saved transaction hash, do not blindly rerun.');
    const record=JSON.parse(fs.readFileSync(file,'utf8'));
    const verified=await verifyDeployment(provider,artifact,record);
    updateDeployment(file,verified);
    console.log('VERIFIED: '+address);
    console.log('Runtime hash: '+verified.runtimeHash);
  }
}catch(e){
  console.error('Deployment: '+safeError(e,config));
  process.exitCode=1;
}finally{provider?.destroy();}
