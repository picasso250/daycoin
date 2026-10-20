import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePending, fixedAmount, roundedAmount } from '../dist/pending.mjs';

const day = 86400n, epoch = 1000n * day;
const genesis = 1800000000n;
const dashboard = { genesisTime: genesis, EPOCH_DURATION: epoch };
const position = (principal, pending = 0n, blockSeconds = genesis + 10n) => ({
  principal, pending, block: { timestamp: `0x${blockSeconds.toString(16)}` },
});

test('display truncates, never leaks 18-decimal ETH balance or reward', () => {
  assert.equal(fixedAmount(43949232371024555n, 6), '0.043949');
  assert.equal(fixedAmount(43703000000000000n, 4), '0.0437');
  assert.equal(fixedAmount(2222222222222222n, 5), '0.00222');
  assert.equal(fixedAmount(0n, 5), '0.00000');
  assert.equal(fixedAmount(10n ** 18n, 5), '1.00000');
});

test('eligible positions increase visibly once per second, without RPC', () => {
  const p = position(10n ** 17n);
  const start = genesis + 10n;
  const first = estimatePending(p, dashboard, start);
  const second = estimatePending(p, dashboard, start + 1n);
  const third = estimatePending(p, dashboard, start + 2n);
  assert.equal(fixedAmount(first, 5), '0.00000');
  assert.equal(fixedAmount(second, 5), '0.00001');
  assert.equal(fixedAmount(third, 5), '0.00002');
  assert.equal(estimatePending(p, dashboard, start + day), 10n ** 18n);
});

test('stops exactly at the eligible epoch boundary and preserves earlier pending', () => {
  const expireAt = genesis + epoch;
  const p = position(10n ** 17n, 5n * 10n ** 17n, expireAt - 2n);
  assert.equal(estimatePending(p, dashboard, expireAt + 3000n), 5n * 10n ** 17n + (2n * 10n ** 18n) / day);
  assert.equal(estimatePending(p, dashboard, expireAt + day), estimatePending(p, dashboard, expireAt));
  const inactive = position(0n, 0n);
  assert.equal(estimatePending(inactive, dashboard, genesis + day), 0n);
});

test('incomplete or future snapshots never fabricate rewards', () => {
  const p = position(10n ** 17n, 12n);
  assert.equal(estimatePending(p, null, genesis + day), 12n);
  assert.equal(estimatePending(p, dashboard, genesis), 12n);
  assert.equal(estimatePending(null, dashboard, genesis), null);
});

test('protocol amounts round to at most 4 decimal places and trim trailing zeros', () => {
  assert.equal(roundedAmount(1849583333333333332n), '1.8496');
  assert.equal(roundedAmount(100000000000000000n), '0.1');
  assert.equal(roundedAmount(0n), '0');
  assert.equal(roundedAmount(999995000000000000n), '1');
  assert.equal(roundedAmount(1234567890123456789000000000n), '1234567890.1235');
});
