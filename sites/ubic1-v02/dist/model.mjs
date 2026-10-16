// Pure, deterministic UI helpers for UBIC1-v0.2. No wallet or network access.
export const DAY = 86400n;
export const EPOCH_SECONDS = 1000n * DAY;
export const STEP = 100000000000000000n;
export const ONE = 1000000000000000000n;

export function eligibleThrough(principal, genesis, now) {
  if (principal <= 0n) return genesis;
  const covered = principal / STEP;
  const epoch = (now - genesis) / EPOCH_SECONDS;
  return covered > epoch ? now : genesis + covered * EPOCH_SECONDS;
}

export function estimatedPending(position, genesis, at) {
  if (!position || position.principal === 0n) return 0n;
  const end = eligibleThrough(position.principal, genesis, at);
  if (end <= position.cursor) return 0n;
  return (end - position.cursor) * ONE / DAY;
}

export function positionState(position, required, pending) {
  const principal = position?.principal ?? 0n;
  const active = principal > 0n;
  const qualified = active && principal >= required;
  const gap = !active ? required : qualified ? 0n : required - principal;
  return {
    active, qualified, gap, claimable: active && pending > 0n,
    status: !active ? 'empty' : qualified ? 'accruing' : 'underfunded'
  };
}

export function truncateToken(raw, digits = 8) {
  const n = BigInt(raw);
  const sign = n < 0n ? '-' : '';
  const v = n < 0n ? -n : n;
  const whole = v / ONE;
  const frac = (v % ONE).toString().padStart(18,'0').slice(0,digits).replace(/0+$/,'');
  return sign + whole.toString() + (frac ? '.' + frac : '');
}

export function depositWarning(pending, principal, amount) {
  if (amount <= 0n) throw Error('存款必须大于 0 ETH');
  const hasPosition = principal > 0n;
  return {
    forfeited: pending,
    hasPosition,
    requiresAcknowledgement: true,
    title: hasPosition ? '追加存款将重置全部奖励时钟' : '确认开启存款仓位',
    detail: hasPosition
      ? '本次追加会永久放弃此前全部未领取奖励，且重新开始计算合格时间。先 Claim 可保留已领取代币。'
      : '首次存款也会从当前区块时间开始计时。未达到当期门槛时不会产生奖励。'
  };
}
