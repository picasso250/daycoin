// Exact transaction simulation and gas budget check on independently verified RPC.
export async function prepareTransaction(rpc, transaction) {
  const value = transaction.value ?? 0n;
  const balance = await rpc.getBalance(transaction.from, 'pending');
  if (balance < value) throw Object.assign(new Error('ETH 余额不足以支付本金。'),{code:'INSUFFICIENT_FUNDS'});
  const estimated = await rpc.estimateGas(transaction);
  const gasLimit = (estimated * 125n + 99n) / 100n;
  const fees = await rpc.getFeeData();
  const price = fees.maxFeePerGas ?? fees.gasPrice;
  if (price == null) throw Error('无法获取当前 Gas 费率');
  if (balance < value + gasLimit * price) throw Object.assign(new Error('ETH 余额不足以支付本金及预计 Gas。'),{code:'INSUFFICIENT_FUNDS'});
  return { gasLimit };
}
export function errorDetail(error) {
  if (!error) return '未知错误';
  if (error.code===4001||error.code==='ACTION_REJECTED')return '用户取消了钱包操作';
  if (error.code==='INSUFFICIENT_FUNDS')return error.message;
  const e=error.info?.error??error.error??error;
  return String(e.shortMessage??e.reason??e.message??error.message??'交易失败').slice(0,450);
}
