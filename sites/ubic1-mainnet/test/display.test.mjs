import test from 'node:test';
import assert from 'node:assert/strict';
import { compactEth } from '../dist/model.mjs';
import { rpcErrorDetail } from '../dist/transaction.mjs';

test('balance formatting preserves precision without floating point or overstating funds', () => {
 assert.equal(compactEth(25770646933410449n), '0.02577');
 assert.equal(compactEth(125719156933410449n), '0.12571');
 assert.equal(compactEth(0n), '0');
 assert.equal(compactEth(1n), '<0.00001');
 assert.equal(compactEth(100000000000000000n), '0.1');
 assert.equal(compactEth(999999999999999999n), '0.99999');
});

test('ethers wrapper retains original signed transaction error and method', () => {
 const e={code:'UNKNOWN_ERROR',shortMessage:'could not coalesce error',message:'could not coalesce error',payload:{method:'eth_sendTransaction'},error:{code:-32602,message:'failed to decode signed transaction'}};
 assert.equal(rpcErrorDetail(e),'eth_sendTransaction: -32602: failed to decode signed transaction');
});

test('nested original errors and circular errors are safe', () => {
 const e={message:'Internal error',data:{originalError:{code:-32602,message:'failed to decode signed transaction'}}};
 e.cause=e;
 assert.match(rpcErrorDetail(e),/^-32602: failed to decode signed transaction$/);
});
