import fs from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256 } from 'ethers';
import { compile } from './compile.mjs';

export const CHAIN_ID = 11155111n;
export const DEPLOYMENT_FILE = 'deployments/sepolia.json';
export function artifact() { return compile()['contracts/UBIC1.sol'].UBIC1; }
export function requireSepolia(id) {
  if (id !== CHAIN_ID) throw new Error('Wrong chain: only Ethereum Sepolia (11155111) is allowed.');
}
export async function connect(sign = false) {
  if (!process.env.SEPOLIA_RPC_URL) throw new Error('Set SEPOLIA_RPC_URL in .env.');
  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL, undefined, { cacheTimeout: -1 });
  try {
    requireSepolia((await provider.getNetwork()).chainId);
    if (!sign) return { provider };
    const key = process.env.PRIVATE_KEY?.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error('PRIVATE_KEY must be 0x + 64 hex characters, without a trailing backslash.');
    return { provider, signer: new Wallet(key, provider) };
  } catch (error) { provider.destroy(); throw error; }
}
export function readDeployment() {
  return fs.existsSync(DEPLOYMENT_FILE) ? JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8')) : null;
}
export function saveDeployment(data) {
  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync(`${DEPLOYMENT_FILE}.tmp`, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(`${DEPLOYMENT_FILE}.tmp`, DEPLOYMENT_FILE);
}
// Constructor patches genesisTime into runtime. Compare all other bytes,
// including compiler metadata, against this exact source build.
export function matchesRuntime(actual, built) {
  let expected = built.evm.deployedBytecode.object.toLowerCase();
  let deployed = actual.replace(/^0x/, '').toLowerCase();
  if (!expected || deployed.length !== expected.length) return false;
  for (const refs of Object.values(built.evm.deployedBytecode.immutableReferences ?? {})) {
    for (const { start, length } of refs) {
      const mask = '0'.repeat(length * 2);
      expected = expected.slice(0, start * 2) + mask + expected.slice((start + length) * 2);
      deployed = deployed.slice(0, start * 2) + mask + deployed.slice((start + length) * 2);
    }
  }
  return deployed === expected;
}
export async function checkedContract(provider, runner, built) {
  const record = readDeployment();
  const input = process.env.UBIC1_ADDRESS || record?.address;
  if (!input) throw new Error('Set UBIC1_ADDRESS or deploy first.');
  const address = getAddress(input);
  const code = await provider.getCode(address);
  if (!matchesRuntime(code, built)) throw new Error('Runtime bytecode does not match this UBIC1 build.');
  if (record?.address?.toLowerCase() === address.toLowerCase() && record.runtimeHash && record.runtimeHash !== keccak256(code)) throw new Error('Runtime differs from saved deployment.');
  const contract = new Contract(address, built.abi, runner);
  if (await contract.name() !== 'UBIC1' || await contract.symbol() !== 'UBIC1' || await contract.decimals() !== 4n) throw new Error('Unexpected token metadata.');
  return contract;
}
export async function mined(transaction, label) {
  console.log(`${label}: https://sepolia.etherscan.io/tx/${transaction.hash}`);
  const receipt = await transaction.wait(1, 180000);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} did not succeed.`);
  return receipt;
}
export function safeError(error) {
  // Never dump an ethers error object or authenticated RPC URL.
  let message = String(error.shortMessage || error.message || 'Unknown error');
  for (const secret of [process.env.PRIVATE_KEY, process.env.SEPOLIA_RPC_URL]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  return message.replace(/https?:\/\/[^\s"']+/g, '[URL redacted]');
}
