// Pure, auditable monetary accounting. No RPC and no wallet.
export const DAY_SECONDS = 86400n;
export const REWARD_XIAO = 10000n;
export const DEPOSIT_STEP_WEI = 100000000000000000n;
export const EPOCH_SECONDS = 1000n * DAY_SECONDS;

export function createLedger() {
  return { positions: new Map(), principal: 0n, supply: 0n, minted: 0n, burned: 0n };
}
export function applyLedgerEvent(ledger, event) {
  const name = event.name;
  const account = String(event.account || '').toLowerCase();
  const amount = BigInt(event.amount);
  if (amount < 0n) throw new Error('Negative event amount');
  if (name === 'Deposited') {
    if (ledger.positions.has(account)) throw new Error('Duplicate position');
    ledger.positions.set(account, amount);
    ledger.principal += amount;
  } else if (name === 'ToppedUp') {
    if (!ledger.positions.has(account)) throw new Error('Top-up without position');
    ledger.positions.set(account, ledger.positions.get(account) + amount);
    ledger.principal += amount;
  } else if (name === 'Withdrawn') {
    if (!ledger.positions.has(account) || ledger.positions.get(account) !== amount) throw new Error('Invalid withdrawal history');
    ledger.positions.delete(account);
    ledger.principal -= amount;
  } else if (name === 'Claimed') {
    ledger.minted += amount;
    ledger.supply += amount;
  } else if (name === 'Burned') {
    ledger.burned += amount;
    ledger.supply -= amount;
    if (ledger.supply < 0n) throw new Error('Incomplete mint/burn history');
  } else {
    throw new Error('Unknown monetary event: ' + name);
  }
}
export function requiredStakeAt(timestamp, genesis) {
  const time = BigInt(timestamp), start = BigInt(genesis);
  if (time < start) throw new Error('Snapshot precedes genesis');
  return (1n + (time - start) / EPOCH_SECONDS) * DEPOSIT_STEP_WEI;
}
export function monetarySnapshot(ledger, timestamp, genesis) {
  const required = requiredStakeAt(timestamp, genesis);
  let eligible = 0;
  for (const principal of ledger.positions.values()) if (principal >= required) eligible++;
  // Annualized percentage expressed in basis points; null when S = 0.
  const annualBps = ledger.supply > 0n
    ? 365n * BigInt(eligible) * REWARD_XIAO * 10000n / ledger.supply
    : null;
  return {
    timestamp: BigInt(timestamp),
    active: ledger.positions.size, eligible, dailyProduction: eligible,
    principal: ledger.principal, supply: ledger.supply, minted: ledger.minted,
    burned: ledger.burned, required, annualBps
  };
}
// events sorted by (blockNumber, logIndex), with exact block timestamps.
// The last bucket is sampled at until, not at a future end-of-hour/day.
export function makeSamples(events, genesis, until, stepSeconds, limit = 365) {
  genesis = BigInt(genesis); until = BigInt(until); stepSeconds = BigInt(stepSeconds);
  if (stepSeconds <= 0n || limit < 1 || until < genesis) throw new Error('Invalid sampling interval');
  const first = (genesis / stepSeconds) * stepSeconds;
  const last = (until / stepSeconds) * stepSeconds;
  const start = first > last - BigInt(limit - 1) * stepSeconds ? first : last - BigInt(limit - 1) * stepSeconds;
  const ledger = createLedger(), samples = [];
  let cursor = 0;
  for (let bucket = first; bucket <= last; bucket += stepSeconds) {
    const sampleTime = bucket === last ? until : bucket + stepSeconds - 1n;
    while (cursor < events.length && BigInt(events[cursor].timestamp) <= sampleTime) {
      applyLedgerEvent(ledger, events[cursor++]);
    }
    if (bucket >= start) samples.push(monetarySnapshot(ledger, sampleTime, genesis));
  }
  return samples;
}
export function formatAnnualBps(bps) {
  if (bps == null) return '—';
  const whole = bps / 100n, fractional = String(bps % 100n).padStart(2, '0');
  return whole.toLocaleString('en-US') + '.' + fractional + '%';
}
