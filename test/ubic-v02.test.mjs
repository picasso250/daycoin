import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BrowserProvider, ContractFactory, parseEther } from 'ethers';
import { compile } from '../scripts/compile.mjs';

process.env.UWS_USE_FALLBACK = 'true';
const { default: ganache } = await import('ganache');

const helper = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {UBIC1V02} from "contracts/UBIC1V02.sol";
contract V02Receiver {
    UBIC1V02 public token;
    bool public reject;
    uint256 public received;
    uint256 public reentryBlocked;
    constructor(UBIC1V02 t) { token = t; }
    function depositForward() external payable { token.deposit{value: msg.value}(); }
    function claimForward() external { token.claim(); }
    function withdrawForward() external { token.withdraw(); }
    function setReject(bool v) external { reject = v; }
    receive() external payable {
        if (reject) revert("ETH_REJECTED");
        received += msg.value;
        try token.withdraw() {} catch { ++reentryBlocked; }
        try token.deposit{value: 1}() {} catch { ++reentryBlocked; }
    }
}`;
const compiled = compile({
  'contracts/UBIC1V02.sol': { content: fs.readFileSync('contracts/UBIC1V02.sol', 'utf8') },
  'test/V02Receiver.sol': { content: helper }
});
const artifact = compiled['contracts/UBIC1V02.sol'].UBIC1V02;
const receiverArtifact = compiled['test/V02Receiver.sol'].V02Receiver;
const UNIT = parseEther('0.1');
const ONE = parseEther('1');
const DAY = 86400;
const EPOCH = 1000 * DAY;
const reward = seconds => BigInt(seconds) * ONE / BigInt(DAY);

async function fixture(t) {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: 'shanghai', time: new Date('2026-01-01T00:00:00Z') },
    miner: { timestampIncrement: 0 },
    wallet: { totalAccounts: 4 }
  });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const alice = await provider.getSigner(0);
  const bob = await provider.getSigner(1);
  const carol = await provider.getSigner(2);
  const token = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, alice).deploy();
  await token.waitForDeployment();
  t.after(async () => { provider.destroy(); await rpc.disconnect(); });
  const send = async tx => (await tx).wait();
  const advance = async seconds => {
    await rpc.request({ method: 'evm_increaseTime', params: [seconds] });
    await rpc.request({ method: 'evm_mine', params: [] });
  };
  const balance = async () => provider.getBalance(await token.getAddress());
  return { rpc, provider, alice, bob, carol, token, send, advance, balance };
}

test('v0.2 has 18 decimals and only the three intended principal/reward operations', async t => {
  const { token, alice } = await fixture(t);
  assert.equal(await token.name(), 'UBIC1');
  assert.equal(await token.symbol(), 'UBIC1');
  assert.equal(await token.decimals(), 18n);
  assert.equal(await token.totalSupply(), 0n);
  assert.equal(await token.requiredDeposit(), UNIT);
  assert.equal(token.interface.getFunction('topUp'), null);
  assert.equal(token.interface.getFunction('deposit'), token.interface.getFunction('deposit()'));
  assert.equal(await token.pending(alice.address), 0n);
  await assert.rejects(token.claim.staticCall());
  await assert.rejects(token.withdraw.staticCall());
});

test('one wei deposit and withdrawal refunds the exact principal, no rewards minted', async t => {
  const { token, alice, provider, send, advance, balance } = await fixture(t);
  await assert.rejects(token.deposit.staticCall({ value: 0n }));
  await send(token.deposit({ value: 1n }));
  assert.equal((await token.positions(alice.address)).principal, 1n);
  await advance(3 * DAY);
  assert.equal(await token.pending(alice.address), 0n);
  const before = await provider.getBalance(alice.address);
  const receipt = await send(token.withdraw());
  assert.equal(await provider.getBalance(alice.address) - before + receipt.fee, 1n);
  assert.equal(await balance(), 0n);
  assert.equal(await token.totalSupply(), 0n);
  assert.deepEqual((await token.positions(alice.address)).toArray(), [0n, 0n]);
  await assert.rejects(token.withdraw.staticCall());
});

test('subminimum ETH earns zero, and reaching threshold starts time at that deposit', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT - 1n }));
  await advance(365 * DAY);
  assert.equal(await token.pending(alice.address), 0n);
  await send(token.deposit({ value: 1n }));
  assert.equal((await token.positions(alice.address)).principal, UNIT);
  assert.equal(await token.pending(alice.address), 0n);
  await advance(DAY);
  assert.equal(await token.pending(alice.address), ONE);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), ONE);
});

test('fractional issuance: half day = 0.5 UBIC; any single eligible second earns tokens', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY / 2);
  assert.equal(await token.pending(alice.address), ONE / 2n);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), ONE / 2n);
  await advance(1);
  assert.equal(await token.pending(alice.address), reward(1));
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), ONE / 2n + reward(1));
  await advance(DAY / 2 - 1);
  await send(token.claim());
  // Claim rounding is per call, never more than the theoretical daily amount.
  assert.ok(await token.balanceOf(alice.address) <= ONE);
  assert.ok(ONE - await token.balanceOf(alice.address) <= 2n);
});

test('repeated claims without elapsed time mint nothing and do not change principal', async t => {
  const { token, alice, send, advance, balance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(1);
  await send(token.claim());
  const minted = await token.balanceOf(alice.address);
  await send(token.claim());
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), minted);
  assert.equal(await token.pending(alice.address), 0n);
  assert.equal(await balance(), UNIT);
});

test('deposit always resets clock, burning matured unclaimed time and fractional progress', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(3 * DAY + DAY / 2);
  assert.equal(await token.pending(alice.address), ONE * 7n / 2n);
  await send(token.deposit({ value: 1n }));
  assert.equal(await token.pending(alice.address), 0n);
  assert.equal(await token.balanceOf(alice.address), 0n);
  await advance(DAY / 2);
  assert.equal(await token.pending(alice.address), ONE / 2n);
  assert.equal((await token.positions(alice.address)).principal, UNIT + 1n);
});

test('claim before deposit preserves minted tokens; deposit discards only the leftover time', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(3 * DAY + DAY / 2);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), ONE * 7n / 2n);
  await send(token.deposit({ value: 1n }));
  assert.equal(await token.pending(alice.address), 0n);
  await advance(DAY);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), ONE * 9n / 2n);
});

test('epoch at 1000 days stops 0.1 ETH rewards at exact boundary; old rewards still claimable', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(EPOCH - 1);
  assert.equal(await token.pending(alice.address), reward(EPOCH - 1));
  assert.equal(await token.requiredDeposit(), UNIT);
  await advance(2);
  assert.equal(await token.requiredDeposit(), 2n * UNIT);
  assert.equal(await token.pending(alice.address), 1000n * ONE);
  await advance(200 * DAY);
  assert.equal(await token.pending(alice.address), 1000n * ONE);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), 1000n * ONE);
  assert.equal(await token.pending(alice.address), 0n);
  await advance(5 * DAY);
  assert.equal(await token.pending(alice.address), 0n);
});

test('claim old reward before topup; resumed time starts now, not at expiration', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(EPOCH + 200 * DAY);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), 1000n * ONE);
  await send(token.deposit({ value: UNIT }));
  assert.equal((await token.positions(alice.address)).principal, 2n * UNIT);
  await advance(DAY / 2);
  assert.equal(await token.pending(alice.address), ONE / 2n);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), 1000n * ONE + ONE / 2n);
});

test('topup after expiration WITHOUT claim voluntarily forfeits previously earned reward', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(EPOCH + 200 * DAY);
  assert.equal(await token.pending(alice.address), 1000n * ONE);
  await send(token.deposit({ value: UNIT }));
  assert.equal(await token.pending(alice.address), 0n);
  await advance(DAY);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), ONE);
});

test('underfunded at a later epoch, tiny deposit cannot retroactively unlock 200 lost days', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(EPOCH + 200 * DAY);
  await send(token.deposit({ value: 1n }));
  assert.equal(await token.pending(alice.address), 0n);
  await advance(2 * DAY);
  assert.equal(await token.pending(alice.address), 0n);
  await send(token.deposit({ value: UNIT - 1n }));
  assert.equal((await token.positions(alice.address)).principal, 2n * UNIT);
  await advance(DAY);
  assert.equal(await token.pending(alice.address), ONE);
});

test('future pre-funding covers multiple consecutive epochs and expires at appropriate boundary', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: 3n * UNIT }));
  await advance(2010 * DAY);
  assert.equal(await token.requiredDeposit(), 3n * UNIT);
  assert.equal(await token.pending(alice.address), 2010n * ONE);
  await advance(1000 * DAY);
  assert.equal(await token.requiredDeposit(), 4n * UNIT);
  assert.equal(await token.pending(alice.address), 3000n * ONE);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), 3000n * ONE);
});

test('any account can withdraw full principal even after epoch expiration without claiming', async t => {
  const { token, alice, bob, provider, send, advance, balance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await send(token.connect(bob).deposit({ value: 1n }));
  await advance(EPOCH + DAY);
  const before = await provider.getBalance(alice.address);
  const receipt = await send(token.withdraw());
  assert.equal(await provider.getBalance(alice.address) - before + receipt.fee, UNIT);
  assert.equal(await token.balanceOf(alice.address), 0n);
  assert.equal(await balance(), 1n);
  const beforeBob = await provider.getBalance(bob.address);
  const receiptBob = await send(token.connect(bob).withdraw());
  assert.equal(await provider.getBalance(bob.address) - beforeBob + receiptBob.fee, 1n);
  assert.equal(await balance(), 0n);
});

test('accounts cannot claim or withdraw another account position; ERC20 transfers do not affect principal', async t => {
  const { token, alice, bob, send, advance, balance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await assert.rejects(token.connect(bob).withdraw.staticCall());
  await assert.rejects(token.connect(bob).claim.staticCall());
  await advance(DAY);
  await send(token.claim());
  await send(token.transfer(bob.address, ONE / 2n));
  assert.equal(await token.balanceOf(bob.address), ONE / 2n);
  assert.equal(await balance(), UNIT);
  assert.equal((await token.positions(alice.address)).principal, UNIT);
});

test('receiving contract rejection reverts atomically and leaves principal & reward untouched', async t => {
  const { token, alice, send, advance } = await fixture(t);
  const receiver = await new ContractFactory(receiverArtifact.abi, receiverArtifact.evm.bytecode.object, alice).deploy(await token.getAddress());
  await receiver.waitForDeployment();
  await send(receiver.depositForward({ value: UNIT }));
  await advance(DAY);
  await send(receiver.setReject(true));
  const original = (await token.positions(await receiver.getAddress())).toArray();
  const pending = await token.pending(await receiver.getAddress());
  await assert.rejects(send(receiver.withdrawForward({ gasLimit: 300000 })));
  assert.deepEqual((await token.positions(await receiver.getAddress())).toArray(), original);
  assert.equal(await token.pending(await receiver.getAddress()), pending);
  await send(receiver.setReject(false));
  await send(receiver.withdrawForward({ gasLimit: 300000 }));
  assert.equal(await receiver.received(), UNIT);
  assert.equal(await receiver.reentryBlocked(), 2n);
});

test('many account operations preserve B >= Σ principals and precomputed time rewards', async t => {
  const { token, alice, bob, carol, send, advance, balance } = await fixture(t);
  const actors = [alice, bob, carol];
  const principles = new Map(actors.map(a=>[a.address, 0n]));
  let seed = 0x12345678;
  const rand = () => {seed = (Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for (let i=0;i<70;i++) {
    const actor = actors[rand()%actors.length];
    const choice = rand()%5;
    if(choice<=1){
      const value=[1n,UNIT/2n,UNIT,3n*UNIT][rand()%4];
      await send(token.connect(actor).deposit({value}));
      principles.set(actor.address,principles.get(actor.address)+value);
    } else if(choice===2) {
      await advance(rand()%(3*DAY));
      if (principles.get(actor.address)>0n) await send(token.connect(actor).claim());
    } else if(choice===3) {
      await advance(rand()%(3*DAY));
    } else if(principles.get(actor.address)>0n) {
      await send(token.connect(actor).withdraw());
      principles.set(actor.address,0n);
    }
    let sum=0n;
    for(const a of actors) {
      const p=(await token.positions(a.address)).principal;
      assert.equal(p,principles.get(a.address));
      sum+=p;
    }
    assert.equal(await balance(),sum);
  }
});
