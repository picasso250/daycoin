// Simulate the exact sender, destination, calldata and value on the verified RPC.
// The injected wallet is only responsible for user approval and broadcasting.
export async function prepareTransaction(provider, transaction) {
 const value = transaction.value ?? 0n;
 const balance = await provider.getBalance(transaction.from, 'pending');
 if (balance < value) throw Object.assign(new Error('钱包余额不足以支付质押本金，请补充 Sepolia 测试 ETH。'), { code: 'INSUFFICIENT_FUNDS' });
 const gas = await provider.estimateGas(transaction);
 const gasLimit = (gas * 120n + 99n) / 100n;
 const fees = await provider.getFeeData();
 const price = fees.maxFeePerGas ?? fees.gasPrice;
 if (price == null) throw Error('RPC 无法返回 gas 费率，请稍后重试。');
 if (balance < value + gasLimit * price) throw Object.assign(new Error('余额不足以支付本金及预估 gas，请补充 Sepolia 测试 ETH。'), { code: 'INSUFFICIENT_FUNDS' });
 return { gasLimit };
}

export function rpcErrorDetail(error) {
 const messages = [], codes = [], seen = new Set();
 function visit(e, depth = 0) {
  if (!e || typeof e !== 'object' || seen.has(e) || depth > 6) return;
  seen.add(e);
  for (const child of [e.info?.error,e.error,e.cause,e.data?.originalError,e.data]) visit(child, depth + 1);
  if (typeof e.code === 'number') codes.push(e.code);
  const message = e.reason || e.message || e.shortMessage;
  if (message && !String(message).includes('could not coalesce error')) messages.push(String(message));
 }
 visit(error);
 const method = error.payload?.method;
 return `${method ? method + ': ' : ''}${codes.length ? codes[0] + ': ' : ''}${messages[0] || error.shortMessage || '钱包未返回具体原因'}`.slice(0, 600);
}

export function isInsufficientFunds(error) {
 return error.code === 'INSUFFICIENT_FUNDS' || /insufficient funds|insufficient balance|funds for gas|exceeds balance/i.test(rpcErrorDetail(error));
}
