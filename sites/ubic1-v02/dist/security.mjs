// Security invariants shared by the v0.2 UI and independent regression tests.
// All checks fail closed. RPC age is a safety heuristic, not proof of consensus.
export const MAX_BLOCK_AGE_SECONDS = 600;
export const MAX_CLOCK_AHEAD_SECONDS = 120;

export function assertFreshBlock(latest, wallClockSeconds, previous = null) {
  if (!latest || !Number.isSafeInteger(latest.number)) throw Error('无法读取可信区块高度');
  const time=Number(latest.timestamp), now=Number(wallClockSeconds);
  if(!Number.isFinite(time)||!Number.isFinite(now))throw Error('链上时钟格式错误');
  if(now-time>MAX_BLOCK_AGE_SECONDS)throw Error('RPC 返回过期区块，停止交易');
  if(time-now>MAX_CLOCK_AHEAD_SECONDS)throw Error('RPC 区块时间超过本地时钟，停止交易');
  if(previous && (latest.number<previous.number ||
       (latest.number===previous.number && latest.hash!==previous.hash) ||
       time < previous.timestamp)) throw Error('RPC 区块高度或时间出现回退，停止交易');
}

export function normalizeChainId(chainId) {
  return '0x'+BigInt(chainId).toString(16);
}

export function pendingKey(chainId,contract,account) {
  return 'ubic1:v02:tx:'+String(chainId)+':'+contract.toLowerCase()+':'+account.toLowerCase();
}
export function readUnresolved(storage,key) {
  try {
    const s=storage.getItem(key);
    const p=s?JSON.parse(s):null;
    if(!p)return null;
    if(typeof p.from!=='string'||typeof p.action!=='string'||!('value' in p))
      throw Error('交易记录字段缺失');
    return p;
  }catch {return {action:'unknown', hash:null, message:'交易状态记录读取失败，请手动核查'};}
}
export function writeUnresolved(storage,key,record) {
  // Fail closed on storage failure; cannot safely accept a potentially
  // irreversible transaction without retaining its uncertain broadcast state.
  storage.setItem(key,JSON.stringify(record));
}
export function clearUnresolved(storage,key) {storage.removeItem(key);}
export function isRejected(error) {
  return error?.code===4001 || error?.code==='ACTION_REJECTED' ||
         error?.info?.error?.code===4001 || error?.error?.code===4001;
}
export function isIdenticalTransaction(tx,expected) {
  return !!tx &&
    tx.from?.toLowerCase()===expected.from.toLowerCase() &&
    tx.to?.toLowerCase()===expected.to.toLowerCase() &&
    (tx.data??'0x').toLowerCase()===expected.data.toLowerCase() &&
    BigInt(tx.value??0)===BigInt(expected.value) &&
    BigInt(tx.chainId)===BigInt(expected.chainId) &&
    (expected.nonce===null||expected.nonce===undefined||Number(tx.nonce)===Number(expected.nonce));
}
