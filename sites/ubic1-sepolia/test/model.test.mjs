import {test} from 'node:test';
import assert from 'node:assert/strict';
import {positionState,countdown,emptyIndex,applyEvent,withdrawGuidance,withdrawalNeedsNewConsent} from '../dist/model.mjs';
const UNIT=10n**17n;
test('pending entitlement alone does not make underfunded position claimable',()=>{
 const s=positionState({depositedAt:100n,claimedPeriods:0n,principal:UNIT},2n*UNIT,12000000n);
 assert.equal(s.gap,UNIT);assert.equal(s.claimable,false);assert.equal(s.active,true);assert.equal(s.status,'underfunded');
});
test('fully funded pending and accruing positions are distinct',()=>{
 const p={depositedAt:100n,claimedPeriods:1n,principal:UNIT};
 assert.equal(positionState(p,UNIT,10000n).claimable,true);
 assert.equal(positionState(p,UNIT,0n).status,'accruing');
 assert.equal(positionState(p,UNIT,0n).nextAt,172900n);
 assert.equal(positionState(null,UNIT,0n).status,'empty');
});
test('events account for variable principal, closures and reopenings; claims survive exit',()=>{
 const i=emptyIndex();applyEvent(i,'Deposited','0xABC',UNIT);applyEvent(i,'ToppedUp','0xABC',UNIT);
 applyEvent(i,'Claimed','0xABC',12000000n);applyEvent(i,'Deposited','0xDEF',UNIT);
 applyEvent(i,'Withdrawn','0xABC',2n*UNIT);assert.equal(i.principal,UNIT);assert.equal(i.active.size,1);
 applyEvent(i,'Deposited','0xABC',3n*UNIT);assert.equal(i.principal,4n*UNIT);assert.equal(i.active.size,2);
 assert.equal(i.claimed.get('0xabc'),12000000n);
});
test('incomplete event stream fails rather than presenting misleading stats',()=>{
 assert.throws(()=>applyEvent(emptyIndex(),'Withdrawn','a',UNIT));
 assert.throws(()=>applyEvent(emptyIndex(),'ToppedUp','a',UNIT));
});
test('withdraw prompts Claim first only with eligible, unclaimed mature rewards',()=>{
 const position={depositedAt:100n,claimedPeriods:0n,principal:100000000000000000n};
 const required=100000000000000000n, pending=30000n;
 const eligible=withdrawGuidance(position,required,pending);
 assert.deepEqual(eligible,{recommendClaim:true,forfeitsMature:true,gap:0n});
 const underfunded=withdrawGuidance(position,2n*required,pending);
 assert.deepEqual(underfunded,{recommendClaim:false,forfeitsMature:true,gap:required});
 const noPending=withdrawGuidance(position,required,0n);
 assert.deepEqual(noPending,{recommendClaim:false,forfeitsMature:false,gap:0n});
 // The already minted wallet balance is deliberately not an input to this decision.
});
test('material changes in rewards, eligibility or principal require renewed withdrawal consent',()=>{
 const original={pending:0n,principal:100n,claimable:false};
 assert.equal(withdrawalNeedsNewConsent(original,{...original}),false);
 assert.equal(withdrawalNeedsNewConsent(original,{...original,pending:10000n}),true);
 assert.equal(withdrawalNeedsNewConsent(original,{...original,claimable:true}),true);
 assert.equal(withdrawalNeedsNewConsent(original,{...original,principal:200n}),true);
});
test('countdown is bounded at zero and supports epochs',()=>{
 assert.equal(countdown(-1),'00:00:00');assert.equal(countdown(86401),'1d 00:00:01');
 assert.equal(countdown(1000*86400),'1000d 00:00:00');
});
