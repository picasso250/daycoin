import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STEP, ONE, DAY, EPOCH_SECONDS, eligibleThrough, estimatedPending, positionState, truncateToken, depositWarning} from '../dist/model.mjs';
import {prepareTransaction} from '../dist/transaction.mjs';
test('unit: eligible second accrual and 18 decimal formatting',()=>{
  const g=1000000n;
  assert.equal(eligibleThrough(STEP,g,g+DAY/2n),g+DAY/2n);
  assert.equal(eligibleThrough(STEP,g,g+EPOCH_SECONDS+20n),g+EPOCH_SECONDS);
  assert.equal(estimatedPending({principal:STEP,cursor:g},g,g+DAY/2n),ONE/2n);
  assert.equal(truncateToken(ONE/2n), '0.5');
  assert.equal(truncateToken(1n,18), '0.000000000000000001');
});
test('unit: past reward claimable even when now underfunded',()=>{
  const pos={principal:STEP,cursor:1234n},genesis=1234n;
  const pending=estimatedPending(pos,genesis,genesis+EPOCH_SECONDS+DAY);
  assert.equal(pending,1000n*ONE);
  assert.deepEqual(positionState(pos,2n*STEP,pending), {
    active:true, qualified:false,gap:STEP,claimable:true,status:'underfunded'
  });
});
test('unit: any positive Deposit always requires loss acknowledgement',()=>{
  const msg=depositWarning(ONE/2n,STEP,1n);
  assert.equal(msg.forfeited,ONE/2n);
  assert.equal(msg.requiresAcknowledgement,true);
  assert.match(msg.detail,/永久放弃/);
  assert.throws(()=>depositWarning(0n,0n,0n));
});
test('unit: gas simulation fails closed for insufficient balance',async()=>{
  const rpc={getBalance:async()=>5n,estimateGas:async()=>21000n,getFeeData:async()=>({maxFeePerGas:100n})};
  await assert.rejects(prepareTransaction(rpc,{from:'x',value:10n}),/余额不足/);
  await assert.rejects(prepareTransaction(rpc,{from:'x',value:0n}),/余额不足/);
  const good={...rpc,getBalance:async()=>10000000n};
  assert.equal((await prepareTransaction(good,{from:'x',value:0n})).gasLimit,26250n);
});
