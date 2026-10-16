import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger,applyLedgerEvent,requiredStakeAt,monetarySnapshot,makeSamples,formatAnnualBps,DAY_SECONDS,DEPOSIT_STEP_WEI} from '../dist/stats-model.mjs';

const stake = DEPOSIT_STEP_WEI;
test('qualified positions differ from active positions at epoch changes', () => {
  const s=createLedger();
  applyLedgerEvent(s,{name:'Deposited',account:'0xAa',amount:stake});
  applyLedgerEvent(s,{name:'Deposited',account:'0xBb',amount:2n*stake});
  assert.equal(monetarySnapshot(s,DAY_SECONDS,0n).eligible,2);
  assert.equal(monetarySnapshot(s,1000n*DAY_SECONDS,0n).eligible,1);
  assert.equal(requiredStakeAt(2000n*DAY_SECONDS,0n),3n*stake);
  applyLedgerEvent(s,{name:'ToppedUp',account:'0xAa',amount:stake});
  assert.equal(monetarySnapshot(s,1000n*DAY_SECONDS,0n).eligible,2);
});
test('mint, burn and withdrawal reconcile and do not include unclaimed rewards', () => {
  const s=createLedger();
  applyLedgerEvent(s,{name:'Deposited',account:'0xAa',amount:stake});
  assert.equal(s.supply,0n);
  applyLedgerEvent(s,{name:'Claimed',account:'0xAa',amount:10000n});
  applyLedgerEvent(s,{name:'Burned',account:'0xAa',amount:1n});
  assert.equal(s.supply,9999n);
  assert.equal(s.minted,10000n);
  assert.equal(s.burned,1n);
  assert.equal(formatAnnualBps(monetarySnapshot(s,DAY_SECONDS,0n).annualBps),'36,503.65%');
  applyLedgerEvent(s,{name:'Withdrawn',account:'0xAa',amount:stake});
  assert.equal(s.positions.size,0);
  assert.equal(s.principal,0n);
  assert.equal(s.supply,9999n);
  assert.throws(()=>applyLedgerEvent(s,{name:'Withdrawn',account:'0xAa',amount:stake}));
});
test('zero supply is undefined, not zero-percent inflation', () => {
  const s=createLedger();
  assert.equal(monetarySnapshot(s,0n,0n).annualBps,null);
  assert.equal(formatAnnualBps(null),'—');
});
test('daily samples correctly replay historical eligibility and minting', () => {
  const events=[
    {name:'Deposited',account:'0xA',amount:stake,timestamp:10n},
    {name:'Claimed',account:'0xA',amount:10000n,timestamp:DAY_SECONDS+10n},
    {name:'Burned',account:'0xA',amount:1000n,timestamp:2n*DAY_SECONDS+10n}
  ];
  const rows=makeSamples(events,0n,2n*DAY_SECONDS+100n,DAY_SECONDS);
  assert.equal(rows.length,3);
  assert.equal(rows[0].supply,0n);
  assert.equal(rows[1].supply,10000n);
  assert.equal(rows[2].supply,9000n);
  assert.equal(rows[2].eligible,1);
});
test('incomplete event stream causes hard failure',()=>{
  assert.throws(()=>applyLedgerEvent(createLedger(),{name:'Burned',account:'a',amount:1n}));
  assert.throws(()=>applyLedgerEvent(createLedger(),{name:'ToppedUp',account:'a',amount:1n}));
});
