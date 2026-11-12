/**
 * DC2 candidate eligibility, v0.2.
 * All four thresholds are required (AND); permanent on-chain admission
 * is a separate process. Inputs MUST be independently verified evidence.
 */
export const INITIAL_RULES = Object.freeze({
  minAccountAgeYears: 7,
  minIndependentStars: 10,
  minExternalMergedPRs: 10,
  minFollowers: 10,
});
export const EXPERIMENTAL_RULES = INITIAL_RULES;

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}
function utcDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be an ISO datetime`);
  }
  return new Date(value);
}
function fullYearsSince(created, cutoff) {
  let years = cutoff.getUTCFullYear() - created.getUTCFullYear();
  const anniversary = new Date(created);
  anniversary.setUTCFullYear(created.getUTCFullYear() + years);
  if (anniversary > cutoff) years--;
  return years;
}

/**
 * Evaluate normalized evidence. Does not issue a token or grant permanent eligibility.
 * @param {object} account
 * @param {number} account.githubId GitHub stable numeric user ID
 * @param {string} account.createdAt original creation timestamp
 * @param {number} account.independentStars verified stars on original owned repos
 * @param {number} account.externalMergedPRs verified merged PRs to third-party repos
 * @param {number} account.followers GitHub profile follower count
 * @param {{asOf:string,rules?:object}} options stable evaluation cutoff and rules
 */
export function evaluateEligibility(account, { asOf, rules = INITIAL_RULES } = {}) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) {
    throw new TypeError('account object required');
  }
  const githubId = integer(account.githubId, 'githubId');
  if (githubId === 0) throw new TypeError('githubId must be positive');
  const cutoff = utcDate(asOf, 'asOf');
  const created = utcDate(account.createdAt, 'createdAt');
  if (created > cutoff) throw new RangeError('account cannot be created after cutoff');
  for (const key of Object.keys(INITIAL_RULES)) integer(rules[key], `rules.${key}`);

  const values = {
    accountAgeYears: fullYearsSince(created, cutoff),
    independentStars: integer(account.independentStars, 'independentStars'),
    externalMergedPRs: integer(account.externalMergedPRs, 'externalMergedPRs'),
    followers: integer(account.followers, 'followers'),
  };
  const checks = {
    accountAge: values.accountAgeYears >= rules.minAccountAgeYears,
    independentStars: values.independentStars >= rules.minIndependentStars,
    externalMergedPRs: values.externalMergedPRs >= rules.minExternalMergedPRs,
    followers: values.followers >= rules.minFollowers,
  };
  return {
    githubId, asOf, values, checks,
    eligible: Object.values(checks).every(Boolean),
    ruleVersion: 'initial-0.2',
    advisoryOnly: true,
  };
}

/** Later rule versions may only reduce thresholds, never raise them. */
export function isRelaxation(previous, next) {
  return Object.keys(INITIAL_RULES).every(key =>
    Number.isSafeInteger(next[key]) && next[key] >= 0 && next[key] <= previous[key]);
}
