import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider, ContractFactory, parseEther } from 'ethers';
import { compile } from '../scripts/compile.mjs';
process.env.UWS_USE_FALLBACK = 'true';
const { default: ganache } = await import('ganache');
const helper = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {UBIC1} from "contracts/UBIC1.sol";
contract Receiver {
    UBIC1 public token;
    uint256 public blocked;
    uint256 public received;
    bool public reject;
    constructor(UBIC1 t) { token = t; }
    function deposit() external payable { token.deposit{value: msg.value}(); }
    function claim() external { token.claim(); }
    function topUp() external payable { token.topUp{value: msg.value}(); }
    function withdraw() external { token.withdraw(); }
    function setReject(bool value) external { reject = value; }
    receive() external payable {
        if (reject) revert();
        received += msg.value;
        try token.claim() {} catch { blocked++; }
        try token.withdraw() {} catch { blocked++; }
        try token.deposit{value: 0.1 ether}() {} catch { blocked++; }
        try token.topUp{value: 1}() {} catch { blocked++; }
    }
}`;
const compiled = compile({ 'test/Receiver.sol': { content: helper } });
const artifact = compiled['contracts/UBIC1.sol'].UBIC1;
const UNIT = parseEther('0.1'), TOKEN = 10000n, DAY = 86400;

async function fixture(t) {
  const rpc = ganache.provider({ logging: { quiet: true },
    chain: { hardfork: 'shanghai', time: new Date('2026-01-01T00:00:00Z') },
    miner: { timestampIncrement: 0 }, wallet: { totalAccounts: 3 } });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const alice = await provider.getSigner(0), bob = await provider.getSigner(1);
  const token = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, alice).deploy();
  await token.waitForDeployment();
  t.after(async () => { provider.destroy(); await rpc.disconnect(); });
  const send = async p => (await p).wait();
  const advance = async seconds => {
    await rpc.request({ method: 'evm_increaseTime', params: [seconds] });
    await rpc.request({ method: 'evm_mine', params: [] });
  };
  return { rpc, provider, alice, bob, token, send, advance };
}

test('minimum deposit and one position per address; no obsolete ABI', async t => {
  const { token, alice, send } = await fixture(t);
  for (const value of [0n, UNIT - 1n])
    await assert.rejects(token.deposit.staticCall({ value }));
  await send(token.deposit({ value: UNIT }));
  const original = await token.positions(alice.address);
  await assert.rejects(send(token.deposit({ value: UNIT, gasLimit: 200000 })));
  assert.deepEqual((await token.positions(alice.address)).toArray(), original.toArray());
  await assert.rejects(alice.sendTransaction({ to: await token.getAddress(), value: UNIT }));
  for (const name of ['claim(uint256)', 'nextPositionId', 'hasActivePosition', 'totalPrincipal'])
    assert.equal(token.interface.getFunction(name), null);
});

test('early and repeated claims preserve principal and original timestamp', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  const original = await token.positions(alice.address);
  await advance(DAY - 1);
  await send(token.claim());
  await send(token.claim());
  assert.deepEqual((await token.positions(alice.address)).toArray(), original.toArray());
  assert.equal(await token.balanceOf(alice.address), 0n);
  assert.equal(await provider.getBalance(await token.getAddress()), UNIT);
  await advance(1);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), TOKEN);
  assert.equal((await token.positions(alice.address)).claimedPeriods, 1n);
  await send(token.claim());
  assert.equal(await token.totalSupply(), TOKEN);
});

test('36h claim keeps 12h remainder; claimed UBIC1 is spendable while earning continues', async t => {
  const { token, alice, bob, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  const started = (await token.positions(alice.address)).depositedAt;
  await advance(DAY * 1.5);
  await send(token.claim());
  await send(token.transfer(bob.address, TOKEN));
  await advance(DAY / 2);
  assert.equal(await token.pending(alice.address), TOKEN);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), TOKEN);
  assert.equal(await token.balanceOf(bob.address), TOKEN);
  assert.equal((await token.positions(alice.address)).depositedAt, started);
  assert.equal((await token.positions(alice.address)).claimedPeriods, 2n);
});

test('withdraw never mints, forfeits pending, refunds principal and permits a fresh deposit', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY);
  await send(token.claim());
  await advance(2 * DAY + DAY / 2);
  const before = await provider.getBalance(alice.address);
  const receipt = await send(token.withdraw());
  assert.equal(await provider.getBalance(alice.address) - before + receipt.fee, UNIT);
  assert.equal(await token.balanceOf(alice.address), TOKEN);
  assert.deepEqual(Array.from(await token.positions(alice.address)), [0n, 0n, 0n]);
  assert.equal(await token.pending(alice.address), 0n);
  await assert.rejects(token.claim.staticCall());
  await assert.rejects(token.withdraw.staticCall());
  await send(token.deposit({ value: UNIT }));
  await advance(DAY / 2);
  await send(token.withdraw());
  assert.equal(await token.balanceOf(alice.address), TOKEN);
});

test('mature direct withdrawal emits no Claim or mint Transfer even after 24h', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(3 * DAY);
  assert.equal(await token.pending(alice.address), 3n * TOKEN);
  const beforeSupply=await token.totalSupply();
  const before=await provider.getBalance(alice.address);
  const receipt=await send(token.withdraw());
  assert.equal(await provider.getBalance(alice.address)-before+receipt.fee, UNIT);
  assert.equal(await token.totalSupply(), beforeSupply);
  assert.equal(await token.balanceOf(alice.address), 0n);
  const events=receipt.logs.map(x=>{try{return token.interface.parseLog(x)?.name;}catch{return null;}}).filter(Boolean);
  assert.deepEqual(events, ['Withdrawn']);
  assert.equal(await token.pending(alice.address), 0n);
});

test('accounts are isolated; early withdrawal returns full principal with no rewards', async t => {
  const { token, alice, bob, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await assert.rejects(token.connect(bob).withdraw.staticCall());
  await assert.rejects(token.connect(bob).claim.staticCall());
  await advance(DAY / 2);
  await send(token.connect(bob).deposit({ value: UNIT }));
  await advance(DAY / 2);
  await send(token.claim());
  const before = await provider.getBalance(bob.address);
  const receipt = await send(token.connect(bob).withdraw());
  assert.equal(await provider.getBalance(bob.address) - before + receipt.fee, UNIT);
  assert.equal(await token.balanceOf(bob.address), 0n);
  assert.equal(await token.balanceOf(alice.address), TOKEN);
  assert.equal(await provider.getBalance(await token.getAddress()), UNIT);
});

test('rejecting ETH receiver can claim; failed withdrawal rolls back; reentry blocked', async t => {
  const { token, alice, send, advance } = await fixture(t);
  const a = compiled['test/Receiver.sol'].Receiver;
  const receiver = await new ContractFactory(a.abi, a.evm.bytecode.object, alice).deploy(await token.getAddress());
  await receiver.waitForDeployment();
  const address = await receiver.getAddress();
  await send(receiver.deposit({ value: UNIT }));
  await send(receiver.setReject(true));
  await advance(DAY);
  await send(receiver.claim());
  await advance(DAY);
  const original = await token.positions(address);
  await assert.rejects(send(receiver.withdraw({ gasLimit: 500000 })));
  assert.deepEqual((await token.positions(address)).toArray(), original.toArray());
  assert.equal(await token.balanceOf(address), TOKEN);
  assert.equal(await token.totalSupply(), TOKEN);
  assert.equal(await token.pending(address), TOKEN);
  await send(receiver.setReject(false));
  await send(receiver.withdraw({ gasLimit: 500000 }));
  assert.equal(await receiver.blocked(), 4n);
  assert.equal(await receiver.received(), UNIT);
  assert.equal(await token.balanceOf(address), TOKEN);
  assert.equal((await token.positions(address)).depositedAt, 0n);
});

test('one xiao transfers and allowances use four-decimal base units', async t => {
  const { token, alice, bob, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY);
  await send(token.claim());
  await send(token.transfer(bob.address, 1));
  await send(token.approve(bob.address, 2));
  await send(token.connect(bob).transferFrom(alice.address, bob.address, 2));
  assert.equal(await token.decimals(), 4n);
  assert.equal(await token.balanceOf(alice.address), TOKEN - 3n);
  assert.equal(await token.balanceOf(bob.address), 3n);
});

test('burning does not alter principal, time, or future earnings', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY);
  await send(token.claim());
  const original = await token.positions(alice.address);
  await send(token.burn(1));
  assert.equal(await token.totalSupply(), TOKEN - 1n);
  await assert.rejects(token.burn.staticCall(TOKEN));
  await send(token.burn(TOKEN - 1n));
  assert.equal(await token.totalSupply(), 0n);
  assert.deepEqual((await token.positions(alice.address)).toArray(), original.toArray());
  assert.equal(await provider.getBalance(await token.getAddress()), UNIT);
  await advance(DAY);
  await send(token.withdraw());
  assert.equal(await token.totalSupply(), TOKEN);
});

test('burnFrom requires and consumes allowance; failed burn rolls back allowance', async t => {
  const { token, alice, bob, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY);
  await send(token.claim());
  await assert.rejects(token.connect(bob).burnFrom.staticCall(alice.address, 1));
  await send(token.approve(bob.address, 3));
  await send(token.connect(bob).burnFrom(alice.address, 2));
  assert.equal(await token.allowance(alice.address, bob.address), 1n);
  assert.equal(await token.totalSupply(), TOKEN - 2n);
  await assert.rejects(token.connect(bob).burnFrom.staticCall(alice.address, 2));
  await send(token.approve(bob.address, TOKEN));
  await assert.rejects(send(token.connect(bob).burnFrom(alice.address, TOKEN, { gasLimit: 200000 })));
  assert.equal(await token.allowance(alice.address, bob.address), TOKEN);
});

test('extra ETH does not change rewards or refunds', async t => {
  const { token, rpc, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await rpc.request({ method: 'evm_setAccountBalance', params: [await token.getAddress(), '0x' + (5n * UNIT).toString(16)] });
  await advance(DAY);
  await send(token.withdraw());
  assert.equal(await token.totalSupply(), TOKEN);
  assert.equal(await provider.getBalance(await token.getAddress()), 4n * UNIT);
});

test('epoch uses deployment time and changes exactly at 1000-day boundaries', async t => {
  const { token, advance } = await fixture(t);
  const genesis = await token.genesisTime();
  assert.equal(await token.currentEpoch(), 0n);
  assert.equal(await token.requiredDeposit(), UNIT);
  await advance(1000 * DAY - 1);
  assert.equal(await token.requiredDeposit(), UNIT);
  await advance(1);
  assert.equal(await token.currentEpoch(), 1n);
  assert.equal(await token.requiredDeposit(), 2n * UNIT);
  await advance(1000 * DAY);
  assert.equal(await token.requiredDeposit(), 3n * UNIT);
  await advance(8000 * DAY);
  assert.equal(await token.currentEpoch(), 10n);
  assert.equal(await token.requiredDeposit(), 11n * UNIT);
  assert.equal(await token.genesisTime(), genesis);
});

test('Alice day-1200 retroactive claim: failure preserves state, top-up unlocks all days', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  const original = await token.positions(alice.address);
  await advance(1200 * DAY);
  await assert.rejects(send(token.claim({ gasLimit: 200000 })));
  assert.deepEqual((await token.positions(alice.address)).toArray(), original.toArray());
  assert.equal(await token.pending(alice.address), 1200n * TOKEN);
  assert.equal(await token.totalSupply(), 0n);
  await send(token.topUp({ value: UNIT }));
  const topped = await token.positions(alice.address);
  assert.equal(topped.depositedAt, original.depositedAt);
  assert.equal(topped.claimedPeriods, 0n);
  assert.equal(topped.principal, 2n * UNIT);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), 1200n * TOKEN);
  await send(token.claim());
  assert.equal(await token.totalSupply(), 1200n * TOKEN);
});

test('top-up accepts positive partial/advance amounts, never adds reward or resets progress', async t => {
  const { token, alice, bob, send, advance } = await fixture(t);
  await assert.rejects(token.connect(bob).topUp.staticCall({ value: UNIT }));
  await send(token.deposit({ value: UNIT }));
  await assert.rejects(token.topUp.staticCall({ value: 0 }));
  await advance(36 * 3600);
  await send(token.claim());
  const original = await token.positions(alice.address);
  await send(token.topUp({ value: 1 }));
  await send(token.topUp({ value: 9n * UNIT - 1n }));
  assert.equal((await token.positions(alice.address)).principal, 10n * UNIT);
  assert.equal((await token.positions(alice.address)).depositedAt, original.depositedAt);
  assert.equal((await token.positions(alice.address)).claimedPeriods, 1n);
  await advance(12 * 3600);
  await send(token.claim());
  assert.equal(await token.balanceOf(alice.address), 2n * TOKEN);
});

test('new positions obey current minimum and overfunding remains refundable', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await advance(2000 * DAY);
  await assert.rejects(token.deposit.staticCall({ value: 3n * UNIT - 1n }));
  const principal = 10n * UNIT + 1n;
  await send(token.deposit({ value: principal }));
  await advance(DAY);
  const before = await provider.getBalance(alice.address);
  const receipt = await send(token.withdraw());
  assert.equal(await provider.getBalance(alice.address) - before + receipt.fee, principal);
  assert.equal(await token.balanceOf(alice.address), 0n);
});

test('underfunded exit returns all principal, forfeits pending only, and preserves issued tokens', async t => {
  const { token, alice, provider, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(DAY);
  await send(token.claim());
  await advance(1199 * DAY);
  await send(token.topUp({ value: UNIT / 2n }));
  assert.equal(await token.pending(alice.address), 1199n * TOKEN);
  const before = await provider.getBalance(alice.address);
  const receipt = await send(token.withdraw());
  assert.equal(await provider.getBalance(alice.address) - before + receipt.fee, UNIT * 3n / 2n);
  assert.equal(await token.balanceOf(alice.address), TOKEN);
  assert.equal(await token.totalSupply(), TOKEN);
  assert.equal(await token.pending(alice.address), 0n);
  assert.deepEqual((await token.positions(alice.address)).toArray(), [0n, 0n, 0n]);
  await assert.rejects(token.topUp.staticCall({ value: UNIT }));
  await assert.rejects(token.deposit.staticCall({ value: UNIT }));
  await send(token.deposit({ value: 2n * UNIT }));
  await advance(DAY);
  await send(token.claim());
  assert.equal(await token.totalSupply(), 2n * TOKEN);
});

test('pre-boundary claims and late top-ups never double-count across epochs', async t => {
  const { token, alice, send, advance } = await fixture(t);
  await send(token.deposit({ value: UNIT }));
  await advance(1000 * DAY - 1);
  await send(token.claim());
  assert.equal(await token.totalSupply(), 999n * TOKEN);
  await advance(1);
  await assert.rejects(token.claim.staticCall());
  await send(token.topUp({ value: UNIT }));
  await send(token.claim());
  assert.equal(await token.totalSupply(), 1000n * TOKEN);
  await advance(1000 * DAY);
  await assert.rejects(token.claim.staticCall());
  await send(token.topUp({ value: UNIT }));
  await send(token.withdraw());
  assert.equal(await token.balanceOf(alice.address), 1000n * TOKEN);
});

test('underfunded refund failure preserves principal and entitlement', async t => {
  const { token, alice, send, advance } = await fixture(t);
  const a = compiled['test/Receiver.sol'].Receiver;
  const receiver = await new ContractFactory(a.abi, a.evm.bytecode.object, alice).deploy(await token.getAddress());
  await receiver.waitForDeployment();
  const address = await receiver.getAddress();
  await send(receiver.deposit({ value: UNIT }));
  await advance(1200 * DAY);
  await send(receiver.setReject(true));
  const original = await token.positions(address);
  await assert.rejects(send(receiver.withdraw({ gasLimit: 500000 })));
  assert.deepEqual((await token.positions(address)).toArray(), original.toArray());
  assert.equal(await token.pending(address), 1200n * TOKEN);
  await send(receiver.setReject(false));
  await send(receiver.withdraw({ gasLimit: 500000 }));
  assert.equal(await receiver.received(), UNIT);
  assert.equal(await token.totalSupply(), 0n);
  assert.equal(await receiver.blocked(), 4n);
});
