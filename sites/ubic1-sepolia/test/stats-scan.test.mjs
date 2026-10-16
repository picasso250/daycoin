import test from 'node:test';
import assert from 'node:assert/strict';
import {scanLogs} from '../dist/stats-scan.mjs';

test('successful chunks consume the total request budget',async()=>{
 let calls=0;
 const rpc={getLogs:async()=>{calls++;return [];}};
 await assert.rejects(scanLogs(rpc,{},0,6000,null,2),/上限/);
 assert.equal(calls,2);
});
test('range reduction retries count and do not skip or duplicate blocks',async()=>{
 const ranges=[];let calls=0;
 const rpc={getLogs:async({fromBlock,toBlock})=>{
  calls++;
  if(toBlock-fromBlock+1>400)throw Error('range limit');
  ranges.push([fromBlock,toBlock]);return [{blockNumber:fromBlock}];
 }};
 const logs=await scanLogs(rpc,{},100,999,null,4);
 assert.equal(calls,4);
 assert.deepEqual(ranges,[[100,499],[500,899],[900,999]]);
 assert.equal(logs.length,3);
});
test('failed scans never return partial results',async()=>{
 let calls=0;
 const rpc={getLogs:async()=>{if(calls++===0)return [{blockNumber:0}];throw Error('offline');}};
 await assert.rejects(scanLogs(rpc,{},0,5000,null,10),/offline/);
});
