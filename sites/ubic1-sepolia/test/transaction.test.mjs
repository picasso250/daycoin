import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTransaction, rpcErrorDetail, isInsufficientFunds } from '../dist/transaction.mjs';

test('insufficient principal is caught before simulation or signing', async () => {
 let estimated=false;
 const rpc={getBalance:async()=>26n,estimateGas:async()=>{estimated=true;}};
 await assert.rejects(prepareTransaction(rpc,{from:'alice',value:100n}),{code:'INSUFFICIENT_FUNDS'});
 assert.equal(estimated,false);
});

test('simulates the exact transaction and returns a rounded gas margin', async () => {
 const tx={from:'alice',to:'ubic',data:'0xd0e30db0',value:100n};
 const rpc={getBalance:async(a,tag)=>{assert.equal(a,'alice');assert.equal(tag,'pending');return 10000n;},estimateGas:async(t)=>{assert.deepEqual(t,tx);return 101n;},getFeeData:async()=>({maxFeePerGas:2n})};
 assert.deepEqual(await prepareTransaction(rpc,tx),{gasLimit:122n});
});

test('balance must cover gas as well as principal', async () => {
 const rpc={getBalance:async()=>101n,estimateGas:async()=>100n,getFeeData:async()=>({maxFeePerGas:2n})};
 await assert.rejects(prepareTransaction(rpc,{from:'alice',value:100n}),{code:'INSUFFICIENT_FUNDS'});
});

test('contract revert is preserved and never bypassed', async () => {
 const revert=Object.assign(new Error('execution reverted'),{code:'CALL_EXCEPTION',data:'0x12345678'});
 const rpc={getBalance:async()=>10000n,estimateGas:async()=>{throw revert;}};
 await assert.rejects(prepareTransaction(rpc,{from:'alice',value:100n}),e=>e===revert);
});

test('nested wallet RPC funding errors remain actionable', () => {
 const e={code:'CALL_EXCEPTION',shortMessage:'missing revert data',info:{error:{message:'insufficient funds for gas * price + value'}}};
 assert.equal(isInsufficientFunds(e),true);
 assert.match(rpcErrorDetail(e),/insufficient funds/);
 assert.equal(isInsufficientFunds({code:'CALL_EXCEPTION',reason:'execution reverted'}),false);
});
