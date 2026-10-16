export const DAY = 86400n;
// Truncate for display only; transaction arithmetic always uses the full bigint.
export function compactEth(wei) {
  if (wei > 0n && wei < 10000000000000n) return '<0.00001';
  const whole = wei / 1000000000000000000n;
  const fraction = (wei % 1000000000000000000n / 10000000000000n).toString().padStart(5, '0').replace(/0+$/, '');
  return `${whole}${fraction ? '.' + fraction : ''}`;
}
export function positionState(position, required, pending) {
  const active = !!position && position.depositedAt > 0n;
  const gap = active && required > position.principal ? required - position.principal : 0n;
  return { active, gap, claimable: active && gap === 0n && pending > 0n,
    nextAt: active ? position.depositedAt + (position.claimedPeriods + 1n) * DAY : null,
    status: !active ? 'empty' : gap > 0n ? 'underfunded' : pending > 0n ? 'ready' : 'accruing' };
}
export function countdown(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds)));
  const d = Math.floor(n / 86400), h = Math.floor(n % 86400 / 3600), m = Math.floor(n % 3600 / 60), s = n % 60;
  return `${d ? d + 'd ' : ''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
export function emptyIndex() { return { principal: 0n, active: new Set(), claimed: new Map() }; }
export function applyEvent(index, name, account, value = 0n) {
  account = account.toLowerCase();
  if (name === 'Deposited') { if (index.active.has(account)) throw new Error('Duplicate active position'); index.active.add(account); index.principal += value; }
  else if (name === 'ToppedUp') { if (!index.active.has(account)) throw new Error('Missing position'); index.principal += value; }
  else if (name === 'Withdrawn') { if (!index.active.delete(account)) throw new Error('Missing withdrawal position'); index.principal -= value; }
  else if (name === 'Claimed') index.claimed.set(account, (index.claimed.get(account) || 0n) + value);
  if (index.principal < 0n) throw new Error('Incomplete event history');
}
