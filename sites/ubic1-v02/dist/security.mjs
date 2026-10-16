// v0.2: stateless transaction guards. No localStorage or transaction recovery.
// RPC recency is a heuristic, not an independent proof of chain consensus.
export const MAX_BLOCK_AGE_SECONDS = 600;
export const MAX_CLOCK_AHEAD_SECONDS = 120;

export function assertFreshBlock(latest, wallClockSeconds, previous = null) {
  if (!latest || !Number.isSafeInteger(latest.number)) throw Error('无法读取可信区块高度');
  const time = Number(latest.timestamp), now = Number(wallClockSeconds);
  if (!Number.isFinite(time) || !Number.isFinite(now)) throw Error('链上时钟格式错误');
  if (now - time > MAX_BLOCK_AGE_SECONDS) throw Error('RPC 返回过期区块，停止交易');
  if (time - now > MAX_CLOCK_AHEAD_SECONDS) throw Error('RPC 区块时间超过本地时钟，停止交易');
  if (previous && (latest.number < previous.number ||
      (latest.number === previous.number && latest.hash !== previous.hash) ||
      time < previous.timestamp)) throw Error('RPC 区块高度或时间出现回退，停止交易');
}

export function isRejected(error) {
  return error?.code === 4001 || error?.code === 'ACTION_REJECTED' ||
    error?.info?.error?.code === 4001 || error?.error?.code === 4001;
}

export function isIdenticalTransaction(tx, expected) {
  return !!tx &&
    tx.from?.toLowerCase() === expected.from.toLowerCase() &&
    tx.to?.toLowerCase() === expected.to.toLowerCase() &&
    (tx.data ?? '0x').toLowerCase() === expected.data.toLowerCase() &&
    BigInt(tx.value ?? 0) === BigInt(expected.value) &&
    BigInt(tx.chainId) === BigInt(expected.chainId);
}
