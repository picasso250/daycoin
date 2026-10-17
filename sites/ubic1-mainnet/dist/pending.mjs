// Presentation-only projection: the on-chain pending() snapshot remains the base.
// Every eligible second adds 1/86400 UBIC1; accrual ends at the last
// epoch covered by the refundable principal. No RPC calls or state writes.
const TOKEN_WEI = 10n ** 18n;
const DEPOSIT_STEP = 10n ** 17n;
const SECONDS_PER_DAY = 86400n;

export function fixedAmount(wei, digits) {
  if (!Number.isInteger(digits) || digits < 0 || digits > 18) throw Error('Invalid precision');
  const value = BigInt(wei);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / TOKEN_WEI;
  if (!digits) return sign + whole.toString();
  const fraction = (absolute % TOKEN_WEI).toString().padStart(18, '0').slice(0, digits);
  return `${sign}${whole}.${fraction}`;
}

export function estimatePending(position, dashboard, nowSeconds) {
  if (!position) return null;
  const baseline = BigInt(position.pending);
  // An incomplete initial snapshot is never interpreted as a zero balance.
  if (dashboard?.genesisTime == null || dashboard?.EPOCH_DURATION == null) return baseline;
  if (BigInt(position.principal) === 0n) return baseline;
  const blockTime = BigInt(position.block.timestamp);
  const now = BigInt(nowSeconds);
  if (now <= blockTime) return baseline;
  const end = BigInt(dashboard.genesisTime)
    + BigInt(position.principal) / DEPOSIT_STEP * BigInt(dashboard.EPOCH_DURATION);
  const eligibleUntil = now < end ? now : end;
  if (eligibleUntil <= blockTime) return baseline;
  return baseline + (eligibleUntil - blockTime) * TOKEN_WEI / SECONDS_PER_DAY;
}
