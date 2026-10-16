import { JsonRpcProvider } from 'ethers';
import {
  buildV02, readV02Deployment, verifyV02OnChain, safeV02Error
} from './v02-sepolia-common.mjs';
import { assertV02RpcUrl } from './v02-sepolia-guards.mjs';

let provider;
try {
  if(process.argv.length!==2)throw Error('Usage: npm run verify:v02:sepolia (no other arguments).');
  const url=process.env.UBIC1_V02_SEPOLIA_RPC_URL;
  assertV02RpcUrl(url);
  const record=readV02Deployment();
  if(!record)throw Error('No deployments/sepolia-v02.json record. Nothing to verify; cannot infer contract addresses.');
  provider=new JsonRpcProvider(url,undefined,{cacheTimeout:-1,batchMaxCount:1});
  const verified=await verifyV02OnChain(provider,buildV02(),record);
  console.log('UBIC1-v0.2: VERIFIED against Sepolia chain and exact compiled artifacts (read-only).');
  console.log('Address: '+verified.address);
  console.log('Deployment TX: '+verified.transactionHash);
  console.log('Deployment block: '+verified.blockNumber);
  console.log('GenesisTime: '+verified.genesisTime);
  console.log('Creation hash: '+verified.creationHash);
  console.log('Full runtime hash: '+verified.runtimeHash);
  console.log('No ETH sent. No files updated.');
} catch(e){
  console.error('v0.2 Sepolia verification: '+safeV02Error(e));
  process.exitCode=1;
} finally {provider?.destroy();}
