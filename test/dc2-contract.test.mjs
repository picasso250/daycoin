import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider, ContractFactory, Wallet, parseEther, keccak256, toUtf8Bytes } from 'ethers';
import { compile } from '../scripts/compile.mjs';
import { readFileSync } from 'node:fs';

process.env.UWS_USE_FALLBACK = 'true';
const { default: ganache } = await import('ganache');
const source = readFileSync('contracts/DayCoinV2.sol', 'utf8');
const compiled = compile({ 'contracts/DayCoinV2.sol': { content: source } });
const artifact = compiled['contracts/DayCoinV2.sol'].DayCoinV2;
const DAY = 86400;
const ONE = parseEther('1');

async function fixture(t) {
  const rpc = ganache.provider({ logging: {quiet:true}, miner: { timestampIncrement: 0 },
    chain: { hardfork: 'shanghai', time: new Date('2026-01-01T00:00:00Z') },
    wallet: { totalAccounts: 3 } });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout:-1 });
  provider.pollingInterval=10;
  const alice=await provider.getSigner(0), bob=await provider.getSigner(1);
  const issuer=Wallet.createRandom();
  const token=await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,alice).deploy(issuer.address);
  await token.waitForDeployment();
  const chainId=(await provider.getNetwork()).chainId;
  const domain={ name:'DayCoin V2',version:'1',chainId,verifyingContract:await token.getAddress() };
  const types={ Enroll:[{name:'identity',type:'bytes32'},{name:'recipient',type:'address'},{name:'deadline',type:'uint256'}] };
  const id=name=>keccak256(toUtf8Bytes(name));
  const approval=async (identity,recipient,deadline=2100000000, signer=issuer, domainOverride=domain) =>
    signer.signTypedData(domainOverride,types,{identity,recipient,deadline});
  const send=async tx=>(await tx).wait();
  const advance=async seconds=>{
    await rpc.request({method:'evm_increaseTime',params:[seconds]});
    await rpc.request({method:'evm_mine',params:[]});
  };
  t.after(async()=>{provider.destroy();await rpc.disconnect();});
  return {alice,bob,issuer,token,id,approval,send,advance,domain};
}

test('valid signed identity enrolls once and starts 1 DC2/day only afterward',async t=>{
  const {alice,token,id,approval,send,advance}=await fixture(t);
  const identity=id('identity-one');
  await advance(DAY*10);
  assert.equal(await token.pending(alice.address),0n);
  await send(token.register(identity,2100000000,await approval(identity,alice.address)));
  assert.equal(await token.pending(alice.address),0n);
  await advance(DAY);
  assert.equal(await token.pending(alice.address),ONE);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address),ONE);
  assert.equal(await token.totalSupply(),ONE);
  assert.equal(await token.pending(alice.address),0n);
  await send(token.claim());
  assert.equal(await token.totalSupply(),ONE);
});

test('identity and wallet cannot register twice, even with another signed voucher',async t=>{
  const {alice,bob,token,id,approval,send}=await fixture(t);
  const identity=id('single-identity'), other=id('other');
  await send(token.register(identity,2100000000,await approval(identity,alice.address)));
  await assert.rejects(token.connect(bob).register(identity,2100000000,await approval(identity,bob.address)));
  await assert.rejects(token.register(other,2100000000,await approval(other,alice.address)));
});

test('fake, redirected, expired, wrong-contract and wrong-chain signatures fail',async t=>{
  const {alice,bob,token,id,approval,domain}=await fixture(t);
  const identity=id('identity-2');
  await assert.rejects(token.connect(bob).register(identity,2100000000,await approval(identity,alice.address)));
  await assert.rejects(token.register(identity,2100000000,await approval(identity,alice.address,2100000000,Wallet.createRandom())));
  await assert.rejects(token.register(identity,1,await approval(identity,alice.address,1)));
  await assert.rejects(token.register(identity,2100000000,await approval(identity,alice.address,2100000000,undefined,{...domain,chainId:domain.chainId+1n})));
  await assert.rejects(token.register(identity,2100000000,await approval(identity,alice.address,2100000000,undefined,{...domain,verifyingContract:bob.address})));
  assert.equal(await token.totalSupply(),0n);
});

test('fractional issuance, repeated claims and transfer preserve total entitlement',async t=>{
  const {alice,bob,token,id,approval,send,advance}=await fixture(t);
  const identity=id('partial');
  await send(token.register(identity,2100000000,await approval(identity,alice.address)));
  await advance(DAY/2);
  assert.equal(await token.pending(alice.address),ONE/2n);
  await send(token.claim());
  await send(token.transfer(bob.address,ONE/2n));
  assert.equal(await token.balanceOf(bob.address),ONE/2n);
  await advance(DAY/2);
  await send(token.claim());
  assert.equal(await token.totalSupply(),ONE);
  assert.equal(await token.balanceOf(alice.address),ONE/2n);
  await assert.rejects(token.connect(bob).claim());
});

test('contract exposes no owner, arbitrary mint, revoke or change-issuer operations',async t=>{
  const {token}=await fixture(t);
  for(const name of ['owner','mint','revoke','setIssuer','pause','upgradeTo','transferPosition']) {
    assert.equal(token.interface.getFunction(name),null);
  }
});
