import {test} from 'node:test';
import assert from 'node:assert/strict';
import {id} from 'ethers';
import {summarizeDc2,readDc2Stats,handleDc2Stats} from '../dc2-stats.mjs';
const contract='0xD891dc80535e885E5893B8139902F90F6aBA086b';
const word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const topics=[id('Registered(uint256,address,uint256)'),word(1884104),word('0x5E81BF553E9Ab75872a47bAd30A0fd3589AD215E')];
const makeLog=(githubId,second)=>({address:contract,topics:[topics[0],word(githubId),topics[2]],data:word(second)});
const RATE=10n**18n;

test('empty DC2 event history is zero in every public statistic',()=>{
 const x=summarizeDc2([],0n,200n,523527970n);
 assert.deepEqual({registered:x.registered,daily:x.dailyRate,supply:x.totalSupply,unclaimed:x.unclaimed},
  {registered:0,daily:0,supply:'0',unclaimed:'0'});
});
test('registered IDs are counted once; minted and unclaimed are distinct',()=>{
 const x=summarizeDc2([makeLog(1884104,100),makeLog(2222,200)],RATE,200n+86400n,523999000n);
 assert.equal(x.registered,2);assert.equal(x.dailyRate,2);assert.equal(x.totalSupply,'1');
 assert.equal(x.totalAccrued,'2.001157407407407407');
 assert.equal(x.unclaimed,'1.001157407407407407');
});
test('a partial minted amount and zero user claims retain exact wei arithmetic',()=>{
 const x=summarizeDc2([makeLog(1,100)],123n,86500n,523999000n);
 assert.equal(x.unclaimed,'0.999999999999999877');
});
test('duplicate, future, forged, and incomplete event data fail rather than fabricate stats',()=>{
 assert.throws(()=>summarizeDc2([makeLog(1,100),makeLog(1,200)],0n,1000n,523999000n),/Inconsistent/);
 assert.throws(()=>summarizeDc2([makeLog(1,1000)],0n,900n,523999000n),/Inconsistent/);
 assert.throws(()=>summarizeDc2([{...makeLog(1,100),address:'0x'+'aa'.repeat(20)}],0n,1000n,523999000n),/Unexpected/);
 assert.throws(()=>summarizeDc2([makeLog(1,100)],RATE+1n,86500n,523999000n),/exceeds/);
});
test('read is same-block only and uses event logs + ERC-20 supply, with no user wallet',async()=>{
 const calls=[];
 const fetcher=async(url,{body})=>{
  assert.equal(url,'https://arb1.arbitrum.io/rpc');
  const req=JSON.parse(body);calls.push(req);
  if(req.method==='eth_getBlockByNumber')return Response.json({jsonrpc:'2.0',id:req.id,result:{number:'0x1f3fa000',timestamp:'0x15204'}});
  if(req.method==='eth_getLogs')return Response.json({jsonrpc:'2.0',id:req.id,result:[makeLog(1884104,100)]});
  if(req.method==='eth_call')return Response.json({jsonrpc:'2.0',id:req.id,result:word(RATE)});
  throw Error(req.method);
 };
 const data=await readDc2Stats(fetcher);
 assert.equal(data.registered,1);
 const logs=calls.find(c=>c.method==='eth_getLogs');
 const supply=calls.find(c=>c.method==='eth_call');
 assert.equal(logs.params[0].toBlock,supply.params[1]);
 assert.equal(supply.params[0].to,contract);
});
test('RPC outage returns 503, never a fabricated 0 or stale success',async()=>{
 const req=new Request('https://daycoin.io99.xyz/api/dc2/stats');
 const response=await handleDc2Stats(req,{fetcher:async()=>new Response('fail',{status:503})});
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'statistics_unavailable');
 assert.equal((await handleDc2Stats(new Request(req.url,{method:'POST'}))).status,405);
});


test('public API retries using an independent Arbitrum RPC on primary outage',async()=>{
 const attempted=[];
 const fetcher=async(url,{body})=>{
  attempted.push(url);
  if(url==='https://arb1.arbitrum.io/rpc')return new Response('down',{status:503});
  assert.equal(url,'https://arbitrum-one.publicnode.com');
  const req=JSON.parse(body);
  if(req.method==='eth_getBlockByNumber')return Response.json({jsonrpc:'2.0',id:req.id,result:{number:'0x1f3fa000',timestamp:'0x15204'}});
  if(req.method==='eth_getLogs')return Response.json({jsonrpc:'2.0',id:req.id,result:[makeLog(1884104,100)]});
  if(req.method==='eth_call')return Response.json({jsonrpc:'2.0',id:req.id,result:word(RATE)});
  throw Error('unhandled method');
 };
 const response=await handleDc2Stats(new Request('https://daycoin.io99.xyz/api/dc2/stats'),{fetcher});
 assert.equal(response.status,200);assert.equal((await response.json()).registered,1);
 assert.ok(attempted.includes('https://arb1.arbitrum.io/rpc'));
 assert.ok(attempted.includes('https://arbitrum-one.publicnode.com'));
});
