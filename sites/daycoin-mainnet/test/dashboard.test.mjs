import test from 'node:test';
import assert from 'node:assert/strict';
import { readDashboard, overviewAbi } from '../dist/dashboard.mjs';

const block = { number: '0x123', timestamp: '0x1234' };
const account = '0x' + '12'.repeat(20);
const values = { totalSupply: 3n * 10n ** 18n, currentEpoch: 1n, requiredDeposit: 2n * 10n ** 17n, genesisTime: 1600000000n, EPOCH_DURATION: 86400000n };
function fixture(fail) {
  const calls = [];
  return { calls, read: async (method, params) => {
    calls.push({ method, params });
    const name = method === 'eth_getBalance' ? 'ethBalance' : overviewAbi.parseTransaction(params[0]).name;
    if (name === fail) throw Error('RPC unavailable');
    return name === 'ethBalance' ? '0x0' : overviewAbi.encodeFunctionResult(name, [values[name]]);
  } };
}
test('overview and native ETH balance use the supplied position block', async () => {
  const f = fixture(); const result = await readDashboard(account, block, f.read);
  assert.equal(result.ethBalance, 0n);
  assert.equal(result.totalSupply, values.totalSupply);
  assert.equal(result.nextEpochTime, 1772800000n);
  assert.ok(f.calls.every(call => call.params[1] === block.number));
  assert.deepEqual(f.calls.find(call => call.method === 'eth_getBalance').params, [account, block.number]);
});
test('failed ETH read stays null, distinct from a real zero', async () => {
  const result = await readDashboard(account, block, fixture('ethBalance').read);
  assert.equal(result.ethBalance, null); assert.equal(result.totalSupply, values.totalSupply);
});
test('missing genesis fails only that field and derived change date', async () => {
  const result = await readDashboard(account, block, fixture('genesisTime').read);
  assert.equal(result.genesisTime, null); assert.equal(result.nextEpochTime, null);
  assert.equal(result.currentEpoch, 1n); assert.equal(result.requiredDeposit, values.requiredDeposit);
});
test('unconnected overview performs no account or historical event reads', async () => {
  const f = fixture(); await readDashboard(undefined, block, f.read);
  assert.equal(f.calls.length, 5); assert.ok(f.calls.every(call => call.method === 'eth_call'));
});
