/**
 * DC2 offline eligibility prototype.
 *
 * Inputs are pre-validated observations, NOT authoritative GitHub evidence.
 * Passing this function is never itself an issuance credential.
 */
export const EXPERIMENTAL_RULES = Object.freeze({
  minAccountAgeDays: 365 * 2,
  minSignals: 2,
  minPublicNonForkRepos: 2,
  minIndependentStars: 5,
  minExternalMergedPRs: 1,
  minContributionMonths: 6,
});

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

/**
 * @param {object} account - normalized, independently verified evidence
 * @param {number} account.githubId - stable numeric GitHub user ID
 * @param {string} account.createdAt - GitHub creation time (ISO8601)
 * @param {number} account.publicNonForkRepos
 * @param {number} account.independentStars - verified independent stars (NOT raw API stars)
 * @param {number} account.externalMergedPRs - merged into independent third-party repos
 * @param {number} account.contributionMonths - distinct months with verified contributions
 * @param {object} options
 * @param {string} options.asOf - fixed evidence cutoff, not current local time
 * @param {object} [options.rules]
 */
export function evaluateEligibility(account, { asOf, rules = EXPERIMENTAL_RULES } = {}) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) {
    throw new TypeError('account object required');
  }
  const githubId = count(account.githubId, 'githubId');
  if (githubId === 0) throw new TypeError('githubId must be positive');
  const cutoff = Date.parse(asOf);
  const created = Date.parse(account.createdAt);
  if (!Number.isFinite(cutoff) || !Number.isFinite(created)) {
    throw new TypeError('asOf and createdAt must be valid ISO date strings');
  }
  if (created > cutoff) throw new RangeError('account cannot be created after cutoff');
  const daysOld = Math.floor((cutoff - created) / 86_400_000);
  const observed = {
    publicNonForkRepos: count(account.publicNonForkRepos, 'publicNonForkRepos'),
    independentStars: count(account.independentStars, 'independentStars'),
    externalMergedPRs: count(account.externalMergedPRs, 'externalMergedPRs'),
    contributionMonths: count(account.contributionMonths, 'contributionMonths'),
  };
  for (const key of Object.keys(EXPERIMENTAL_RULES)) {
    count(rules[key], `rules.${key}`);
  }
  const signals = {
    publicNonForkRepos: observed.publicNonForkRepos >= rules.minPublicNonForkRepos,
    independentStars: observed.independentStars >= rules.minIndependentStars,
    externalMergedPRs: observed.externalMergedPRs >= rules.minExternalMergedPRs,
    contributionMonths: observed.contributionMonths >= rules.minContributionMonths,
  };
  const signalCount = Object.values(signals).filter(Boolean).length;
  const agePass = daysOld >= rules.minAccountAgeDays;
  return {
    githubId,
    asOf,
    daysOld,
    agePass,
    signalCount,
    signals,
    eligible: agePass && signalCount >= rules.minSignals,
    ruleVersion: 'experimental-0.1',
    advisoryOnly: true,
  };
}
