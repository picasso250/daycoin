import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import {
  getAddress, getCreateAddress, keccak256
} from 'ethers';

const HEX=/^0x[0-9a-fA-F]+$/;
const KEY=/^0x[0-9a-fA-F]{64}$/;

export function readConfig(filename,{requireKey=true}={}) {
  if(!fs.existsSync(filename))throw Error('Configuration file not found: '+filename);
  const config=parseEnv(fs.readFileSync(filename,'utf8'));
  const chainId=Number(config.CHAIN_ID);
  if(!Number.isSafeInteger(chainId)||chainId<1)throw Error('CHAIN_ID must be a positive integer in env file.');
  const rpcUrl=config.RPC_URL;
  if(typeof rpcUrl!=='string' ||
      (!/^https:\/\//i.test(rpcUrl)&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/i.test(rpcUrl)))
    throw Error('RPC_URL must use HTTPS (localhost HTTP allowed only for tests).');
  const key=config.PRIVATE_KEY?.trim();
  if(requireKey && !KEY.test(key??''))throw Error('PRIVATE_KEY must be 0x plus 64 hex digits in env file.');
  const budget=config.MAX_DEPLOY_FEE_ETH??'0.02';
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(budget)||Number(budget)===0)
    throw Error('MAX_DEPLOY_FEE_ETH must be a positive ETH decimal.');
  return {chainId,rpcUrl,privateKey:key,budget};
}

export function readArtifact(filename) {
  const artifact=JSON.parse(fs.readFileSync(filename,'utf8'));
  const creation=artifact?.evm?.bytecode?.object;
  const runtime=artifact?.evm?.deployedBytecode?.object;
  if(!Array.isArray(artifact.abi)||typeof creation!=='string'||!HEX.test('0x'+creation)||
     typeof runtime!=='string'||!HEX.test('0x'+runtime))
    throw Error('Artifact must contain ABI and compiled EVM creation/runtime bytecode; run the appropriate build command.');
  // This minimal deployer only accepts zero-argument constructors; it cannot
  // silently deploy a constructor requiring configuration from an unknown source.
  const ctor=artifact.abi.find(x=>x.type==='constructor');
  if(ctor?.inputs?.length)throw Error('Constructor arguments are not supported; build a dedicated reviewed deployment mode.');
  if(artifact.evm.bytecode.linkReferences &&
      Object.keys(artifact.evm.bytecode.linkReferences).length)
    throw Error('Linked-library deployment is not supported.');
  return artifact;
}

export const creationHex=artifact=>'0x'+artifact.evm.bytecode.object;
export const creationHash=artifact=>keccak256(creationHex(artifact));

export function deploymentFile(chainId,artifactPath,artifact=readArtifact(artifactPath)) {
  // Key on chain + artifact filename + full creation hash. Separate versions and
  // avoid collisions when an artifact filename is reused for a new build.
  const filename=path.basename(artifactPath,'.json');
  if(!/^[a-zA-Z0-9_-]+$/.test(filename))throw Error('Unsafe artifact filename.');
  return path.join('deployments',String(chainId)+'-'+filename+'-'+creationHash(artifact).slice(2,18)+'.json');
}

export function requireChain(actual,configured) {
  if(BigInt(actual)!==BigInt(configured))throw Error('WRONG CHAIN: RPC network differs from env CHAIN_ID. Refusing to deploy.');
}

export function safeError(error,config) {
  let message=String(error?.shortMessage||error?.message||'Unknown error');
  for(const secret of [config?.privateKey,config?.rpcUrl]){
    if(secret)message=message.split(secret).join('[redacted]');
  }
  return message.replace(/https?:\/\/[^\s"'<>]+/g,'[RPC URL redacted]');
}

export function runtimeMatches(actual,artifact) {
  const expected=artifact.evm.deployedBytecode.object.toLowerCase();
  const runtime=actual.replace(/^0x/i,'').toLowerCase();
  if(runtime.length!==expected.length||!runtime)return false;
  const refs=artifact.evm.deployedBytecode.immutableReferences??{};
  let cleanActual=runtime,cleanExpected=expected;
  const used=new Set();
  for(const slots of Object.values(refs)) {
    if(!Array.isArray(slots)||!slots.length)return false;
    let originalWord=null;
    for(const {start,length} of slots){
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||length<1 ||
         (start+length)*2>runtime.length)return false;
      const key=start+':'+length;
      if(used.has(key))return false;
      used.add(key);
      const from=start*2,to=(start+length)*2;
      const actualWord=runtime.slice(from,to);
      if(originalWord===null)originalWord=actualWord;
      else if(actualWord!==originalWord)return false; // repeated immutable must agree
      const mask='0'.repeat(length*2);
      cleanActual=cleanActual.slice(0,from)+mask+cleanActual.slice(to);
      cleanExpected=cleanExpected.slice(0,from)+mask+cleanExpected.slice(to);
    }
  }
  return cleanActual===cleanExpected;
}

export async function verifyDeployment(provider,artifact,record) {
  if(!record||!Number.isSafeInteger(record.chainId)||!record.transactionHash)
    throw Error('Deployment record is missing required fields.');
  requireChain((await provider.getNetwork()).chainId,record.chainId);
  if(record.creationHash?.toLowerCase()!==creationHash(artifact).toLowerCase())
    throw Error('Saved creation hash differs from selected artifact.');
  const from=getAddress(record.deployer),address=getAddress(record.address);
  if(!Number.isSafeInteger(record.nonce)||record.nonce<0||
     getCreateAddress({from,nonce:record.nonce}).toLowerCase()!==address.toLowerCase())
    throw Error('Recorded deployer, nonce and address do not agree.');
  const [tx,receipt]=await Promise.all([
    provider.getTransaction(record.transactionHash),
    provider.getTransactionReceipt(record.transactionHash)
  ]);
  if(!tx||!receipt||receipt.status!==1||tx.to!==null||
     tx.from.toLowerCase()!==from.toLowerCase()||tx.nonce!==record.nonce||
     tx.chainId!==BigInt(record.chainId)||tx.value!==0n||
     tx.data.toLowerCase()!==creationHex(artifact).toLowerCase()||
     receipt.contractAddress?.toLowerCase()!==address.toLowerCase()||
     receipt.from.toLowerCase()!==from.toLowerCase())
    throw Error('Original creation transaction does not match selected artifact and deployer.');
  const block=await provider.getBlock(receipt.blockNumber);
  if(!block||block.hash!==receipt.blockHash)throw Error('Cannot validate creation block.');
  // Check current on-chain code: works with standard non-archive RPC endpoints.
  const code=await provider.getCode(address);
  if(!runtimeMatches(code,artifact))
    throw Error('On-chain runtime differs from compiled runtime outside compiler-labelled immutable slots.');
  // A runtime bytecode comparison cannot prove what an immutable MEANS.
  // For each contract's semantic checks (e.g. genesisTime), use its tests.
  return {...record,status:'verified',blockNumber:receipt.blockNumber,
    runtimeHash:keccak256(code),verifiedAt:new Date().toISOString()};
}
