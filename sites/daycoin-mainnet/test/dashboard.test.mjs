import test from 'node:test';
import assert from 'node:assert/strict';
import { readDashboard, overviewAbi, estimateTotalAccrued } from '../dist/dashboard.mjs';
import { ADDRESS as ADDRESS_FOR_TEST } from '../dist/core.mjs';

const block = { number: '0x123', timestamp: '0x1234' };
const account = '0x' + '12'.repeat(20);
const values = { totalSupply: 3n * 10n ** 18n, currentEpoch: 1n, requiredDeposit: 2n * 10n ** 17n, genesisTime: 1600000000n, EPOCH_DURATION: 86400000n };
function fixture(fail) {
  const calls = [];
  return { calls, read: async (method, params) => {
    calls.push({ method, params });
    const name = method === 'eth_getBalance' ? (params[0] === account ? 'ethBalance' : 'totalPrincipal') : overviewAbi.parseTransaction(params[0]).name;
    if (name === fail) throw Error('RPC unavailable');
    return name === 'ethBalance' ? '0x0' : name === 'totalPrincipal' ? '0x16345785d8a0000' : overviewAbi.encodeFunctionResult(name, [values[name]]);
  } };
}
test('overview and native ETH balance use the supplied position block', async () => {
  const f = fixture(); const result = await readDashboard(account, block, f.read);
  assert.equal(result.ethBalance, 0n);
  assert.equal(result.totalPrincipal, 10n ** 17n);
  assert.equal(result.estimatedTotalAccrued, null); // Fixture timestamp precedes genesis.
  assert.equal(result.totalSupply, values.totalSupply);
  assert.equal(result.nextEpochTime, 1772800000n);
  assert.ok(f.calls.every(call => call.params[1] === block.number));
  assert.deepEqual(f.calls.filter(call => call.method === 'eth_getBalance').map(call => call.params), [[ADDRESS_FOR_TEST, block.number], [account, block.number]]);
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
  assert.equal(f.calls.length, 6);
  assert.equal(f.calls.filter(call => call.method === 'eth_getBalance').length, 1);
  assert.ok(f.calls.every(call => call.method === 'eth_call' || call.method === 'eth_getBalance'));
});

test('rough accrued estimate is non-decreasing versus minted supply and never double-counts it', () => {
  const day = 86400n;
  const common = { totalSupply: 2n * 10n ** 18n, totalPrincipal: 2n * 10n ** 17n, requiredDeposit: 10n ** 17n,
    genesisTime: 1000000n, block: { timestamp: `0x${(1000000n + 2n * day).toString(16)}` } };
  assert.equal(estimateTotalAccrued(common), 4n * 10n ** 18n);
  assert.equal(estimateTotalAccrued({ ...common, totalSupply: 7n * 10n ** 18n }), 7n * 10n ** 18n);
  assert.equal(estimateTotalAccrued({ ...common, totalPrincipal: 5n * 10n ** 16n }), common.totalSupply);
  assert.equal(estimateTotalAccrued({ ...common, totalPrincipal: null }), null);
  assert.equal(estimateTotalAccrued({ ...common, block: { timestamp: '0x1' } }), null);
});
test('failed contract balance never becomes an invented principal or accrual', async () => {
  const result = await readDashboard(account, block, fixture('totalPrincipal').read);
  assert.equal(result.totalPrincipal, null);
  assert.equal(result.estimatedTotalAccrued, null);
  assert.equal(result.totalSupply, values.totalSupply);
});
