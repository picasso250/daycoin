import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility, INITIAL_RULES, isRelaxation } from '../dc2/eligibility.mjs';

const asOf = '2026-11-12T00:00:00Z';
const example = {
  githubId: 1234567,
  createdAt: '2016-01-01T00:00:00Z',
  independentStars: 10,
  externalMergedPRs: 10,
  followers: 10,
};
const check = (patch = {}, opts = {}) => evaluateEligibility({ ...example, ...patch }, { asOf, ...opts });

test('four inclusive thresholds must ALL pass', () => {
  const result = check();
  assert.equal(result.eligible, true);
  assert.deepEqual(Object.values(result.checks), [true, true, true, true]);
  assert.equal(result.advisoryOnly, true);
  for (const [field, value] of [
    ['createdAt', '2020-01-01T00:00:00Z'],
    ['independentStars', 9],
    ['externalMergedPRs', 9],
    ['followers', 9],
  ]) assert.equal(check({ [field]: value }).eligible, false, field);
});

test('seven calendar years respect anniversary rather than rough day count', () => {
  assert.equal(check({ createdAt: '2019-11-12T00:00:00Z' }).eligible, true);
  assert.equal(check({ createdAt: '2019-11-12T00:00:01Z' }).eligible, false);
});

test('old but inactive accounts do not pass', () => {
  assert.equal(check({ independentStars: 0, externalMergedPRs: 0, followers: 0 }).eligible, false);
});

test('candidate thresholds are configurable, future relaxations are monotone', () => {
  assert.equal(isRelaxation(INITIAL_RULES, { ...INITIAL_RULES, minExternalMergedPRs: 5 }), true);
  assert.equal(isRelaxation(INITIAL_RULES, { ...INITIAL_RULES, minFollowers: 11 }), false);
  assert.equal(check({ externalMergedPRs: 5 }, { rules: { ...INITIAL_RULES, minExternalMergedPRs: 5 } }).eligible, true);
});

test('invalid GitHub ID, invalid dates and missing metrics fail closed', () => {
  assert.throws(() => check({ githubId: 0 }), /githubId/);
  assert.throws(() => check({ githubId: '123' }), /githubId/);
  assert.throws(() => check({ createdAt: '2028-01-01T00:00:00Z' }), /cutoff/);
  assert.throws(() => check({ independentStars: undefined }), /independentStars/);
  assert.throws(() => check({ externalMergedPRs: -1 }), /externalMergedPRs/);
  assert.throws(() => check({ followers: undefined }), /followers/);
});

test('fixed input and cutoff give deterministic output', () => {
  assert.deepEqual(check(), check());
});
