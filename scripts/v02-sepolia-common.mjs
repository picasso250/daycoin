import fs from 'node:fs';
import solc from 'solc';
import { Contract, getAddress, getCreateAddress, keccak256 } from 'ethers';
import { compile } from './compile.mjs';

export const V02_SEPOLIA_CHAIN = 11155111n;
export const V02_DEPLOYMENT_FILE = 'deployments/sepolia-v02.json';
const SOL_FILE = 'contracts/UBIC1V02.sol';
const CONTRACT = 'UBIC1V02';
const DAY_SECONDS = 86400n;
const EPOCH_SECONDS = 86400000n;
const STEP = 100000000000000000n;

export function requireV02Sepolia(chainId) {
  if (BigInt(chainId) !== V02_SEPOLIA_CHAIN)
    throw Error('UBIC1-v0.2: WRONG CHAIN. Sepolia (11155111) only; no transaction allowed.');
}

export function buildV02() {
  if (!solc.version().startsWith('0.8.37+commit.f401782d.'))
    throw Error('Incorrect solc build; require exactly Solidity 0.8.37 commit f401782d.');
  const built = compile({
    [SOL_FILE]: { content: fs.readFileSync(SOL_FILE, 'utf8') }
  })[SOL_FILE]?.[CONTRACT];
  if (!built?.evm?.bytecode?.object || !built?.evm?.deployedBytecode?.object)
    throw Error('UBIC1-v0.2 build is missing executable bytecode.');
  const errors = ['deposit','claim','withdraw','pending','genesisTime','positions'];
  const functions = new Map(built.abi.filter(item => item.type === 'function').map(item => [item.name, item]));
  for (const name of errors) if (!functions.has(name)) throw Error('Not a v0.2 build: missing ' + name);
  const position = functions.get('positions');
  if (position.outputs?.map(x => x.name).join(',') !== 'cursor,principal')
    throw Error('Not a v0.2 position ABI.');
  if (functions.has('topUp')) throw Error('Refusing v0.1 ABI: topUp present.');
  return built;
}

export function creationHash(built) {
  return keccak256('0x' + built.evm.bytecode.object);
}

/** Exact byte-for-byte runtime, replacing ONLY the verified immutable slots.
 *  This contract has precisely one uint256 immutable: genesisTime; references
 *  must all carry the SAME genesis timestamp as the deployment block.
 */
export function runtimeAtGenesis(built, genesisTime) {
  const refs = built.evm.deployedBytecode.immutableReferences || {};
  const keys = Object.keys(refs);
  if (keys.length !== 1 || refs[keys[0]].length < 1)
    throw Error('Unexpected immutable layout in v0.2 build; refusing to mask unknown runtime bytes.');
  const genesis = BigInt(genesisTime);
  if (genesis < 0n || genesis > ((1n << 256n) - 1n))
    throw Error('Invalid genesis timestamp.');
  const word = genesis.toString(16).padStart(64, '0');
  const runtime = built.evm.deployedBytecode.object.toLowerCase();
  const refsFlat = refs[keys[0]];
  const positions = new Set();
  let expected = runtime;
  for (const {start,length} of refsFlat) {
    if (!Number.isSafeInteger(start) || length !== 32 ||
        start < 0 || (start + length) * 2 > runtime.length || positions.has(start))
      throw Error('Unexpected or overlapping genesis immutable slot.');
    positions.add(start);
    expected = expected.slice(0,start*2) + word + expected.slice((start+length)*2);
  }
  return '0x' + expected;
}

export function safeV02Error(error) {
  let message=String(error?.shortMessage || error?.message || 'Unknown error');
  for (const secret of [
    process.env.UBIC1_V02_SEPOLIA_PRIVATE_KEY,
    process.env.UBIC1_V02_SEPOLIA_RPC_URL
  ]) if(secret)message=message.split(secret).join('[redacted]');
  return message.replace(/https?:\/\/[^\s"'<>]+/g,'[RPC URL redacted]');
}

export function readV02Deployment(file=V02_DEPLOYMENT_FILE) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : null;
}

/** Validate a REAL mined creation tx plus exact runtime, never masking bytes.
 *  A local test EVM can exercise the same verifier. This function is read-only.
 */
export async function verifyV02OnChain(provider, built, record) {
  requireV02Sepolia((await provider.getNetwork()).chainId);
  if (!record || Number(record.chainId) !== Number(V02_SEPOLIA_CHAIN))
    throw Error('Missing v0.2 Sepolia deployment record.');
  if (record.creationHash?.toLowerCase() !== creationHash(built).toLowerCase())
    throw Error('Creation bytecode hash differs from the saved v0.2 deployment.');
  const address = getAddress(record.address);
  if(!Number.isSafeInteger(record.nonce) || record.nonce < 0 ||
     getCreateAddress({from:getAddress(record.deployer),nonce:record.nonce}).toLowerCase() !== address.toLowerCase())
    throw Error('Recorded deployer, nonce, and predicted creation address disagree.');
  const transactionHash = record.transactionHash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash || ''))
    throw Error('Missing recorded creation transaction hash; cannot prove deployed creation code.');
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(transactionHash), provider.getTransactionReceipt(transactionHash)
  ]);
  if (!tx || !receipt || receipt.status !== 1 || tx.to !== null ||
      receipt.contractAddress?.toLowerCase() !== address.toLowerCase() ||
      tx.from.toLowerCase() !== getAddress(record.deployer).toLowerCase() ||
      tx.nonce !== record.nonce ||
      receipt.from.toLowerCase() !== getAddress(record.deployer).toLowerCase() ||
      tx.chainId !== V02_SEPOLIA_CHAIN || tx.value !== 0n ||
      tx.data.toLowerCase() !== ('0x' + built.evm.bytecode.object).toLowerCase()) {
    throw Error('Creation transaction does NOT match the exact UBIC1-v0.2 compiled creation bytecode.');
  }
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block || block.hash !== receipt.blockHash)
    throw Error('Deployment block cannot be verified.');
  const code = await provider.getCode(address,receipt.blockNumber);
  const fullExpected = runtimeAtGenesis(built,BigInt(block.timestamp));
  if (code.toLowerCase() !== fullExpected.toLowerCase())
    throw Error('On-chain runtime bytecode differs from exact compiled v0.2 runtime + genesis immutable.');
  const contract = new Contract(address,built.abi,provider);
  const opts={blockTag:receipt.blockNumber};
  const [genesis,name,symbol,decimals,supply,depositStep,epochDuration,period,rewardPerDay,required] =
    await Promise.all([
      contract.genesisTime(opts),contract.name(opts),contract.symbol(opts),
      contract.decimals(opts),contract.totalSupply(opts),contract.DEPOSIT_STEP(opts),
      contract.EPOCH_DURATION(opts),contract.PERIOD(opts),contract.REWARD_PER_DAY(opts),
      contract.requiredDeposit(opts)
    ]);
  if (genesis !== BigInt(block.timestamp) || name !== 'UBIC1' || symbol !== 'UBIC1' ||
      decimals !== 18n || supply !== 0n || depositStep !== STEP ||
      epochDuration !== EPOCH_SECONDS || period !== DAY_SECONDS ||
      rewardPerDay !== 1000000000000000000n || required !== STEP)
    throw Error('v0.2 genesis, metadata, constants, or initial supply mismatch.');
  return {
    ...record,
    status:'verified',
    blockNumber:receipt.blockNumber,
    genesisTime:genesis.toString(),
    runtimeHash:keccak256(code),
    creationHash:creationHash(built),
    verifiedAt:new Date().toISOString()
  };
}
