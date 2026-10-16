import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFreshBlock,normalizeChainId,pendingKey,readUnresolved,writeUnresolved,clearUnresolved,isRejected,isIdenticalTransaction} from '../dist/security.mjs';

test('security guard: stale/future/rollback RPC blocks are rejected',()=>{
  const current=Math.floor(Date.now()/1000);
  const fresh={number:100,hash:'0xaaa',timestamp:current-12};
  assert.doesNotThrow(()=>assertFreshBlock(fresh,current,null));
  assert.throws(()=>assertFreshBlock({...fresh,timestamp:current-601},current,null),/过期区块/);
  assert.throws(()=>assertFreshBlock({...fresh,timestamp:current+121},current,null),/超过本地时钟/);
  assert.throws(()=>assertFreshBlock({...fresh,number:99},current,fresh),/回退/);
  assert.throws(()=>assertFreshBlock({...fresh,hash:'0xbbb'},current,fresh),/回退/);
});

test('security guard: chain IDs and pending keys are fixed to account and contract',()=>{
  assert.equal(normalizeChainId(31337n),'0x7a69');
  assert.notEqual(pendingKey(31337,'0xABC','0x123'),pendingKey(31338,'0xABC','0x123'));
  assert.notEqual(pendingKey(31337,'0xABC','0x123'),pendingKey(31337,'0xDEF','0x123'));
});

test('security guard: unknown broadcast is recoverable after reload, not silently discarded',()=>{
  const data=new Map();
  const storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)??null,removeItem:k=>data.delete(k)};
  const key=pendingKey(31337,'0x123','0xabc');
  const record={action:'deposit',from:'0xabc',to:'0x123',value:'100',nonce:4,hash:null,chainId:'31337'};
  writeUnresolved(storage,key,record);
  assert.deepEqual(readUnresolved(storage,key),record);
  clearUnresolved(storage,key);
  assert.equal(readUnresolved(storage,key),null);
  assert.equal(isRejected({code:4001}),true);
  assert.equal(isRejected({code:-32000}),false);
});

test('security guard: receipt transaction must match chain/from/to/data/value/nonce',()=>{
  const tx={chainId:31337n,from:'0xABC',to:'0xDEF',data:'0xabc',value:100n,nonce:4};
  const expected={chainId:'31337',from:'0xabc',to:'0xdef',data:'0xABC',value:'100',nonce:4};
  assert.equal(isIdenticalTransaction(tx,expected),true);
  assert.equal(isIdenticalTransaction({...tx,chainId:31338n},expected),false);
  assert.equal(isIdenticalTransaction({...tx,value:200n},expected),false);
  assert.equal(isIdenticalTransaction({...tx,nonce:5},expected),false);
});
