import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider, ContractFactory, parseEther } from 'ethers';
import { compile } from '../scripts/compile.mjs';
process.env.UWS_USE_FALLBACK = 'true';
const { default: ganache } = await import('ganache');

const helper = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {UBIC} from "contracts/UBIC.sol";
contract Receiver {
    UBIC public token;
    uint256 public blocked;
    uint256 public received;
    bool public reject;
    constructor(UBIC t) { token = t; }
    function deposit() external payable { token.deposit{value: msg.value}(); }
    function claim(uint256 id) external { token.claim(id); }
    function setReject(bool value) external { reject = value; }
    receive() external payable {
        if (reject) revert();
        received += msg.value;
        try token.claim(0) {} catch { blocked++; }
        try token.claim(1) {} catch { blocked++; }
        try token.deposit{value: 0.1 ether}() {} catch { blocked++; }
    }
}
`;
const compiled = compile({ 'test/Receiver.sol': { content: helper } });
const artifact = compiled['contracts/UBIC.sol'].UBIC;
const UNIT = parseEther('0.1');
const TOKEN = 10_000n;
const DAY = 86400;

async function fixture(t) {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: 'shanghai', time: new Date('2026-01-01T00:00:00Z') },
    miner: { timestampIncrement: 0 }, wallet: { totalAccounts: 3 }
  });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const alice = await provider.getSigner(0);
  const bob = await provider.getSigner(1);
  const token = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, alice).deploy();
  await token.waitForDeployment();
  t.after(async () => { provider.destroy(); await rpc.disconnect(); });
  const send = async promise => (await promise).wait();
  const advance = async seconds => {
    await rpc.request({ method: 'evm_increaseTime', params: [seconds] });
    await rpc.request({ method: 'evm_mine', params: [] });
  };
  return { rpc, provider, alice, bob, token, send, advance };
}

test('exact deposit amount, no plain transfers or old batch ABI', async t => {
  const { token, alice, send } = await fixture(t);
  for (const value of [0n, UNIT - 1n, UNIT + 1n, 2n * UNIT]) {
    await assert.rejects(token.deposit.staticCall({ value }));
  }
  await send(token.deposit({ value: UNIT }));
  assert.equal(await token.totalPrincipal(), UNIT);
  assert.equal(await token.nextPositionId(alice.address), 1n);
  await assert.rejects(alice.sendTransaction({ to: await token.getAddress(), value: UNIT }));
  assert.equal(token.interface.getFunction('claim(uint256[])'), null);
  assert.equal(token.interface.getFunction('withdraw'), null);
});

test('early claim returns principal minus gas, closes position and mints nothing', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY - 1);
  const before = await provider.getBalance(alice.address);
  const receipt = await send(token.claim(0));
  assert.equal(await provider.getBalance(alice.address) - before + receipt.fee, UNIT);
  assert.equal(await token.balanceOf(alice.address), 0n);
  assert.equal(await token.totalPrincipal(), 0n);
  assert.equal((await token.positions(alice.address, 0)).active, false);
  await assert.rejects(token.claim.staticCall(0));
});

test('exactly 24h earns 10,000 xiao and returns principal', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY - 1);
  assert.equal(await token.pending(alice.address, 0), 0n);
  await advance(1);
  assert.equal(await token.pending(alice.address, 0), TOKEN);
  const before = await provider.getBalance(alice.address);
  const receipt = await send(token.claim(0));
  assert.equal(await provider.getBalance(alice.address) - before + receipt.fee, UNIT);
  assert.equal(await token.totalSupply(), TOKEN);
  assert.equal(await token.decimals(), 4n);
  assert.equal(await token.pending(alice.address, 0), 0n);
});

test('one independently timed position per claim; accounts are isolated', async t => {
  const { token, alice, bob, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY / 2);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY / 2);
  await assert.rejects(token.connect(bob).claim.staticCall(0));
  await assert.rejects(token.claim.staticCall(100));
  await send(token.claim(0));
  assert.equal(await token.balanceOf(alice.address), TOKEN);
  assert.equal(await token.totalPrincipal(), UNIT);
  assert.equal((await token.positions(alice.address, 1)).active, true);
  assert.equal(await token.pending(alice.address, 1), 0n);
  await advance(DAY / 2);
  await send(token.claim(1));
  assert.equal(await token.balanceOf(alice.address), 2n * TOKEN);
});

test('multiple days accrue; closing discards fractions and redeposit starts anew', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(3 * DAY + DAY / 2);
  await send(token.claim(0));
  assert.equal(await token.balanceOf(alice.address), 3n * TOKEN);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY / 2);
  await send(token.claim(1));
  assert.equal(await token.balanceOf(alice.address), 3n * TOKEN);
  assert.equal(await token.nextPositionId(alice.address), 2n);
});

test('reentry blocked; failed refund rolls back mint, balance and position deletion', async t => {
  const { token, alice, send, advance } = await fixture(t);
  const a = compiled['test/Receiver.sol'].Receiver;
  const receiver = await new ContractFactory(a.abi, a.evm.bytecode.object, alice).deploy(await token.getAddress());
  await receiver.waitForDeployment();
  const address = await receiver.getAddress();
  await send(receiver.deposit({ value: UNIT }));
  await send(receiver.deposit({ value: UNIT }));
  await advance(DAY);
  await send(receiver.setReject(true));
  await assert.rejects(send(receiver.claim(0, { gasLimit: 500000 })));
  assert.equal(await token.totalPrincipal(), 2n * UNIT);
  assert.equal(await token.totalSupply(), 0n);
  assert.equal(await token.balanceOf(address), 0n);
  assert.equal((await token.positions(address, 0)).active, true);
  await send(receiver.setReject(false));
  await send(receiver.claim(0, { gasLimit: 500000 }));
  assert.equal(await receiver.blocked(), 3n);
  assert.equal(await receiver.received(), UNIT);
  assert.equal(await token.totalPrincipal(), UNIT);
  assert.equal(await token.balanceOf(address), TOKEN);
  assert.equal((await token.positions(address, 1)).active, true);
});

test('one xiao transfers and allowances use four-decimal base units', async t => {
  const { token, alice, bob, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY);
  await send(token.claim(0));
  await send(token.transfer(bob.address, 1));
  await send(token.approve(bob.address, 2));
  await send(token.connect(bob).transferFrom(alice.address, bob.address, 2));
  assert.equal(await token.balanceOf(alice.address), TOKEN - 3n);
  assert.equal(await token.balanceOf(bob.address), 3n);
  assert.equal(await token.allowance(alice.address, bob.address), 0n);
  assert.equal(await token.totalSupply(), TOKEN);
});

test('unaccounted ETH neither increases refund nor creates rewards', async t => {
  const { token, alice, rpc, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await rpc.request({ method: 'evm_setAccountBalance', params: [await token.getAddress(), '0x' + (5n * UNIT).toString(16)] });
  await advance(DAY);
  await send(token.claim(0));
  assert.equal(await token.totalSupply(), TOKEN);
  assert.equal(await token.totalPrincipal(), 0n);
  assert.equal(await provider.getBalance(await token.getAddress()), 4n * UNIT);
});
