import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { compile } from '../scripts/compile.mjs';
import {
  readConfig, readArtifact, creationHash, deploymentFile,
  runtimeMatches, verifyDeployment, requireChain
} from '../scripts/deployment-common.mjs';

process.env.UWS_USE_FALLBACK='true';
const {default:ganache}=await import('ganache');

test('generic deployment configuration checks chain and rejects invalid artifact/input',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubic-deploy-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const env=path.join(dir,'.env');
  fs.writeFileSync(env,'CHAIN_ID=11155111\nRPC_URL=https://example.org\nPRIVATE_KEY=\nMAX_DEPLOY_FEE_ETH=0.02\n');
  const parsed=readConfig(env,{requireKey:false});
  assert.equal(parsed.chainId,11155111);
  assert.throws(()=>readConfig(env),/PRIVATE_KEY/);
  assert.throws(()=>requireChain(1,11155111),/WRONG CHAIN/);
  assert.throws(()=>readArtifact(env),/Unexpected token|not valid JSON/);
  fs.writeFileSync(env,'CHAIN_ID=1\nRPC_URL=http://bad.example.com\nPRIVATE_KEY=\n');
  assert.throws(()=>readConfig(env,{requireKey:false}),/HTTPS/);
});

test('generic artifact creation bytes and runtime immutables match v0.2 build',()=>{
  const built=compile({'contracts/UBIC1V02.sol':{
    content:fs.readFileSync('contracts/UBIC1V02.sol','utf8')
  }})['contracts/UBIC1V02.sol'].UBIC1V02;
  const refs=Object.values(built.evm.deployedBytecode.immutableReferences);
  assert.equal(refs.length,1);
  const runtime=built.evm.deployedBytecode.object;
  const word=12345n.toString(16).padStart(64,'0');
  let modified=runtime;
  for(const {start,length} of refs[0]){
    assert.equal(length,32);
    modified=modified.slice(0,2*start)+word+modified.slice(2*(start+length));
  }
  assert.equal(runtimeMatches('0x'+modified,built),true);
  assert.equal(runtimeMatches('0x'+modified.slice(0,250)+'ff'+modified.slice(252),built),false);
  assert.ok(creationHash(built).startsWith('0x'));
});

test('generic deploy and verify use exactly env file and artifact, local Sepolia EVM', {timeout:150000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubic-generic-deploy-'));
  const server=ganache.server({
    logging:{quiet:true},chain:{chainId:11155111,hardfork:'shanghai'},
    wallet:{totalAccounts:2}
  });
  await server.listen(0,'127.0.0.1');
  const url='http://127.0.0.1:'+server.address().port;
  const provider=new JsonRpcProvider(url,undefined,{cacheTimeout:-1,batchMaxCount:1});
  t.after(async()=>{provider.destroy();await server.close();fs.rmSync(dir,{recursive:true,force:true});});
  fs.mkdirSync(path.join(dir,'scripts'));
  for(const name of ['deploy.mjs','verify.mjs','deployment-common.mjs','deployment-journal.mjs']){
    fs.copyFileSync(path.join('scripts',name),path.join(dir,'scripts',name));
  }
  fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'junction');
  fs.mkdirSync(path.join(dir,'artifacts'));
  const built=compile({'contracts/UBIC1V02.sol':{
    content:fs.readFileSync('contracts/UBIC1V02.sol','utf8')
  }})['contracts/UBIC1V02.sol'].UBIC1V02;
  const art='artifacts/UBIC1V02.json';
  fs.writeFileSync(path.join(dir,art),JSON.stringify(built));
  const key=Object.values(server.provider.getInitialAccounts())[0].secretKey;
  const envFile='.env.sepolia';
  const env=path.join(dir,envFile);
  fs.writeFileSync(env,`CHAIN_ID=11155111\nRPC_URL=${url}\nPRIVATE_KEY=${key}\nMAX_DEPLOY_FEE_ETH=0.02\n`);
  const run=async(script,args=[],exit=0)=>{
    const result=await new Promise((resolve,reject)=>{
      const p=spawn(process.execPath,[path.join(dir,'scripts',script),...args],{
        cwd:dir,env:{...process.env},windowsHide:true
      });
      let output='';
      p.stdout.on('data',x=>output+=x);
      p.stderr.on('data',x=>output+=x);
      p.once('error',reject);
      p.once('close',code=>resolve({code,output}));
    });
    assert.equal(result.code,exit,result.output);
    assert.ok(!result.output.includes(key),'key leaked to output');
    assert.ok(!result.output.includes(url),'RPC URL leaked to output');
    return result.output;
  };
  const args=[envFile,art];
  const journal=path.join(dir,deploymentFile(11155111,art).replace(/^deployments[/\\]/,''));
  const fullJournal=path.join(dir,deploymentFile(11155111,path.join(dir,art)));
  assert.equal(path.basename(fullJournal),path.basename(journal));
  const expectedFile=path.join(dir,'deployments',path.basename(fullJournal));
  assert.match(await run('deploy.mjs',args),/PREFLIGHT ONLY/);
  assert.equal(fs.existsSync(expectedFile),false);
  await run('deploy.mjs',[...args,'--broadcast'],0);
  const record=JSON.parse(fs.readFileSync(expectedFile,'utf8'));
  assert.equal(record.status,'verified');
  assert.equal(record.chainId,11155111);
  assert.equal(record.creationHash,creationHash(built));
  assert.equal((await verifyDeployment(provider,built,record)).runtimeHash,record.runtimeHash);
  // v0.2-specific properties stay in test, not in reusable deployment code.
  const contract=new Contract(record.address,built.abi,provider);
  assert.equal(await contract.decimals(),18n);
  assert.equal(await contract.totalSupply(),0n);
  const creationBlock=await provider.getBlock(record.blockNumber);
  assert.equal(await contract.genesisTime(),BigInt(creationBlock.timestamp));
  assert.match(await run('verify.mjs',args),/VERIFIED/);
  assert.match(await run('deploy.mjs',[...args,'--broadcast'],1),/already exists/);
  const wrongArtifact={...built,evm:{...built.evm,bytecode:{...built.evm.bytecode,object:built.evm.bytecode.object.slice(0,-2)+'00'}}};
  fs.writeFileSync(path.join(dir,art),JSON.stringify(wrongArtifact));
  await run('verify.mjs',args,1);
  fs.writeFileSync(path.join(dir,art),JSON.stringify(built));
  const bad={...record,creationHash:'0x'+'00'.repeat(32)};
  fs.writeFileSync(expectedFile,JSON.stringify(bad));
  await run('verify.mjs',args,1);
});

test('generic deploy refuses wrong chain before any broadcast', {timeout:40000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubic-generic-wrong-chain-'));
  const server=ganache.server({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:1}});
  await server.listen(0,'127.0.0.1');
  t.after(async()=>{await server.close();fs.rmSync(dir,{recursive:true,force:true});});
  const url='http://127.0.0.1:'+server.address().port;
  fs.mkdirSync(path.join(dir,'scripts'));
  for(const name of ['deploy.mjs','deployment-common.mjs','deployment-journal.mjs'])fs.copyFileSync(path.join('scripts',name),path.join(dir,'scripts',name));
  fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'junction');
  fs.mkdirSync(path.join(dir,'artifacts'));
  const built=compile({'contracts/UBIC1V02.sol':{content:fs.readFileSync('contracts/UBIC1V02.sol','utf8')}})['contracts/UBIC1V02.sol'].UBIC1V02;
  fs.writeFileSync(path.join(dir,'artifacts/UBIC1V02.json'),JSON.stringify(built));
  const key=Object.values(server.provider.getInitialAccounts())[0].secretKey;
  fs.writeFileSync(path.join(dir,'.env.sepolia'),`CHAIN_ID=11155111\nRPC_URL=${url}\nPRIVATE_KEY=${key}\n`);
  const p=spawn(process.execPath,[path.join(dir,'scripts/deploy.mjs'),'.env.sepolia','artifacts/UBIC1V02.json','--broadcast'],{cwd:dir,windowsHide:true});
  let result='';for await(const x of p.stdout)result+=x;
  let errors='';for await(const x of p.stderr)errors+=x;
  const exit=await new Promise(resolve=>p.once('close',resolve));
  assert.notEqual(exit,0);
  assert.match(result+errors,/WRONG CHAIN/);
  assert.equal(fs.existsSync(path.join(dir,'deployments')),false);
});
