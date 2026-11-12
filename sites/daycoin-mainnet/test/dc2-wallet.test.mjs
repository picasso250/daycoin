import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDC2, accrued, readPosition, connectWallet, sendClaim, waitForReceipt} from '../dist/dc2/wallet.mjs';
const address='0x5E81BF553E9Ab75872a47bAd30A0fd3589AD215E';
const contract='0xD891dc80535e885E5893B8139902F90F6aBA086b';
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const pos={since:1794480351n,minted:0n};
test('time accrual is integer precision, independent of claims and display rounding',()=>{
 assert.equal(accrued(pos,1794480351),0n);
 assert.equal(accrued(pos,1794480351+86400),10n**18n);
 assert.equal(formatDC2(accrued(pos,1794480351+43200)),'0.5');
 assert.equal(formatDC2(1234567890000000000n),'1.23456');
 assert.equal(accrued({...pos,minted:10n**18n},1794480351+43200),0n);
});
test('wallet read identifies actual registration and balances from chain, not GitHub UI',async()=>{
 const calls=[];
 const provider={request:async ({method,params})=>{
  calls.push([method,params]);
  if(method==='eth_call') {
   assert.equal(params[0].to,contract);
   if(params[0].data.startsWith('0x61b5cb4b'))return '0x'+word(1884104);
   if(params[0].data.startsWith('0x99fbab88'))return '0x'+word(address)+word(pos.since)+word(0);
   if(params[0].data.startsWith('0x70a08231'))return '0x'+word(1500000000000000000n);
  }
  if(method==='eth_getBlockByNumber')return {timestamp:'0x'+(Number(pos.since)+86400).toString(16)};
  throw Error('Unexpected '+method);
 }};
 const result=await readPosition(provider,address);
 assert.equal(result.registered,true);
 assert.equal(result.githubId,1884104n);
 assert.equal(result.balance,1500000000000000000n);
 assert.equal(formatDC2(accrued(result,result.chainTime)),'1');
 assert.equal(calls.filter(([method])=>method==='eth_call').length,3);
});
test('unregistered wallet never gets a balance/claim call',async()=>{
 let called=0;
 const provider={request:async({method})=>{called++;assert.equal(method,'eth_call');return '0x'+word(0);}};
 const result=await readPosition(provider,address);
 assert.equal(result.registered,false);assert.equal(called,1);
});
test('wallet switch requires user action; sendClaim is fixed to contract selector',async()=>{
 let switched=0;let captured;
 const provider={request:async({method,params})=>{
  if(method==='eth_accounts'||method==='eth_requestAccounts')return [address];
  if(method==='eth_chainId')return switched?'0xa4b1':'0x1';
  if(method==='wallet_switchEthereumChain'){assert.equal(params[0].chainId,'0xa4b1');switched++;return null;}
  if(method==='eth_sendTransaction'){captured=params[0];return '0x'+'ba'.repeat(32);}
  throw Error('Unexpected '+method);
 }};
 assert.equal((await connectWallet(provider,false)).wrongNetwork,true);
 assert.equal(switched,0);
 assert.equal((await connectWallet(provider,true)).wrongNetwork,false);
 const hash=await sendClaim(provider,address);
 assert.equal(hash,'0x'+'ba'.repeat(32));
 assert.equal(captured.to,contract);assert.equal(captured.from,address);
 assert.equal(captured.data,'0x4e71d92d');
});
test('receipt failure never reports success',async()=>{
 const hash='0x'+'ab'.repeat(32);
 const success={request:async()=>({status:'0x1'})};
 const failure={request:async()=>({status:'0x0'})};
 await waitForReceipt(success,hash,1);
 await assert.rejects(()=>waitForReceipt(failure,hash,1),/执行失败/);
});
