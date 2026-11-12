import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility, EXPERIMENTAL_RULES } from '../dc2/eligibility.mjs';

const asOf = '2026-11-12T00:00:00Z';
const example = {
  githubId: 1234567,
  createdAt: '2020-01-01T00:00:00Z',
  publicNonForkRepos: 2,
  independentStars: 0,
  externalMergedPRs: 1,
  contributionMonths: 8
};
const check = (patch = {}, opts = {}) => evaluateEligibility({ ...example, ...patch }, { asOf, ...opts });

test('old maintainer qualifies with multiple paths and no stars', () => {
  const result = check();
  assert.equal(result.eligible, true);
  assert.equal(result.signalCount, 3);
  assert.equal(result.advisoryOnly, true);
});

test('age is a mandatory floor even with all activity signals', () => {
  assert.equal(check({ createdAt: '2026-01-01T00:00:00Z', independentStars: 100 }).eligible, false);
});

test('old empty accounts do not qualify', () => {
  assert.equal(check({ publicNonForkRepos: 0, independentStars: 0, externalMergedPRs: 0, contributionMonths: 0 }).eligible, false);
});

test('one signal alone cannot pass', () => {
  assert.equal(check({ publicNonForkRepos: 0, externalMergedPRs: 0, contributionMonths: 0, independentStars: 5 }).eligible, false);
});

test('configurable rules are not baked into program logic', () => {
  const strict = { ...EXPERIMENTAL_RULES, minSignals: 4 };
  assert.equal(check({}, { rules: strict }).eligible, false);
});

test('stable numeric ID required, time cannot run backwards', () => {
  assert.throws(() => check({ githubId: 0 }), /githubId/);
  assert.throws(() => check({ githubId: '123' }), /githubId/);
  assert.throws(() => check({ createdAt: '2028-01-01T00:00:00Z' }), /cutoff/);
});

test('unknown or missing metrics must not silently become zero', () => {
  assert.throws(() => check({ independentStars: undefined }), /independentStars/);
  assert.throws(() => check({ externalMergedPRs: -1 }), /externalMergedPRs/);
});

test('result is stable across repeated evaluation at fixed cutoff', () => {
  assert.deepEqual(check(), check());
});
