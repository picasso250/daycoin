import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { JsonRpcProvider, keccak256 } from 'ethers';
import { requireV02Sepolia, buildV02, creationHash, runtimeAtGenesis, verifyV02OnChain } from '../scripts/v02-sepolia-common.mjs';
import { parseV02DeployMode, assertV02FeeBudget, assertV02RpcUrl } from '../scripts/v02-sepolia-guards.mjs';
process.env.UWS_USE_FALLBACK='true';
const {default:ganache}=await import('ganache');

test('v0.2 deployment guards reject wrong chain, wrong confirmation and large fee',()=>{
  requireV02Sepolia(11155111n);
  assert.throws(()=>requireV02Sepolia(1n),/WRONG CHAIN/);
  assert.throws(()=>requireV02Sepolia(31337n),/WRONG CHAIN/);
  assert.deepEqual(parseV02DeployMode([]),{broadcast:false});
  assert.throws(()=>parseV02DeployMode(['--broadcast']),/Usage/);
  assert.throws(()=>parseV02DeployMode(['--broadcast','--confirm-deployer=0x123']),/Usage/);
  assert.throws(()=>assertV02FeeBudget(100000n,1000000000n,'0.00001'),/maximum fee/);
  assert.ok(assertV02FeeBudget(100000n,1000000000n,'0.02')>0n);
  assert.throws(()=>assertV02RpcUrl('http://rpc.example'),/HTTPS/);
  assert.throws(()=>assertV02RpcUrl('http://127.0.0.2:8545'),/HTTPS/);
  assertV02RpcUrl('http://127.0.0.1:8545');
});

test('v0.2 exact runtime patch affects only required genesis immutable slots',()=>{
  const built=buildV02();
  const expected=runtimeAtGenesis(built,1792134312n);
  assert.ok(expected.length>2500);
  const refs=built.evm.deployedBytecode.immutableReferences;
  assert.equal(Object.keys(refs).length,1);
  assert.ok(refs[Object.keys(refs)[0]].length>=1);
  assert.notEqual(keccak256(expected),keccak256(runtimeAtGenesis(built,1792134313n)));
  assert.ok(creationHash(built).startsWith('0x'));
  assert.throws(()=>runtimeAtGenesis({...built,evm:{...built.evm,deployedBytecode:{...built.evm.deployedBytecode,immutableReferences:{}}}},123n),/immutable layout/);
});

test('separate v0.2 Sepolia scripts: dry-run, guard, deploy, exact onchain verification, no redeploy', {timeout:200000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubic-v02-sepolia-'));
  const server=ganache.server({
    logging:{quiet:true},
    chain:{chainId:11155111,hardfork:'shanghai'},
    wallet:{totalAccounts:2}
  });
  await server.listen(0,'127.0.0.1');
  const provider=new JsonRpcProvider('http://127.0.0.1:'+server.address().port,undefined,{cacheTimeout:-1});
  t.after(async()=>{provider.destroy();await server.close();fs.rmSync(dir,{recursive:true,force:true});});
  for(const folder of ['scripts','contracts'])fs.cpSync(folder,path.join(dir,folder),{recursive:true});
  fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'junction');
  const accounts=Object.values(server.provider.getInitialAccounts());
  const key=accounts[0].secretKey;
  const signer=accounts[0].secretKey;
  const {Wallet}=await import('ethers');
  const address=new Wallet(signer).address;
  const rpcUrl='http://127.0.0.1:'+server.address().port;
  const env={...process.env,UBIC1_V02_SEPOLIA_RPC_URL:rpcUrl,
    UBIC1_V02_SEPOLIA_PRIVATE_KEY:key,UBIC1_V02_SEPOLIA_MAX_FEE_ETH:'0.02'};
  // Do not permit old v0.1 credential variables to influence v0.2.
  delete env.PRIVATE_KEY;
  delete env.SEPOLIA_RPC_URL;
  const run=async(file,args=[],expected=0)=>{
    const outcome=await new Promise((resolve,reject)=>{
      const p=spawn(process.execPath,[path.join(dir,'scripts',file),...args],{
        cwd:dir,env,windowsHide:true
      });
      let output='';
      p.stdout.on('data',d=>output+=d);
      p.stderr.on('data',d=>output+=d);
      p.once('error',reject);
      p.once('close',code=>resolve({code,output}));
    });
    assert.equal(outcome.code,expected,outcome.output);
    assert.ok(!outcome.output.includes(key),'private key must not appear in any stdout/stderr');
    assert.ok(!outcome.output.includes(rpcUrl),'authenticated RPC URL must not be displayed');
    return outcome.output;
  };
  const file=path.join(dir,'deployments/sepolia-v02.json');
  const built=buildV02();
  const creation=creationHash(built);

  await run('deploy-v02-sepolia.mjs');
  assert.equal(fs.existsSync(file),false,'dry-run must not touch deployment file');
  await run('deploy-v02-sepolia.mjs',['--broadcast','--confirm-deployer='+address,
    '--confirm-creation-hash='+'0x'+'00'.repeat(32)],1);
  assert.equal(fs.existsSync(file),false,'wrong creation hash must not reserve or send');
  await run('deploy-v02-sepolia.mjs',['--broadcast','--confirm-deployer=0x0000000000000000000000000000000000000001',
    '--confirm-creation-hash='+creation],1);
  assert.equal(fs.existsSync(file),false);
  const before=await provider.getBlockNumber();
  await run('deploy-v02-sepolia.mjs',['--broadcast','--confirm-deployer='+address,'--confirm-creation-hash='+creation]);
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(record.status,'verified');
  assert.equal(record.protocol,'UBIC1-v0.2');
  assert.equal(record.chainId,11155111);
  assert.equal(record.creationHash,creation);
  assert.ok((await provider.getBlockNumber())>before);
  await run('verify-v02-sepolia.mjs');
  const checked=await verifyV02OnChain(provider,built,record);
  assert.equal(checked.runtimeHash,record.runtimeHash);
  assert.equal(checked.genesisTime,record.genesisTime);
  await run('deploy-v02-sepolia.mjs',['--broadcast','--confirm-deployer='+address,'--confirm-creation-hash='+creation],1);
  // Simulated tampering with the manifest cannot pass the independent verifier.
  const bad={...record,creationHash:'0x'+'11'.repeat(32)};
  await assert.rejects(verifyV02OnChain(provider,built,bad),/hash differs/);
  fs.writeFileSync(file,JSON.stringify(bad));
  await run('verify-v02-sepolia.mjs',[],1);
  assert.equal((await provider.getCode(record.address)).toLowerCase(),runtimeAtGenesis(built,BigInt(record.genesisTime)).toLowerCase());
});

test('v0.2 verify rejects an existing v0.1 contract even on the same Sepolia chain',{timeout:50000},async t=>{
  const server=ganache.server({logging:{quiet:true},
    chain:{chainId:11155111,hardfork:'shanghai'},wallet:{totalAccounts:1}});
  await server.listen(0,'127.0.0.1');
  const provider=new JsonRpcProvider('http://127.0.0.1:'+server.address().port,undefined,{cacheTimeout:-1});
  t.after(async()=>{provider.destroy();await server.close();});
  const {ContractFactory}=await import('ethers');
  const signer=await provider.getSigner();
  const {compile}=await import('../scripts/compile.mjs');
  const old=compile()['contracts/UBIC1.sol'].UBIC1;
  const contract=await new ContractFactory(old.abi,old.evm.bytecode.object,signer).deploy();
  await contract.waitForDeployment();
  const tx=contract.deploymentTransaction();
  const receipt=await tx.wait();
  const fake={
    chainId:11155111,address:await contract.getAddress(),
    deployer:await signer.getAddress(),transactionHash:tx.hash,nonce:tx.nonce,
    creationHash:creationHash(buildV02())
  };
  assert.equal(receipt.status,1);
  await assert.rejects(verifyV02OnChain(provider,buildV02(),fake),/creation bytecode/);
});
