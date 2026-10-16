import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import ganache from 'ganache';
import {ContractFactory,JsonRpcProvider,parseEther,keccak256} from 'ethers';
import {compile} from '../../../scripts/compile.mjs';

process.env.UWS_USE_FALLBACK='true';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
process.chdir(root);
const dist=path.join(root,'sites/ubic1-v02/dist');
const edgePath = process.env.UBIC_E2E_BROWSER || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined));
const DAY=86400, UNIT=parseEther('0.1');
const listen=server=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>resolve(server.address().port));
});
const close=server=>new Promise(resolve=>server.close(()=>resolve()));
const errPage=[];

async function lab(t,options={}) {
  const chain=ganache.server({
    logging:{quiet:true},
    chain:{hardfork:'shanghai',chainId:31337,time:options.stale?new Date('2026-01-01T00:00:00Z'):new Date()},
    wallet:{totalAccounts:3},
    miner:{timestampIncrement:0}
  });
  const rpcPort=await listen(chain);
  const rpcUrl=`http://127.0.0.1:${rpcPort}`;
  const rpc=new JsonRpcProvider(rpcUrl,undefined,{batchMaxCount:1,cacheTimeout:-1});
  const signer=await rpc.getSigner(0);
  const account=await signer.getAddress();
  const compiled=compile({
    'contracts/UBIC1V02.sol':{content:fs.readFileSync(path.join(root,'contracts/UBIC1V02.sol'),'utf8')}
  });
  const artifact=compiled['contracts/UBIC1V02.sol'].UBIC1V02;
  const contract=await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,signer).deploy();
  await contract.waitForDeployment();
  const address=await contract.getAddress();
  const runtimeHash=keccak256(await rpc.getCode(address));
  let mismatch=false;
  const site=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(url.pathname==='/config.mjs') {
      res.setHeader('Content-Type','text/javascript; charset=utf-8');
      res.end(`export const CONFIG = Object.freeze(${JSON.stringify({
        label:'Ganache 本地隔离测试链',
        chainId:31337,address,runtimeHash:mismatch?'0x'+'00'.repeat(32):runtimeHash,
        rpcUrl:`http://127.0.0.1:${site.address().port}/rpc`,explorerUrl:null
      })});`);
      return;
    }
    if(url.pathname==='/rpc'&&req.method==='POST') {
      try {
        let body='';
        for await(const chunk of req)body+=chunk;
        const upstream=await fetch(rpcUrl,{
          method:'POST',headers:{'Content-Type':'application/json'},body
        });
        res.writeHead(upstream.status,{'Content-Type':'application/json'});
        res.end(await upstream.text());
      }catch(e){res.writeHead(502);res.end(String(e.message));}
      return;
    }
    let requested;
    try {requested=path.resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}
    catch{res.writeHead(400).end();return;}
    if(!requested.startsWith(dist+path.sep)||!fs.existsSync(requested)||!fs.statSync(requested).isFile()){
      res.writeHead(404).end('Not found');return;
    }
    const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.txt':'text/plain'};
    res.writeHead(200,{'Content-Type':(mime[path.extname(requested)]||'application/octet-stream')+'; charset=utf-8'});
    fs.createReadStream(requested).pipe(res);
  });
  const sitePort=await listen(site);
  const browser=await chromium.launch({executablePath:edgePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  page.on('pageerror',e=>errPage.push(e.message));
  await page.addInitScript(()=>{
    const actualNow=Date.now.bind(Date);
    let simulatedOffset=0;
    window.__advanceTestClock=seconds=>{simulatedOffset+=seconds*1000;};
    Date.now=()=>actualNow()+simulatedOffset;
  });
  await page.addInitScript(({account})=>{
    // A test-only unlocked EIP-1193 wallet proxy, connected solely to Ganache.
    // It never contains a user's seed phrase or touches Ethereum Mainnet.
    window.ethereum={
      __listeners:{},
      on(name,cb){(this.__listeners[name]??=[]).push(cb);},
      removeListener(name,cb){this.__listeners[name]=(this.__listeners[name]??[]).filter(f=>f!==cb);},
      async request({method,params=[]}){
        if(method==='eth_requestAccounts'||method==='eth_accounts')return [account];
        const response=await fetch('/rpc',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({jsonrpc:'2.0',id:Math.floor(Math.random()*1000000),method,params})
        });
        const data=await response.json();
        if(data.error){
          const e=new Error(data.error.message??'RPC Error');
          e.code=data.error.code;throw e;
        }
        return data.result;
      }
    };
  },{account});
  const url=`http://127.0.0.1:${sitePort}/`;
  // Ganache server.close() returns a Promise; unlike Node HTTP server.close,
  // it does not accept a callback. Using the HTTP helper hung test teardown.
  t.after(async()=>{await browser.close();await close(site);rpc.destroy();await chain.close();});
  return {rpc,chain,page,contract,account,url,setMismatch:v=>{mismatch=v;}};
}
async function waitValue(page, selector, expression) {
  await page.waitForFunction(([s,val])=>document.querySelector(s)?.textContent?.includes(val),
    [selector,expression],{timeout:16000});
}
async function submitDeposit(page,eth) {
  await page.locator('[data-action="deposit"]').click();
  await page.locator('#amount').fill(eth);
  await page.locator('#submit').click();
  await page.locator('#deposit-dialog[open]').waitFor({timeout:10000});
  assert.match(await page.locator('#deposit-detail').innerText(),/放弃|未领取/);
  await page.locator('#deposit-confirm').click();
}

test('browser E2E: real click -> local ETH deposit/claim/reset/withdraw, no mainnet calls', {timeout:90000}, async t=>{
  const {page,contract,account,url,chain,rpc,setMismatch}=await lab(t);
  await page.goto(url);
  await waitValue(page,'#environment-title','已验证');
  await page.locator('#connect').click();
  await waitValue(page,'#principal','0.0 ETH');
  // 0.001 ETH can enter and leave, but does not qualify for minting.
  await submitDeposit(page,'0.001');
  await waitValue(page,'#principal','0.001 ETH');
  assert.equal((await contract.positions(account)).principal,parseEther('0.001'));
  assert.equal(await contract.pending(account),0n);
  await page.locator('[data-action="withdraw"]').click();
  await page.locator('#submit').click();
  await page.locator('#withdraw-dialog[open]').waitFor();
  await page.locator('#withdraw-confirm').click();
  await waitValue(page,'#principal','0.0 ETH');
  assert.equal((await contract.positions(account)).principal,0n);
  assert.equal(await rpc.getBalance(await contract.getAddress()),0n);
  // Deposit lower than threshold, then make the position eligible.
  await submitDeposit(page,'0.001');
  await waitValue(page,'#principal','0.001 ETH');
  await submitDeposit(page,'0.099');
  await waitValue(page,'#principal','0.1 ETH');
  assert.equal((await contract.positions(account)).principal,UNIT);
  await chain.provider.send('evm_increaseTime',[DAY/2]);
  await chain.provider.send('evm_mine',[]);
  await page.evaluate(seconds=>window.__advanceTestClock(seconds),DAY/2);
  await page.locator('#refresh').click();
  await waitValue(page,'#pending','0.5');
  assert.equal(await contract.pending(account),parseEther('0.5'));
  // Canceling a deposit does NOT reset reward clock.
  await page.locator('[data-action="deposit"]').click();
  await page.locator('#amount').fill('0.000000000000000001');
  await page.locator('#submit').click();
  await page.locator('#deposit-dialog[open]').waitFor();
  assert.match(await page.locator('#deposit-detail').innerText(),/0.5 UBIC1/);
  await page.locator('#deposit-cancel').click();
  assert.equal((await contract.positions(account)).principal,UNIT);
  assert.equal(await contract.pending(account),parseEther('0.5'));
  // Actual signed local deposit resets all 0.5 unclaimed UBIC.
  await submitDeposit(page,'0.000000000000000001');
  await page.waitForFunction(() => document.querySelector('#pending')?.textContent?.trim() === '0', null, {timeout: 16000});
  await page.waitForFunction(() => document.querySelector('#tx-title')?.textContent === 'Confirmed', null, {timeout: 16000});
  assert.equal((await contract.positions(account)).principal,UNIT+1n);
  assert.equal(await contract.pending(account),0n);
  await chain.provider.send('evm_increaseTime',[DAY/2]);
  await chain.provider.send('evm_mine',[]);
  await page.evaluate(seconds=>window.__advanceTestClock(seconds),DAY/2);
  await page.locator('#refresh').click();
  await waitValue(page,'#pending','0.5');
  await page.locator('[data-action="claim"]').click();
  await page.locator('#submit').click();
  await waitValue(page,'#token-balance','0.5 UBIC1');
  assert.equal(await contract.balanceOf(account),parseEther('0.5'));
  // Last seconds are unclaimed; direct Withdraw does not mint.
  await chain.provider.send('evm_increaseTime',[DAY/2]);
  await chain.provider.send('evm_mine',[]);
  await page.evaluate(seconds=>window.__advanceTestClock(seconds),DAY/2);
  await page.locator('#refresh').click();
  await waitValue(page,'#pending','0.5');
  await page.locator('[data-action="withdraw"]').click();
  await page.locator('#submit').click();
  await page.locator('#withdraw-dialog[open]').waitFor();
  const detail=await page.locator('#withdraw-detail').innerText();
  assert.match(detail,/0.5 UBIC1/);
  assert.match(detail,/0.100000000000000001 ETH/);
  await page.locator('#withdraw-confirm').click();
  await waitValue(page,'#principal','0.0 ETH');
  assert.equal((await contract.positions(account)).principal,0n);
  assert.equal(await contract.balanceOf(account),parseEther('0.5'));
  assert.equal(await rpc.getBalance(await contract.getAddress()),0n);
  // Wrong bytecode hash must disable all transactions.
  setMismatch(true);
  await page.reload();
  await waitValue(page,'#environment-title','交易不可用');
  assert.equal(await page.locator('#submit').isDisabled(),true);
  assert.match(await page.locator('#environment-desc').innerText(),/Hash 不匹配/);
  assert.deepEqual(errPage,[]);
});

test('browser E2E: deployed wallet on the wrong chain cannot transact', {timeout:45000},async t=>{
  const {page,url}=await lab(t);
  await page.goto(url);
  await waitValue(page,'#environment-title','已验证');
  // Override provider chain reporting before wallet connects (read-only RPC stays on 31337).
  await page.evaluate(()=>{
    const wallet=window.ethereum, orig=wallet.request;
    wallet.request=async args=>args.method==='eth_chainId'?'0x1':orig(args);
  });
  await page.locator('#connect').click();
  await waitValue(page,'#wallet-id','网络不匹配');
  assert.equal(await page.locator('#submit').isDisabled(),true);
});

test('security V02-01: chainChanged during getSigner invalidates signing; no transaction is sent', {timeout:50000},async t=>{
  const {page,url,contract,rpc}=await lab(t);
  await page.goto(url);await waitValue(page,'#environment-title','已验证');
  await page.locator('#connect').click();await waitValue(page,'#principal','0.0 ETH');
  await page.evaluate(()=>{
    const w=window.ethereum, original=w.request;
    let changed=false;window.sent=[];
    w.request=async args=>{
      if(!changed && args.method==='eth_accounts' &&
        document.querySelector('#tx-detail').textContent.includes('请核对链 ID')){
        changed=true;
        for(const handler of w.__listeners.chainChanged??[])handler('0x7a6a');
      }
      if(args.method==='eth_sendTransaction')window.sent.push(args.params[0]);
      if(changed&&args.method==='eth_chainId')return '0x7a6a';
      return original(args);
    };
  });
  await submitDeposit(page,'0.1');
  await waitValue(page,'#tx-title','Failed');
  assert.equal(await page.evaluate(()=>window.sent.length),0);
  assert.equal(await rpc.getBalance(await contract.getAddress()),0n);
  assert.equal(await page.locator('#submit').isDisabled(),true);
});

test('security V02-02: one stale snapshot double-click cannot send two Deposits', {timeout:50000},async t=>{
  const {page,url,contract,account}=await lab(t);
  await page.goto(url);await waitValue(page,'#environment-title','已验证');
  await page.locator('#connect').click();await waitValue(page,'#principal','0.0 ETH');
  await page.evaluate(()=>{
    const w=window.ethereum, old=w.request;
    window.sent=[];
    w.request=async args=>{if(args.method==='eth_sendTransaction')window.sent.push(args.params[0]);return old(args);};
    const now=Date.now.bind(Date);Date.now=()=>now()+61000;
    document.querySelector('#submit').click();
    document.querySelector('#submit').click();
  });
  await page.locator('#deposit-dialog[open]').waitFor();
  await page.locator('#deposit-confirm').click();
  await waitValue(page,'#tx-title','Confirmed');
  assert.equal(await page.evaluate(()=>window.sent.length),1);
  assert.equal(BigInt(await page.evaluate(()=>window.sent[0].chainId)),31337n);
  assert.equal((await contract.positions(account)).principal,parseEther('0.001'));
});

test('security V02-03: months-old RPC block disables Deposit instead of marking fresh', {timeout:35000},async t=>{
  const {page,url}=await lab(t,{stale:true});
  await page.goto(url);await waitValue(page,'#environment-title','交易不可用');
  assert.match(await page.locator('#environment-desc').innerText(),/过期区块/);
  await page.locator('#connect').click();
  assert.equal(await page.locator('#submit').isDisabled(),true);
});

test('security V02-04: broadcast accepted but response lost stays Pending across reload', {timeout:50000},async t=>{
  const {page,url,contract,account}=await lab(t);
  await page.goto(url);await waitValue(page,'#environment-title','已验证');
  await page.locator('#connect').click();await waitValue(page,'#principal','0.0 ETH');
  await page.evaluate(()=>{
    const w=window.ethereum, old=w.request;
    w.request=async args=>{
      const result=await old(args);
      if(args.method==='eth_sendTransaction')throw Object.assign(new Error('response lost after broadcast'),{code:-32000});
      return result;
    };
  });
  await submitDeposit(page,'0.1');
  await waitValue(page,'#tx-title','Pending');
  await page.locator('#unresolved:not([hidden])').waitFor();
  assert.equal((await contract.positions(account)).principal,parseEther('0.1'));
  assert.equal(await page.locator('#submit').isDisabled(),true);
  assert.match(await page.locator('#tx-detail').innerText(),/结果未知/);
  await page.reload();await waitValue(page,'#environment-title','已验证');
  await page.locator('#connect').click();
  await page.locator('#unresolved:not([hidden])').waitFor();
  assert.equal(await page.locator('#submit').isDisabled(),true);
  await page.locator('#reconcile').click();
  await waitValue(page,'#tx-title','Pending');
  assert.equal(await page.locator('#submit').isDisabled(),true);
});
