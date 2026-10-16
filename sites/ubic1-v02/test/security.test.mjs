import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFreshBlock,isRejected,isIdenticalTransaction} from '../dist/security.mjs';

test('security guard: stale/future/rollback RPC blocks are rejected',()=>{
  const current=Math.floor(Date.now()/1000);
  const fresh={number:100,hash:'0xaaa',timestamp:current-12};
  assert.doesNotThrow(()=>assertFreshBlock(fresh,current,null));
  assert.throws(()=>assertFreshBlock({...fresh,timestamp:current-601},current,null),/过期区块/);
  assert.throws(()=>assertFreshBlock({...fresh,timestamp:current+121},current,null),/超过本地时钟/);
  assert.throws(()=>assertFreshBlock({...fresh,number:99},current,fresh),/回退/);
  assert.throws(()=>assertFreshBlock({...fresh,hash:'0xbbb'},current,fresh),/回退/);
});

test('security guard: explicit wallet rejection differs from missing response',()=>{
  assert.equal(isRejected({code:4001}),true);
  assert.equal(isRejected({code:'ACTION_REJECTED'}),true);
  assert.equal(isRejected({code:-32000}),false);
});

test('security guard: confirmed receipt must match chain/from/to/data/value',()=>{
  const tx={chainId:31337n,from:'0xABC',to:'0xDEF',data:'0xabc',value:100n,nonce:4};
  const expected={chainId:'31337',from:'0xabc',to:'0xdef',data:'0xABC',value:'100'};
  assert.equal(isIdenticalTransaction(tx,expected),true);
  assert.equal(isIdenticalTransaction({...tx,chainId:31338n},expected),false);
  assert.equal(isIdenticalTransaction({...tx,value:200n},expected),false);
  assert.equal(isIdenticalTransaction({...tx,to:'0x123'},expected),false);
});
