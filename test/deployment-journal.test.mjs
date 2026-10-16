import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider, Wallet, getCreateAddress, keccak256 } from 'ethers';
import { compile } from '../scripts/compile.mjs';
import { reserveDeployment, updateDeployment, broadcastRecordedTransaction } from '../scripts/mainnet-journal.mjs';

function journal(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubic1-mainnet-journal-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'mainnet.json');
}

test('node accepts transaction then loses response: hash and address remain on disk, retry blocked', async t => {
  const file = journal(t);
  const signer = Wallet.createRandom();
  reserveDeployment(file, { chainId: 1, deployer: signer.address });
  const nonce = 0;
  const address = getCreateAddress({ from: signer.address, nonce });
  const signedTransaction = await signer.signTransaction({
    chainId: 1, nonce, type: 2, data: '0x60006000f3', gasLimit: 120000n,
    maxFeePerGas: 10n ** 9n, maxPriorityFeePerGas: 10n ** 8n, value: 0n,
  });
  const prepared = { chainId: 1, deployer: signer.address, address, nonce };
  let accepted = false;
  await assert.rejects(broadcastRecordedTransaction({
    file, prepared, signedTransaction,
    broadcast: async () => {
      accepted = true; // the node has received the bytes
      throw new Error('simulated response loss');
    },
  }), /simulated response loss/);
  assert.equal(accepted, true);
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(persisted.status, 'signed');
  assert.equal(persisted.transactionHash, keccak256(signedTransaction));
  assert.equal(persisted.address, address);
  assert.equal(persisted.nonce, nonce);
  assert.throws(() => reserveDeployment(file, prepared), /already exists/);
});

test('successful broadcast persists pending status, never discarding identifying data', async t => {
  const file = journal(t);
  reserveDeployment(file, {chainId: 1});
  const signer = Wallet.createRandom();
  const signedTransaction = await signer.signTransaction({
    chainId: 1, nonce: 0, type: 2, data: '0x60006000f3', gasLimit: 120000n,
    maxFeePerGas: 10n ** 9n, maxPriorityFeePerGas: 10n ** 8n, value: 0n,
  });
  const hash = keccak256(signedTransaction);
  const { transactionHash } = await broadcastRecordedTransaction({
    file, signedTransaction,
    prepared: { chainId: 1, deployer: signer.address, address: getCreateAddress({from:signer.address,nonce:0}),nonce:0 },
    broadcast: async () => ({ hash }),
  });
  assert.equal(transactionHash, hash);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, 'pending');
  assert.throws(() => reserveDeployment(file, {}), /already exists/);
});

test('exclusive reservation blocks two concurrent OS processes from deploying', async t => {
  const file = journal(t);
  const worker = fileURLToPath(new URL('./fixtures/mainnet-reserve-worker.mjs', import.meta.url));
  function run() {
    return new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [worker, file], { stdio: 'ignore' });
      p.once('error', reject);
      p.once('close', code => resolve(code));
    });
  }
  const codes = await Promise.all([run(), run()]);
  assert.deepEqual(codes.sort((a,b) => a-b), [0,2]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, 'reserved');
});

test('reserved record blocks another attempt even before nonce determination', t => {
  const file = journal(t);
  reserveDeployment(file, {chainId:1});
  assert.throws(() => reserveDeployment(file, {chainId:1}), /already exists/);
  updateDeployment(file,{chainId:1,status:'signed',nonce:8,transactionHash:'0x123'});
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).nonce, 8);
  assert.throws(() => reserveDeployment(file, {chainId:1}), /already exists/);
});

test('offline-signed contract creation works against isolated simulated chain 1', { timeout: 60000 }, async t => {
  process.env.UWS_USE_FALLBACK = 'true';
  const { default: ganache } = await import('ganache');
  const server = ganache.server({
    logging: {quiet: true},
    chain: {chainId: 1, hardfork: 'shanghai'},
    wallet: {totalAccounts: 1}
  });
  await server.listen(0, '127.0.0.1');
  const provider = new JsonRpcProvider('http://127.0.0.1:' + server.address().port, undefined, {cacheTimeout:-1});
  t.after(async () => {provider.destroy(); await server.close();});
  const signer = new Wallet(Object.values(server.provider.getInitialAccounts())[0].secretKey, provider);
  const file = journal(t);
  reserveDeployment(file, {chainId:1, deployer:signer.address});
  const built = compile()['contracts/UBIC1.sol'].UBIC1;
  const factory = new ContractFactory(built.abi, built.evm.bytecode.object, signer);
  const request = await factory.getDeployTransaction();
  const nonce = await provider.getTransactionCount(signer.address, 'pending');
  const gasEstimate = await provider.estimateGas({...request,from:signer.address});
  const fees = await provider.getFeeData();
  const address = getCreateAddress({from:signer.address,nonce});
  const signedTransaction = await signer.signTransaction({
    chainId:1,type:2,nonce,to:null,data:request.data,value:0n,
    gasLimit:gasEstimate*120n/100n,
    maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas
  });
  const {transactionHash} = await broadcastRecordedTransaction({
    file,prepared:{chainId:1,deployer:signer.address,nonce,address},signedTransaction,
    broadcast:bytes=>provider.broadcastTransaction(bytes)
  });
  const receipt = await provider.waitForTransaction(transactionHash,1,30000);
  assert.equal(receipt.status,1);
  assert.equal(receipt.contractAddress.toLowerCase(),address.toLowerCase());
  assert.ok((await provider.getCode(address)).length>2);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).status,'pending');
  assert.throws(()=>reserveDeployment(file,{}),/already exists/);
});
