import fs from 'node:fs';
import { JsonRpcProvider } from 'ethers';
import {
  readConfig, readArtifact, deploymentFile, requireChain,
  verifyDeployment, safeError
} from './deployment-common.mjs';

let config,provider;
try{
  const [envFile,artifactFile,...rest]=process.argv.slice(2);
  if(!envFile||!artifactFile||rest.length)
    throw Error('Usage: node scripts/verify.mjs <env-file> <artifact.json>');
  config=readConfig(envFile,{requireKey:false});
  const artifact=readArtifact(artifactFile);
  const file=deploymentFile(config.chainId,artifactFile,artifact);
  if(!fs.existsSync(file))throw Error('Deployment record not found: '+file);
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  provider=new JsonRpcProvider(config.rpcUrl,undefined,{batchMaxCount:1,cacheTimeout:-1});
  requireChain((await provider.getNetwork()).chainId,config.chainId);
  const verified=await verifyDeployment(provider,artifact,record);
  console.log('VERIFIED (read-only): Chain '+verified.chainId+'; contract '+verified.address);
  console.log('Creation transaction: '+verified.transactionHash);
  console.log('Creation hash: '+verified.creationHash);
  console.log('Runtime hash: '+verified.runtimeHash);
  console.log('Block: '+verified.blockNumber);
  console.log('Compiler-marked immutable slots are compared modulo their assigned values; protocol-specific semantics require separate checks.');
}catch(e){
  console.error('Verification: '+safeError(e,config));
  process.exitCode=1;
}finally{provider?.destroy();}
